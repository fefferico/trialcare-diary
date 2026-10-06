import { Component, input, output, signal } from '@angular/core';

@Component({
  selector: 'app-timepicker',
  standalone: true,
  template: ` <div class="relative">
    <div class="flex gap-2">
      <input
        class="field-control min-w-0 flex-1"
        type="text"
        inputmode="numeric"
        placeholder="hh:mm"
        [value]="value()"
        [attr.aria-label]="label()"
        (input)="onInput($event)"
      /><button
        type="button"
        class="icon-button"
        [attr.aria-label]="'Scegli orario: ' + label()"
        (click)="open.update((v) => !v)"
      >
        ◷
      </button>
    </div>
    @if (open()) {
      <div
        class="absolute z-30 mt-2 grid w-full grid-cols-4 gap-1 rounded-2xl border border-slate-200 bg-white p-2 shadow-xl dark:border-slate-700 dark:bg-slate-900"
      >
        @for (time of times; track time) {
          <button
            type="button"
            class="rounded-lg px-2 py-2 text-sm hover:bg-teal-50 dark:hover:bg-slate-800"
            (click)="timeChange.emit(time); open.set(false)"
          >
            {{ time }}
          </button>
        }
      </div>
    }
  </div>`,
})
export class AppTimepickerComponent {
  readonly label = input('Orario');
  readonly value = input('');
  readonly timeChange = output<string>();
  readonly open = signal(false);
  readonly times = Array.from(
    { length: 48 },
    (_, i) => `${String(Math.floor(i / 2)).padStart(2, '0')}:${i % 2 ? '30' : '00'}`,
  );
  onInput(event: Event): void {
    const value = (event.target as HTMLInputElement).value;
    if (/^([01]\d|2[0-3]):[0-5]\d$/.test(value) || !value) this.timeChange.emit(value);
  }
}
