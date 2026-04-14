import { provideHttpClient, withInterceptorsFromDi } from '@angular/common/http'
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing'
import { TestBed } from '@angular/core/testing'
import { Meta } from '@angular/platform-browser'
import { CookieService } from 'ngx-cookie-service'
import { ReadableStream } from 'node:stream/web'
import { Subscription } from 'rxjs'
import { environment } from 'src/environments/environment'
import { ChatService } from './chat.service'

let httpTestingController: HttpTestingController
let service: ChatService
let subscription: Subscription

beforeEach(() => {
  TestBed.configureTestingModule({
    providers: [
      ChatService,
      provideHttpClient(withInterceptorsFromDi()),
      provideHttpClientTesting(),
    ],
  })

  httpTestingController = TestBed.inject(HttpTestingController)
  service = TestBed.inject(ChatService)
})

describe('ChatService', () => {
  it('should call the chat messages endpoint', () => {
    subscription = service.listMessages(42).subscribe()
    const req = httpTestingController.expectOne(
      `${environment.apiBaseUrl}chats/42/messages/`
    )
    expect(req.request.method).toEqual('GET')
  })

  it('should stream a message using fetch with csrf header', async () => {
    jest.spyOn(TestBed.inject(Meta), 'getTag').mockReturnValue({
      content: 'pngx_',
    } as HTMLMetaElement)
    jest
      .spyOn(TestBed.inject(CookieService), 'get')
      .mockReturnValue('token-123')

    const fetchSpy = jest.fn().mockResolvedValue({
      ok: true,
      body: new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(
            new TextEncoder().encode(
              '{"type":"message_completed","messageId":9,"finishReason":"stop"}\n'
            )
          )
          controller.close()
        },
      }),
    } as unknown as Response)
    ;(globalThis as any).fetch = fetchSpy

    const onEvent = jest.fn()
    await service.streamMessage({
      chatId: 42,
      content: 'hello',
      onEvent,
    })

    expect(fetchSpy).toHaveBeenCalledWith(
      `${environment.apiBaseUrl}chats/42/messages/stream/`,
      expect.objectContaining({
        method: 'POST',
        credentials: 'include',
        headers: expect.objectContaining({
          Accept: `application/json; version=${environment.apiVersion}`,
          'Content-Type': 'application/json',
          'X-CSRFToken': 'token-123',
        }),
      })
    )
    expect(onEvent).toHaveBeenCalledWith({
      type: 'message_completed',
      messageId: 9,
      finishReason: 'stop',
    })

    delete (globalThis as any).fetch
  })
})
