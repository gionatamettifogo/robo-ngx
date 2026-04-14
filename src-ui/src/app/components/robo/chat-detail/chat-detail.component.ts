import { AsyncPipe, DatePipe, NgFor, NgIf } from '@angular/common'
import { Component, inject, OnDestroy, OnInit } from '@angular/core'
import { FormsModule } from '@angular/forms'
import { ActivatedRoute, RouterLink } from '@angular/router'
import { Subject, takeUntil } from 'rxjs'
import { ChatStateService } from 'src/app/services/chat-state.service'

@Component({
  selector: 'pngx-robo-chat-detail',
  templateUrl: './chat-detail.component.html',
  imports: [AsyncPipe, DatePipe, FormsModule, NgFor, NgIf, RouterLink],
})
export class ChatDetailComponent implements OnInit, OnDestroy {
  private route = inject(ActivatedRoute)
  private destroy$ = new Subject<void>()

  readonly chatState = inject(ChatStateService)

  ngOnInit(): void {
    this.route.paramMap.pipe(takeUntil(this.destroy$)).subscribe((params) => {
      const chatId = Number(params.get('id'))
      if (Number.isFinite(chatId)) {
        void this.chatState.loadChat(chatId)
      }
    })
  }

  ngOnDestroy(): void {
    this.destroy$.next()
    this.destroy$.complete()
    this.chatState.stopStreaming()
  }

  async sendMessage() {
    await this.chatState.sendMessage(this.chatState.snapshot.pendingInput)
  }
}
