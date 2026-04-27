from django.conf import settings
from django.http import StreamingHttpResponse

from paperless import version

try:
    from compression_middleware.middleware import (
        CompressionMiddleware as BaseCompressionMiddleware,
    )
except ModuleNotFoundError:  # pragma: no cover - dependency is optional in tests

    class BaseCompressionMiddleware:
        def __init__(self, get_response):
            self.get_response = get_response

        def process_response(self, request, response):
            return response


CHAT_STREAM_PATH_FRAGMENT = "/api/chats/"
CHAT_STREAM_PATH_SUFFIX = "/messages/stream/"


def should_skip_compression(request, response) -> bool:
    path = request.path
    content_type = response.get("Content-Type", "")

    return (
        (CHAT_STREAM_PATH_FRAGMENT in path and path.endswith(CHAT_STREAM_PATH_SUFFIX))
        or isinstance(response, StreamingHttpResponse)
        or content_type.startswith("application/x-ndjson")
    )


class StreamingSafeCompressionMiddleware(BaseCompressionMiddleware):
    def process_response(self, request, response):
        if should_skip_compression(request, response):
            return response

        return super().process_response(request, response)


class ApiVersionMiddleware:
    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        response = self.get_response(request)
        if request.user.is_authenticated:
            versions = settings.REST_FRAMEWORK["ALLOWED_VERSIONS"]
            response["X-Api-Version"] = versions[len(versions) - 1]
            response["X-Version"] = version.__full_version_str__

        return response
