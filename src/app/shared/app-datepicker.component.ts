import { Component, input, output, signal } from '@angular/core';

@Component({
  selector: 'app-datepicker',
  standalone: true,
  template: ` <div class="relative">
    <div class="flex gap-2">
      <input
        class="field-control min-w-0 flex-1"
        type="text"
        inputmode="numeric"
        [value]="displayValue()"
        [placeholder]="monthOnly() ? 'MM/aaaa' : 'gg/mm/aaaa'"
        [attr.aria-label]="label()"
        (input)="onInput($event)"
      /><button
        type="button"
        class="icon-button"
        [attr.aria-label]="'Apri calendario: ' + label()"
        (click)="toggleCalendar()"
      >
        <svg
          class="h-5 w-5"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="1.8"
          stroke-linecap="round"
          stroke-linejoin="round"
          aria-hidden="true"
        >
          <rect x="3.5" y="5" width="17" height="16" rx="2.5" />
          <path d="M7.5 3v4M16.5 3v4M4 9.5h16M8 13h.01M12 13h.01M16 13h.01M8 17h.01M12 17h.01" />
        </svg>
      </button>
    </div>
    @if (calendarOpen()) {
      <div
        class="absolute z-30 mt-2 w-72 rounded-2xl border border-slate-200 bg-white p-4 shadow-xl dark:border-slate-700 dark:bg-slate-900"
      >
        <div class="mb-3 flex items-center justify-between">
          <button type="button" class="icon-button" (click)="monthOnly() ? shiftYear(-1) : shiftMonth(-1)">‹</button
          ><strong class="text-sm">{{ monthLabel() }}</strong
          ><button type="button" class="icon-button" (click)="monthOnly() ? shiftYear(1) : shiftMonth(1)">›</button>
        </div>
        @if (monthOnly()) {
          <div class="grid grid-cols-3 gap-2">
            @for (month of months; track $index) {
              <button type="button" class="rounded-xl px-2 py-3 text-sm hover:bg-teal-50 dark:hover:bg-slate-800" (click)="chooseMonth($index)">{{ month }}</button>
            }
          </div>
        } @else {
          <div class="grid grid-cols-7 gap-1 text-center text-xs text-slate-400">
            @for (day of weekdays; track $index) { <span class="py-1">{{ day }}</span> }
          </div>
          <div class="grid grid-cols-7 gap-1">
            @for (day of days(); track $index) {
              <button type="button" class="h-8 rounded-lg text-sm hover:bg-teal-50 dark:hover:bg-slate-800" [disabled]="!day" (click)="choose(day)">{{ day || '' }}</button>
            }
          </div>
        }
      </div>
    }
  </div>`,
})
export class AppDatepickerComponent {
  readonly label = input('Data');
  readonly value = input('');
  readonly monthOnly = input(false);
  readonly lenient = input(false);
  readonly dateChange = output<string>();
  readonly monthOnlyDetected = output<void>();
  readonly calendarOpen = signal(false);
  readonly weekdays = ['L', 'M', 'M', 'G', 'V', 'S', 'D'];
  readonly months = ['Gennaio', 'Febbraio', 'Marzo', 'Aprile', 'Maggio', 'Giugno', 'Luglio', 'Agosto', 'Settembre', 'Ottobre', 'Novembre', 'Dicembre'];
  private cursor = new Date();
  readonly monthLabel = signal('');
  readonly days = signal<(number | null)[]>([]);
  constructor() {
    this.refresh();
  }
  displayValue(): string {
    const value = this.value();
    if (!value) return '';
    const [y, m, d] = value.split('-');
    if (this.monthOnly()) return y && m ? `${m}/${y}` : value;
    return y && m && d ? `${d}/${m}/${y}` : value;
  }
  onInput(event: Event): void {
    const text = (event.target as HTMLInputElement).value.trim();
    if (this.monthOnly()) {
      const match = /^(0?[1-9]|1[0-2])\/?(\d{4})$/.exec(text);
      if (match) this.dateChange.emit(`${match[2]}-${match[1].padStart(2, '0')}-01`);
      else if (!text) this.dateChange.emit('');
      return;
    }
    const match = /^([0-3]?\d)\/([01]?\d)\/(\d{4})$/.exec(text);
    if (match)
      this.dateChange.emit(`${match[3]}-${match[2].padStart(2, '0')}-${match[1].padStart(2, '0')}`);
    else if (this.lenient() && /^\d+$/.test(text)) this.parseCompactDate(text);
    else if (!text) this.dateChange.emit('');
  }
  private parseCompactDate(text: string): void {
    const year = Number(text.slice(-4));
    if (year < 1000 || year > 9999) return;
    if (text.length === 6) {
      const firstTwo = Number(text.slice(0, 2));
      if (firstTwo >= 1 && firstTwo <= 12) {
        this.monthOnlyDetected.emit();
        this.dateChange.emit(`${year}-${String(firstTwo).padStart(2, '0')}-01`);
        return;
      }
      const day = Number(text[0]);
      const month = Number(text[1]);
      this.emitValidDate(year, month, day);
      return;
    }
    if (text.length === 8) {
      this.emitValidDate(year, Number(text.slice(2, 4)), Number(text.slice(0, 2)));
    }
  }
  private emitValidDate(year: number, month: number, day: number): void {
    const date = new Date(year, month - 1, day);
    if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) return;
    this.dateChange.emit(`${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`);
  }
  shiftMonth(delta: number): void {
    this.cursor = new Date(this.cursor.getFullYear(), this.cursor.getMonth() + delta, 1);
    this.refresh();
  }
  shiftYear(delta: number): void {
    this.cursor = new Date(this.cursor.getFullYear() + delta, this.cursor.getMonth(), 1);
    this.refresh();
  }
  toggleCalendar(): void {
    if (!this.calendarOpen()) {
      const match = /^(\d{4})-(\d{2})/.exec(this.value());
      if (match) this.cursor = new Date(Number(match[1]), Number(match[2]) - 1, 1);
      this.refresh();
    }
    this.calendarOpen.update((open) => !open);
  }
  chooseMonth(month: number): void {
    this.dateChange.emit(`${this.cursor.getFullYear()}-${String(month + 1).padStart(2, '0')}-01`);
    this.calendarOpen.set(false);
  }
  choose(day: number | null): void {
    if (!day) return;
    this.dateChange.emit(
      `${this.cursor.getFullYear()}-${String(this.cursor.getMonth() + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`,
    );
    this.calendarOpen.set(false);
  }
  private refresh(): void {
    this.monthLabel.set(this.monthOnly() ? String(this.cursor.getFullYear()) :
      this.cursor.toLocaleDateString('it-IT', { month: 'long', year: 'numeric' }));
    const first = (new Date(this.cursor.getFullYear(), this.cursor.getMonth(), 1).getDay() + 6) % 7;
    const total = new Date(this.cursor.getFullYear(), this.cursor.getMonth() + 1, 0).getDate();
    this.days.set([...Array(first).fill(null), ...Array.from({ length: total }, (_, i) => i + 1)]);
  }
}
