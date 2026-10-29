import { Component, input, output, signal } from '@angular/core';

@Component({
  selector: 'app-timepicker',
  standalone: true,
  template: ` <div class="relative">
    <div class="flex gap-2">
      <input
        class="field-control min-w-0 flex-1"
        type="text"
        inputmode="text"
        [placeholder]="withSeconds() ? 'hh:mm:ss' : 'hh:mm'"
        [value]="displayValue()"
        [attr.aria-label]="label()"
        (input)="onInput($event)"
      /><button
        type="button"
        class="icon-button"
        [attr.aria-label]="'Scegli orario: ' + label()"
        [attr.aria-expanded]="open()"
        (click)="togglePicker()"
      >
        <svg viewBox="0 0 24 24" class="h-5 w-5" fill="none" aria-hidden="true">
          <circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="1.7" />
          <path d="M12 6.5v5.8l3.8 2.2" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" />
        </svg>
      </button>
    </div>
    @if (open()) {
      <div
        class="absolute right-0 z-40 mt-2 w-72 rounded-2xl border border-slate-200 bg-white p-4 shadow-xl dark:border-slate-700 dark:bg-slate-900"
        (keydown.escape)="open.set(false)"
      >
        <div class="mb-3 flex items-center justify-center gap-1 font-semibold tabular-nums" aria-live="polite">
          <button type="button" class="rounded-lg px-2 py-1 text-2xl hover:bg-teal-50 dark:hover:bg-slate-800"
            [class.text-teal-700]="mode() === 'hour'" [class.dark:text-teal-300]="mode() === 'hour'"
            [attr.aria-label]="'Seleziona le ore: ' + selectedHourLabel()" (click)="mode.set('hour')">
            {{ selectedHourLabel() }}
          </button>
          <span class="text-2xl text-slate-400">:</span>
          <button type="button" class="rounded-lg px-2 py-1 text-2xl hover:bg-teal-50 dark:hover:bg-slate-800"
            [class.text-teal-700]="mode() === 'minute'" [class.dark:text-teal-300]="mode() === 'minute'"
            [attr.aria-label]="'Seleziona i minuti: ' + selectedMinuteLabel()" (click)="mode.set('minute')">
            {{ selectedMinuteLabel() }}
          </button>
          @if (withSeconds()) { <span class="text-sm text-slate-500">:00</span> }
        </div>

        <div class="mx-auto flex h-60 w-60 items-center justify-center rounded-full bg-slate-50 dark:bg-slate-800/70"
          [attr.aria-label]="mode() === 'hour' ? 'Quadrante per la scelta dell’ora' : 'Quadrante per la scelta dei minuti'">
          <div class="relative h-52 w-52 touch-none select-none rounded-full border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900"
            (pointerdown)="startClockDrag($event)" (pointermove)="moveClockDrag($event)"
            (pointerup)="endClockDrag($event)" (pointercancel)="cancelClockDrag($event)"
            (lostpointercapture)="cancelClockDrag($event)">
            <span class="pointer-events-none absolute left-1/2 top-1/2 z-10 h-[34%] w-1 origin-top rounded-full bg-slate-500 dark:bg-slate-300"
              [style.transform]="'translateX(-50%) rotate(' + hourHandRotation() + 'deg)'" aria-hidden="true"></span>
            <span class="pointer-events-none absolute left-1/2 top-1/2 z-20 h-[43%] w-0.5 origin-top rounded-full bg-teal-600 dark:bg-teal-400"
              [style.transform]="'translateX(-50%) rotate(' + minuteHandRotation() + 'deg)'" aria-hidden="true"></span>

            @if (mode() === 'hour') {
              @for (hour of hourLabels; track hour.value) {
                <button type="button"
                  class="absolute z-30 flex h-8 w-8 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full text-xs font-semibold tabular-nums transition-colors"
                  [class.h-7]="hour.inner" [class.w-7]="hour.inner"
                  [class.bg-teal-700]="selectedHour() === hour.value" [class.text-white]="selectedHour() === hour.value"
                  [class.text-slate-700]="selectedHour() !== hour.value" [class.dark:text-slate-200]="selectedHour() !== hour.value"
                  [class.hover:bg-teal-50]="selectedHour() !== hour.value" [class.dark:hover:bg-slate-800]="selectedHour() !== hour.value"
                  [style.left.%]="hour.left" [style.top.%]="hour.top"
                  [attr.aria-label]="'Seleziona ora ' + hour.value.toString().padStart(2, '0')"
                  [attr.aria-pressed]="selectedHour() === hour.value"
                  (click)="selectHour(hour.value)">
                  {{ hour.label }}
                </button>
              }
            } @else {
              @for (minute of minuteLabels; track minute.value) {
                <button type="button"
                  class="absolute z-30 flex h-8 w-8 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full text-xs font-semibold tabular-nums transition-colors"
                  [class.bg-teal-700]="selectedMinute() === minute.value" [class.text-white]="selectedMinute() === minute.value"
                  [class.text-slate-700]="selectedMinute() !== minute.value" [class.dark:text-slate-200]="selectedMinute() !== minute.value"
                  [class.hover:bg-teal-50]="selectedMinute() !== minute.value" [class.dark:hover:bg-slate-800]="selectedMinute() !== minute.value"
                  [style.left.%]="minute.left" [style.top.%]="minute.top"
                  [attr.aria-label]="'Seleziona ' + minute.value.toString().padStart(2, '0') + ' minuti'"
                  [attr.aria-pressed]="selectedMinute() === minute.value"
                  (click)="selectMinute(minute.value)">
                  {{ minute.label }}
                </button>
              }
            }
            <span class="absolute left-1/2 top-1/2 z-40 h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-teal-700 dark:bg-teal-400" aria-hidden="true"></span>
          </div>
        </div>
        <p class="mt-3 text-center text-xs text-slate-500" aria-live="polite">
          {{ mode() === 'hour' ? 'Trascina la lancetta o scegli l’ora' : 'Trascina la lancetta o scegli i minuti · ogni 5 minuti' }}
        </p>
      </div>
    }
  </div>`,
})
export class AppTimepickerComponent {
  readonly label = input('Orario');
  readonly value = input('');
  readonly withSeconds = input(false);
  readonly timeChange = output<string>();
  readonly open = signal(false);
  readonly mode = signal<'hour' | 'minute'>('hour');
  readonly selectedHour = signal(8);
  readonly selectedMinute = signal(0);
  readonly hourLabels = Array.from({ length: 24 }, (_, value) => {
    const hourOnDial = value % 12 || 12;
    const inner = value === 0 || value > 12;
    const radius = inner ? 28 : 42;
    const angle = (hourOnDial * 30 - 90) * Math.PI / 180;
    return {
      value,
      label: value === 0 ? '00' : value > 12 ? String(value) : String(value),
      inner,
      left: 50 + Math.cos(angle) * radius,
      top: 50 + Math.sin(angle) * radius,
    };
  });
  readonly minuteLabels = Array.from({ length: 12 }, (_, index) => {
    const value = index * 5;
    const angle = (value * 6 - 90) * Math.PI / 180;
    return {
      value,
      label: String(value).padStart(2, '0'),
      left: 50 + Math.cos(angle) * 42,
      top: 50 + Math.sin(angle) * 42,
    };
  });
  private clockPointerId: number | null = null;
  private clockDragMode: 'hour' | 'minute' = 'hour';

