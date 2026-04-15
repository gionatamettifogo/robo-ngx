import { CommonModule } from '@angular/common'
import {
  AfterViewInit,
  Component,
  ElementRef,
  EventEmitter,
  Input,
  OnChanges,
  Output,
  SimpleChanges,
  ViewChild,
} from '@angular/core'
import { FormsModule } from '@angular/forms'
import { NgxBootstrapIconsModule } from 'ngx-bootstrap-icons'

@Component({
  selector: 'pngx-robo-chat-composer',
  standalone: true,
  imports: [CommonModule, FormsModule, NgxBootstrapIconsModule],
  template: `
    <section class="robo-composer">
      <div class="robo-composer-shell">
        <div class="robo-composer-left">
          <button
            class="robo-composer-affordance"
            type="button"
            aria-label="Add attachment"
            disabled
          >
            <i-bs name="plus"></i-bs>
          </button>
        </div>

        <div class="robo-composer-input-wrap">
          <textarea
            #composerTextarea
            class="robo-composer-textarea"
            [ngModel]="value"
            (ngModelChange)="onValueChange($event)"
            (input)="autoResizeComposer()"
            (keydown)="onComposerKeydown($event)"
            [disabled]="disabled"
            [placeholder]="placeholder"
            rows="1"
          ></textarea>
        </div>

        <div class="robo-composer-right ms-auto">
          <button
            *ngIf="!showStopButton"
            class="robo-composer-affordance"
            type="button"
            aria-label="Voice input"
            disabled
          >
            <i-bs name="mic"></i-bs>
          </button>
          <button
            *ngIf="showStopButton"
            class="robo-send-button"
            type="button"
            (click)="stop.emit()"
            aria-label="Stop generation"
          >
            <i-bs name="stop-circle-fill"></i-bs>
          </button>
          <button
            *ngIf="!showStopButton"
            class="robo-send-button"
            type="button"
            (click)="onSubmit()"
            [disabled]="submitDisabled"
            aria-label="Send message"
          >
            <i-bs name="arrow-up-circle-fill"></i-bs>
          </button>
        </div>
      </div>
    </section>
  `,
  styles: [
    `
      .robo-composer {
        border: 1px solid var(--bs-border-color);
        border-radius: 1.7rem;
        background: var(--bs-body-bg);
        box-shadow: var(--bs-box-shadow-sm);
        padding: 0.45rem 0.7rem 0.45rem 0.8rem;
      }

      .robo-composer-shell {
        display: flex;
        align-items: center;
        gap: 0.35rem;
        min-height: 2.5rem;
      }

      .robo-composer-textarea {
        flex: 1;
        min-height: 1.6rem;
        max-height: 16rem;
        border: 0;
        outline: 0;
        resize: none;
        overflow: hidden;
        background: transparent;
        color: var(--bs-body-color);
        font-size: 1rem;
        line-height: 1.4;
        padding: 0;
        margin: 0;
      }

      .robo-composer-textarea::placeholder {
        color: var(--bs-secondary-color);
      }

      .robo-composer-left,
      .robo-composer-right {
        display: flex;
        align-items: center;
        gap: 0.35rem;
      }

      .robo-composer-affordance {
        width: 2rem;
        height: 2rem;
        border: 0;
        border-radius: 999px;
        background: transparent;
        color: var(--bs-secondary-color);
        display: inline-flex;
        align-items: center;
        justify-content: center;
      }

      .robo-send-button {
        width: 32px;
        height: 32px;
        border: 0;
        border-radius: 999px;
        background: transparent;
        color: var(--bs-body-color);
        display: inline-flex;
        align-items: center;
        justify-content: center;
        font-size: 32px;
        line-height: 1;
        padding: 0;
      }

      .robo-send-button:disabled {
        opacity: 0.45;
      }

      .robo-composer-input-wrap {
        flex: 1;
        min-width: 0;
        display: flex;
        align-items: center;
        justify-content: center;
        min-height: 2rem;
      }
    `,
  ],
})
export class ChatComposerComponent implements AfterViewInit, OnChanges {
  @ViewChild('composerTextarea')
  private composerTextarea?: ElementRef<HTMLTextAreaElement>

  @Input() value = ''
  @Input() disabled = false
  @Input() placeholder = 'Ask anything'
  @Input() submitDisabled = false
  @Input() showStopButton = false

  @Output() valueChange = new EventEmitter<string>()
  @Output() submit = new EventEmitter<void>()
  @Output() stop = new EventEmitter<void>()

  ngAfterViewInit(): void {
    queueMicrotask(() => this.autoResizeComposer())
  }

  ngOnChanges(changes: SimpleChanges): void {
    if ('value' in changes) {
      queueMicrotask(() => this.autoResizeComposer())
    }
  }

  onValueChange(value: string) {
    this.valueChange.emit(value)
    queueMicrotask(() => this.autoResizeComposer())
  }

  onComposerKeydown(event: KeyboardEvent) {
    if (event.key !== 'Enter' || event.shiftKey || this.submitDisabled) {
      return
    }

    event.preventDefault()
    this.onSubmit()
  }

  autoResizeComposer() {
    const textarea = this.composerTextarea?.nativeElement
    if (!textarea) {
      return
    }

    textarea.style.height = 'auto'
    textarea.style.height = `${Math.min(textarea.scrollHeight, 256)}px`
  }

  private onSubmit() {
    if (this.submitDisabled) {
      return
    }

    const textarea = this.composerTextarea?.nativeElement
    this.submit.emit()
    this.valueChange.emit('')

    if (textarea) {
      textarea.value = ''
      textarea.style.height = 'auto'
    }

    queueMicrotask(() => this.autoResizeComposer())
  }
}
