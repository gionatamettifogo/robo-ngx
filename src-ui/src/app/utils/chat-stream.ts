import { ChatStreamEvent } from '../data/chat'

export async function consumeNdjsonStream(
  stream: ReadableStream<Uint8Array>,
  onEvent: (event: ChatStreamEvent) => void
): Promise<void> {
  const reader = stream.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  try {
    while (true) {
      const { value, done } = await reader.read()
      if (done) break

      buffer += decoder.decode(value, { stream: true })

      let newlineIndex = buffer.indexOf('\n')
      while (newlineIndex >= 0) {
        const line = buffer.slice(0, newlineIndex).trim()
        buffer = buffer.slice(newlineIndex + 1)

        if (line) {
          onEvent(JSON.parse(line) as ChatStreamEvent)
        }
        newlineIndex = buffer.indexOf('\n')
      }
    }

    const tail = buffer.trim()
    if (tail) {
      onEvent(JSON.parse(tail) as ChatStreamEvent)
    }
  } finally {
    reader.releaseLock()
  }
}
