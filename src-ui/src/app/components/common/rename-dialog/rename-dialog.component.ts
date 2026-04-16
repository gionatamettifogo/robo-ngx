import { Component, Input, inject } from '@angular/core'
import { FormsModule } from '@angular/forms'
import { NgbActiveModal } from '@ng-bootstrap/ng-bootstrap'

@Component({
  selector: 'pngx-rename-dialog',
  standalone: true,
  imports: [FormsModule],
  templateUrl: './rename-dialog.component.html',
})
export class RenameDialogComponent {
  private activeModal = inject(NgbActiveModal)

  // ROBO: Simple reusable rename modal for Robo list actions.
  @Input() title = $localize`:Robo|Title for rename dialog:Rename chat`
  @Input() cancelLabel =
    $localize`:Robo|Cancel button label for rename dialog:Cancel`
  @Input() confirmLabel =
    $localize`:Robo|Confirm button label for rename dialog:Rename`
  @Input() value = ''
  closeLabel = $localize`:Robo|Aria label for closing rename dialog:Close`

  close() {
    this.activeModal.dismiss()
  }

  submit() {
    const nextValue = this.value.trim()
    if (!nextValue) {
      return
    }

    this.activeModal.close(nextValue)
  }
}
