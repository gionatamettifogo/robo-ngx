import { AsyncPipe, DatePipe, NgFor, NgIf } from '@angular/common'
import { Component, inject, OnDestroy, OnInit } from '@angular/core'
import { FormsModule } from '@angular/forms'
import { ActivatedRoute, RouterLink } from '@angular/router'
import { Subject, takeUntil } from 'rxjs'
import { ChatMessage, ChatMessageStatusPill } from 'src/app/data/chat'
import { ChatStateService } from 'src/app/services/chat-state.service'

@Component({
  selector: 'pngx-robo-chat-detail',
  templateUrl: './chat-detail.component.html',
  imports: [AsyncPipe, DatePipe, FormsModule, NgFor, NgIf, RouterLink],
  styles: [
    `
      .robo-status-strip {
        display: flex;
        flex-wrap: wrap;
        gap: 0.5rem;
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
    `,
  ],
})
export class ChatDetailComponent implements OnInit, OnDestroy {
  private route = inject(ActivatedRoute)
  private destroy$ = new Subject<void>()

  readonly chatState = inject(ChatStateService)

  ngOnInit(): void {
    this.route.paramMap.pipe(takeUntil(this.destroy$)).subscribe((params) => {
      const chatId = Number(params.get('id'))
      if (Number.isFinite(chatId)) {
        void this.chatState.loadChat(chatId)
      }
    })
  }

  ngOnDestroy(): void {
    this.destroy$.next()
    this.destroy$.complete()
    this.chatState.stopStreaming()
  }

  async sendMessage() {
    await this.chatState.sendMessage(this.chatState.snapshot.pendingInput)
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
}
