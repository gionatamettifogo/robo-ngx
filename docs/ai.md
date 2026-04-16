# AI chats in this fork

This document explains how AI chats are implemented and how they work in this Paperless-ngx fork.

## Overview

Chats are implemented as a normal Paperless feature:

-   chats are stored in the Paperless database
-   messages are stored in the Paperless database
-   assistant replies are streamed from the backend to the Angular frontend as NDJSON
-   the backend adapts the upstream Robo OpenAI-compatible endpoint
-   the frontend uses `fetch()` for the streaming POST and applies stream events into local page state

The implementation lives in the existing `documents` Django app, so the database tables use the `documents_` prefix.

## Backend

### Models

The chat data model is implemented in `src/documents/models.py`.

Added models:

-   `Chat`
-   `ChatMessage`
-   `ChatToolCall`

Current table names:

-   `documents_chat`
-   `documents_chatmessage`
-   `documents_chattoolcall`

`Chat` stores:

-   `owner`
-   `title`
-   `archived`
-   `pinned`
-   `created_at`
-   `updated_at`
-   `last_message_at`
-   `document` nullable FK
-   `agent_id`

`ChatMessage` stores:

-   `chat`
-   `role`
-   `status`
-   `content`
-   `created_at`
-   `updated_at`
-   `model`
-   `run_id`
-   `error_code`
-   `error_message`
-   token usage fields

`ChatToolCall` stores:

-   `message`
-   `tool_call_id`
-   `tool_name`
-   `arguments_text`
-   `output_text`
-   `status`
-   timestamps

### API

The chat API is implemented in `ChatViewSet` in `src/documents/views.py` and registered in `src/paperless/urls.py`.

Implemented endpoints:

-   `GET /api/chats/`
-   `POST /api/chats/`
-   `GET /api/chats/:id/`
-   `PATCH /api/chats/:id/`
-   `GET /api/chats/:id/messages/`
-   `POST /api/chats/:id/messages/stream/`

Notes:

-   the stream route includes a trailing slash because it is a DRF action route
-   chats are filtered to `owner=request.user`
-   chat messages are returned in chronological order

### Stream behavior

The main orchestration lives in `src/documents/chat_streaming.py`.

Current lifecycle:

1. Create a completed user message.
2. Create an assistant message with `status="streaming"`.
3. Emit `message_created`.
4. Build upstream history from persisted chat messages.
5. Call the upstream Robo service.
6. Normalize upstream events into NDJSON events.
7. Persist tool calls separately.
8. Periodically flush assistant content to the database.
9. Finalize the assistant message on completion.
10. Mark the assistant message failed on upstream error or client abort.

Flush policy for assistant content:

-   every 500 characters
-   every 1 second
-   on forced final flush

Abort policy:

-   partial assistant content remains persisted
-   assistant message is marked `failed`
-   `error_code="client_abort"`

### Stream protocol

The frontend does not consume the upstream provider protocol directly.

The backend emits NDJSON with one JSON object per line.

Implemented event types:

-   `message_created`
-   `message_delta`
-   `thinking_delta`
-   `tool_call_started`
-   `tool_call_delta`
-   `tool_result`
-   `message_completed`
-   `error`

The stream response sets:

-   `Content-Type: application/x-ndjson`
-   `Cache-Control: no-cache`
-   `X-Accel-Buffering: no`
-   `Content-Encoding: identity`

`Content-Encoding: identity` is intentional. It prevents Paperless compression middleware from buffering the NDJSON stream.

### Upstream Robo integration

The upstream adapter lives in `src/documents/chat_agent_client.py`.

Current behavior:

-   reads `PAPERLESS_AI_API_URL`
-   reads `PAPERLESS_AI_API_KEY`
-   reads `PAPERLESS_AI_MODEL`
-   sends `POST {AI_API_URL}/chat/completions`
-   sends `Authorization: Bearer ...`
-   sends `stream: true`
-   uses the configured model directly
-   does not call `/v1/models`

Paperless sends these upstream metadata fields:

-   `session_id`
-   `chat_id`
-   `paperless_user_id`
-   `document_ids`
-   `include_thinking`

The session id currently uses:

-   `robo-ngx-{chat.id}`

The backend reads upstream SSE and converts it into normalized downstream NDJSON events.

Important local note:

-   the Robo service on `localhost:8007` currently speaks plain HTTP
-   local config therefore uses `http://localhost:8007/v1`, not HTTPS

## Frontend

### Routes

The frontend uses two chat routes:

-   `/chats`
-   `/chats/:id`

This mirrors the document list/detail split.

### Frontend files

Main frontend pieces:

-   `src-ui/src/app/data/chat.ts`
-   `src-ui/src/app/services/rest/chat.service.ts`
-   `src-ui/src/app/services/chat-state.service.ts`
-   `src-ui/src/app/utils/chat-stream.ts`
-   `src-ui/src/app/components/robo/chats/`
-   `src-ui/src/app/components/robo/chat-detail/`

### Current UI behavior

`/chats`:

-   lists chats from the backend
-   creates a new chat
-   navigates into `/chats/:id`

`/chats/:id`:

-   loads chat metadata and full message history
-   renders messages in chronological order
-   streams assistant replies into the page
-   supports stop-generation with `AbortController`
-   displays tool events if present

The UI is intentionally functional rather than heavily designed.

### Browser stream handling

The streaming request uses `fetch()` instead of Angular `HttpClient`.

Current request behavior:

-   `Content-Type: application/json`
-   `Accept: application/json; version=9`
-   `X-CSRFToken` when available
-   `credentials: include`

The response body is read through `ReadableStream`, buffered line-by-line, and parsed as NDJSON.

## Integration notes

Two backend/frontend integration details matter in local development:

1. Because the frontend dev server runs on `http://localhost:4200`, backend CORS and CSRF settings must trust that origin in `DEBUG`.
2. Because `fetch()` bypasses Angular HTTP interceptors, the streaming request must set the API version in the `Accept` header manually.

## Main files

Backend:

-   `src/documents/models.py`
-   `src/documents/serialisers.py`
-   `src/documents/views.py`
-   `src/documents/chat_streaming.py`
-   `src/documents/chat_agent_client.py`
-   `src/documents/migrations/1076_chat_chatmessage_chattoolcall_and_more.py`
-   `src/paperless/settings.py`
-   `src/paperless/urls.py`

Frontend:

-   `src-ui/src/app/app-routing.module.ts`
-   `src-ui/src/app/data/chat.ts`
-   `src-ui/src/app/components/robo/chats/`
-   `src-ui/src/app/components/robo/chat-detail/`
-   `src-ui/src/app/services/rest/chat.service.ts`
-   `src-ui/src/app/services/chat-state.service.ts`
-   `src-ui/src/app/utils/chat-stream.ts`
