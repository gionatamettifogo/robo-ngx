import { AsyncPipe, NgFor, NgIf } from '@angular/common'
import {
  Component,
  HostListener,
  inject,
  OnDestroy,
  OnInit,
} from '@angular/core'
import { ActivatedRoute, Router, RouterLink } from '@angular/router'
import { NgxBootstrapIconsModule } from 'ngx-bootstrap-icons'
import { MarkdownComponent } from 'ngx-markdown'
import { Subject, takeUntil } from 'rxjs'
import { ChatMessage, ChatMessageStatusPill } from 'src/app/data/chat'
import { ChatStateService } from 'src/app/services/chat-state.service'
import { ChatComposerComponent } from '../chat-composer/chat-composer.component'
import { IconActionButtonComponent } from '../icon-action-button/icon-action-button.component'

@Component({
  selector: 'pngx-robo-chat-detail',
  templateUrl: './chat-detail.component.html',
  imports: [
    AsyncPipe,
    ChatComposerComponent,
    IconActionButtonComponent,
    MarkdownComponent,
    NgFor,
    NgIf,
    NgxBootstrapIconsModule,
    RouterLink,
  ],
  styles: [
    `
      .robo-chat-detail-page {
        min-height: 100vh;
        display: flex;
        flex-direction: column;
      }

      .robo-chat-detail-content {
        flex: 1 0 auto;
        padding-bottom: 2rem !important;
      }

      .robo-chat-detail-shell,
      .robo-chat-detail-composer {
        max-width: 920px;
        margin: 0 auto;
      }

      .robo-chat-detail-panel {
        margin-top: auto;
        position: sticky;
        bottom: 0;
        z-index: 10;
        padding: 0 1rem 1rem;
        background: linear-gradient(
          to top,
          var(--bs-body-bg) 0%,
          var(--bs-body-bg) 72%,
          rgba(var(--bs-body-bg-rgb), 0) 100%
        );
      }

      .robo-chat-detail-composer {
        width: 100%;
      }

      .robo-status-strip {
        display: flex;
        flex-wrap: wrap;
        gap: 0.5rem;
      }

      .robo-message {
        margin-bottom: 1rem;
      }

      .robo-message--user {
        display: flex;
        justify-content: flex-end;
      }

      .robo-user-message {
        display: inline-flex;
        flex-direction: column;
        align-items: flex-end;
        max-width: min(32rem, 75%);
      }

      .robo-user-bubble {
        width: fit-content;
        max-width: 100%;
        border-radius: 1.25rem;
        border: 0;
        box-shadow: none;
        background: #e9ecef;
        color: var(--bs-body-color);
        padding: 0.75rem 1rem;
        white-space: pre-wrap;
        line-height: 1.4;
      }

      .robo-user-actions {
        display: flex;
        justify-content: flex-end;
        gap: 0.3rem;
        margin-top: 0.35rem;
        opacity: 0;
        pointer-events: none;
        transition: opacity 120ms ease;
      }

      .robo-user-message:hover .robo-user-actions {
        opacity: 1;
        pointer-events: auto;
      }

      .robo-assistant-message {
        color: var(--bs-body-color);
        padding-bottom: 1rem;
      }

      .robo-assistant-actions {
        display: flex;
        align-items: center;
        gap: 0.3rem;
        margin-top: 0.5rem;
        margin-left: -0.35rem;
      }

      .robo-thinking-toggle {
        display: inline-flex;
        align-items: center;
        gap: 0.45rem;
        border: 0;
        padding: 0;
        margin-bottom: 0.75rem;
        background: transparent;
        color: var(--bs-secondary-color);
        font-size: 0.95rem;
        line-height: 1.4;
        cursor: pointer;
      }

      .robo-thinking-toggle span,
      .robo-thinking-toggle:hover {
        display: inline-flex;
        align-items: center;
        color: var(--bs-secondary-color);
      }

      .robo-thinking-toggle i-bs {
        display: inline-flex;
        align-items: center;
        line-height: 1;
        font-size: 0.9rem;
      }

      .robo-assistant-markdown {
        line-height: 1.6;
      }

      .robo-assistant-markdown:empty {
        display: none;
      }

      .robo-assistant-markdown ::ng-deep > :first-child {
        margin-top: 0;
      }

      .robo-assistant-markdown ::ng-deep > :last-child {
        margin-bottom: 0;
      }

      .robo-assistant-markdown ::ng-deep p,
      .robo-assistant-markdown ::ng-deep ul,
      .robo-assistant-markdown ::ng-deep ol,
      .robo-assistant-markdown ::ng-deep pre,
      .robo-assistant-markdown ::ng-deep table,
      .robo-assistant-markdown ::ng-deep blockquote {
        margin: 0 0 1rem;
      }

      .robo-assistant-markdown ::ng-deep h1,
      .robo-assistant-markdown ::ng-deep h2,
      .robo-assistant-markdown ::ng-deep h3,
      .robo-assistant-markdown ::ng-deep h4,
      .robo-assistant-markdown ::ng-deep h5,
      .robo-assistant-markdown ::ng-deep h6 {
        margin: 1.25rem 0 0.75rem;
        font-weight: 600;
        line-height: 1.3;
      }

      .robo-assistant-markdown ::ng-deep ul,
      .robo-assistant-markdown ::ng-deep ol {
        padding-left: 1.5rem;
      }

      .robo-assistant-markdown ::ng-deep li + li {
        margin-top: 0.25rem;
      }

      .robo-assistant-markdown ::ng-deep code {
        font-size: 0.925em;
        padding: 0.15rem 0.35rem;
        border-radius: 0.35rem;
        background: var(--bs-tertiary-bg);
      }

      .robo-assistant-markdown ::ng-deep pre {
        overflow-x: auto;
        padding: 0.9rem 1rem;
        border-radius: 0.85rem;
        background: #f8f9fa;
      }

      .robo-assistant-markdown ::ng-deep pre code {
        padding: 0;
        background: transparent;
      }

      .robo-assistant-markdown ::ng-deep table {
        width: 100%;
        border-collapse: collapse;
        font-size: 0.95rem;
      }

      .robo-assistant-markdown ::ng-deep th,
      .robo-assistant-markdown ::ng-deep td {
        padding: 0.65rem 0.75rem;
        border: 1px solid var(--bs-border-color);
        vertical-align: top;
      }

      .robo-assistant-markdown ::ng-deep th {
        background: var(--bs-tertiary-bg);
        font-weight: 600;
      }

      .robo-assistant-markdown ::ng-deep blockquote {
        padding-left: 1rem;
        border-left: 3px solid var(--bs-border-color);
        color: var(--bs-secondary-color);
      }

      .robo-status-pill {
        display: inline-flex;
        align-items: center;
        border-radius: 999px;
        padding: 0.2rem 0.65rem;
        font-size: 0.75rem;
        font-weight: 600;
        line-height: 1.2;
      }

      .robo-status-pill--info {
        background: rgba(13, 110, 253, 0.12);
        color: #0b5ed7;
      }

      .robo-status-pill--muted {
        background: rgba(108, 117, 125, 0.12);
        color: #495057;
      }

      .robo-status-pill--success {
        background: rgba(25, 135, 84, 0.12);
        color: #146c43;
      }

      .robo-status-pill--danger {
        background: rgba(220, 53, 69, 0.12);
        color: #b02a37;
      }

      @media (max-width: 767.98px) {
        .robo-chat-detail-panel {
          padding-inline: 0.75rem;
        }

        .robo-user-bubble {
          max-width: 100%;
        }

        .robo-user-message {
          max-width: 85%;
        }
      }
    `,
  ],
})
export class ChatDetailComponent implements OnInit, OnDestroy {
  private route = inject(ActivatedRoute)
  private router = inject(Router)
  private destroy$ = new Subject<void>()
  private initialPromptHandledForChatId: number | null = null
  private shouldStickToBottom = false

