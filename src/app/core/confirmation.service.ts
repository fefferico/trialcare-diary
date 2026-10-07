import { Injectable, signal } from '@angular/core';

export interface ConfirmationRequest {
  title: string;
  message: string;
  confirmLabel: string;
  cancelLabel: string;
}

@Injectable({ providedIn: 'root' })
export class ConfirmationService {
  readonly request = signal<ConfirmationRequest | null>(null);
  private resolveRequest: ((confirmed: boolean) => void) | null = null;

  confirm(message: string, options: Partial<ConfirmationRequest> = {}): Promise<boolean> {
    this.finish(false);
    this.request.set({
      title: options.title ?? 'Conferma',
      message,
      confirmLabel: options.confirmLabel ?? 'Conferma',
      cancelLabel: options.cancelLabel ?? 'Annulla',
    });
    return new Promise((resolve) => {
      this.resolveRequest = resolve;
    });
  }

  finish(confirmed: boolean): void {
    this.request.set(null);
    const resolve = this.resolveRequest;
    this.resolveRequest = null;
    resolve?.(confirmed);
  }
}
