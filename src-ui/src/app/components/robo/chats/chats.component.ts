import { NgClass, NgFor, NgIf } from '@angular/common'
import { Component, inject, OnInit } from '@angular/core'
import { FormsModule } from '@angular/forms'
import { Router } from '@angular/router'
import { NgbDropdownModule } from '@ng-bootstrap/ng-bootstrap'
import { NgxBootstrapIconsModule } from 'ngx-bootstrap-icons'
import { firstValueFrom } from 'rxjs'
import { Chat, ChatMessage } from 'src/app/data/chat'
import { ChatStateService } from 'src/app/services/chat-state.service'
import { ChatService } from 'src/app/services/rest/chat.service'
import { ChatComposerComponent } from '../chat-composer/chat-composer.component'

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
    NgClass,
    NgFor,
    NgIf,
    NgbDropdownModule,
    NgxBootstrapIconsModule,
  ],
  styles: [
    `
      .robo-chats-page {
        max-width: 920px;
        margin: 0 auto;
        padding: 1.5rem 1rem 2rem;
      }

      .robo-page-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 1rem;
        margin-bottom: 3.5rem;
      }

      .robo-icon-button {
        width: 2.25rem;
        height: 2.25rem;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        border: 0;
        border-radius: 999px;
        background: transparent;
        color: var(--bs-secondary-color);
      }

      .robo-icon-button.dropdown-toggle::after {
        display: none;
      }

      .robo-tabs {
        display: inline-flex;
        gap: 0.25rem;
        padding: 0.2rem;
        border-radius: 999px;
        background: var(--bs-tertiary-bg);
        margin: 1.4rem 0 0.85rem;
      }

      .robo-tab {
        border: 0;
        background: transparent;
        border-radius: 999px;
        padding: 0.4rem 0.8rem;
        font-size: 0.875rem;
        font-weight: 600;
        color: var(--bs-secondary-color);
      }

      .robo-tab.active {
        background: var(--bs-body-bg);
        color: var(--bs-body-color);
        box-shadow: 0 1px 2px rgba(33, 37, 41, 0.08);
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
        width: 5.5rem;
        min-width: 5.5rem;
        margin-left: auto;
        position: relative;
      }

      .robo-chat-time,
      .robo-chat-menu {
        transition: opacity 120ms ease;
      }

      .robo-chat-menu {
        opacity: 0;
        position: absolute;
        inset: 50% 0 auto auto;
        transform: translateY(-50%);
        pointer-events: none;
      }

      .robo-chat-row:hover .robo-chat-time,
      .robo-chat-meta--menu-open .robo-chat-time {
        opacity: 0;
        pointer-events: none;
      }

      .robo-chat-row:hover .robo-chat-menu,
      .robo-chat-meta--menu-open .robo-chat-menu {
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

  chatItems: ChatListItem[] = []
  loading = false
  creating = false
  activeTab: 'chats' | 'sources' = 'chats'
  prompt = ''
  thinkingMode: 'regular' | 'extended' = 'regular'
  openMenuChatId: number | null = null

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
          agent_id: 'indena-legal',
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
    const nextTitle = window.prompt('Rename chat', chat.title)?.trim()
    if (!nextTitle || nextTitle === chat.title) {
      return
    }

    await this.saveChat({
      ...chat,
      title: nextTitle,
    })
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
    if (!window.confirm(`Delete "${chat.title}"?`)) {
      return
    }

    await firstValueFrom(this.chatService.delete(chat))
    this.chatItems = this.chatItems.filter((item) => item.chat.id !== chat.id)
  }

  openChat(chatId: number) {
    void this.router.navigate(['/chats', chatId])
  }

  setMenuOpen(chatId: number, isOpen: boolean) {
    this.openMenuChatId = isOpen ? chatId : null
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
