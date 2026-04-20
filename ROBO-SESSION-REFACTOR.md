# ROBO Session Refactor

## Goal

Move canonical conversation/session ownership to `robo`, while keeping `paperless-ngx` responsible for Paperless-specific UX and product metadata.

This should prepare the system for:

- multiple transports: `paperless-ngx`, WhatsApp, Telegram, others
- runtime-owned memories
- runtime-owned routines and background tasks
- transport-independent user identity and conversation identity
- a cleaner separation between application UI state and agent runtime state

## Summary

Today the system stores overlapping conversation state in two places:

- `paperless-ngx`
  - owns `Chat`, `ChatMessage`, `ChatToolCall`
  - reconstructs message history from SQL before every upstream request
  - uses chat ID to derive the runtime session ID
- `robo`
  - owns AgentScope session files
  - owns workspace-scoped memory and file state
  - loads and saves runtime session memory separately from Paperless SQL history

This works, but the ownership boundary is wrong for a multi-transport agent runtime.

The target design is:

- `robo` owns canonical conversation/session state
- `paperless-ngx` owns a local projection for Paperless UI concerns

Important distinction:

- do not expose raw AgentScope JSON session files as the product API
- instead, add explicit conversation APIs in `robo`

## Current State

### In `paperless-ngx`

Current chat persistence is first-class product data:

- `src/documents/models.py`
  - `Chat`
  - `ChatMessage`
  - `ChatToolCall`
- `src/documents/views.py`
  - chat list/detail endpoints
  - message streaming endpoint
- `src/documents/chat_streaming.py`
  - creates local user and assistant messages
  - reads SQL history
  - forwards request upstream
  - stores streaming deltas and tool-call events locally
- `src/documents/chat_agent_client.py`
  - derives runtime session as `paperless-ngx-{chat.id:07d}`
  - sends `metadata.session_id`
  - also sends `X-Session-Id`

Observed behavior:

1. User sends a message to Paperless.
2. Paperless creates `ChatMessage` rows locally.
3. Paperless rebuilds the full transcript from SQL.
4. Paperless sends that full transcript to `robo`.
5. `robo` also loads prior session memory from its own session store.

This means the conversation context is effectively persisted twice:

- SQL transcript in `paperless-ngx`
- AgentScope session memory in `robo`

### In `robo`

Current runtime persistence is already broader than chat:

- `robo/core/robo.py`
  - resolves `session_id` from payload metadata, `conversation_id`, header, or fallback
  - loads agent and session
  - saves session after run
- `robo/core/sessions.py`
  - persists session state to JSON files
- `robo/core/agents.py`
  - creates agent
  - loads session-backed memory
- `robo/tools/memory.py`
  - owns workspace-backed ReMeLight memory
  - owns `MEMORY.md`, daily logs, related memory folders
- `robo/core/gateway.py`
  - already builds transport-native session IDs for non-Paperless flows

Observed behavior:

- `robo` is already acting like a runtime with transport-aware session scope
- `robo` is the natural future owner for:
  - memory
  - conversation/session identity
  - routines
  - multi-transport message history
  - tool execution state

## Problem Statement

The current split has several issues.

### 1. Two sources of truth for conversation state

The current system stores overlapping short-term conversation state in:

- Paperless SQL transcript
- Robo AgentScope session state

This is manageable only while the runtime memory remains simple.

Once routines, memory extraction, summaries, tool results, or transport-specific state become more important, the duplication becomes risky.

### 2. UI-derived session identity

Paperless currently derives runtime session identity from local chat ID:

- `paperless-ngx-{chat.id}`

That is acceptable for one web UI, but it is not a good canonical cross-transport identity.

WhatsApp and Telegram will want their own thread or conversation mappings, and they should not depend on a Paperless DB row existing.

### 3. Poor fit for multi-transport

In the future, the same user may interact with the same agent through:

- Paperless web chat
- WhatsApp
- Telegram
- other channels

The runtime should decide whether those are:

- separate conversations
- linked threads
- transport aliases of the same ongoing conversation

That logic belongs in `robo`, not in a Paperless-specific DB model.

### 4. Session JSON is not a stable product API

Even if `robo` owns runtime state, `paperless-ngx` should not read raw AgentScope session files directly.

Those files are implementation details. The UI should talk to explicit conversation endpoints, not internal runtime serialization formats.

## Recommended Ownership Model

### `robo` should own canonical runtime state

Canonical runtime state includes:

