import { NgFor, NgIf } from '@angular/common'
import { Component, inject, OnInit } from '@angular/core'
import { FormsModule } from '@angular/forms'
import { Router } from '@angular/router'
import { NgbModal } from '@ng-bootstrap/ng-bootstrap'
import { NgxBootstrapIconsModule } from 'ngx-bootstrap-icons'
import { firstValueFrom } from 'rxjs'
import { Chat, ChatMessage } from 'src/app/data/chat'
import { ChatStateService } from 'src/app/services/chat-state.service'
import { ChatService } from 'src/app/services/rest/chat.service'
import { ToastService } from 'src/app/services/toast.service'
import { RenameDialogComponent } from '../../common/rename-dialog/rename-dialog.component'
import { ChatComposerComponent } from '../chat-composer/chat-composer.component'
import { IconActionButtonComponent } from '../icon-action-button/icon-action-button.component'

interface ChatListItem {
  chat: Chat
  lastMessage: ChatMessage | null
}

@Component({
  selector: 'pngx-robo-chats',
  templateUrl: './chats.component.html',
  imports: [
    ChatComposerComponent,
    FormsModule,
    IconActionButtonComponent,
    NgFor,
    NgIf,
    NgxBootstrapIconsModule,
  ],
  styles: [
    `
      .robo-chats-page {
        max-width: 920px;
        margin: 0 auto;
        padding: 8rem 1rem 2rem;
      }

      .robo-chat-list,
      .robo-empty-state,
      .robo-loading-state {
        margin-top: 3.5rem;
      }

      .robo-chat-row {
        display: grid;
        grid-template-columns: minmax(0, 1fr) auto;
        gap: 1rem;
        align-items: center;
        width: 100%;
        border: 0;
        border-bottom: 1px solid rgba(33, 37, 41, 0.08);
        background: transparent;
        text-align: left;
        padding: 0.9rem 0.5rem;
        cursor: pointer;
        transition: background-color 120ms ease;
      }

      .robo-chat-row:hover {
        background: var(--bs-tertiary-bg);
      }

      .robo-chat-row:last-child {
        border-bottom: 0;
      }

      .robo-chat-main {
        min-width: 0;
      }

      .robo-chat-title {
        font-size: 0.95rem;
        margin-bottom: 0.15rem;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }

      .robo-chat-preview {
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }

      .robo-chat-time {
        white-space: nowrap;
        text-align: right;
        width: 100%;
      }

      .robo-chat-meta {
        display: flex;
        align-items: center;
        justify-content: flex-end;
        width: 6rem;
        min-width: 6rem;
        margin-left: auto;
        position: relative;
      }

      .robo-chat-time,
      .robo-chat-actions {
        transition: opacity 120ms ease;
      }

      .robo-chat-actions {
        display: inline-flex;
        align-items: center;
        gap: 0.15rem;
        opacity: 0;
        position: absolute;
        inset: 50% 0 auto auto;
        transform: translateY(-50%);
        pointer-events: none;
      }

      .robo-chat-row:hover .robo-chat-time {
        opacity: 0;
        pointer-events: none;
      }

      .robo-chat-row:hover .robo-chat-actions {
        opacity: 1;
        pointer-events: auto;
      }

      .robo-empty-state,
      .robo-loading-state {
        padding: 1rem 0.25rem;
      }

      @media (max-width: 767.98px) {
        .robo-chats-page {
          padding-inline: 0.75rem;
        }

        .robo-chat-row {
          grid-template-columns: minmax(0, 1fr) auto;
        }
      }
    `,
  ],
})
export class ChatsComponent implements OnInit {
  private chatService = inject(ChatService)
  private chatState = inject(ChatStateService)
  private router = inject(Router)
  private modalService = inject(NgbModal)
  private toastService = inject(ToastService)

  chatItems: ChatListItem[] = []
  loading = false
  creating = false
  prompt = ''
  thinkingMode: 'regular' | 'extended' = 'regular'
  readonly renameChatTooltip = $localize`:Robo|Tooltip for renaming a chat from the chats list:Rename chat`
  readonly renameChatAriaLabel = $localize`:Robo|Aria label for renaming a chat from the chats list:Rename chat`
  readonly deleteChatTooltip = $localize`:Robo|Tooltip for deleting a chat from the chats list:Delete chat`
  readonly deleteChatAriaLabel = $localize`:Robo|Aria label for deleting a chat from the chats list:Delete chat`
  readonly deleteChatSuccess = $localize`:Robo|Toast shown after deleting a chat from the chats list:Chat deleted.`
  readonly deleteChatError = $localize`:Robo|Toast shown when deleting a chat from the chats list fails:Error deleting chat`
  readonly renameChatError = $localize`:Robo|Toast shown when renaming a chat from the chats list fails:Error renaming chat`

  ngOnInit(): void {
    void this.reload()
  }