  displayValue(): string {
    const value = this.value() ?? '';
    return this.withSeconds() ? value : value.replace(/^((?:[01]\d|2[0-3]):[0-5]\d):[0-5]\d$/, '$1');
  }

  selectedHourLabel(): string {
    return String(this.selectedHour()).padStart(2, '0');
  }

  selectedMinuteLabel(): string {
    return String(this.selectedMinute()).padStart(2, '0');
  }

  hourHandRotation(): number {
    return (this.selectedHour() % 12) * 30 + this.selectedMinute() * 0.5 + 180;
  }

  minuteHandRotation(): number {
    return this.selectedMinute() * 6 + 180;
  }

  togglePicker(): void {
    if (this.open()) {
      this.open.set(false);
      return;
    }
    const match = this.displayValue().match(/^([01]\d|2[0-3]):([0-5]\d)/);
    const now = new Date();
    this.selectedHour.set(match ? Number(match[1]) : now.getHours());
    this.selectedMinute.set(match ? Number(match[2]) : now.getMinutes());
    this.mode.set('hour');
    this.open.set(true);
  }

  selectHour(hour: number): void {
    this.selectedHour.set(hour);
    this.mode.set('minute');
  }

  selectMinute(minute: number): void {
    this.selectedMinute.set(minute);
    this.selectTime(`${this.selectedHourLabel()}:${String(minute).padStart(2, '0')}`);
  }