  readonly chatState = inject(ChatStateService)

  ngOnInit(): void {
    this.route.paramMap.pipe(takeUntil(this.destroy$)).subscribe((params) => {
      const chatId = Number(params.get('id'))
      if (Number.isFinite(chatId)) {
        void this.loadChat(chatId)
      }
    })

    this.chatState.state$.pipe(takeUntil(this.destroy$)).subscribe(() => {
      if (!this.shouldStickToBottom) {
        return
      }

      window.requestAnimationFrame(() => {
        window.scrollTo({
          top: document.documentElement.scrollHeight,
          behavior: 'auto',
        })
      })
    })
  }

  ngOnDestroy(): void {
    this.destroy$.next()
    this.destroy$.complete()
    this.chatState.stopStreaming()
  }

  async sendMessage() {
    this.shouldStickToBottom = true
    window.requestAnimationFrame(() => {
      window.scrollTo({
        top: document.documentElement.scrollHeight,
        behavior: 'auto',
      })
    })
    await this.chatState.sendMessage(this.chatState.snapshot.pendingInput)
  }

  @HostListener('window:scroll')
  onWindowScroll() {
    this.shouldStickToBottom = this.isNearPageBottom()
  }

  private async loadChat(chatId: number): Promise<void> {
    this.shouldStickToBottom = false
    await this.chatState.loadChat(chatId)
    window.requestAnimationFrame(() => {
      window.scrollTo({
        top: 0,
        behavior: 'auto',
      })
    })
    await this.sendInitialPromptIfNeeded(chatId)
  }

