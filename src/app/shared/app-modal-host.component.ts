import { CommonModule } from '@angular/common';
import { Component, inject } from '@angular/core';
import { ModalService } from '../core/modal.service';

@Component({
  selector: 'app-modal-host',
  standalone: true,
  imports: [CommonModule],
  template: `
    @if (modal.active(); as active) {
      <ng-container *ngComponentOutlet="active.component; inputs: active.inputs" />
    }
  `,
})
export class AppModalHostComponent {
  readonly modal = inject(ModalService);
}
