import { Injectable, signal } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class UiStateService {
  readonly darkMode = signal(localStorage.getItem('trialcare-theme') === 'dark');
  readonly menuOpen = signal(false);
  readonly modalOpen = signal(false);

  constructor() { this.applyTheme(); }
  toggleTheme(): void { this.darkMode.update(value => !value); localStorage.setItem('trialcare-theme', this.darkMode() ? 'dark' : 'light'); this.applyTheme(); }
  setModal(open: boolean): void { this.modalOpen.set(open); this.resetBodyScroll(); }
  resetBodyScroll(): void { document.body.classList.toggle('overflow-hidden', this.modalOpen() || this.menuOpen()); }
  private applyTheme(): void { document.documentElement.classList.toggle('dark', this.darkMode()); }
}
