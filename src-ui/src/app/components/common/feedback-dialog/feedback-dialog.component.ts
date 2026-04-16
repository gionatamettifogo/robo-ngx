import { NgClass, NgFor } from '@angular/common'
import { Component, Input, inject } from '@angular/core'
import { FormsModule } from '@angular/forms'
import { NgbActiveModal } from '@ng-bootstrap/ng-bootstrap'

export interface FeedbackDialogResult {
  selectedReason: string
  details: string
  reason: string
}

@Component({
  selector: 'pngx-feedback-dialog',
  templateUrl: './feedback-dialog.component.html',
  styleUrls: ['./feedback-dialog.component.scss'],
  standalone: true,
  imports: [FormsModule, NgClass, NgFor],
})
export class FeedbackDialogComponent {
  private activeModal = inject(NgbActiveModal)

  @Input() title = $localize`Share feedback`
  closeLabel = $localize`Close`
  detailsPlaceholder = $localize`Share details (optional)`
  @Input() reasons = [
    $localize`Incorrect or incomplete`,
    $localize`Not what I asked for`,
    $localize`Slow or buggy`,
    $localize`Style or tone`,
    $localize`Safety or legal concern`,
    $localize`Other`,
  ]

  selectedReason = ''
  details = ''

  close() {
    this.activeModal.dismiss()
  }

  submit() {
    if (!this.selectedReason) {
      return
    }

    const details = this.details.trim()
    this.activeModal.close({
      selectedReason: this.selectedReason,
      details,
      reason: details
        ? `${this.selectedReason}: ${details}`
        : this.selectedReason,
    } satisfies FeedbackDialogResult)
  }
}
