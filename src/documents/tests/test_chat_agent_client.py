from django.test import SimpleTestCase

from documents.chat_agent_client import AgentClient


class TestChatAgentClient(SimpleTestCase):
    def test_map_chunk_extracts_tool_calls_and_tool_results_from_delta(self):
        client = AgentClient()
        state = {
            "run_id": None,
            "model": "default",
            "usage": None,
            "finish_reason": "stop",
            "tool_calls": {},
        }

        events = client._map_chunk(
            {
                "id": "chatcmpl_1",
                "model": "agent",
                "choices": [
                    {
                        "delta": {
                            "reasoning": "Need a lookup.",
                            "content": "Checking ",
                            "tool_calls": [
                                {
                                    "index": 0,
                                    "id": "tool_1",
                                    "type": "function",
                                    "function": {
                                        "name": "lookup_document",
                                        "arguments": '{"document_id":12}',
                                    },
                                },
                            ],
                            "tool_results": [
                                {
                                    "id": "tool_1",
                                    "name": "lookup_document",
                                    "status": "completed",
                                    "output": "Found document 12",
                                },
                            ],
                        },
                        "finish_reason": None,
                    },
                ],
            },
            state,
        )

        self.assertEqual(
            events,
            [
                {"type": "message_delta", "text": "Checking "},
                {"type": "thinking_delta", "text": "Need a lookup."},
                {
                    "type": "tool_call_started",
                    "tool_call_id": "tool_1",
                    "tool_name": "lookup_document",
                },
                {
                    "type": "tool_call_delta",
                    "tool_call_id": "tool_1",
                    "arguments_text": '{"document_id":12}',
                },
                {
                    "type": "tool_result",
                    "tool_call_id": "tool_1",
                    "tool_name": "lookup_document",
                    "status": "completed",
                    "output": "Found document 12",
                },
            ],
        )
