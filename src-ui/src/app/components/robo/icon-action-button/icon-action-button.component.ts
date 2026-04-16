import { Component, EventEmitter, Input, Output } from '@angular/core'
import { NgbTooltipModule } from '@ng-bootstrap/ng-bootstrap'
import { NgxBootstrapIconsModule } from 'ngx-bootstrap-icons'

@Component({
  selector: 'pngx-robo-icon-action-button',
  standalone: true,
  imports: [NgbTooltipModule, NgxBootstrapIconsModule],
  template: `
    <button
      class="robo-icon-action-button"
      [class.robo-icon-action-button--selected]="selected"
      [class.robo-icon-action-button--disabled]="disabled"
      type="button"
      [ngbTooltip]="tooltip"
      [placement]="placement"
      [attr.aria-label]="ariaLabel || tooltip"
      [disabled]="disabled"
      (click)="onClick($event)"
    >
      <i-bs [name]="icon"></i-bs>
    </button>
  `,
  styles: [
    `
      .robo-icon-action-button {
        width: 2rem;
        height: 2rem;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        border: 0;
        border-radius: 0.5rem;
        padding: 0;
        background: transparent;
        color: var(--bs-secondary-color);
        transition:
          background-color 120ms ease,
          color 120ms ease;
      }

      .robo-icon-action-button:hover {
        background: transparent;
        color: var(--bs-primary);
      }

      .robo-icon-action-button--selected {
        color: var(--bs-primary);
      }

      .robo-icon-action-button--disabled {
        color: var(--bs-secondary-color);
        opacity: 0.5;
        cursor: default;
      }

      .robo-icon-action-button--disabled:hover {
        color: var(--bs-secondary-color);
      }

      .robo-icon-action-button i-bs {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        line-height: 1;
      }
    `,
  ],
})
export class IconActionButtonComponent {
  @Input({ required: true }) icon!: string
  @Input({ required: true }) tooltip!: string
  @Input() ariaLabel = ''
  @Input() placement = 'bottom'
  @Input() selected = false
  @Input() disabled = false
  @Output() pressed = new EventEmitter<void>()

  onClick(event: MouseEvent) {
    event.stopPropagation()
    if (this.disabled) {
      return
    }
    this.pressed.emit()
  }
}
