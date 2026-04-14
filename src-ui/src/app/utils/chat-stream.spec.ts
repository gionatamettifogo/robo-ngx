import { ReadableStream } from 'node:stream/web'
import { consumeNdjsonStream } from './chat-stream'

function createStream(chunks: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder()
  return new ReadableStream<Uint8Array>({
    start(controller) {
      chunks.forEach((chunk) => controller.enqueue(encoder.encode(chunk)))
      controller.close()
    },
  })
}

describe('consumeNdjsonStream', () => {
  it('handles chunk boundaries and trailing buffers', async () => {
    const events = []

    await consumeNdjsonStream(
      createStream([
        '{"type":"message_delta","messageId":1,"text":"Hel',
        'lo"}\n{"type":"message_delta","messageId":1,"text":" world"}\n{"type":"message_completed","messageId":1,"finishReason":"stop"}',
      ]),
      (event) => events.push(event)
    )

    expect(events).toEqual([
      { type: 'message_delta', messageId: 1, text: 'Hello' },
      { type: 'message_delta', messageId: 1, text: ' world' },
      { type: 'message_completed', messageId: 1, finishReason: 'stop' },
    ])
  })
})
