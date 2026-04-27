import { NO_ERRORS_SCHEMA } from '@angular/core'
import { ComponentFixture, TestBed } from '@angular/core/testing'
import { ActivatedRoute, Router, convertToParamMap } from '@angular/router'
import { NgbModal } from '@ng-bootstrap/ng-bootstrap'
import { NgxBootstrapIconsModule, allIcons } from 'ngx-bootstrap-icons'
import { BehaviorSubject, EMPTY, of } from 'rxjs'
import { ChatConversationState } from 'src/app/data/chat'
import { ChatStateService } from 'src/app/services/chat-state.service'
import { ChatService } from 'src/app/services/rest/chat.service'
import { ToastService } from 'src/app/services/toast.service'
import { ChatDetailComponent } from './chat-detail.component'

jest.mock('ngx-markdown', () => {
  const { Component } = jest.requireActual('@angular/core')

  @Component({
    selector: 'markdown',
    template: '',
    standalone: true,
  })
  class MockMarkdownComponent {}

  return {
    MarkdownComponent: MockMarkdownComponent,
  }
})

describe('ChatDetailComponent', () => {
  let fixture: ComponentFixture<ChatDetailComponent>
  let stateSubject: BehaviorSubject<ChatConversationState>

  beforeEach(async () => {
    stateSubject = new BehaviorSubject<ChatConversationState>({
      chat: {
        id: 1,
        title: 'Chat',
        archived: false,
        pinned: false,
        agent_id: 'agent',
        created_at: '2026-04-27T00:00:00Z',
        updated_at: '2026-04-27T00:00:00Z',
      },
      messages: [],
      pendingInput: '',
      activeStream: null,
      thinkingByMessageId: {},
      error: null,
      loading: false,
    })

    await TestBed.configureTestingModule({
      imports: [ChatDetailComponent, NgxBootstrapIconsModule.pick(allIcons)],
      providers: [
        {
          provide: ActivatedRoute,
          useValue: {
            paramMap: of(convertToParamMap({ id: 'invalid' })),
          },
        },
        {
          provide: Router,
          useValue: {
            createUrlTree: jest.fn(() => ({})),
            events: EMPTY,
            getCurrentNavigation: jest.fn(),
            navigate: jest.fn(),
            serializeUrl: jest.fn(() => '/chats'),
          },
        },
        {
          provide: NgbModal,
          useValue: {
            open: jest.fn(),
          },
        },
        {
          provide: ChatService,
          useValue: {
            update: jest.fn(),
            delete: jest.fn(),
            deleteMessage: jest.fn(),
          },
        },
        {
          provide: ToastService,
          useValue: {
            showError: jest.fn(),
            showInfo: jest.fn(),
          },
        },
        {
          provide: ChatStateService,
          useValue: {
            state$: stateSubject.asObservable(),
            snapshot: stateSubject.value,
            stopStreaming: jest.fn(),
            loadChat: jest.fn(),
            sendMessage: jest.fn(),
            setPendingInput: jest.fn(),
            reset: jest.fn(),
            removeMessages: jest.fn(),
            setMessageFeedback: jest.fn(),
          },
        },
      ],
      schemas: [NO_ERRORS_SCHEMA],
    }).compileComponents()

    fixture = TestBed.createComponent(ChatDetailComponent)
  })

  it('shows the empty state when there are no messages and no request is in flight', () => {
    fixture.detectChanges()

    expect(fixture.nativeElement.textContent).toContain('No messages yet.')
  })

  it('hides the empty state while the first message is waiting for a streamed response', () => {
    stateSubject.next({
      ...stateSubject.value,
      activeStream: {
        chatId: 1,
        isStreaming: true,
      },
    })

    fixture.detectChanges()

    expect(fixture.nativeElement.textContent).not.toContain('No messages yet.')
  })
})
