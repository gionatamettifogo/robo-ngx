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

  // ROBO: Reusable feedback modal for negative-response capture in Robo flows.
  @Input() title =
    $localize`:Robo|Title for negative feedback dialog:Share feedback`
  closeLabel = $localize`:Robo|Aria label for closing feedback dialog:Close`
  detailsPlaceholder = $localize`:Robo|Placeholder for optional feedback details textarea:Share details (optional)`
  @Input() reasons = [
    $localize`:Robo|Negative feedback preset reason:Incorrect or incomplete`,
    $localize`:Robo|Negative feedback preset reason:Not what I asked for`,
    $localize`:Robo|Negative feedback preset reason:Slow or buggy`,
    $localize`:Robo|Negative feedback preset reason:Style or tone`,
    $localize`:Robo|Negative feedback preset reason:Safety or legal concern`,
    $localize`:Robo|Negative feedback preset reason:Other`,
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
