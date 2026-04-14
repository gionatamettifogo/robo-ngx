import { Injectable, inject } from '@angular/core'
import { BehaviorSubject, firstValueFrom } from 'rxjs'
import {
  ActiveStreamState,
  ChatConversationState,
  ChatMessage,
  ChatStreamEvent,
  ChatToolCall,
} from 'src/app/data/chat'
import { ChatService } from './rest/chat.service'

const initialState: ChatConversationState = {
  chat: null,
  messages: [],
  pendingInput: '',
  activeStream: null,
  thinkingByMessageId: {},
  error: null,
  loading: false,
}

@Injectable({
  providedIn: 'root',
})
export class ChatStateService {
  private chatService = inject(ChatService)

  private stateSubject = new BehaviorSubject<ChatConversationState>(
    initialState
  )
  readonly state$ = this.stateSubject.asObservable()

  get snapshot(): ChatConversationState {
    return this.stateSubject.value
  }

  reset() {
    this.stateSubject.next(initialState)
  }

  setPendingInput(value: string) {
    this.patchState({ pendingInput: value })
  }

  async loadChat(chatId: number): Promise<void> {
    this.patchState({ loading: true, error: null })
    try {
      const [chat, messages] = await Promise.all([
        firstValueFrom(this.chatService.get(chatId)),
        firstValueFrom(this.chatService.listMessages(chatId)),
      ])
      this.patchState({
        chat,
        messages,
        loading: false,
        error: null,
        thinkingByMessageId: {},
      })
    } catch {
      this.patchState({
        loading: false,
        error: 'Failed to load chat.',
      })
    }
  }