  startClockDrag(event: PointerEvent): void {
    if (!event.isPrimary || event.button !== 0 || (event.target instanceof Element && event.target.closest('button'))) return;
    this.clockPointerId = event.pointerId;
    this.clockDragMode = this.handNearPointer(event) ?? this.mode();
    this.mode.set(this.clockDragMode);
    event.preventDefault();
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
    this.updateClockFromPointer(event);
  }

  moveClockDrag(event: PointerEvent): void {
    if (this.clockPointerId !== event.pointerId) return;
    event.preventDefault();
    this.updateClockFromPointer(event);
  }

  endClockDrag(event: PointerEvent): void {
    if (this.clockPointerId !== event.pointerId) return;
    this.updateClockFromPointer(event);
    this.clockPointerId = null;
    if (this.clockDragMode === 'hour') this.mode.set('minute');
    else this.selectTime(`${this.selectedHourLabel()}:${this.selectedMinuteLabel()}`);
  }

  cancelClockDrag(event: PointerEvent): void {
    if (this.clockPointerId === event.pointerId) this.clockPointerId = null;
  }

  private updateClockFromPointer(event: PointerEvent): void {
    const bounds = (event.currentTarget as HTMLElement).getBoundingClientRect();
    const deltaX = event.clientX - (bounds.left + bounds.width / 2);
    const deltaY = event.clientY - (bounds.top + bounds.height / 2);
    const distance = Math.hypot(deltaX, deltaY);
    if (distance < bounds.width * 0.1) return;

    const degrees = (Math.atan2(deltaX, -deltaY) * 180 / Math.PI + 360) % 360;
    if (this.clockDragMode === 'hour') {
      const dialHour = Math.round(degrees / 30) % 12;
      const innerRing = distance < bounds.width * 0.34;
      this.selectedHour.set(innerRing ? (dialHour === 0 ? 0 : dialHour + 12) : (dialHour === 0 ? 12 : dialHour));
      return;
    }
    this.selectedMinute.set(Math.round(degrees / 6) % 60);
  }

  private handNearPointer(event: PointerEvent): 'hour' | 'minute' | null {
    const bounds = (event.currentTarget as HTMLElement).getBoundingClientRect();
    const deltaX = event.clientX - (bounds.left + bounds.width / 2);
    const deltaY = event.clientY - (bounds.top + bounds.height / 2);
    const hourLength = bounds.height * 0.34;
    const minuteLength = bounds.height * 0.43;
    const distanceFromCenter = Math.hypot(deltaX, deltaY);
    const distanceToHand = (clockwiseDegrees: number, length: number): number => {
      const radians = clockwiseDegrees * Math.PI / 180;
      const unitX = Math.sin(radians);
      const unitY = -Math.cos(radians);
      const projection = Math.max(0, Math.min(length, deltaX * unitX + deltaY * unitY));
      return Math.hypot(deltaX - projection * unitX, deltaY - projection * unitY);
    };
    const hourDistance = distanceToHand(
      (this.selectedHour() % 12) * 30 + this.selectedMinute() * 0.5,
      hourLength,
    );
    const minuteDistance = distanceToHand(this.selectedMinute() * 6, minuteLength);
    if (Math.min(hourDistance, minuteDistance) > 22) return null;
    if (Math.abs(hourDistance - minuteDistance) < 4) {
      return distanceFromCenter > hourLength + 8 ? 'minute' : 'hour';
    }
    return hourDistance < minuteDistance ? 'hour' : 'minute';
  }

  selectTime(time: string): void {
    const formatted = this.withSeconds() ? `${time}:00` : time;
    this.timeChange.emit(formatted);
    this.open.set(false);
  }

  onInput(event: Event): void {
    const value = (event.target as HTMLInputElement).value;
    if (!value) {
      this.timeChange.emit('');
      return;
    }
    const match = value.match(/^(\d{1,2}):([0-5]\d)(?::([0-5]\d))?$/);
    if (!match || Number(match[1]) > 23) return;
    const normalized = `${match[1].padStart(2, '0')}:${match[2]}${match[3] ? `:${match[3]}` : ''}`;
    this.timeChange.emit(normalized);
  }
}
