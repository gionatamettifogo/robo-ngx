import json
from unittest import mock

from asgiref.sync import async_to_sync
from django.contrib.auth.models import Permission
from django.contrib.auth.models import User
from rest_framework import status
from rest_framework.test import APIRequestFactory
from rest_framework.test import APITestCase
from rest_framework.test import force_authenticate

from documents.models import Chat
from documents.models import ChatMessage
from documents.models import Document
from documents.models import Feedback
from documents.views import ChatViewSet


class TestApiChats(APITestCase):
    def setUp(self):
        super().setUp()
        self.factory = APIRequestFactory()
        self.user = User.objects.create_user(username="chat-user")
        self.other_user = User.objects.create_user(username="other-user")
        self.user.user_permissions.add(
            *Permission.objects.filter(content_type__app_label="documents"),
        )
        self.other_user.user_permissions.add(
            *Permission.objects.filter(content_type__app_label="documents"),
        )
        self.client.force_authenticate(self.user)

    def _collect_stream_lines(self, response):
        async def collect_async(content):
            lines = []
            async for chunk in content:
                text = chunk.decode() if isinstance(chunk, bytes) else chunk
                lines.extend(line for line in text.splitlines() if line.strip())
            return lines

        content = response.streaming_content
        if hasattr(content, "__aiter__"):
            return async_to_sync(collect_async)(content)

        lines = []
        for chunk in content:
            text = chunk.decode() if isinstance(chunk, bytes) else chunk
            lines.extend(line for line in text.splitlines() if line.strip())
        return lines

    def test_list_returns_only_current_users_chats(self):
        own_chat = Chat.objects.create(owner=self.user, title="Mine")
        Chat.objects.create(owner=self.other_user, title="Theirs")

        response = self.client.get("/api/chats/")

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["results"][0]["id"], own_chat.id)
        self.assertEqual(len(response.data["results"]), 1)

    def test_create_and_patch_chat(self):
        response = self.client.post(
            "/api/chats/",
            json.dumps(
                {
                    "title": "Invoices April",
                    "agent_id": "default",
                },
            ),
            content_type="application/json",
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        chat_id = response.data["id"]

        patch_response = self.client.patch(
            f"/api/chats/{chat_id}/",
            json.dumps({"title": "Renamed", "pinned": True}),
            content_type="application/json",
        )

        self.assertEqual(patch_response.status_code, status.HTTP_200_OK)
        self.assertEqual(patch_response.data["title"], "Renamed")
        self.assertTrue(patch_response.data["pinned"])

    def test_messages_are_returned_in_chronological_order(self):
        chat = Chat.objects.create(owner=self.user, title="Chat")
        first = ChatMessage.objects.create(
            chat=chat,
            role=ChatMessage.Role.USER,
            status=ChatMessage.Status.COMPLETED,
            content="first",
        )
        second = ChatMessage.objects.create(
            chat=chat,
            role=ChatMessage.Role.ASSISTANT,
            status=ChatMessage.Status.COMPLETED,
            content="second",
        )

        response = self.client.get(f"/api/chats/{chat.id}/messages/")

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(
            [message["id"] for message in response.data],
            [first.id, second.id],
        )

    def test_messages_include_current_users_feedback_only(self):
        chat = Chat.objects.create(owner=self.user, title="Chat")
        message = ChatMessage.objects.create(
            chat=chat,
            role=ChatMessage.Role.ASSISTANT,
            status=ChatMessage.Status.COMPLETED,
            content="assistant",
        )
        Feedback.objects.create(
            owner=self.user,
            message=message,
            vote=Feedback.Vote.POSITIVE,
            reason="Good response",
        )
        Feedback.objects.create(
            owner=self.other_user,
            message=message,
            vote=Feedback.Vote.NEGATIVE,
            reason="Bad response",
        )

        response = self.client.get(f"/api/chats/{chat.id}/messages/")

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data[0]["feedback"]["vote"], Feedback.Vote.POSITIVE)
        self.assertEqual(response.data[0]["feedback"]["reason"], "Good response")

    def test_cannot_access_another_users_chat(self):
        chat = Chat.objects.create(owner=self.other_user, title="Private")

        response = self.client.get(f"/api/chats/{chat.id}/")

        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    def test_can_delete_own_chat(self):
        chat = Chat.objects.create(owner=self.user, title="Mine")

        response = self.client.delete(f"/api/chats/{chat.id}/")

        self.assertEqual(response.status_code, status.HTTP_204_NO_CONTENT)
        self.assertFalse(Chat.objects.filter(id=chat.id).exists())

    @mock.patch("documents.chat_streaming.AgentClient.stream_chat")
    def test_stream_endpoint_persists_completed_assistant_message(
        self,
        mock_stream_chat,
    ):
        def fake_stream(**kwargs):
            yield {"type": "message_delta", "text": "Hello "}
            yield {"type": "message_delta", "text": "world"}
            yield {
                "type": "message_completed",
                "finish_reason": "stop",
                "usage": {
                    "prompt_tokens": 12,
                    "completion_tokens": 3,
                    "total_tokens": 15,
                },
                "run_id": "run_upstream",
                "model": "default",
            }

        mock_stream_chat.side_effect = fake_stream
        chat = Chat.objects.create(owner=self.user, title="Chat")

        response = self.client.post(
            f"/api/chats/{chat.id}/messages/stream/",
            json.dumps({"content": "Hi"}),
            content_type="application/json",
        )

        lines = self._collect_stream_lines(response)
        events = [json.loads(line) for line in lines]

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(events[0]["type"], "message_created")
        self.assertEqual(events[1]["type"], "message_delta")
        self.assertEqual(events[-1]["type"], "message_completed")

        assistant = ChatMessage.objects.get(id=events[0]["assistantMessageId"])
        self.assertEqual(assistant.status, ChatMessage.Status.COMPLETED)
        self.assertEqual(assistant.content, "Hello world")
        self.assertEqual(assistant.total_tokens, 15)

    @mock.patch("documents.chat_streaming.AgentClient.stream_chat")
    def test_stream_endpoint_uses_async_iterator_for_asgi_requests(
        self,
        mock_stream_chat,
    ):
        def fake_stream(**kwargs):
            yield {"type": "message_delta", "text": "Hello "}
            yield {"type": "message_delta", "text": "world"}
            yield {
                "type": "message_completed",
                "finish_reason": "stop",
                "usage": {
                    "prompt_tokens": 12,
                    "completion_tokens": 3,
                    "total_tokens": 15,
                },
                "run_id": "run_upstream",
                "model": "default",
            }

        mock_stream_chat.side_effect = fake_stream
        chat = Chat.objects.create(owner=self.user, title="Chat")
        request = self.factory.post(
            f"/api/chats/{chat.id}/messages/stream/",
            {"content": "Hi"},
            format="json",
        )
        request.scope = {}
        force_authenticate(request, self.user)
        view = ChatViewSet.as_view({"post": "stream"})

        response = view(request, pk=chat.id)
        lines = self._collect_stream_lines(response)
        events = [json.loads(line) for line in lines]

        self.assertTrue(hasattr(response.streaming_content, "__aiter__"))
        self.assertEqual(events[0]["type"], "message_created")
        self.assertEqual(events[-1]["type"], "message_completed")

    @mock.patch("documents.chat_streaming.AgentClient.stream_chat")
    def test_stream_endpoint_marks_failed_message_on_upstream_error(
        self,
        mock_stream_chat,
    ):
        def fake_stream(**kwargs):
            raise RuntimeError("boom")
            yield None

        mock_stream_chat.side_effect = fake_stream
        chat = Chat.objects.create(owner=self.user, title="Chat")

        response = self.client.post(
            f"/api/chats/{chat.id}/messages/stream/",
            json.dumps({"content": "Hi"}),
            content_type="application/json",
        )

        events = [json.loads(line) for line in self._collect_stream_lines(response)]
        assistant = ChatMessage.objects.filter(
            chat=chat,
            role=ChatMessage.Role.ASSISTANT,
        ).latest("id")

        self.assertEqual(events[-1]["type"], "error")
        self.assertEqual(assistant.status, ChatMessage.Status.FAILED)
        self.assertEqual(assistant.error_code, "upstream_error")

    def test_stream_rejects_inaccessible_document_ids(self):
        chat = Chat.objects.create(owner=self.user, title="Chat")
        foreign_document = Document.objects.create(
            title="Private doc",
            checksum="foreign-doc",
            mime_type="application/pdf",
            owner=self.other_user,
        )

        response = self.client.post(
            f"/api/chats/{chat.id}/messages/stream/",
            json.dumps({"content": "Hi", "document_ids": [foreign_document.id]}),
            content_type="application/json",
        )

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_can_create_and_delete_message_feedback(self):
        chat = Chat.objects.create(owner=self.user, title="Chat")
        message = ChatMessage.objects.create(
            chat=chat,
            role=ChatMessage.Role.ASSISTANT,
            status=ChatMessage.Status.COMPLETED,
            content="assistant",
        )

        create_response = self.client.post(
            f"/api/chats/{chat.id}/messages/{message.id}/feedback/",
            json.dumps({"vote": 1, "reason": "Good response"}),
            content_type="application/json",
        )

        self.assertEqual(create_response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(create_response.data["vote"], Feedback.Vote.POSITIVE)
        self.assertTrue(
            Feedback.objects.filter(
                owner=self.user,
                message=message,
                vote=Feedback.Vote.POSITIVE,
            ).exists(),
        )

        delete_response = self.client.delete(
            f"/api/chats/{chat.id}/messages/{message.id}/feedback/",
        )

        self.assertEqual(delete_response.status_code, status.HTTP_204_NO_CONTENT)
        self.assertFalse(
            Feedback.objects.filter(owner=self.user, message=message).exists(),
        )

    def test_can_delete_user_message_and_following_assistant_message(self):
        chat = Chat.objects.create(owner=self.user, title="Chat")
        first = ChatMessage.objects.create(
            chat=chat,
            role=ChatMessage.Role.USER,
            status=ChatMessage.Status.COMPLETED,
            content="first",
        )
        second = ChatMessage.objects.create(
            chat=chat,
            role=ChatMessage.Role.ASSISTANT,
            status=ChatMessage.Status.COMPLETED,
            content="reply",
        )
        third = ChatMessage.objects.create(
            chat=chat,
            role=ChatMessage.Role.USER,
            status=ChatMessage.Status.COMPLETED,
            content="later",
        )

        response = self.client.delete(f"/api/chats/{chat.id}/messages/{first.id}/")

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["deleted_message_ids"], [first.id, second.id])
        self.assertFalse(ChatMessage.objects.filter(id=first.id).exists())
        self.assertFalse(ChatMessage.objects.filter(id=second.id).exists())
        self.assertTrue(ChatMessage.objects.filter(id=third.id).exists())

    def test_delete_user_message_does_not_delete_following_user_message(self):
        chat = Chat.objects.create(owner=self.user, title="Chat")
        first = ChatMessage.objects.create(
            chat=chat,
            role=ChatMessage.Role.USER,
            status=ChatMessage.Status.COMPLETED,
            content="first",
        )
        second = ChatMessage.objects.create(
            chat=chat,
            role=ChatMessage.Role.USER,
            status=ChatMessage.Status.COMPLETED,
            content="second",
        )

        response = self.client.delete(f"/api/chats/{chat.id}/messages/{first.id}/")

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["deleted_message_ids"], [first.id])
        self.assertFalse(ChatMessage.objects.filter(id=first.id).exists())
        self.assertTrue(ChatMessage.objects.filter(id=second.id).exists())

    def test_feedback_post_updates_existing_feedback(self):
        chat = Chat.objects.create(owner=self.user, title="Chat")
        message = ChatMessage.objects.create(
            chat=chat,
            role=ChatMessage.Role.ASSISTANT,
            status=ChatMessage.Status.COMPLETED,
            content="assistant",
        )
        Feedback.objects.create(
            owner=self.user,
            message=message,
            vote=Feedback.Vote.POSITIVE,
            reason="Good response",
        )

        response = self.client.post(
            f"/api/chats/{chat.id}/messages/{message.id}/feedback/",
            json.dumps({"vote": -1, "reason": "Incorrect or incomplete"}),
            content_type="application/json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        feedback = Feedback.objects.get(owner=self.user, message=message)
        self.assertEqual(feedback.vote, Feedback.Vote.NEGATIVE)
        self.assertEqual(feedback.reason, "Incorrect or incomplete")
