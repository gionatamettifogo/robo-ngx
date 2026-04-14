import { DatePipe, NgFor, NgIf } from '@angular/common'
import { Component, inject, OnInit } from '@angular/core'
import { Router, RouterLink } from '@angular/router'
import { Chat } from 'src/app/data/chat'
import { ChatService } from 'src/app/services/rest/chat.service'

@Component({
  selector: 'pngx-robo-chats',
  templateUrl: './chats.component.html',
  imports: [DatePipe, NgFor, NgIf, RouterLink],
})
export class ChatsComponent implements OnInit {
  private chatService = inject(ChatService)
  private router = inject(Router)

  chats: Chat[] = []
  loading = false
  creating = false

  ngOnInit(): void {
    this.reload()
  }

  reload() {
    this.loading = true
    this.chatService.list(1, 1000).subscribe({
      next: (result) => {
        this.chats = result.results
        this.loading = false
      },
      error: () => {
        this.loading = false
      },
    })
  }

  createChat() {
    if (this.creating) {
      return
    }

    this.creating = true
    this.chatService
      .create({
        title: 'New chat',
        archived: false,
        pinned: false,
        agent_id: 'default',
      } as Chat)
      .subscribe({
        next: (chat) => {
          this.creating = false
          this.router.navigate(['chats', chat.id])
        },
        error: () => {
          this.creating = false
        },
      })
  }
}
