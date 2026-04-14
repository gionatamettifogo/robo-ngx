import { ObjectWithId } from './object-with-id'

export interface Chat extends ObjectWithId {
  id: number
  title: string
  archived: boolean
  pinned: boolean
  agent_id: string
  document?: number | null
  created_at: string
  updated_at: string
  last_message_at?: string | null
}

export interface ChatToolCall extends ObjectWithId {
  id: number
  tool_call_id: string
  tool_name: string
  arguments_text: string
  output_text: string
  status: 'started' | 'completed' | 'failed'
  created_at: string
  updated_at: string
}

export interface ChatMessage extends ObjectWithId {
  id: number
  chat: number
  role: 'user' | 'assistant' | 'system' | 'tool'
  status: 'pending' | 'streaming' | 'completed' | 'failed'
  content: string
  created_at: string
  updated_at: string
  model?: string | null
  run_id?: string | null
  error_code?: string | null
  error_message?: string | null
  input_tokens?: number | null
  output_tokens?: number | null
  total_tokens?: number | null
  tool_calls?: ChatToolCall[]
}

export interface ChatMessageStatusPill {
  key: string
  label: string
  tone: 'info' | 'muted' | 'success' | 'danger'
}

export type ChatStreamEvent =
  | {
      type: 'message_created'
      chatId: number
      userMessageId: number
      assistantMessageId: number
      runId: string
    }
  | {
      type: 'message_delta'
      messageId: number
      text: string
    }
  | {
      type: 'thinking_delta'
      messageId: number
      text: string
    }
  | {
      type: 'tool_call_started'
      messageId: number
      toolCallId: string
      toolName: string
    }
  | {
      type: 'tool_call_delta'
      messageId: number
      toolCallId: string
      argumentsText: string
    }
  | {
      type: 'tool_result'
      messageId: number
      toolCallId: string
      toolName?: string
      status?: 'started' | 'completed' | 'failed'
      output: unknown
    }
  | {
      type: 'message_completed'
      messageId: number
      finishReason: 'stop' | 'tool_calls' | 'length' | 'error'
      usage?: {
        inputTokens: number | null
        outputTokens: number | null
        totalTokens: number | null
      } | null
    }
  | {
      type: 'error'
      code: string
      message: string
      retryable?: boolean
    }

export interface ActiveStreamState {
  chatId: number
  runId?: string
  userMessageId?: number
  assistantMessageId?: number
  isStreaming: boolean
  abortController?: AbortController
}

export interface ChatConversationState {
  chat: Chat | null
  messages: ChatMessage[]
  pendingInput: string
  activeStream: ActiveStreamState | null
  thinkingByMessageId: Record<number, string>
  error: string | null
  loading: boolean
}