  statusPillsForMessage(
    message: ChatMessage,
    thinkingText?: string | null
  ): ChatMessageStatusPill[] {
    const pills: ChatMessageStatusPill[] = []

    if (message.role === 'assistant' && thinkingText?.trim()) {
      pills.push({
        key: `thinking-${message.id}`,
        label: 'Thinking',
        tone: 'muted',
      })
    }

    for (const toolCall of message.tool_calls ?? []) {
      pills.push({
        key: toolCall.tool_call_id,
        label: this.toolCallLabel(toolCall.tool_name, toolCall.status),
        tone: this.toolCallTone(toolCall.status),
      })
    }

    return pills
  }

  shouldShowThinkingToggle(
    message: ChatMessage,
    thinkingText?: string | null
  ): boolean {
    if (message.role !== 'assistant') {
      return false
    }

    if (message.status === 'streaming') {
      return true
    }

    return !!thinkingText?.trim() || (message.tool_calls?.length ?? 0) > 0
  }

  thinkingToggleLabel(message: ChatMessage): string {
    return message.status === 'streaming'
      ? 'Thinking...'
      : 'Thinking complete >'
  }

  shouldShowAssistantActions(message: ChatMessage): boolean {
    return message.role === 'assistant' && message.status !== 'streaming'
  }

  private toolCallLabel(toolName: string, status: string): string {
    if (status === 'completed') {
      return `${toolName} done`
    }
    if (status === 'failed') {
      return `${toolName} failed`
    }
    return `Calling ${toolName}`
  }

  private toolCallTone(status: string): ChatMessageStatusPill['tone'] {
    if (status === 'completed') {
      return 'success'
    }
    if (status === 'failed') {
      return 'danger'
    }
    return 'info'
  }

  private async sendInitialPromptIfNeeded(chatId: number): Promise<void> {
    const state =
      this.router.getCurrentNavigation()?.extras.state ?? window.history.state
    const initialPrompt =
      typeof state?.initialPrompt === 'string' ? state.initialPrompt.trim() : ''

    if (!initialPrompt) {
      return
    }

    if (this.initialPromptHandledForChatId === chatId) {
      return
    }

    if (this.chatState.snapshot.messages.length > 0) {
      return
    }

    this.initialPromptHandledForChatId = chatId
    this.chatState.setPendingInput(initialPrompt)
    await this.chatState.sendMessage(initialPrompt)

    const nextState = { ...window.history.state }
    delete nextState.initialPrompt
    delete nextState.thinkingMode
    window.history.replaceState(nextState, '')
  }

  private isNearPageBottom(): boolean {
    const viewportBottom = window.innerHeight + window.scrollY
    const documentBottom = document.documentElement.scrollHeight
    return documentBottom - viewportBottom < 80
  }
}
