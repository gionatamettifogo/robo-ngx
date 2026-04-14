import json
from collections.abc import Iterator
from typing import Any
from urllib.parse import urljoin

import httpx
from django.conf import settings


class AgentClientError(Exception):
    def __init__(
        self,
        message: str,
        *,
        code: str = "upstream_error",
        retryable: bool = True,
    ) -> None:
        super().__init__(message)
        self.code = code
        self.retryable = retryable


class AgentClient:
    def stream_chat(
        self,
        *,
        messages: list[dict[str, Any]],
        agent_id: str,
        document_ids: list[int],
        include_thinking: bool,
        user,
        chat,
    ) -> Iterator[dict[str, Any]]:
        if not settings.AI_API_URL or not settings.AI_API_KEY:
            raise AgentClientError(
                "AI endpoint is not configured.",
                code="configuration_error",
                retryable=False,
            )

        endpoint = urljoin(settings.AI_API_URL.rstrip("/") + "/", "chat/completions")
        session_id = f"paperless-chat-{chat.id}"
        payload = {
            "model": settings.AI_MODEL,
            "stream": True,
            "stream_options": {"include_usage": True},
            "messages": messages,
            "metadata": {
                "session_id": session_id,
                "chat_id": chat.id,
                "paperless_user_id": user.id,
                "document_ids": document_ids,
                "include_thinking": include_thinking,
            },
            "conversation_id": session_id,
        }
        headers = {
            "Authorization": f"Bearer {settings.AI_API_KEY}",
            "Accept": "text/event-stream",
            "Content-Type": "application/json",
            "x-transport-id": "paperless-chat",
        }
        state: dict[str, Any] = {
            "run_id": None,
            "model": settings.AI_MODEL,
            "usage": None,
            "finish_reason": "stop",
            "tool_calls": {},
        }

        timeout = httpx.Timeout(connect=10.0, read=None, write=30.0, pool=30.0)
        try:
            with (
                httpx.Client(timeout=timeout) as client,
                client.stream(
                    "POST",
                    endpoint,
                    headers=headers,
                    json=payload,
                ) as response,
            ):
                try:
                    response.raise_for_status()
                except httpx.HTTPStatusError as exc:
                    raise AgentClientError(
                        self._extract_error_message(exc.response),
                    ) from exc

                for data in self._iter_sse_data(response):
                    if data == "[DONE]":
                        break
                    chunk = json.loads(data)
                    yield from self._map_chunk(chunk, state)
        except httpx.HTTPError as exc:
            raise AgentClientError("The agent request failed.") from exc

        yield {
            "type": "message_completed",
            "finish_reason": state["finish_reason"] or "stop",
            "usage": state["usage"],
            "run_id": state["run_id"],
            "model": state["model"],
        }

    def _extract_error_message(self, response: httpx.Response) -> str:
        try:
            payload = response.json()
        except ValueError:
            return "The agent request failed."

        error = payload.get("error")
        if isinstance(error, dict) and error.get("message"):
            return str(error["message"])
        if isinstance(error, str):
            return error
        if payload.get("message"):
            return str(payload["message"])
        return "The agent request failed."

    def _iter_sse_data(self, response: httpx.Response) -> Iterator[str]:
        event_lines: list[str] = []
        text_buffer = ""

        # httpx line iteration can buffer small SSE responses heavily.
        # Read small text chunks and split lines manually so deltas flush promptly.
        for chunk in response.iter_text(chunk_size=1):
            text_buffer += chunk
            while "\n" in text_buffer:
                line, text_buffer = text_buffer.split("\n", 1)
                line = line.rstrip("\r")
                if not line:
                    if event_lines:
                        yield "\n".join(event_lines)
                        event_lines = []
                    continue
                if line.startswith(":"):
                    continue
                if line.startswith("data:"):
                    event_lines.append(line[5:].lstrip())

        tail = text_buffer.rstrip("\r")
        if tail.startswith("data:"):
            event_lines.append(tail[5:].lstrip())
        if event_lines:
            yield "\n".join(event_lines)

    def _map_chunk(
        self,
        chunk: dict[str, Any],
        state: dict[str, Any],
    ) -> list[dict[str, Any]]:
        events: list[dict[str, Any]] = []

        state["run_id"] = chunk.get("id") or state["run_id"]
        state["model"] = chunk.get("model") or state["model"]
        if chunk.get("usage"):
            state["usage"] = chunk["usage"]

        choices = chunk.get("choices") or []
        if not choices and chunk.get("type") == "tool_result":
            events.append(
                {
                    "type": "tool_result",
                    "tool_call_id": chunk.get("tool_call_id"),
                    "output": chunk.get("output"),
                },
            )
            return events

        for choice in choices:
            delta = choice.get("delta") or {}
            finish_reason = choice.get("finish_reason")
            if finish_reason:
                state["finish_reason"] = finish_reason

            text = self._extract_text_delta(delta)
            if text:
                events.append({"type": "message_delta", "text": text})

            thinking = self._extract_thinking_delta(delta)
            if thinking:
                events.append({"type": "thinking_delta", "text": thinking})

            for tool_event in self._extract_tool_events(delta, state):
                events.append(tool_event)

        return events

    def _extract_text_delta(self, delta: dict[str, Any]) -> str:
        content = delta.get("content")
        if isinstance(content, str):
            return content
        if isinstance(content, list):
            text_parts = []
            for item in content:
                if not isinstance(item, dict):
                    continue
                if item.get("type") in {"text", "output_text"} and item.get("text"):
                    text_parts.append(str(item["text"]))
            return "".join(text_parts)
        return ""

    def _extract_thinking_delta(self, delta: dict[str, Any]) -> str:
        for key in ("reasoning_content", "thinking", "reasoning"):
            value = delta.get(key)
            if isinstance(value, str):
                return value
            if isinstance(value, list):
                text_parts = []
                for item in value:
                    if isinstance(item, dict) and item.get("text"):
                        text_parts.append(str(item["text"]))
                if text_parts:
                    return "".join(text_parts)
        return ""

    def _extract_tool_events(
        self,
        delta: dict[str, Any],
        state: dict[str, Any],
    ) -> list[dict[str, Any]]:
        events: list[dict[str, Any]] = []
        tool_calls = delta.get("tool_calls") or []
        if not isinstance(tool_calls, list):
            return events

        for tool_call in tool_calls:
            if not isinstance(tool_call, dict):
                continue
            index = tool_call.get("index", 0)
            tracked = state["tool_calls"].setdefault(
                index,
                {"started": False, "tool_call_id": None, "tool_name": None},
            )
            function = tool_call.get("function") or {}
            tool_call_id = (
                tool_call.get("id") or tracked["tool_call_id"] or f"call_{index}"
            )
            tool_name = function.get("name") or tracked["tool_name"] or "tool"
            tracked["tool_call_id"] = tool_call_id
            tracked["tool_name"] = tool_name

            if not tracked["started"]:
                tracked["started"] = True
                events.append(
                    {
                        "type": "tool_call_started",
                        "tool_call_id": tool_call_id,
                        "tool_name": tool_name,
                    },
                )

            arguments = function.get("arguments")
            if isinstance(arguments, str) and arguments:
                events.append(
                    {
                        "type": "tool_call_delta",
                        "tool_call_id": tool_call_id,
                        "arguments_text": arguments,
                    },
                )

        return events
