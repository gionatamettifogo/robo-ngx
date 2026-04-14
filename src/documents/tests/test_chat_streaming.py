from unittest import mock

from django.contrib.auth.models import User
from django.test import TestCase

from documents.chat_streaming import stream_chat_message
from documents.models import Chat
from documents.models import ChatMessage
from documents.models import ChatToolCall


class TestChatStreaming(TestCase):
    @mock.patch("documents.chat_streaming.AgentClient.stream_chat")
    def test_service_persists_tool_calls_and_usage(self, mock_stream_chat):
        def fake_stream(**kwargs):
            yield {"type": "message_delta", "text": "Result: "}
            yield {
                "type": "tool_call_started",
                "tool_call_id": "call_1",
                "tool_name": "lookup_document",
            }
            yield {
                "type": "tool_call_delta",
                "tool_call_id": "call_1",
                "arguments_text": '{"document_id": 12}',
            }
            yield {
                "type": "tool_result",
                "tool_call_id": "call_1",
                "output": {"status": "ok"},
            }
            yield {"type": "message_delta", "text": "done"}
            yield {
                "type": "message_completed",
                "finish_reason": "stop",
                "usage": {
                    "prompt_tokens": 20,
                    "completion_tokens": 5,
                    "total_tokens": 25,
                },
                "run_id": "run_upstream",
                "model": "default",
            }

        mock_stream_chat.side_effect = fake_stream
        user = User.objects.create_user(username="chat-user")
        chat = Chat.objects.create(owner=user, title="Chat")
        events = list(
            stream_chat_message(
                user=user,
                chat=chat,
                content="hello",
                document_ids=[],
                agent_id="default",
                include_thinking=False,
            ),
        )

        assistant = ChatMessage.objects.get(chat=chat, role=ChatMessage.Role.ASSISTANT)
        tool_call = ChatToolCall.objects.get(message=assistant)

        self.assertEqual(events[0]["type"], "message_created")
        self.assertEqual(assistant.status, ChatMessage.Status.COMPLETED)
        self.assertEqual(assistant.content, "Result: done")
        self.assertEqual(assistant.total_tokens, 25)
        self.assertEqual(tool_call.arguments_text, '{"document_id": 12}')
        self.assertEqual(tool_call.output_text, "{'status': 'ok'}")
        self.assertEqual(tool_call.status, ChatToolCall.Status.COMPLETED)
