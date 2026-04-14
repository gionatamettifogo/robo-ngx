import { inject, Injectable } from '@angular/core'
import { Meta } from '@angular/platform-browser'
import { CookieService } from 'ngx-cookie-service'
import { Observable } from 'rxjs'
import { Chat, ChatMessage, ChatStreamEvent } from 'src/app/data/chat'
import { consumeNdjsonStream } from 'src/app/utils/chat-stream'
import { environment } from 'src/environments/environment'
import { AbstractPaperlessService } from './abstract-paperless-service'

@Injectable({
  providedIn: 'root',
})
export class ChatService extends AbstractPaperlessService<Chat> {
  private meta = inject(Meta)
  private cookieService = inject(CookieService)

  constructor() {
    super()
    this.resourceName = 'chats'
  }

  listMessages(chatId: number): Observable<ChatMessage[]> {
    return this.http.get<ChatMessage[]>(this.getResourceUrl(chatId, 'messages'))
  }

  async streamMessage(params: {
    chatId: number
    content: string
    documentIds?: number[]
    agentId?: string
    includeThinking?: boolean
    signal?: AbortSignal
    onEvent: (event: ChatStreamEvent) => void
  }): Promise<void> {
    const response = await fetch(
      this.getResourceUrl(params.chatId, 'messages/stream'),
      {
        method: 'POST',
        credentials: 'include',
        signal: params.signal,
        headers: {
          'Content-Type': 'application/json',
          // fetch() bypasses Angular interceptors, so the API version header
          // must be added manually for DRF Accept-header negotiation.
          Accept: `application/json; version=${environment.apiVersion}`,
          ...this.getCsrfHeaders(),
        },
        body: JSON.stringify({
          content: params.content,
          document_ids: params.documentIds ?? [],
          agent_id: params.agentId,
          include_thinking: params.includeThinking ?? false,
        }),
      }
    )

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`)
    }

    if (!response.body) {
      throw new Error('Missing response body')
    }

    await consumeNdjsonStream(response.body, params.onEvent)
  }

  private getCsrfHeaders(): Record<string, string> {
    let prefix = ''
    const prefixTag = this.meta.getTag('name=cookie_prefix')
    if (prefixTag?.content) {
      prefix = prefixTag.content
    }

    const csrfToken = this.cookieService.get(`${prefix}csrftoken`)
    return csrfToken ? { 'X-CSRFToken': csrfToken } : {}
  }
}
