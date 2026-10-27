import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { ToastService } from '../core/toast.service';

@Component({
  selector: 'tc-toast-container',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (toast.current(); as notification) {
      <div class="pointer-events-none fixed bottom-4 left-4 right-4 z-[120] flex justify-center sm:left-auto sm:right-6 sm:w-[calc(100vw-3rem)] sm:max-w-md sm:justify-end">
        <div
          class="pointer-events-auto flex w-full max-w-md items-start gap-3 rounded-2xl border border-emerald-200 bg-white p-4 text-emerald-950 shadow-xl shadow-slate-950/15 dark:border-emerald-800 dark:bg-slate-900 dark:text-emerald-100"
          role="status"
          aria-live="polite"
        >
          <span class="mt-0.5 shrink-0 text-emerald-700 dark:text-emerald-300" aria-hidden="true">
            <svg viewBox="0 0 24 24" class="h-5 w-5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="12" cy="12" r="9" />
              <path d="m8 12 2.5 2.5L16 9" />
            </svg>
          </span>
          <div class="min-w-0 flex-1">
            <p class="text-sm font-semibold">{{ notification.title }}</p>
          <p class="mt-0.5 break-words text-sm text-slate-600 dark:text-slate-300">{{ notification.message }}</p>
          </div>
          <button
            type="button"
            class="-mr-1 -mt-1 rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600 dark:text-slate-400 dark:hover:bg-slate-800"
            aria-label="Chiudi notifica"
            (click)="toast.dismiss()"
          >
            <svg viewBox="0 0 24 24" class="h-4 w-4" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true">
              <path d="m6 6 12 12M18 6 6 18" />
            </svg>
          </button>
        </div>
      </div>
    }
  `,
})
export class AppToastContainerComponent {
  readonly toast = inject(ToastService);
}