- conversation identity
- session identity
- runtime transcript or event log
- short-term memory
- long-term memory linkage
- workspace state
- tool execution history if needed by the runtime
- transport linkage
- transport participant linkage
- routine state
- background workflow state

### `paperless-ngx` should own product projection state

Paperless-specific state includes:

- chat title
- pinned/archived state
- linked Paperless document
- ownership and permissions in the Paperless app
- feedback/votes
- UI-only sorting/filtering/presentation metadata
- optional local cached transcript projection

This allows Paperless to remain a first-class app without becoming the system of record for all conversations.

## Target Data Model

Introduce a canonical runtime conversation model in `robo`.

Suggested fields:

- `conversation_id`
  - canonical external identifier
  - generated by `robo`
- `session_id`
  - runtime persistence key
  - may equal `conversation_id`
- `agent_id`
  - selected model/agent/routine family
- `user_id`
  - canonical runtime user identifier
- `transport`
  - `paperless-ngx`, `whatsapp`, `telegram`, etc.
- `transport_thread_id`
  - transport-native thread/chat identifier
- `status`
  - active, archived, closed, failed, etc.
- `title`
  - optional runtime title
- `metadata`
  - structured metadata for transport/application-specific context
- `created_at`
- `updated_at`
- `last_message_at`

Suggested runtime message/event model:

- `message_id`
- `conversation_id`
- `role`
- `content`
- `tool_calls`
- `tool_results`
- `status`
- `model`
- `run_id`
- `usage`
- `error_code`
- `error_message`
- `created_at`
- `updated_at`

The exact backing store can be:

- SQL
- event store
- append-only JSONL plus index
- another persistent store

But it should be an explicit conversation store, not only AgentScope session JSON.

## Recommended API Shape in `robo`

Add explicit conversation endpoints. Example:

- `GET /v1/models`
- `POST /v1/conversations`
- `GET /v1/conversations`
- `GET /v1/conversations/{conversation_id}`
- `PATCH /v1/conversations/{conversation_id}`
- `GET /v1/conversations/{conversation_id}/messages`
- `POST /v1/conversations/{conversation_id}/messages`
- `GET /v1/conversations/{conversation_id}/events`

Optional:

- `POST /v1/conversations/{conversation_id}/archive`
- `POST /v1/conversations/{conversation_id}/title`
- `GET /v1/conversations/{conversation_id}/state`

For streaming:

- either continue exposing OpenAI-compatible `/v1/chat/completions`
- or add a first-class conversation streaming endpoint

Example hybrid approach:

- keep `/v1/chat/completions` for compatibility
- internally resolve it to a canonical `conversation_id`
- store resulting messages/events in the runtime conversation store

## Recommended Paperless Integration Model

Paperless should stop being the source of truth for transcript reconstruction.

Instead:

1. On new chat creation, Paperless asks `robo` to create a conversation.
2. `robo` returns `conversation_id`.
3. Paperless stores that `conversation_id` on its local `Chat` row.
4. On message send, Paperless sends:
   - `conversation_id`
   - new user input
   - selected `agent_id`
   - relevant Paperless-scoped metadata
5. `robo` loads canonical runtime state and appends the turn.
6. Paperless renders from:
   - live stream events from `robo`
   - optionally a local projection of messages

### New field to add in `paperless-ngx`

Add something like:

- `runtime_conversation_id = CharField(...)`

This should become the runtime linkage key.

Optional:

- `runtime_status`
- `runtime_last_synced_at`
- `runtime_error`

### Keep local transcript or not?

Recommended answer: keep a local projection for now.

Reasons:

- fast UI rendering
- local auditability
- easier feedback linkage
- easier Paperless permission checks
- resilience during migration

But the local transcript should become a projection, not the source of truth.

## Migration Strategy

Do this incrementally.

### Phase 0: Define canonical boundaries

Before coding, agree on:

- who owns `conversation_id`
- whether `session_id == conversation_id`
- whether runtime messages are authoritative
- whether Paperless keeps message projection permanently or only temporarily

Suggested decision:

- `robo` owns `conversation_id`
- `session_id` can initially equal `conversation_id`
- runtime messages are authoritative
- Paperless keeps a local projection for at least one migration phase

### Phase 1: Introduce runtime conversation IDs

In `paperless-ngx`:

- add `runtime_conversation_id` to `Chat`
- backfill existing rows if needed
- for new chats, request a runtime conversation on creation

In `robo`:

- add conversation create/get/list primitives
- allow metadata to contain Paperless info:
  - `paperless_chat_id`
  - `paperless_document_id`
  - `transport`

