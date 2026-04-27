from unittest import TestCase

from django.http import HttpResponse
from django.http import StreamingHttpResponse
from django.test import RequestFactory

from paperless.middleware import should_skip_compression


class TestStreamingSafeCompression(TestCase):
    def setUp(self):
        self.factory = RequestFactory()

    def test_skips_chat_stream_route(self):
        request = self.factory.post("/api/chats/42/messages/stream/")
        response = HttpResponse(content_type="application/json")

        self.assertTrue(should_skip_compression(request, response))

    def test_skips_ndjson_response(self):
        request = self.factory.get("/api/other/")
        response = HttpResponse(content_type="application/x-ndjson")

        self.assertTrue(should_skip_compression(request, response))

    def test_skips_streaming_response(self):
        request = self.factory.get("/api/other/")
        response = StreamingHttpResponse(iter(["ok"]))

        self.assertTrue(should_skip_compression(request, response))

    def test_allows_regular_response_compression(self):
        request = self.factory.get("/api/other/")
        response = HttpResponse(content_type="application/json")

        self.assertFalse(should_skip_compression(request, response))
