from django.contrib.auth.models import User
from django.db import IntegrityError
from django.db import transaction
from django.test import TestCase

from documents.models import Chat
from documents.models import ChatMessage
from documents.models import ChatToolCall


class TestChatModels(TestCase):
    def test_tool_call_uniqueness_and_cascade_delete(self):
        user = User.objects.create_user(username="chat-owner")
        chat = Chat.objects.create(owner=user, title="Chat")
        message = ChatMessage.objects.create(
            chat=chat,
            role=ChatMessage.Role.ASSISTANT,
            status=ChatMessage.Status.COMPLETED,
            content="hello",
        )

        ChatToolCall.objects.create(
            message=message,
            tool_call_id="call_1",
            tool_name="lookup",
            status=ChatToolCall.Status.STARTED,
        )

        with self.assertRaises(IntegrityError):
            with transaction.atomic():
                ChatToolCall.objects.create(
                    message=message,
                    tool_call_id="call_1",
                    tool_name="lookup",
                    status=ChatToolCall.Status.STARTED,
                )

        chat.delete()

        self.assertEqual(ChatMessage.objects.count(), 0)
        self.assertEqual(ChatToolCall.objects.count(), 0)