  async reload() {
    this.loading = true
    try {
      const result = await firstValueFrom(this.chatService.list(1, 1000))
      const chats = [...result.results].sort((left, right) =>
        this.chatSortValue(right).localeCompare(this.chatSortValue(left))
      )

      this.chatItems = await Promise.all(
        chats.map(async (chat) => ({
          chat,
          lastMessage: await this.fetchLastMessage(chat.id),
        }))
      )
    } catch {
      this.chatItems = []
    } finally {
      this.loading = false
    }
  }

  async createChat() {
    const trimmedPrompt = this.prompt.trim()
    if (this.creating || !trimmedPrompt) {
      return
    }

    this.creating = true
    try {
      const chat = await firstValueFrom(
        this.chatService.create({
          title: this.buildChatTitle(trimmedPrompt),
          archived: false,
          pinned: false,
        } as Chat)
      )

      this.chatState.reset()
      await this.router.navigate(['/chats', chat.id], {
        state: {
          initialPrompt: trimmedPrompt,
          thinkingMode: this.thinkingMode,
        },
      })
      this.prompt = ''
    } finally {
      this.creating = false
    }
  }

  async renameChat(chat: Chat, event?: Event) {
    event?.stopPropagation()
    const modal = this.modalService.open(RenameDialogComponent, {
      centered: true,
    })
    modal.componentInstance.value = chat.title

    const nextTitle = (await modal.result.catch(() => null)) as string | null
    if (!nextTitle || nextTitle === chat.title) {
      return
    }

    try {
      await this.saveChat({
        ...chat,
        title: nextTitle,
      })
      window.location.reload()
    } catch (error) {
      this.toastService.showError(this.renameChatError, error)
    }
  }

  async togglePinned(chat: Chat, event?: Event) {
    event?.stopPropagation()
    await this.saveChat({
      ...chat,
      pinned: !chat.pinned,
    })
  }

  async deleteChat(chat: Chat, event?: Event) {
    event?.stopPropagation()
    try {
      await firstValueFrom(this.chatService.delete(chat))
      this.chatItems = this.chatItems.filter((item) => item.chat.id !== chat.id)
      this.toastService.showInfo(this.deleteChatSuccess)
    } catch (error) {
      this.toastService.showError(this.deleteChatError, error)
    }
  }

  openChat(chatId: number) {
    void this.router.navigate(['/chats', chatId])
  }

  lastMessagePreview(item: ChatListItem): string {
    return item.lastMessage?.content?.trim() || 'No messages yet.'
  }

  lastMessageTime(item: ChatListItem): string {
    const source = item.chat.last_message_at || item.lastMessage?.created_at
    if (!source) {
      return ''
    }

    const date = new Date(source)
    const now = new Date()
    const startOfToday = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate()
    )
    const startOfDate = new Date(
      date.getFullYear(),
      date.getMonth(),
      date.getDate()
    )
    const diffDays = Math.round(
      (startOfToday.getTime() - startOfDate.getTime()) / 86400000
    )

    if (diffDays === 0) {
      return new Intl.DateTimeFormat(undefined, {
        hour: 'numeric',
        minute: '2-digit',
      }).format(date)
    }

    if (diffDays === 1) {
      return 'Yesterday'
    }

    if (diffDays > 1 && diffDays < 7) {
      return new Intl.DateTimeFormat(undefined, {
        weekday: 'long',
      }).format(date)
    }

    return new Intl.DateTimeFormat(undefined, {
      month: 'short',
      day: 'numeric',
    }).format(date)
  }

  thinkingLabel(): string {
    return this.thinkingMode === 'extended'
      ? 'Extended Thinking'
      : 'Regular Thinking'
  }

  trackByChatId(_index: number, item: ChatListItem): number {
    return item.chat.id
  }

  private async fetchLastMessage(chatId: number): Promise<ChatMessage | null> {
    try {
      const messages = await firstValueFrom(
        this.chatService.listMessages(chatId)
      )
      return messages.length > 0 ? messages[messages.length - 1] : null
    } catch {
      return null
    }
  }

  private async saveChat(chat: Chat): Promise<void> {
    const updated = await firstValueFrom(this.chatService.update(chat))
    this.chatItems = this.chatItems
      .map((item) =>
        item.chat.id === updated.id
          ? {
              ...item,
              chat: updated,
            }
          : item
      )
      .sort((left, right) =>
        this.chatSortValue(right.chat).localeCompare(
          this.chatSortValue(left.chat)
        )
      )
  }

  private buildChatTitle(prompt: string): string {
    const compact = prompt.replace(/\s+/g, ' ').trim()
    return compact.length > 60 ? `${compact.slice(0, 57)}...` : compact
  }

  private chatSortValue(chat: Chat): string {
    return `${chat.pinned ? '1' : '0'}-${chat.last_message_at || chat.created_at}`
  }
}
