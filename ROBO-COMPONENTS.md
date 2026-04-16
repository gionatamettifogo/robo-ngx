# ROBO Components

Chat-page related components currently in use:

- `ChatsComponent`
  Selector: `pngx-robo-chats`
  File: `src-ui/src/app/components/robo/chats/chats.component.ts`
  Purpose: `/chats` page, including chat list and top-level new-chat composer usage.

- `ChatDetailComponent`
  Selector: `pngx-robo-chat-detail`
  File: `src-ui/src/app/components/robo/chat-detail/chat-detail.component.ts`
  Purpose: `/chats/:id` page, including message rendering, streaming state, and bottom composer panel.

- `ChatComposerComponent`
  Selector: `pngx-robo-chat-composer`
  File: `src-ui/src/app/components/robo/chat-composer/chat-composer.component.ts`
  Purpose: Shared prompt/composer UI used by both `/chats` and `/chats/:id`.

- `IconActionButtonComponent`
  Selector: `pngx-robo-icon-action-button`
  File: `src-ui/src/app/components/robo/icon-action-button/icon-action-button.component.ts`
  Purpose: Shared icon + tooltip action button used for assistant and user message action rows.

- `FeedbackDialogComponent`
  Selector: `pngx-feedback-dialog`
  File: `src-ui/src/app/components/common/feedback-dialog/feedback-dialog.component.ts`
  Purpose: Reusable modal dialog for collecting structured negative feedback, currently used from chat assistant thumbs-down feedback and designed for reuse in other contexts.
