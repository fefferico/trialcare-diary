import { Component, inject } from '@angular/core';
import { ConfirmationService } from '../core/confirmation.service';

@Component({
  selector: 'app-confirm-dialog',
  standalone: true,
  template: `
    @if (confirmation.request(); as request) {
      <div class="modal-backdrop confirmation-backdrop" (click)="confirmation.finish(false)" (keydown.escape)="confirmation.finish(false)">
        <section
          class="modal-panel max-w-md p-6"
          role="alertdialog"
          aria-modal="true"
          aria-labelledby="confirmation-title"
          aria-describedby="confirmation-message"
          (click)="$event.stopPropagation()"
        >
          <h2 id="confirmation-title" class="text-lg font-semibold">{{ request.title }}</h2>
          <p id="confirmation-message" class="mt-2 text-sm text-slate-600 dark:text-slate-300">
            {{ request.message }}
          </p>
          <div class="mt-6 flex justify-end gap-2">
            <button type="button" class="button-secondary" (click)="confirmation.finish(false)">
              {{ request.cancelLabel }}
            </button>
            <button type="button" class="button-primary" (click)="confirmation.finish(true)">
              {{ request.confirmLabel }}
            </button>
          </div>
        </section>
      </div>
    }
  `,
})
export class AppConfirmDialogComponent {
  readonly confirmation = inject(ConfirmationService);
}