### Phase 2: Stop sending full SQL transcript upstream

This is the critical behavioral change.

In `paperless-ngx`:

- stop rebuilding the full chat transcript from `ChatMessage`
- send only:
  - `conversation_id`
  - current user message
  - selected `agent_id`
  - optional document context references

In `robo`:

- resolve prior context from runtime-owned conversation/session state
- append the new turn to canonical runtime conversation history

At this point, duplication of short-term context is greatly reduced.

### Phase 3: Make Paperless transcript a projection

In `paperless-ngx`:

- still store `ChatMessage` locally, but treat it as a synced projection
- local rows are created from runtime stream events rather than used to build runtime context

Possible implementation patterns:

- Paperless continues to write local rows while consuming the stream
- or Paperless fetches `/messages` from `robo` after send and syncs locally

Streaming projection is likely simpler for preserving the current UI behavior.

### Phase 4: Move tool-call/event authority to `robo`

Currently, Paperless stores `ChatToolCall` as stream events arrive.

Eventually:

- `robo` should own tool-call and tool-result events canonically
- Paperless may still mirror them into `ChatToolCall`

This matters once tool chains and routines become important outside Paperless.

### Phase 5: Decide whether to keep local message rows long-term

After the migration stabilizes, choose one:

1. keep local message projection permanently
2. remove local transcript storage and fetch from `robo` on demand

Recommendation:

- keep local `Chat` rows
- keep local projection of recent/current messages if it improves UX
- do not rely on local transcript as authoritative runtime context

## Proposed Changes in `paperless-ngx`

### Schema

Add to `Chat`:

- `runtime_conversation_id`

Potentially add:

- `runtime_last_synced_at`
- `runtime_status`

### Service layer

Refactor `AgentClient` responsibilities:

Current:

- OpenAI-compatible forwarding client
- derives session ID from Paperless chat ID

Target:

- conversation-aware runtime client
- knows how to:
  - create conversation
  - send turn into existing conversation
  - list/fetch messages if needed

### Stream flow

Current `stream_chat_message()`:

1. create local user message
2. create local assistant placeholder
3. load local chat history
4. send full upstream history
5. persist deltas locally

Target `stream_chat_message()`:

1. ensure local `Chat.runtime_conversation_id` exists
2. create local user projection row
3. create local assistant placeholder row
4. send only new user turn plus `conversation_id`
5. consume runtime stream
6. persist projection rows locally

### View/API model

Paperless APIs can remain mostly the same for the Angular UI:

- `/api/chats/`
- `/api/chats/{id}/`
- `/api/chats/{id}/messages/`
- `/api/chats/{id}/messages/stream`

But internally they should become a façade over runtime conversations rather than the runtime source of truth.

### Error handling

Add explicit handling for:

- missing `runtime_conversation_id`
- runtime conversation not found
- sync conflicts between local projection and runtime
- unauthorized transport/user mismatch

## Proposed Changes in `robo`

### Add explicit conversation repository

Do not rely solely on:

- `robo/core/sessions.py`

Add a dedicated conversation persistence abstraction.

Possible modules:

- `robo/core/conversations.py`
- `robo/core/conversation_store.py`
- `robo/core/message_store.py`

Responsibilities:

- create conversation
- append message/event
- list messages
- fetch conversation metadata
- archive/update title
- map transport thread IDs to canonical conversation IDs

### Keep AgentScope session persistence, but demote it

AgentScope session persistence should remain an internal runtime implementation detail.

It can still back:

- memory serialization
- intermediate runtime state
- compression summaries

But it should not be the main product-facing conversation store.

### Unify session and conversation identifiers

Strong suggestion:

- start with `session_id == conversation_id`

This simplifies the first migration.

Later, if needed:

- keep `conversation_id` stable for product/API identity
- allow multiple runtime sessions or branches under a conversation

But that complexity is unnecessary initially.

### Make conversation state transport-aware

Runtime conversation records should support:

- originating transport
- transport-native thread ID
- transport user linkage

This is necessary for WhatsApp and Telegram.

### Make auth context less Paperless-specific

Current Paperless auth flow resolves runtime user from the Paperless profile token.

That is reasonable for Paperless transport, but the runtime model should generalize to:

- transport-authenticated user identity
- optional linked canonical user identity
- transport-specific credentials in environment/context

## Suggested Canonical Identity Model

There are several identities in play. Keep them separate.

### User identity

- `runtime_user_id`
  - canonical runtime principal
- transport identities
  - Paperless email or user ID
  - WhatsApp number
  - Telegram user ID

