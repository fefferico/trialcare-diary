import { Injectable, OnDestroy, signal } from '@angular/core';

export interface ToastNotification {
  id: number;
  title: string;
  message: string;
}

@Injectable({ providedIn: 'root' })
export class ToastService implements OnDestroy {
  readonly current = signal<ToastNotification | null>(null);
  private nextId = 0;
  private dismissTimer: ReturnType<typeof setTimeout> | null = null;

  showSuccess(title: string, message: string, duration = 5000): void {
    this.clearDismissTimer();
    const id = ++this.nextId;
    this.current.set({ id, title, message });
    this.dismissTimer = setTimeout(() => {
      if (this.current()?.id === id) this.current.set(null);
      this.dismissTimer = null;
    }, duration);
  }

  dismiss(): void {
    this.clearDismissTimer();
    this.current.set(null);
  }

  ngOnDestroy(): void {
    this.clearDismissTimer();
  }

  private clearDismissTimer(): void {
    if (this.dismissTimer === null) return;
    clearTimeout(this.dismissTimer);
    this.dismissTimer = null;
  }
}
