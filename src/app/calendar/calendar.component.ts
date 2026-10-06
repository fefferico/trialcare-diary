import { CommonModule } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { AuthService } from '../core/auth.service';
import { DiaryDataService, SearchableDiaryItem } from '../core/diary-data.service';
import { DiaryRow } from '../models/diary.models';
import { AppDatepickerComponent } from '../shared/app-datepicker.component';
import { AppTimepickerComponent } from '../shared/app-timepicker.component';

interface CalendarEvent {
  id: string;
  section: string;
  title: string;
  date: string;
  time: string;
  detail: string;
  status?: string;
  skippedReason?: string;
}

@Component({
  selector: 'tc-calendar',
  standalone: true,
  imports: [CommonModule, RouterLink, AppDatepickerComponent, AppTimepickerComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: ` <section class="space-y-5">
    <header class="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <p class="eyebrow">IL TUO DIARIO · PROGRAMMA</p>
        <h1 class="page-title">Calendario</h1>
        <p class="mt-2 max-w-2xl text-sm text-slate-500 dark:text-slate-400">
          Appuntamenti, ricorrenze, terapie e scadenze del diario.
        </p>
      </div>
      <button
        type="button"
        class="button-primary"
        [disabled]="!children().length"
        (click)="openForm()"
      >
        ＋ Aggiungi evento
      </button>
    </header>
    @if (data.error()) {
      <p role="alert" class="notice-error">
        Non è stato possibile caricare tutti i dati del calendario.
      </p>
    }
    @if (!children().length) {
      <p
        class="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-100"
      >
        Per usare il calendario, crea prima un profilo bambino. Gli eventi sono collegati al profilo
        per mantenere i dati separati.
      </p>
    }
    <section class="panel space-y-4" aria-label="Calendario mensile">
      <div class="flex items-center justify-between gap-3">
        <button
          class="button-secondary"
          type="button"
          aria-label="Mese precedente"
          (click)="moveMonth(-1)"
        >
          ← <span class="hidden sm:inline">Precedente</span>
        </button>
        <h2 class="text-lg font-semibold capitalize">{{ monthLabel() }}</h2>
        <button
          class="button-secondary"
          type="button"
          aria-label="Mese successivo"
          (click)="moveMonth(1)"
        >
          <span class="hidden sm:inline">Successivo</span> →
        </button>
      </div>
      <div class="grid grid-cols-7 gap-1 text-center text-xs font-semibold text-slate-500 sm:gap-2">
        @for (day of weekdays; track day) {
          <div class="py-2">{{ day }}</div>
        }
      </div>
      <div class="grid grid-cols-7 gap-1 sm:gap-2">
        @for (cell of cells(); track cell.key) {
          <button
            type="button"
            class="min-h-16 rounded-xl border p-1.5 text-left transition sm:min-h-24 sm:p-2"
            [ngClass]="{
              'border-transparent bg-slate-50': !cell.date,
              'border-slate-200 dark:border-slate-700': !!cell.date,
              'bg-slate-50 text-slate-400 dark:bg-slate-900/50 dark:text-slate-500':
                !!cell.date && !cell.inCurrentMonth,
              'bg-white text-slate-800 dark:bg-slate-950 dark:text-slate-100':
                !!cell.date && cell.inCurrentMonth,
              'bg-teal-50 dark:bg-teal-900/30': cell.date === selectedDate(),
            }"
            [disabled]="!cell.date"
            [attr.aria-label]="
              cell.date ? dayLabel(cell.date) + ', ' + cell.events.length + ' eventi' : null
            "
            (click)="cell.date && selectedDate.set(cell.date)"
          >
            <span class="flex items-center justify-between text-xs font-semibold"
              ><span>{{ cell.day }}</span>
              @if (cell.events.length) {
                <span class="rounded-full bg-teal-600 px-1.5 py-0.5 text-[10px] text-white">{{
                  cell.events.length
                }}</span>
              }</span
            ><span class="mt-1 hidden space-y-1 sm:block">
              @for (event of cell.events.slice(0, 2); track event.id) {
                <span
                  class="block truncate rounded-md px-1 py-0.5 text-[10px]"
                  [class]="eventTone(event.section)"
                  >{{ event.title }}</span
                >
              }</span
            ><span class="mt-1 flex gap-0.5 sm:hidden">
              @for (event of cell.events.slice(0, 3); track event.id) {
                <i class="h-1.5 w-1.5 rounded-full bg-teal-600"></i>
              }
            </span>
          </button>
        }
      </div>
    </section>
    <section class="panel">
      <div class="flex items-center justify-between">
        <div>
          <p class="eyebrow">{{ dayLabel(selectedDate()) }}</p>
          <h2 class="mt-1 text-lg font-semibold">Programma del giorno</h2>
        </div>
        <button
          type="button"
          class="button-secondary"
          [disabled]="!children().length"
          (click)="openForm(selectedDate())"
        >
          ＋ Evento
        </button>
      </div>
      @if (selectedEvents().length) {
        <div class="mt-4 divide-y divide-slate-100 dark:divide-slate-800">
          @for (event of selectedEvents(); track event.id) {
            <article class="flex items-start gap-3 py-3">
              <span class="mt-1 h-2.5 w-2.5 shrink-0 rounded-full bg-teal-600"></span>
              <div class="min-w-0 flex-1">
                <strong class="block text-sm">{{ event.title }}</strong
                ><span class="mt-1 block text-xs text-slate-500"
                  >{{ event.time || 'Intera giornata' }} · {{ event.detail }}</span
                >
                @if (event.section === 'health_events') {
                  <span
                    class="mt-1 inline-block rounded-full bg-slate-100 px-2 py-0.5 text-xs dark:bg-slate-800"
                    >{{ event.status || 'Confermato' }}</span
                  >
                }
                @if (event.status === 'Saltato' && event.skippedReason) {
                  <p class="mt-1 text-sm text-slate-600 dark:text-slate-300">
                    Motivo: {{ event.skippedReason }}
                  </p>
                }
                @if (event.section === 'health_events' && event.status !== 'Saltato') {
                  <div class="mt-2 flex flex-wrap gap-2">
                    @if (event.status === 'Da confermare') {
                      <button
                        class="button-secondary !px-3 !py-1.5 text-xs"
                        type="button"
                        (click)="setStatus(event, 'Confermato')"
                      >
                        Conferma
                      </button>
                    }
                    <button
                      class="button-secondary !px-3 !py-1.5 text-xs"
                      type="button"
                      (click)="openSkip(event)"
                    >
                      Segna come saltato
                    </button>
                  </div>
                }
              </div>
              <a
                [routerLink]="'/' + event.section"
                class="shrink-0 text-xs text-teal-700 dark:text-teal-300"
                >{{ sectionLabel(event.section) }} →</a
              >
            </article>
          }
        </div>
      } @else {
        <p class="mt-4 rounded-xl bg-slate-50 p-4 text-sm text-slate-500 dark:bg-slate-800/60">
          Nessun evento in programma. Puoi aggiungerne uno per questo giorno.
        </p>
      }
    </section>
    @if (formOpen()) {
      <div class="modal-backdrop" (click)="closeForm()">
        <section
          class="modal-panel max-w-lg"
          role="dialog"
          aria-modal="true"
          aria-labelledby="event-form-title"
          (click)="$event.stopPropagation()"
        >
          <div
            class="flex items-center justify-between border-b border-slate-100 px-5 py-4 dark:border-slate-800"
          >
            <div>
              <p class="eyebrow">NUOVA VOCE</p>
              <h2 id="event-form-title" class="text-xl font-semibold">Aggiungi evento</h2>
            </div>
            <button type="button" class="icon-button" aria-label="Chiudi" (click)="closeForm()">
              ×
            </button>
          </div>
          <form
            class="space-y-4 overflow-y-auto p-5"
            (submit)="$event.preventDefault(); saveEvent()"
          >
            <label class="block text-sm font-medium"
              >Titolo<input
                class="field-control mt-1"
                required
                maxlength="120"
                [value]="title()"
                (input)="title.set($any($event.target).value)"
                placeholder="Es. Controllo in ospedale" /></label
            ><label class="block text-sm font-medium"
              >Data<app-datepicker
                class="mt-1 block"
                [value]="eventDate()"
                (dateChange)="eventDate.set($event)" /></label
            ><label class="block text-sm font-medium"
              >Ora <span class="font-normal text-slate-500">(facoltativa)</span
              ><app-timepicker
                class="mt-1 block"
                [value]="eventTime()"
                (timeChange)="eventTime.set($event)" /></label
            ><label class="block text-sm font-medium"
              >Ripeti<select
                class="field-control mt-1"
                [value]="repeat()"
                (change)="repeat.set($any($event.target).value)"
              >
                <option value="none">Non ripetere</option>
                <option value="weekly">Ogni settimana</option>
                <option value="biweekly">Ogni 2 settimane</option>
                <option value="monthly">Ogni mese</option>
              </select></label
            >
            @if (repeat() !== 'none') {
              <label class="block text-sm font-medium"
                >Ripeti fino al<app-datepicker
                  class="mt-1 block"
                  [value]="repeatUntil()"
                  (dateChange)="repeatUntil.set($event)"
              /></label>
              <p class="text-xs text-slate-500">
                Verranno creati al massimo 100 appuntamenti. Ogni data potrà essere confermata o
                segnata come saltata separatamente.
              </p>
            }
            <label class="block text-sm font-medium"
              >Note <span class="font-normal text-slate-500">(facoltative)</span
              ><textarea
                class="field-control mt-1 min-h-24"
                maxlength="1000"
                [value]="notes()"
                (input)="notes.set($any($event.target).value)"
                placeholder="Dettagli utili"
              ></textarea>
            </label>
            @if (children().length) {
              <label class="block text-sm font-medium"
                >Profilo<select
                  required
                  class="field-control mt-1"
                  [value]="childId()"
                  (change)="childId.set($any($event.target).value)"
                >
                  @for (child of children(); track child.id) {
                    <option [value]="child.id">{{ child.name }}</option>
                  }
                </select></label
              >
            }
            @if (saveError()) {
              <p role="alert" class="notice-error">{{ saveError() }}</p>
            }
            <div
              class="flex justify-end gap-2 border-t border-slate-100 pt-4 dark:border-slate-800"
            >
              <button type="button" class="button-secondary" (click)="closeForm()">Annulla</button
              ><button
                type="submit"
                class="button-primary"
                [disabled]="saving() || !title().trim()"
              >
                {{ saving() ? 'Salvataggio…' : 'Salva evento' }}
              </button>
            </div>
          </form>
        </section>
      </div>
    }
    @if (skipEvent()) {
      <div class="modal-backdrop" (click)="closeSkip()">
        <section
          class="modal-panel max-w-lg"
          role="dialog"
          aria-modal="true"
          aria-labelledby="skip-event-title"
          (click)="$event.stopPropagation()"
        >
          <div class="border-b border-slate-100 px-5 py-4 dark:border-slate-800">
            <p class="eyebrow">AGGIORNA APPUNTAMENTO</p>
            <h2 id="skip-event-title" class="text-xl font-semibold">Segna come saltato</h2>
          </div>
          <form class="space-y-4 p-5" (submit)="$event.preventDefault(); saveSkipped()">
            <label class="block text-sm font-medium"
              >Motivazione<textarea
                class="field-control mt-1 min-h-24"
                required
                maxlength="500"
                [value]="skipReason()"
                (input)="skipReason.set($any($event.target).value)"
                placeholder="Indica perché l'appuntamento è saltato"
              ></textarea>
            </label>
            @if (saveError()) {
              <p role="alert" class="notice-error">{{ saveError() }}</p>
            }
            <div class="flex justify-end gap-2">
              <button type="button" class="button-secondary" (click)="closeSkip()">Annulla</button
              ><button
                type="submit"
                class="button-primary"
                [disabled]="saving() || !skipReason().trim()"
              >
                {{ saving() ? 'Salvataggio…' : 'Conferma' }}
              </button>
            </div>
          </form>
        </section>
      </div>
    }
  </section>`,
})
export class CalendarComponent implements OnInit {
  private readonly auth = inject(AuthService);
  readonly data = inject(DiaryDataService);
  readonly weekdays = ['Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab', 'Dom'];
  readonly entries = signal<SearchableDiaryItem[]>([]);
  readonly month = signal(new Date(new Date().getFullYear(), new Date().getMonth(), 1));
  readonly selectedDate = signal(dateKey(new Date()));
  readonly formOpen = signal(false);
  readonly title = signal('');
  readonly eventDate = signal(dateKey(new Date()));
  readonly eventTime = signal('');
  readonly notes = signal('');
  readonly childId = signal('');
  readonly repeat = signal('none');
  readonly repeatUntil = signal(dateKey(new Date()));
  readonly saving = signal(false);
  readonly saveError = signal('');
  readonly skipEvent = signal<CalendarEvent | null>(null);
  readonly skipReason = signal('');
  readonly children = computed(() =>
    this.entries()
      .filter((item) => item.section === 'children')
      .map((item) => ({ id: item.row.id, name: String(item.row['name'] ?? 'Profilo') })),
  );
  readonly events = computed(() => toEvents(this.entries()));
  readonly monthLabel = computed(() =>
    this.month().toLocaleDateString('it-IT', { month: 'long', year: 'numeric' }),
  );
  readonly cells = computed(() => {
    const first = this.month();
    const offset = (first.getDay() + 6) % 7;
    const days = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate();
    const map = new Map<string, CalendarEvent[]>();
    for (const event of this.events()) {
      const list = map.get(event.date) ?? [];
      list.push(event);
      map.set(event.date, list);
    }
    const cellCount = Math.ceil((offset + days) / 7) * 7;
    return Array.from({ length: cellCount }, (_, index) => {
      const dateValue = new Date(first.getFullYear(), first.getMonth(), index - offset + 1);
      const date = dateKey(dateValue);
      return {
        key: date,
        date,
        day: dateValue.getDate(),
        inCurrentMonth: dateValue.getMonth() === first.getMonth(),
        events: map.get(date) ?? [],
      };
    });
  });
  readonly selectedEvents = computed(() =>
    this.events()
      .filter((event) => event.date === this.selectedDate())
      .sort((a, b) => a.time.localeCompare(b.time)),
  );
  async ngOnInit(): Promise<void> {
    await this.auth.ready;
    this.entries.set(await this.data.loadAllForSearch());
  }
  moveMonth(delta: number): void {
    const current = this.month();
    this.month.set(new Date(current.getFullYear(), current.getMonth() + delta, 1));
  }
  dayLabel(date: string): string {
    return new Date(`${date}T12:00:00`).toLocaleDateString('it-IT', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
    });
  }
  eventTone(section: string): string {
    return section === 'medicine_cabinet'
      ? 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200'
      : section === 'medications'
        ? 'bg-violet-100 text-violet-800 dark:bg-violet-900/40 dark:text-violet-200'
        : section === 'therapies'
          ? 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200'
          : 'bg-teal-100 text-teal-800 dark:bg-teal-900/40 dark:text-teal-200';
  }
  sectionLabel(section: string): string {
    return (
      (
        {
          health_events: 'Evento',
          therapies: 'Terapia',
          medications: 'Farmaco',
          documents: 'Scadenza documento',
          expenses: 'Spesa',
        } as Record<string, string>
      )[section] ?? 'Diario'
    );
  }
  openForm(date = this.selectedDate()): void {
    this.title.set('');
    this.eventDate.set(date);
    this.eventTime.set('');
    this.notes.set('');
    this.repeat.set('none');
    this.repeatUntil.set(date);
    this.childId.set(this.children()[0]?.id ?? '');
    this.saveError.set('');
    this.formOpen.set(true);
  }
  closeForm(): void {
    this.formOpen.set(false);
  }
  async saveEvent(): Promise<void> {
    if (!this.title().trim() || !this.eventDate()) return;
    const dates = this.occurrenceDates();
    if (!dates.length) {
      this.saveError.set('La data finale deve essere successiva o uguale alla data iniziale.');
      return;
    }
    if (dates.length > 100) {
      this.saveError.set(
        'La ricorrenza supera il limite di 100 appuntamenti. Scegli una data finale più vicina.',
      );
      return;
    }
    this.saving.set(true);
    this.saveError.set('');
    const groupId = dates.length > 1 ? crypto.randomUUID() : null;
    const values = dates.map((date) => ({
      title: this.title().trim(),
      category: 'Appuntamento',
      date,
      time: this.eventTime() || null,
      notes: this.notes().trim() || null,
      status: date > dateKey(new Date()) ? 'Da confermare' : 'Confermato',
      skipped_reason: null,
      recurrence_group_id: groupId,
    }));
    const ok = await this.data.saveMany('health_events', values, this.childId() || undefined);
    this.saving.set(false);
    if (!ok) {
      this.saveError.set(this.data.error() || 'Non è stato possibile salvare l’evento.');
      return;
    }
    this.entries.set(await this.data.loadAllForSearch());
    this.selectedDate.set(this.eventDate());
    const [year, month] = this.eventDate().split('-').map(Number);
    this.month.set(new Date(year, month - 1, 1));
    this.closeForm();
  }
  private occurrenceDates(): string[] {
    const start = parseDate(this.eventDate());
    const until = this.repeat() === 'none' ? start : parseDate(this.repeatUntil());
    if (!start || !until || until < start) return [];
    const output: string[] = [];
    let cursor = start;
    while (cursor <= until && output.length < 101) {
      output.push(dateKey(cursor));
      if (this.repeat() === 'none') break;
      cursor = nextOccurrence(cursor, this.repeat());
    }
    return output;
  }
  openSkip(event: CalendarEvent): void {
    this.skipEvent.set(event);
    this.skipReason.set('');
    this.saveError.set('');
  }
  closeSkip(): void {
    this.skipEvent.set(null);
    this.saveError.set('');
  }
  async setStatus(event: CalendarEvent, status: string): Promise<void> {
    await this.updateEvent(event, { status, skipped_reason: null });
  }
  async saveSkipped(): Promise<void> {
    const event = this.skipEvent();
    if (!event || !this.skipReason().trim()) return;
    if (
      await this.updateEvent(event, { status: 'Saltato', skipped_reason: this.skipReason().trim() })
    )
      this.skipEvent.set(null);
  }
  private async updateEvent(
    event: CalendarEvent,
    values: Record<string, unknown>,
  ): Promise<boolean> {
    this.saving.set(true);
    this.saveError.set('');
    const ok = await this.data.update(
      'health_events',
      event.id.replace('health_events-', ''),
      values,
    );
    this.saving.set(false);
    if (!ok) {
      this.saveError.set(this.data.error() || 'Non è stato possibile aggiornare l’evento.');
      return false;
    }
    this.entries.set(await this.data.loadAllForSearch());
    return true;
  }
}
function dateKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}
function parseDate(value: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day
    ? date
    : null;
}
function nextOccurrence(date: Date, repeat: string): Date {
  const next = new Date(date);
  if (repeat === 'weekly') next.setDate(next.getDate() + 7);
  else if (repeat === 'biweekly') next.setDate(next.getDate() + 14);
  else {
    const day = next.getDate();
    next.setDate(1);
    next.setMonth(next.getMonth() + 1);
    next.setDate(Math.min(day, new Date(next.getFullYear(), next.getMonth() + 1, 0).getDate()));
  }
  return next;
}
function toEvents(entries: SearchableDiaryItem[]): CalendarEvent[] {
  const today = dateKey(new Date());
  const output: CalendarEvent[] = [];
  for (const { section, row } of entries) {
    if (section === 'medicine_cabinet') {
      const expiry = String(row['expiry_date'] ?? '').slice(0, 10);
      if (validDate(expiry))
        output.push({
          ...makeEvent(row, section, expiry),
          title: `Scadenza: ${String(row['name'] ?? 'Farmaco')}`,
        });
    } else if (section === 'health_events') {
      const date = String(row['date'] ?? '').slice(0, 10);
      if (validDate(date))
        output.push({
          ...makeEvent(row, section, date),
          status: String(row['status'] ?? (date > today ? 'Da confermare' : 'Confermato')),
          skippedReason: String(row['skipped_reason'] ?? ''),
        });
    } else if (section === 'therapies') {
      const start = String(row['start_date'] ?? '').slice(0, 10);
      if (validDate(start)) output.push(makeEvent(row, section, start));
    } else if (section === 'medications') {
      const start = String(row['start_date'] ?? '').slice(0, 10);
      const end = String(row['end_date'] ?? '').slice(0, 10);
      if (validDate(start) && start >= today) output.push(makeEvent(row, section, start));
      if (validDate(end))
        output.push({
          ...makeEvent(row, section, end),
          id: `${row.id}-end`,
          title: `Fine: ${String(row['name'] ?? 'Terapia farmacologica')}`,
        });
    }
  }
  return output;
}
function makeEvent(row: DiaryRow, section: string, date: string): CalendarEvent {
  const rawTime = String(row['time'] ?? '');
  const time = rawTime.replace(/^(\d{2}:\d{2}):\d{2}(?:\.\d+)?$/, '$1');
  return {
    id: `${section}-${row.id}`,
    section,
    title: String(row['title'] ?? row['name'] ?? row['category'] ?? 'Evento'),
    date,
    time,
    detail: String(row['facility'] ?? row['notes'] ?? row['category'] ?? ''),
  };
}
function validDate(value: string): boolean {
  return !!parseDate(value);
}
