import { TestBed } from '@angular/core/testing'
import { ChatStateService } from './chat-state.service'
import { ChatService } from './rest/chat.service'

describe('ChatStateService', () => {
  let service: ChatStateService

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        ChatStateService,
        {
          provide: ChatService,
          useValue: {
            get: jest.fn(),
            listMessages: jest.fn(),
            streamMessage: jest.fn(),
          },
        },
      ],
    })

    service = TestBed.inject(ChatStateService)
    service.reset()
  })

  it('creates user and assistant placeholders on message_created', () => {
    service.applyStreamEvent(
      {
        type: 'message_created',
        chatId: 1,
        userMessageId: 10,
        assistantMessageId: 11,
        runId: 'run_1',
      },
      'hello'
    )

    expect(service.snapshot.messages.map((message) => message.id)).toEqual([
      10, 11,
    ])
    expect(service.snapshot.messages[1].status).toEqual('streaming')
  })

  it('appends message deltas and finalizes the assistant message', () => {
    service.applyStreamEvent(
      {
        type: 'message_created',
        chatId: 1,
        userMessageId: 10,
        assistantMessageId: 11,
        runId: 'run_1',
      },
      'hello'
    )

    service.applyStreamEvent({
      type: 'message_delta',
      messageId: 11,
      text: 'Hi there',
    })
    service.applyStreamEvent({
      type: 'message_completed',
      messageId: 11,
      finishReason: 'stop',
      usage: {
        inputTokens: 1,
        outputTokens: 2,
        totalTokens: 3,
      },
    })

    expect(service.snapshot.messages[1].content).toEqual('Hi there')
    expect(service.snapshot.messages[1].status).toEqual('completed')
    expect(service.snapshot.activeStream).toBeNull()
  })

  it('marks the assistant failed on error', () => {
    service.applyStreamEvent(
      {
        type: 'message_created',
        chatId: 1,
        userMessageId: 10,
        assistantMessageId: 11,
        runId: 'run_1',
      },
      'hello'
    )

    service.applyStreamEvent({
      type: 'error',
      code: 'upstream_error',
      message: 'boom',
    })

    expect(service.snapshot.messages[1].status).toEqual('failed')
    expect(service.snapshot.error).toEqual('boom')
    expect(service.snapshot.activeStream).toBeNull()
  })

  it('tracks thinking text and tool call lifecycle on streamed assistant messages', () => {
    service.applyStreamEvent(
      {
        type: 'message_created',
        chatId: 1,
        userMessageId: 10,
        assistantMessageId: 11,
        runId: 'run_1',
      },
      'hello'
    )

    service.applyStreamEvent({
      type: 'thinking_delta',
      messageId: 11,
      text: 'Need to search.',
    })
    service.applyStreamEvent({
      type: 'tool_call_started',
      messageId: 11,
      toolCallId: 'tool_1',
      toolName: 'search_documents',
    })
    service.applyStreamEvent({
      type: 'tool_call_delta',
      messageId: 11,
      toolCallId: 'tool_1',
      argumentsText: '{"query":"invoice"}',
    })
    service.applyStreamEvent({
      type: 'tool_result',
      messageId: 11,
      toolCallId: 'tool_1',
      toolName: 'search_documents',
      status: 'completed',
      output: { hits: 3 },
    })

    expect(service.snapshot.thinkingByMessageId[11]).toEqual('Need to search.')
    expect(service.snapshot.messages[1].tool_calls).toEqual([
      expect.objectContaining({
        tool_call_id: 'tool_1',
        tool_name: 'search_documents',
        arguments_text: '{"query":"invoice"}',
        output_text: '{"hits":3}',
        status: 'completed',
      }),
    ])
  })

  it('creates a tool call from tool_result when the result arrives first', () => {
    service.applyStreamEvent(
      {
        type: 'message_created',
        chatId: 1,
        userMessageId: 10,
        assistantMessageId: 11,
        runId: 'run_1',
      },
      'hello'
    )

    service.applyStreamEvent({
      type: 'tool_result',
      messageId: 11,
      toolCallId: 'tool_9',
      toolName: 'lookup_document',
      status: 'failed',
      output: 'Not found',
    })

    expect(service.snapshot.messages[1].tool_calls).toEqual([
      expect.objectContaining({
        tool_call_id: 'tool_9',
        tool_name: 'lookup_document',
        output_text: '"Not found"',
        status: 'failed',
      }),
    ])
  })

  it('aborts and clears the active stream state', () => {
    service['patchState']({
      activeStream: {
        chatId: 1,
        isStreaming: true,
        abortController: new AbortController(),
      },
    })
    const abortSpy = jest.spyOn(
      service.snapshot.activeStream.abortController,
      'abort'
    )

    service.stopStreaming()

    expect(abortSpy).toHaveBeenCalled()
    expect(service.snapshot.activeStream).toBeNull()
  })
})
