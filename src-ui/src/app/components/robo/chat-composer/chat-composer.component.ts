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
import { NgbTooltipModule } from '@ng-bootstrap/ng-bootstrap'
import { NgxBootstrapIconsModule } from 'ngx-bootstrap-icons'
import { IconActionButtonComponent } from '../icon-action-button/icon-action-button.component'

@Component({
  selector: 'pngx-robo-chat-composer',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    IconActionButtonComponent,
    NgbTooltipModule,
    NgxBootstrapIconsModule,
  ],
  template: `
    <section class="robo-composer" [class.robo-composer--multiline]="multiline">
      <div class="robo-composer-shell">
        <div
          class="robo-composer-left"
          [class.robo-composer-left--hidden]="multiline"
        >
          <pngx-robo-icon-action-button
            icon="plus"
            tooltip="Add files and more"
            ariaLabel="Add files and more"
            placement="top"
          />
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

        <div
          class="robo-composer-right ms-auto"
          [class.robo-composer-right--hidden]="multiline"
        >
          <pngx-robo-icon-action-button
            *ngIf="!showStopButton"
            icon="mic"
            tooltip="Dictate"
            ariaLabel="Dictate"
            placement="top"
          />
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
            ngbTooltip="Send prompt"
            placement="top"
            [class.robo-send-button--enabled]="!submitDisabled"
            aria-label="Send message"
          >
            <i-bs name="arrow-up"></i-bs>
          </button>
        </div>
      </div>

      <div class="robo-composer-actions" *ngIf="multiline">
        <div class="robo-composer-left">
          <pngx-robo-icon-action-button
            icon="plus"
            tooltip="Add files and more"
            ariaLabel="Add files and more"
            placement="top"
          />
        </div>

        <div class="robo-composer-right ms-auto">
          <pngx-robo-icon-action-button
            *ngIf="!showStopButton"
            icon="mic"
            tooltip="Dictate"
            ariaLabel="Dictate"
            placement="top"
          />
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
            ngbTooltip="Send prompt"
            placement="top"
            [class.robo-send-button--enabled]="!submitDisabled"
            aria-label="Send message"
          >
            <i-bs name="arrow-up"></i-bs>
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

      .robo-composer--multiline .robo-composer-shell {
        align-items: flex-start;
        padding-top: 0.25rem;
      }

      .robo-composer--multiline {
        padding-bottom: 0.7rem;
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
        text-align: left;
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

      .robo-composer-left {
        margin-left: -0.35rem;
      }

      .robo-composer-left--hidden,
      .robo-composer-right--hidden {
        visibility: hidden;
        pointer-events: none;
        width: 0;
        min-width: 0;
        overflow: hidden;
        margin: 0;
      }

      .robo-composer-actions {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 0.75rem;
        margin-top: 0.45rem;
      }

      .robo-send-button {
        width: 32px;
        height: 32px;
        border: 0;
        border-radius: 999px;
        background: #dee2e6;
        color: var(--bs-white, #fff);
        display: inline-flex;
        align-items: center;
        justify-content: center;
        font-size: 18px;
        line-height: 1;
        padding: 0;
      }

      .robo-send-button i-bs {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        line-height: 1;
      }

      .robo-send-button--enabled {
        background: var(--bs-primary);
      }

      .robo-send-button:disabled {
        opacity: 1;
      }

      .robo-composer-input-wrap {
        flex: 1;
        min-width: 0;
        display: flex;
        align-items: center;
        justify-content: center;
        min-height: 2rem;
      }

      .robo-composer:not(.robo-composer--multiline) .robo-composer-input-wrap {
        min-height: 2.25rem;
      }
    `,
  ],
})
export class ChatComposerComponent implements AfterViewInit, OnChanges {
  @ViewChild('composerTextarea')
  private composerTextarea?: ElementRef<HTMLTextAreaElement>
  private readonly singleLineHeightRem = 1.6

  @Input() value = ''
  @Input() disabled = false
  @Input() placeholder = 'Ask anything'
  @Input() submitDisabled = false
  @Input() showStopButton = false

  @Output() valueChange = new EventEmitter<string>()
  @Output() submit = new EventEmitter<void>()
  @Output() stop = new EventEmitter<void>()

  multiline = false

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
    const rootFontSize = Number.parseFloat(
      getComputedStyle(document.documentElement).fontSize
    )
    const singleLineHeight = this.singleLineHeightRem * rootFontSize
    this.multiline = textarea.scrollHeight > singleLineHeight + 4
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
