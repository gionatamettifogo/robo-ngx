import time
import uuid
from collections.abc import Iterator
from typing import Any

from django.utils import timezone

from documents.chat_agent_client import AgentClient
from documents.chat_agent_client import AgentClientError
from documents.models import Chat
from documents.models import ChatMessage
from documents.models import ChatToolCall

FLUSH_CHAR_INTERVAL = 500
FLUSH_SECONDS_INTERVAL = 1.0


def build_openai_messages(messages: list[ChatMessage]) -> list[dict[str, str]]:
    return [
        {
            "role": message.role,
            "content": message.content,
        }
        for message in messages
        if message.content
    ]


def stream_chat_message(
    *,
    user,
    chat: Chat,
    content: str,
    document_ids: list[int],
    agent_id: str,
    include_thinking: bool,
) -> Iterator[dict[str, Any]]:
    run_id = f"run_{uuid.uuid4().hex}"
    now = timezone.now()

    user_message = ChatMessage.objects.create(
        chat=chat,
        role=ChatMessage.Role.USER,
        status=ChatMessage.Status.COMPLETED,
        content=content,
        run_id=run_id,
    )
    assistant_message = ChatMessage.objects.create(
        chat=chat,
        role=ChatMessage.Role.ASSISTANT,
        status=ChatMessage.Status.STREAMING,
        content="",
        run_id=run_id,
        model=agent_id,
    )

    yield {
        "type": "message_created",
        "chatId": chat.id,
        "userMessageId": user_message.id,
        "assistantMessageId": assistant_message.id,
        "runId": run_id,
    }

    history = list(
        ChatMessage.objects.filter(chat=chat)
        .exclude(id=assistant_message.id)
        .order_by("created_at", "id"),
    )
    upstream_messages = build_openai_messages(history)
    agent_client = AgentClient()
    accumulated_content = ""
    last_flushed_length = 0
    last_flush_at = time.monotonic()
    tool_calls: dict[str, ChatToolCall] = {}

    def flush_assistant_content(*, force: bool = False) -> None:
        nonlocal last_flushed_length, last_flush_at
        should_flush = force
        if not should_flush:
            chars_since_flush = len(accumulated_content) - last_flushed_length
            elapsed = time.monotonic() - last_flush_at
            should_flush = (
                chars_since_flush >= FLUSH_CHAR_INTERVAL
                or elapsed >= FLUSH_SECONDS_INTERVAL
            )
        if not should_flush:
            return
        assistant_message.content = accumulated_content
        assistant_message.updated_at = timezone.now()
        assistant_message.save(update_fields=["content", "updated_at"])
        last_flushed_length = len(accumulated_content)
        last_flush_at = time.monotonic()

    try:
        for event in agent_client.stream_chat(
            messages=upstream_messages,
            agent_id=agent_id,
            document_ids=document_ids,
            include_thinking=include_thinking,
            user=user,
            chat=chat,
        ):
            event_type = event["type"]

            if event_type == "message_delta":
                text = event.get("text", "")
                accumulated_content += text
                yield {
                    "type": "message_delta",
                    "messageId": assistant_message.id,
                    "text": text,
                }
                flush_assistant_content()
                continue

            if event_type == "thinking_delta":
                yield {
                    "type": "thinking_delta",
                    "messageId": assistant_message.id,
                    "text": event.get("text", ""),
                }
                continue

            if event_type == "tool_call_started":
                tool_call = ChatToolCall.objects.create(
                    message=assistant_message,
                    tool_call_id=event["tool_call_id"],
                    tool_name=event["tool_name"],
                    status=ChatToolCall.Status.STARTED,
                )
                tool_calls[event["tool_call_id"]] = tool_call
                yield {
                    "type": "tool_call_started",
                    "messageId": assistant_message.id,
                    "toolCallId": tool_call.tool_call_id,
                    "toolName": tool_call.tool_name,
                }
                continue

            if event_type == "tool_call_delta":
                tool_call = tool_calls.get(event["tool_call_id"])
                if tool_call is None:
                    tool_call = ChatToolCall.objects.create(
                        message=assistant_message,
                        tool_call_id=event["tool_call_id"],
                        tool_name="tool",
                        status=ChatToolCall.Status.STARTED,
                    )
                    tool_calls[event["tool_call_id"]] = tool_call
                tool_call.arguments_text += event.get("arguments_text", "")
                tool_call.updated_at = timezone.now()
                tool_call.save(update_fields=["arguments_text", "updated_at"])
                yield {
                    "type": "tool_call_delta",
                    "messageId": assistant_message.id,
                    "toolCallId": tool_call.tool_call_id,
                    "argumentsText": event.get("arguments_text", ""),
                }
                continue

            if event_type == "tool_result":
                tool_call = tool_calls.get(event["tool_call_id"])
                if tool_call is not None:
                    tool_call.output_text = str(event.get("output"))
                    tool_call.status = ChatToolCall.Status.COMPLETED
                    tool_call.updated_at = timezone.now()
                    tool_call.save(
                        update_fields=["output_text", "status", "updated_at"],
                    )
                yield {
                    "type": "tool_result",
                    "messageId": assistant_message.id,
                    "toolCallId": event["tool_call_id"],
                    "output": event.get("output"),
                }
                continue

            if event_type == "message_completed":
                flush_assistant_content(force=True)
                usage = event.get("usage") or {}
                assistant_message.status = ChatMessage.Status.COMPLETED
                assistant_message.content = accumulated_content
                assistant_message.model = event.get("model") or assistant_message.model
                assistant_message.run_id = (
                    event.get("run_id") or assistant_message.run_id
                )
                assistant_message.input_tokens = usage.get("prompt_tokens")
                assistant_message.output_tokens = usage.get("completion_tokens")
                assistant_message.total_tokens = usage.get("total_tokens")
                assistant_message.updated_at = timezone.now()
                assistant_message.save(
                    update_fields=[
                        "status",
                        "content",
                        "model",
                        "run_id",
                        "input_tokens",
                        "output_tokens",
                        "total_tokens",
                        "updated_at",
                    ],
                )
                chat.last_message_at = assistant_message.created_at or now
                chat.updated_at = timezone.now()
                chat.save(update_fields=["last_message_at", "updated_at"])
                yield {
                    "type": "message_completed",
                    "messageId": assistant_message.id,
                    "finishReason": event.get("finish_reason", "stop"),
                    "usage": {
                        "inputTokens": assistant_message.input_tokens,
                        "outputTokens": assistant_message.output_tokens,
                        "totalTokens": assistant_message.total_tokens,
                    }
                    if assistant_message.total_tokens is not None
                    else None,
                }
                return
    except GeneratorExit:
        flush_assistant_content(force=True)
        assistant_message.status = ChatMessage.Status.FAILED
        assistant_message.content = accumulated_content
        assistant_message.error_code = "client_abort"
        assistant_message.error_message = "The client aborted the stream."
        assistant_message.updated_at = timezone.now()
        assistant_message.save(
            update_fields=[
                "status",
                "content",
                "error_code",
                "error_message",
                "updated_at",
            ],
        )
        raise
    except AgentClientError as exc:
        flush_assistant_content(force=True)
        assistant_message.status = ChatMessage.Status.FAILED
        assistant_message.content = accumulated_content
        assistant_message.error_code = exc.code
        assistant_message.error_message = str(exc)
        assistant_message.updated_at = timezone.now()
        assistant_message.save(
            update_fields=[
                "status",
                "content",
                "error_code",
                "error_message",
                "updated_at",
            ],
        )
        yield {
            "type": "error",
            "code": exc.code,
            "message": str(exc),
            "retryable": exc.retryable,
        }
    except Exception:
        flush_assistant_content(force=True)
        assistant_message.status = ChatMessage.Status.FAILED
        assistant_message.content = accumulated_content
        assistant_message.error_code = "upstream_error"
        assistant_message.error_message = "The agent request failed."
        assistant_message.updated_at = timezone.now()
        assistant_message.save(
            update_fields=[
                "status",
                "content",
                "error_code",
                "error_message",
                "updated_at",
            ],
        )
        yield {
            "type": "error",
            "code": "upstream_error",
            "message": "The agent request failed.",
            "retryable": True,
        }