These should map to one runtime user profile when appropriate.

### Conversation identity

- `conversation_id`
  - canonical external thread identity

### Session identity

- `session_id`
  - runtime state bucket
  - initially equal to `conversation_id`

### Application identity

- `paperless_chat_id`
  - local Paperless projection row

## Suggested Order of Implementation

If doing this later, the lowest-risk order is:

1. Add `runtime_conversation_id` to Paperless `Chat`
2. Add conversation create/get/list/message APIs to `robo`
3. Create runtime conversations for new Paperless chats
4. Continue local transcript storage, but begin linking everything by `runtime_conversation_id`
5. Stop sending full SQL history from Paperless
6. Let `robo` own transcript context
7. Convert local Paperless `ChatMessage` rows to projection status
8. Move tool/event authority to `robo`
9. Revisit whether local message storage is still needed

## Questions to Resolve Before Implementation

These are worth deciding before coding.

### 1. Should `robo` store full transcripts, or only session memory plus derived summaries?

Recommendation:

- store full runtime transcript or full append-only event log

Reason:

- makes multi-transport, replay, audit, and sync much easier

### 2. Should Paperless still own titles and pin/archive state?

Recommendation:

- yes, in the short term

Reason:

- these are Paperless UX concerns

Possible later improvement:

- sync some of them to `robo` as shared cross-client conversation metadata

### 3. Should one runtime conversation be visible in multiple apps/transports?

Recommendation:

- design for it, but do not overbuild initially

Start with:

- one Paperless chat maps to one runtime conversation
- one WhatsApp thread maps to one runtime conversation

Later:

- allow cross-transport linking if needed

### 4. Should local Paperless message IDs remain stable and first-class?

Recommendation:

- yes for the Paperless UI
- but store runtime message IDs alongside them when available

### 5. Should feedback stay in Paperless?

Recommendation:

- yes initially

Reason:

- feedback is currently part of the Paperless product UX

Later:

- optionally forward feedback to `robo` for evaluation/training loops

## Risks

### Risk 1: Divergence during migration

If local Paperless projection and runtime store both change independently, they will drift.

Mitigation:

- choose one authority per phase
- phase 2 is the inflection point:
  - after that, Paperless should no longer construct runtime context from local SQL transcript

### Risk 2: Runtime store design is underspecified

If `robo` only exposes session JSON persistence and no explicit conversation store, the migration will stall.

Mitigation:

- add dedicated conversation repository/API first

### Risk 3: Permissions and ownership mismatch

Paperless has a mature ownership/permissions model.

If transcript authority moves to `robo`, access control must still be enforced consistently.

Mitigation:

- keep Paperless auth/token validation strict
- require runtime conversations created through Paperless transport to retain transport/user binding

### Risk 4: Overcoupling to current agent model naming

Today `agent_id` is used both as model selection and as broader agent identity.

As routines and skills grow, this may become too narrow.

Mitigation:

- consider eventually distinguishing:
  - `assistant_id` or `agent_config_id`
  - `model_id`

Not necessary immediately, but worth keeping in mind.

## Concrete End State

Desired behavior once the refactor is done:

1. User opens Paperless chat.
2. Paperless loads local chat metadata and runtime-linked conversation ID.
3. User sends a message.
4. Paperless sends only the new turn and `conversation_id` to `robo`.
5. `robo` loads canonical conversation/session state.
6. `robo` runs the agent, with all runtime-owned memory and transport-aware context.
7. `robo` emits canonical events/messages.
8. Paperless updates its local projection and UI.

For another transport:

1. WhatsApp inbound message arrives.
2. `robo` resolves or creates canonical conversation ID from transport thread identity.
3. `robo` runs against the same runtime primitives.
4. No Paperless DB row is required.

That is the correct long-term shape.

## Recommended First Cut

If only one first implementation slice is done, it should be this:

- add canonical `conversation_id` creation and storage in `robo`
- add `runtime_conversation_id` in Paperless `Chat`
- stop sending full Paperless SQL history upstream
- let `robo` own prior-turn reconstruction
- keep Paperless `ChatMessage` as projection for now

This removes the worst duplication without forcing a full frontend/API rewrite immediately.

## Short Decision

The answer to the architectural question is:

- yes, sessions and conversation state should move toward runtime ownership in `robo`
- no, `paperless-ngx` should not become a thin client that directly reads raw AgentScope session files
- instead, `paperless-ngx` should consume explicit runtime conversation APIs and keep local projection state for Paperless-specific UX
