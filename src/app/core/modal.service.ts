import { Injectable, Type, signal } from '@angular/core';
import { UiStateService } from './ui-state.service';

export interface ModalConfig {
  component: Type<unknown>;
  inputs: Record<string, unknown>;
}

@Injectable({ providedIn: 'root' })
export class ModalService {
  readonly active = signal<ModalConfig | null>(null);

  constructor(private readonly ui: UiStateService) {}

  open(component: Type<unknown>, inputs: Record<string, unknown> = {}): void {
    this.active.set({ component, inputs });
    this.ui.setModal(true);
  }

  close(): void {
    this.active.set(null);
    this.ui.setModal(false);
  }
}