  async sendMessage(content: string): Promise<void> {
    const chat = this.snapshot.chat
    if (!chat || this.snapshot.activeStream?.isStreaming) {
      return
    }

    const trimmed = content.trim()
    if (!trimmed) {
      return
    }

    const abortController = new AbortController()
    this.patchState({
      pendingInput: '',
      error: null,
      activeStream: {
        chatId: chat.id,
        isStreaming: true,
        abortController,
      },
    })

    try {
      await this.chatService.streamMessage({
        chatId: chat.id,
        content: trimmed,
        agentId: chat.agent_id,
        signal: abortController.signal,
        onEvent: (event) => this.applyStreamEvent(event, trimmed),
      })
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        this.markAssistantFailed('client_abort', 'Generation stopped.')
        return
      }
      this.patchState({
        error: 'Failed to send message.',
        activeStream: null,
      })
    }
  }

  stopStreaming() {
    const activeStream = this.snapshot.activeStream
    if (!activeStream?.abortController) {
      return
    }
    activeStream.abortController.abort()
    this.patchState({
      activeStream: null,
    })
  }

  applyStreamEvent(event: ChatStreamEvent, submittedContent?: string) {
    switch (event.type) {
      case 'message_created':
        this.handleMessageCreated(event, submittedContent)
        break
      case 'message_delta':
        this.updateMessage(event.messageId, (message) => ({
          ...message,
          content: `${message.content}${event.text}`,
        }))
        break
      case 'thinking_delta':
        this.patchState({
          thinkingByMessageId: {
            ...this.snapshot.thinkingByMessageId,
            [event.messageId]: `${
              this.snapshot.thinkingByMessageId[event.messageId] ?? ''
            }${event.text}`,
          },
        })
        break
      case 'tool_call_started':
        this.updateMessage(event.messageId, (message) => ({
          ...message,
          tool_calls: [
            ...(message.tool_calls ?? []),
            {
              id: Date.now(),
              tool_call_id: event.toolCallId,
              tool_name: event.toolName,
              arguments_text: '',
              output_text: '',
              status: 'started',
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            },
          ],
        }))
        break
      case 'tool_call_delta':
        this.updateToolCall(event.messageId, event.toolCallId, (toolCall) => ({
          ...toolCall,
          arguments_text: `${toolCall.arguments_text}${event.argumentsText}`,
        }))
        break
      case 'tool_result':
        this.updateOrCreateToolCall(event.messageId, event.toolCallId, {
          tool_name: event.toolName ?? 'tool',
          output_text: JSON.stringify(event.output),
          status: event.status ?? 'completed',
        })
        break
      case 'message_completed':
        this.updateMessage(event.messageId, (message) => ({
          ...message,
          status: 'completed',
          input_tokens:
            event.usage?.inputTokens ?? message.input_tokens ?? null,
          output_tokens:
            event.usage?.outputTokens ?? message.output_tokens ?? null,
          total_tokens:
            event.usage?.totalTokens ?? message.total_tokens ?? null,
        }))
        this.patchState({
          activeStream: null,
        })
        break
      case 'error':
        this.markAssistantFailed(event.code, event.message)
        break
    }
  }

  private handleMessageCreated(
    event: Extract<ChatStreamEvent, { type: 'message_created' }>,
    submittedContent?: string
  ) {
    const messages = [...this.snapshot.messages]
    if (!messages.find((message) => message.id === event.userMessageId)) {
      messages.push({
        id: event.userMessageId,
        chat: event.chatId,
        role: 'user',
        status: 'completed',
        content: submittedContent ?? '',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        run_id: event.runId,
      })
    }
    if (!messages.find((message) => message.id === event.assistantMessageId)) {
      messages.push({
        id: event.assistantMessageId,
        chat: event.chatId,
        role: 'assistant',
        status: 'streaming',
        content: '',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        run_id: event.runId,
        tool_calls: [],
      })
    }

    const activeStream: ActiveStreamState = {
      ...(this.snapshot.activeStream ?? {
        chatId: event.chatId,
        isStreaming: true,
      }),
      runId: event.runId,
      userMessageId: event.userMessageId,
      assistantMessageId: event.assistantMessageId,
      isStreaming: true,
    }

    this.patchState({
      messages,
      activeStream,
    })
  }

  private markAssistantFailed(code: string, message: string) {
    const assistantMessageId = this.snapshot.activeStream?.assistantMessageId
    if (assistantMessageId != null) {
      this.updateMessage(assistantMessageId, (current) => ({
        ...current,
        status: 'failed',
        error_code: code,
        error_message: message,
      }))
    }
    this.patchState({
      activeStream: null,
      error: message,
    })
  }

  private updateMessage(
    messageId: number,
    updater: (message: ChatMessage) => ChatMessage
  ) {
    this.patchState({
      messages: this.snapshot.messages.map((message) =>
        message.id === messageId ? updater(message) : message
      ),
    })
  }

  private updateToolCall(
    messageId: number,
    toolCallId: string,
    updater: (toolCall: ChatToolCall) => ChatToolCall
  ) {
    this.updateMessage(messageId, (message) => ({
      ...message,
      tool_calls: (message.tool_calls ?? []).map((toolCall) =>
        toolCall.tool_call_id === toolCallId ? updater(toolCall) : toolCall
      ),
    }))
  }

  private updateOrCreateToolCall(
    messageId: number,
    toolCallId: string,
    patch: Partial<ChatToolCall> & Pick<ChatToolCall, 'tool_name'>
  ) {
    let found = false

    this.updateMessage(messageId, (message) => {
      const nextToolCalls = (message.tool_calls ?? []).map((toolCall) => {
        if (toolCall.tool_call_id !== toolCallId) {
          return toolCall
        }
        found = true
        return {
          ...toolCall,
          ...patch,
          updated_at: new Date().toISOString(),
        }
      })

      if (found) {
        return {
          ...message,
          tool_calls: nextToolCalls,
        }
      }

      return {
        ...message,
        tool_calls: [
          ...nextToolCalls,
          {
            id: Date.now(),
            tool_call_id: toolCallId,
            tool_name: patch.tool_name,
            arguments_text: patch.arguments_text ?? '',
            output_text: patch.output_text ?? '',
            status: patch.status ?? 'started',
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          },
        ],
      }
    })
  }

  private patchState(patch: Partial<ChatConversationState>) {
    this.stateSubject.next({
      ...this.snapshot,
      ...patch,
    })
  }
}
