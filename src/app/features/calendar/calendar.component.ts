import { CommonModule } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  OnDestroy,
  OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { AuthService } from '../../core/auth.service';
import { ConfirmationService } from '../../core/confirmation.service';
import { ModalService } from '../../core/modal.service';
import { DiaryDataService, SearchableDiaryItem } from '../../core/diary-data.service';
import { DiaryRow } from '../../models/diary.models';
import { medicineCabinetExpiry } from '../../models/medicine-cabinet-expiry';
import { AppDatepickerComponent } from '../../shared/app-datepicker.component';
import { AppDropdownComponent } from '../../shared/app-dropdown.component';
import { AppTimepickerComponent } from '../../shared/app-timepicker.component';
import { TooltipDirective } from '../../shared/directives/tooltip.directive';
import { LucideMapPin, LucidePlus, LucideSearch, LucideUsersRound } from '@lucide/angular';
import {
  CalendarEventFormDialogComponent,
  CalendarEventFormController,
} from './calendar-event-form-dialog.component';
import { StorageService } from '../../core/storage.service';
import { SupabaseClientService } from '../../core/supabase-client.service';
import { Subscription } from 'rxjs';

interface CalendarEvent {
  id: string;
  childId?: string;
  section: string;
  title: string;
  date: string;
  time: string;
  endTime?: string;
  category: string;
  recurrenceGroupId?: string;
  specialist: string;
  contactIds: string[];
  location: string;
  detail: string;
  status?: string;
  skippedReason?: string;
  medicationId?: string;
  isSpotDose?: boolean;
  doseTaken?: boolean;
  takenAt?: string;
  doseSkipped?: boolean;
}

@Component({
  selector: 'tc-calendar',
  standalone: true,
  imports: [
    CommonModule,
    RouterLink,
    AppDatepickerComponent,
    AppDropdownComponent,
    AppTimepickerComponent,
    TooltipDirective,
    LucideMapPin,
    LucidePlus,
    LucideSearch,
    LucideUsersRound,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './calendar.component.html',
})
export class CalendarComponent implements OnInit, OnDestroy, CalendarEventFormController {
  private readonly route = inject(ActivatedRoute);
  private readonly host = inject(ElementRef<HTMLElement>);
  private readonly auth = inject(AuthService);
  private readonly confirmation = inject(ConfirmationService);
  private readonly modal = inject(ModalService);
  readonly data = inject(DiaryDataService);
  readonly weekdays = ['Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab', 'Dom'];
  readonly entries = signal<SearchableDiaryItem[]>([]);
  readonly expandedSkippedEvents = signal<Record<string, boolean>>({});
  readonly loading = signal(true);
  readonly month = signal(new Date(new Date().getFullYear(), new Date().getMonth(), 1));
  readonly today = dateKey(new Date());
  readonly selectedDate = signal(dateKey(new Date()));
  readonly historyCategory = signal('');
  readonly historyQuery = signal('');
  readonly historyFrom = signal('');
  readonly historyTo = signal(dateKey(new Date()));
  readonly formOpen = signal(false);
  readonly title = signal('');
  readonly eventCategory = signal('');
  readonly specialist = signal('');
  readonly eventStatus = signal('Confermato');
  readonly eventSkippedReason = signal('');
  readonly selectedContactIds = signal<string[]>([]);
  readonly location = signal('');
  readonly eventDate = signal(dateKey(new Date()));
  readonly eventTime = signal('');
  readonly notes = signal('');
  readonly childId = signal('');
  readonly repeat = signal('none');
  readonly repeatUntil = signal(dateKey(new Date()));
  readonly saving = signal(false);
  readonly saveError = signal('');
  readonly skipEvent = signal<CalendarEvent | null>(null);
  readonly focusedEvent = signal<CalendarEvent | null>(null);
  readonly editingEvent = signal<CalendarEvent | null>(null);
  readonly recurrenceScopePrompt = signal(false);
  readonly successMessage = signal('');
  readonly pastOccurrencesPrompt = signal(false);
  readonly pastOccurrenceCount = signal(0);
  readonly skipReason = signal('');
  readonly doseTimes = signal<Record<string, string>>({});
  readonly doseDates = signal<Record<string, string>>({});
  readonly doseSaveError = signal('');
  readonly documentSearchResults = signal<DiaryRow[]>([]);
  readonly selectedDocuments = signal<DiaryRow[]>([]);
  readonly availableContacts = computed(() => this.selectedChildRows('contacts'));
  readonly filteredContacts = computed(() => {
    const query = this.contactSearchTerm().trim().toLocaleLowerCase('it');
    if (!query) return this.availableContacts();
    return this.availableContacts().filter((contact) =>
      ['name', 'role', 'category', 'facility', 'phone', 'email', 'website']
        .some((key) => String(contact[key] ?? '').toLocaleLowerCase('it').includes(query)),
    );
  });
  readonly contactSearchLoading = signal(false);
  readonly documentSearchLoading = signal(false);
  readonly associatedFiles = signal<File[]>([]);
  readonly editingImageFile = signal<File | null>(null);
  readonly editingDocumentFile = signal<File | null>(null);
  readonly eventPdfTextSeed = signal('');
  readonly documentTextProcessing = signal(false);
  readonly associatedFileTexts = signal<{ file: File; text: string }[]>([]);
  readonly focusedDocuments = signal<DiaryRow[]>([]);
  readonly activeAssociatedFile = signal<File | null>(null);
  private readonly contactSearchTerm = signal('');
  private contactSearchTimer?: ReturnType<typeof setTimeout>;
  private pendingDocumentTargetIds: string[] = [];
  private readonly storage = inject(StorageService);
  private readonly supabase = inject(SupabaseClientService);
  private documentSearchTimer?: ReturnType<typeof setTimeout>;
  private documentSearchRequest = 0;
  private routeSubscription?: Subscription;
  readonly children = computed(() =>
    this.entries()
      .filter((item) => item.section === 'children')
      .map((item) => ({ id: item.row.id, name: String(item.row['name'] ?? 'Profilo') })),
  );
  readonly categoryOptions = ['Visita Pediatrica', 'Visita Specialistica', 'Esame', 'Terapia', 'Controllo', 'Trial clinico', 'Altro'];
  readonly specialistOptions = computed(() =>
    this.suggestionValues([
      ...this.selectedChildRows('contacts')
        .filter((row) => ['Team clinico', 'Centro trial', 'Terapista'].includes(String(row['category'] ?? '')))
        .map((row) => String(row['name'] ?? '')),
      ...this.selectedChildRows('therapies').map((row) => String(row['therapist'] ?? '')),
      ...this.selectedChildRows('calendar_events').map((row) => String(row['specialist'] ?? '')),
    ]),
  );
  readonly locationOptions = computed(() =>
    this.suggestionValues([
      ...this.selectedChildRows('contacts').map((row) => String(row['facility'] ?? '')),
      ...this.selectedChildRows('therapies').map((row) => String(row['facility'] ?? '')),
      ...this.selectedChildRows('calendar_events').map((row) => String(row['location'] ?? '')),
    ]),
  );
  readonly events = computed(() => toEvents(this.entries(), this.month()));
  readonly historyCategories = computed(() => [...new Set(this.entries()
    .filter((item) => item.section === 'calendar_events')
    .map((item) => String(item.row['category'] ?? '').trim())
    .filter(Boolean))].sort((a, b) => a.localeCompare(b, 'it')));
  readonly historyEvents = computed(() => {
    const query = this.historyQuery().trim().toLocaleLowerCase('it');
    return this.entries()
      .filter((item) => item.section === 'calendar_events')
      .map(({ row }) => {
        const date = String(row['date'] ?? '').slice(0, 10);
        return {
          ...makeEvent(row, 'calendar_events', date),
          status: String(row['status'] ?? ''),
          skippedReason: String(row['skipped_reason'] ?? ''),
        };
      })
      .filter((event) => validDate(event.date))
      .filter((event) => !this.historyCategory() || event.category === this.historyCategory())
      .filter((event) => !this.historyFrom() || event.date >= this.historyFrom())
      .filter((event) => !this.historyTo() || event.date <= this.historyTo())
      .filter((event) => !query || [event.title, event.category, event.specialist, ...this.contactNames(event), event.location, event.detail]
        .some((value) => value.toLocaleLowerCase('it').includes(query)))
      .sort((a, b) => b.date.localeCompare(a.date) || a.time.localeCompare(b.time));
  });
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
    const now = new Date();
    const today = dateKey(now);
    const currentTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    return Array.from({ length: cellCount }, (_, index) => {
      const dateValue = new Date(first.getFullYear(), first.getMonth(), index - offset + 1);
      const date = dateKey(dateValue);
      const dayEvents = [...(map.get(date) ?? [])];
      if (date === today) {
        dayEvents.sort((a, b) => {
          const aUpcoming = a.section === 'calendar_events' && !this.isInactive(a) && !!a.time && a.time >= currentTime;
          const bUpcoming = b.section === 'calendar_events' && !this.isInactive(b) && !!b.time && b.time >= currentTime;
          if (aUpcoming !== bUpcoming) return aUpcoming ? -1 : 1;
          return a.time.localeCompare(b.time);
        });
      } else {
        dayEvents.sort((a, b) => a.time.localeCompare(b.time));
      }
      return {
        key: date,
        date,
        day: dateValue.getDate(),
        inCurrentMonth: dateValue.getMonth() === first.getMonth(),
        events: dayEvents,
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
    await this.refreshEntries();
    this.loading.set(false);
    this.routeSubscription = this.route.queryParamMap.subscribe((params) => {
      const requestedDate = params.get('date') ?? '';
      const highlight = params.get('highlight') ?? '';
      if (validDate(requestedDate)) {
        const previousMonth = `${this.month().getFullYear()}-${this.month().getMonth()}`;
        this.selectedDate.set(requestedDate);
        const [year, month] = requestedDate.split('-').map(Number);
        this.month.set(new Date(year, month - 1, 1));
        if (previousMonth !== `${year}-${month - 1}`) void this.refreshEntries();
      }
      if (highlight) {
        const event = this.events().find((item) => item.id === `calendar_events-${highlight}`);
        this.focusedEvent.set(event ?? null);
        if (event) void this.loadFocusedDocuments(event);
      } else {
        this.focusedEvent.set(null);
        this.focusedDocuments.set([]);
        this.scrollToFirstUpcomingEvent();
      }
    });
  }
  ngOnDestroy(): void {
    if (this.formOpen()) this.closeForm();
    this.routeSubscription?.unsubscribe();
    if (this.documentSearchTimer) clearTimeout(this.documentSearchTimer);
    if (this.contactSearchTimer) clearTimeout(this.contactSearchTimer);
  }
  closeFocusedEvent(): void {
    this.focusedEvent.set(null);
    this.focusedDocuments.set([]);
  }
  scrollToEventHistory(): void {
    this.host.nativeElement.querySelector('#event-history-title')?.scrollIntoView({
      behavior: 'smooth',
      block: 'start',
    });
  }
  openSectionEvent(event: CalendarEvent): void {
    this.focusedEvent.set(event);
    void this.loadFocusedDocuments(event);
  }
  async editCalendarEvent(event: CalendarEvent): Promise<void> {
    this.editingEvent.set(event);
    this.recurrenceScopePrompt.set(false);
    this.repeat.set('none');
    this.title.set(event.title);
    this.eventCategory.set(event.category);
    this.specialist.set(event.specialist);
    this.eventStatus.set(this.isSkipped(event)
      ? 'Saltato'
      : this.isCanceled(event)
        ? 'Cancellato'
        : ['Confermato', 'Da confermare'].includes(event.status ?? '')
          ? event.status!
          : event.date > this.today ? 'Da confermare' : 'Confermato');
    this.eventSkippedReason.set(event.skippedReason ?? '');
    this.selectedContactIds.set(event.contactIds);
    this.resetContactSearch();
    this.location.set(event.location);
    this.eventDate.set(event.date);
    this.eventTime.set(event.time);
    this.notes.set(event.detail);
    this.childId.set(event.childId ?? this.children()[0]?.id ?? '');
    this.documentSearchResults.set([]);
    this.selectedDocuments.set([]);
    this.associatedFiles.set([]);
    this.associatedFileTexts.set([]);
    this.resetAssociatedFileEditor();
    if (event.childId) {
      const ids = await this.data.loadDocumentLinks(
        'calendar_events', event.id.replace('calendar_events-', ''), event.childId,
      );
      this.selectedDocuments.set(await this.data.loadDocumentsByIds(event.childId, ids));
    }
    this.saveError.set('');
    this.formOpen.set(true);
    this.modal.open(CalendarEventFormDialogComponent, { controller: this });
    this.closeFocusedEvent();
  }
  async deleteCalendarEvent(event: CalendarEvent): Promise<void> {
    if (
      event.section !== 'calendar_events' ||
      !(await this.confirmation.confirm('Vuoi eliminare questo evento?', {
        title: 'Elimina evento',
        confirmLabel: 'Elimina',
      }))
    ) return;
    this.data.error.set('');
    this.saving.set(true);
    await this.data.remove('calendar_events', { id: event.id.replace('calendar_events-', '') } as DiaryRow);
    this.saving.set(false);
    if (this.data.error()) return;
    await this.refreshEntries();
    this.closeFocusedEvent();
  }
  selectDate(date: string): void {
    this.selectedDate.set(date);
    this.scrollToFirstUpcomingEvent();
  }
  moveMonth(delta: number): void {
    const current = this.month();
    this.month.set(new Date(current.getFullYear(), current.getMonth() + delta, 1));
    void this.refreshEntries();
  }
  private scrollToFirstUpcomingEvent(): void {
    const now = new Date();
    const today = dateKey(now);
    const date = this.selectedDate();
    if (date < today) return;
    const currentTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    const event = this.selectedEvents().find(
      (item) =>
        item.section === 'calendar_events' &&
        !this.isInactive(item) &&
        (date > today || !item.time || item.time >= currentTime),
    );
    if (!event) return;
    requestAnimationFrame(() => {
      const target = Array.from(
        this.host.nativeElement.querySelectorAll('[data-calendar-event-id]') as NodeListOf<HTMLElement>,
      ).find((element) => element.dataset['calendarEventId'] === event.id);
      target?.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' });
    });
  }
  dayLabel(date: string): string {
    return new Date(`${date}T12:00:00`).toLocaleDateString('it-IT', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
    });
  }
  eventTone(event: CalendarEvent): string {
    if (this.isSkipped(event)) return 'bg-amber-100 text-amber-900 dark:bg-amber-900/50 dark:text-amber-100';
    if (this.isCanceled(event)) return 'bg-rose-100 text-rose-900 line-through dark:bg-rose-950/60 dark:text-rose-200';
    const section = event.section;
    return section === 'medicine_cabinet'
      ? 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200'
      : section === 'medications'
        ? 'bg-violet-100 text-violet-800 dark:bg-violet-900/40 dark:text-violet-200'
        : section === 'therapies'
          ? 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200'
          : 'bg-teal-100 text-teal-800 dark:bg-teal-900/40 dark:text-teal-200';
  }
  eventDotTone(event: CalendarEvent): string {
    if (this.isSkipped(event)) return 'bg-amber-500';
    if (this.isCanceled(event) || this.isDoseOutOfWindow(event)) return 'bg-rose-600';
    if (this.isDoseInTolerance(event)) return 'bg-orange-500';
    return 'bg-teal-600';
  }
  medicationCardTone(event: CalendarEvent): string {
    if (!event.medicationId) return '';
    const windowState = this.doseWindowState(event);
    if (windowState === 'out') {
      return 'my-2 border border-rose-300 border-l-4 bg-rose-50 px-3 shadow-sm dark:border-rose-700 dark:bg-rose-950/40';
    }
    if (windowState === 'tolerance') {
      return 'my-2 border border-orange-400 border-l-4 bg-orange-50 px-3 shadow-sm dark:border-orange-600 dark:bg-orange-950/40';
    }
    if (!event.doseTaken && !event.doseSkipped) {
      return 'my-2 border border-amber-300 border-l-4 bg-amber-50 px-3 shadow-sm dark:border-amber-700 dark:bg-amber-950/40';
    }
    if (event.doseTaken) {
      return 'rounded-lg bg-slate-50/70 dark:bg-slate-900/40';
    }
    return '';
  }
  doseWindowState(event: CalendarEvent): 'ok' | 'tolerance' | 'out' {
    if (!event.medicationId || event.isSpotDose || event.doseSkipped || this.isSkipped(event)) return 'ok';
    const scheduledDate = parseDate(event.date);
    if (!scheduledDate || !event.time) return 'ok';
    const [startHour, startMinute] = event.time.split(':').map(Number);
    const endTime = event.endTime || event.time;
    const [endHour, endMinute] = endTime.split(':').map(Number);
    const startMs = new Date(
      scheduledDate.getFullYear(),
      scheduledDate.getMonth(),
      scheduledDate.getDate(),
      startHour,
      startMinute,
    ).getTime();
    const endMs = new Date(
      scheduledDate.getFullYear(),
      scheduledDate.getMonth(),
      scheduledDate.getDate(),
      endHour,
      endMinute,
    ).getTime();
    if (event.doseTaken) {
      if (!event.takenAt) return 'ok';
      const taken = new Date(event.takenAt);
      if (Number.isNaN(taken.getTime())) return 'ok';
      const takenMs = new Date(
        taken.getFullYear(),
        taken.getMonth(),
        taken.getDate(),
        taken.getHours(),
        taken.getMinutes(),
      ).getTime();
      if (takenMs >= startMs && takenMs <= endMs) return 'ok';
      const diffMinutes = takenMs < startMs ? (startMs - takenMs) / 60000 : (takenMs - endMs) / 60000;
      return diffMinutes <= 30 ? 'tolerance' : 'out';
    }
    const now = new Date();
    const nowMs = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate(),
      now.getHours(),
      now.getMinutes(),
    ).getTime();
    if (nowMs <= endMs) return 'ok';
    const diffMinutes = (nowMs - endMs) / 60000;
    return diffMinutes <= 30 ? 'tolerance' : 'out';
  }
  isDoseInTolerance(event: CalendarEvent): boolean {
    return this.doseWindowState(event) === 'tolerance';
  }
  isDoseOutOfWindow(event: CalendarEvent): boolean {
    return this.doseWindowState(event) === 'out';
  }
  eventStatusLabel(event: CalendarEvent): string {
    if (this.isSkipped(event)) return 'Saltato';
    if (this.isCanceled(event)) return 'Cancellato';
    return event.status ?? '';
  }
  eventStatusTone(event: CalendarEvent): string {
    if (this.isSkipped(event)) return 'bg-amber-100 text-amber-900 dark:bg-amber-900/50 dark:text-amber-100';
    if (this.isCanceled(event)) return 'bg-rose-100 text-rose-900 dark:bg-rose-950/60 dark:text-rose-200';
    return 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200';
  }
  isSkipped(event: CalendarEvent): boolean {
    return (event.status ?? '').trim().toLocaleLowerCase('it') === 'saltato';
  }
  isCompletedDose(event: CalendarEvent): boolean {
    return !!event.isSpotDose || (!!event.medicationId && !!event.doseTaken);
  }
  isCompleted(event: CalendarEvent): boolean {
    if (this.isSkipped(event) || this.isCanceled(event)) return false;
    if (event.date < this.today) return true;
    if (event.date > this.today || !event.time) return false;
    const now = new Date();
    const currentTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    return event.time < currentTime;
  }
  toggleSkippedEvent(eventId: string): void {
    this.expandedSkippedEvents.update((expanded) => ({ ...expanded, [eventId]: !expanded[eventId] }));
  }
  isCanceled(event: CalendarEvent): boolean {
    return ['cancellato', 'cancellata', 'annullato', 'annullata', 'canceled', 'cancelled'].includes(
      (event.status ?? '').trim().toLocaleLowerCase('it'),
    );
  }
  isInactive(event: CalendarEvent): boolean {
    return this.isSkipped(event) || this.isCanceled(event);
  }
  doseTakenLabel(event: CalendarEvent): string {
    if (event.isSpotDose) return 'Somministrazione spot';
    if (!event.takenAt) return 'Fatto';
    const time = new Date(event.takenAt);
    if (Number.isNaN(time.getTime())) return 'Fatto';
    const dateLabel = dateKey(time) === event.date
      ? ''
      : ` il ${time.toLocaleDateString('it-IT', { day: '2-digit', month: 'short' })}`;
    return `Fatto${dateLabel} alle ${time.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })}`;
  }
  doseAvailable(event: CalendarEvent): boolean {
    if (event.date !== this.today) return false;
    const now = new Date();
    const currentTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    return currentTime >= event.time;
  }
  doseTime(event: CalendarEvent): string {
    const draft = this.doseTimes()[event.id];
    if (draft !== undefined) return draft;
    if (!event.takenAt) return '';
    const takenAt = new Date(event.takenAt);
    return Number.isNaN(takenAt.getTime())
      ? ''
      : `${String(takenAt.getHours()).padStart(2, '0')}:${String(takenAt.getMinutes()).padStart(2, '0')}`;
  }
  doseDate(event: CalendarEvent): string {
    const draft = this.doseDates()[event.id];
    if (draft !== undefined) return draft;
    if (!event.takenAt) return event.date;
    const takenAt = new Date(event.takenAt);
    return Number.isNaN(takenAt.getTime()) ? event.date : dateKey(takenAt);
  }
  doseDateTimeError(event: CalendarEvent): string {
    const date = this.doseDate(event);
    const time = this.doseTime(event);
    if (!validDate(date)) return date ? 'Inserisci una data valida.' : '';
    if (date > this.today) return 'La data effettiva non può essere futura.';
    if (!time || !validTime(time)) return '';
    if (date === this.today) {
      const now = new Date();
      const currentTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
      if (time > currentTime) return 'L’ora effettiva non può essere futura.';
    }
    return '';
  }
  canSaveDose(event: CalendarEvent): boolean {
    const time = this.doseTime(event);
    return !this.doseDateTimeError(event) && !!time && validTime(time);
  }
  setDoseTime(event: CalendarEvent, time: string): void {
    this.doseTimes.update((times) => ({ ...times, [event.id]: time }));
    this.doseSaveError.set('');
  }
  setDoseDate(event: CalendarEvent, date: string): void {
    this.doseDates.update((dates) => ({ ...dates, [event.id]: date }));
    this.doseSaveError.set('');
  }
  sectionLabel(section: string): string {
    return (
      (
        {
          calendar_events: 'Appuntamento',
          therapies: 'Terapia',
          medications: 'Farmaco',
          documents: 'Scadenza documento',
          expenses: 'Spesa',
        } as Record<string, string>
      )[section] ?? 'Diario'
    );
  }
  openForm(date = this.selectedDate()): void {
    if (this.documentSearchTimer) clearTimeout(this.documentSearchTimer);
    this.documentSearchRequest++;
    this.documentSearchLoading.set(false);
    this.documentSearchResults.set([]);
    this.editingEvent.set(null);
    this.recurrenceScopePrompt.set(false);
    this.title.set('');
    this.eventCategory.set('');
    this.specialist.set('');
    this.selectedContactIds.set([]);
    this.resetContactSearch();
    this.location.set('');
    this.eventDate.set(date);
    this.eventTime.set('');
    this.notes.set('');
    this.repeat.set('none');
    this.repeatUntil.set(date);
    this.childId.set(this.children()[0]?.id ?? '');
    this.documentSearchResults.set([]);
    this.selectedDocuments.set([]);
    this.associatedFiles.set([]);
    this.associatedFileTexts.set([]);
    this.resetAssociatedFileEditor();
    this.saveError.set('');
    this.formOpen.set(true);
    this.modal.open(CalendarEventFormDialogComponent, { controller: this });
  }
  closeForm(): void {
    if (this.documentSearchTimer) clearTimeout(this.documentSearchTimer);
    this.documentSearchRequest++;
    this.documentSearchLoading.set(false);
    this.formOpen.set(false);
    this.modal.close();
    this.editingEvent.set(null);
    this.recurrenceScopePrompt.set(false);
    this.associatedFiles.set([]);
    this.associatedFileTexts.set([]);
    this.resetAssociatedFileEditor();
    this.documentSearchResults.set([]);
    this.selectedDocuments.set([]);
    this.pendingDocumentTargetIds = [];
    this.resetContactSearch();
  }
  changeChild(childId: string): void {
    if (this.documentSearchTimer) clearTimeout(this.documentSearchTimer);
    this.documentSearchRequest++;
    this.documentSearchLoading.set(false);
    this.childId.set(childId);
    this.selectedContactIds.set([]);
    this.resetContactSearch();
    this.documentSearchResults.set([]);
    this.selectedDocuments.set([]);
    this.associatedFiles.set([]);
    this.associatedFileTexts.set([]);
    this.resetAssociatedFileEditor();
  }
  async saveEvent(
    recurrenceScope?: 'single' | 'preceding' | 'following' | 'all',
    markPastOccurrencesCompleted?: boolean,
  ): Promise<void> {
    if (this.documentTextProcessing()) {
      this.saveError.set('Attendi che l’elaborazione del documento sia completata prima di salvare l’evento.');
      return;
    }
    if (!this.title().trim() || !this.eventDate()) return;
    const availableContactIds = new Set(this.availableContacts().map((contact) => contact.id));
    const selectedContactIds = [...new Set(this.selectedContactIds())];
    if (selectedContactIds.some((id) => !availableContactIds.has(id))) {
      this.saveError.set('Una o più persone selezionate non sono più disponibili per questo profilo. Aggiorna la selezione e riprova.');
      return;
    }
    this.selectedContactIds.set(selectedContactIds);
    const editing = this.editingEvent();
    if (editing && this.eventStatus() === 'Saltato' && !this.eventSkippedReason().trim()) {
      this.saveError.set('Inserisci la motivazione per segnare l’evento come saltato.');
      return;
    }
    const seriesChanges = editing?.recurrenceGroupId ? this.seriesSharedChanges(editing) : {};
    if (Object.keys(seriesChanges).length && !recurrenceScope) {
      this.recurrenceScopePrompt.set(true);
      return;
    }
    if (!editing && this.pendingDocumentTargetIds.length) {
      this.saving.set(true);
      this.saveError.set('');
      const ok = await this.saveEventDocuments(this.pendingDocumentTargetIds);
      this.saving.set(false);
      if (!ok) {
        this.saveError.set(this.data.error() || 'L’evento è stato salvato, ma non è stato possibile collegare tutti i documenti.');
        return;
      }
      this.pendingDocumentTargetIds = [];
      this.selectedDate.set(this.eventDate());
      this.closeForm();
      return;
    }
    if (editing) {
      this.recurrenceScopePrompt.set(false);
      this.saving.set(true);
      this.saveError.set('');
      if (
        editing.recurrenceGroupId &&
        recurrenceScope &&
        recurrenceScope !== 'single' &&
        Object.keys(seriesChanges).length > 0 &&
        !(await this.data.updateCalendarEventSeries(
          editing.recurrenceGroupId,
          editing.childId ?? '',
          seriesChanges,
          recurrenceScope === 'following' ? editing.date : undefined,
          recurrenceScope === 'preceding' ? editing.date : undefined,
        ))
      ) {
        this.saving.set(false);
        this.saveError.set(this.data.error() || 'Non è stato possibile aggiornare la serie di appuntamenti.');
        return;
      }
      const ok = await this.updateEvent(editing, {
        title: this.title().trim(),
        category: this.eventCategory().trim() || null,
        specialist: this.specialist().trim() || null,
        contact_ids: this.selectedContactIds(),
        location: this.location().trim() || null,
        date: this.eventDate(),
        time: this.eventTime() || null,
        notes: this.notes().trim() || null,
        child_id: this.childId() || null,
        status: this.eventStatus(),
        skipped_reason: this.eventStatus() === 'Saltato' ? this.eventSkippedReason().trim() : null,
      });
      if (!ok) {
        this.saving.set(false);
        this.saveError.set(this.data.error() || 'Non è stato possibile salvare le modifiche.');
        return;
      }
      if (!(await this.saveEventDocuments([editing.id.replace('calendar_events-', '')]))) {
        this.saveError.set(this.data.error() || 'Non è stato possibile salvare i documenti collegati.');
        this.saving.set(false);
        return;
      }
      this.saving.set(false);
      this.selectedDate.set(this.eventDate());
      const [year, month] = this.eventDate().split('-').map(Number);
      this.month.set(new Date(year, month - 1, 1));
      this.successMessage.set(recurrenceScope === 'all'
        ? 'Modifiche applicate a tutta la serie, agli eventi passati e futuri.'
        : recurrenceScope === 'following'
          ? 'Modifiche applicate a questo evento e ai successivi.'
          : recurrenceScope === 'preceding'
            ? 'Modifiche applicate a questo evento e ai precedenti.'
            : 'Modifiche salvate per questo evento.');
      this.closeForm();
      this.closeFocusedEvent();
      return;
    }
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
    const pastDates = dates.filter((date) => date < this.today);
    if (
      markPastOccurrencesCompleted === undefined &&
      dates.length > 1 &&
      pastDates.length > 1
    ) {
      this.pastOccurrenceCount.set(pastDates.length);
      this.pastOccurrencesPrompt.set(true);
      return;
    }
    if (markPastOccurrencesCompleted !== undefined) this.closePastOccurrencesPrompt();
    this.saving.set(true);
    this.saveError.set('');
    const groupId = dates.length > 1 ? crypto.randomUUID() : null;
    const values = dates.map((date) => ({
      id: crypto.randomUUID(),
      title: this.title().trim(),
      category: this.eventCategory().trim() || null,
      specialist: this.specialist().trim() || null,
      contact_ids: this.selectedContactIds(),
      location: this.location().trim() || null,
      date,
      time: this.eventTime() || null,
      notes: this.notes().trim() || null,
      status:
        date > this.today
          ? 'Da confermare'
          : markPastOccurrencesCompleted && date < this.today
            ? 'Completato'
            : 'Confermato',
      skipped_reason: null,
      recurrence_group_id: groupId,
    }));
    const ok = await this.data.saveMany('calendar_events', values, this.childId() || undefined);
    if (!ok) {
      this.saving.set(false);
      this.saveError.set(this.data.error() || 'Non è stato possibile salvare l’evento.');
      return;
    }
    this.pendingDocumentTargetIds = values.map((value) => String(value.id));
    if (!(await this.saveEventDocuments(this.pendingDocumentTargetIds))) {
      this.saveError.set(this.data.error() || 'L’evento è stato salvato, ma non è stato possibile collegare tutti i documenti.');
      this.saving.set(false);
      return;
    }
    this.pendingDocumentTargetIds = [];
    this.saving.set(false);
    await this.refreshEntries();
    this.selectedDate.set(this.eventDate());
    const [year, month] = this.eventDate().split('-').map(Number);
    this.month.set(new Date(year, month - 1, 1));
    this.scrollToFirstUpcomingEvent();
    this.closeForm();
  }
  closePastOccurrencesPrompt(): void {
    this.pastOccurrencesPrompt.set(false);
    this.pastOccurrenceCount.set(0);
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
  async markDoseTaken(event: CalendarEvent, actualDate?: string, actualTime?: string): Promise<void> {
    if (!event.medicationId || !event.childId) return;
    const now = new Date();
    const time = actualTime ?? `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    const date = actualDate ?? event.date;
    const takenDate = parseDate(date);
    if (!takenDate || date > this.today || !validTime(time)) return;
    if (actualDate === undefined && actualTime === undefined && !this.doseAvailable(event)) return;
    if (date === this.today) {
      const currentTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
      if (time > currentTime) return;
    }
    const [hour, minute] = time.split(':').map(Number);
    takenDate.setHours(hour, minute, 0, 0);
    const takenAt = takenDate.toISOString();
    this.saving.set(true);
    this.doseSaveError.set('');
    this.successMessage.set('');
    const ok = await this.data.markMedicationDoseTaken(
      event.medicationId,
      event.childId,
      event.date,
      event.time,
      takenAt,
    );
    this.saving.set(false);
    if (!ok) {
      this.doseSaveError.set(this.data.error() || 'Non è stato possibile registrare la somministrazione.');
      return;
    }
    this.doseTimes.update((times) => {
      const next = { ...times };
      delete next[event.id];
      return next;
    });
    this.doseDates.update((dates) => {
      const next = { ...dates };
      delete next[event.id];
      return next;
    });
    await this.refreshEntries();
    this.successMessage.set(event.doseTaken ? 'Somministrazione aggiornata.' : 'Somministrazione registrata.');
  }
  async saveSkipped(): Promise<void> {
    const event = this.skipEvent();
    if (!event || !this.skipReason().trim()) return;
    let skipped: boolean;
    if (event.medicationId && event.childId) {
      this.saving.set(true);
      this.saveError.set('');
      skipped = await this.data.markMedicationDoseSkipped(
        event.medicationId,
        event.childId,
        event.date,
        event.time,
        this.skipReason().trim(),
      );
      this.saving.set(false);
      if (!skipped) this.saveError.set(this.data.error() || 'Non è stato possibile registrare la dose saltata.');
    } else {
      skipped = await this.updateEvent(event, {
        status: 'Saltato',
        skipped_reason: this.skipReason().trim(),
      });
    }
    if (skipped && event.medicationId) await this.refreshEntries();
    if (skipped)
      this.skipEvent.set(null);
  }
  private async updateEvent(
    event: CalendarEvent,
    values: Record<string, unknown>,
  ): Promise<boolean> {
    this.saving.set(true);
    this.saveError.set('');
    const ok = await this.data.update(
      'calendar_events',
      event.id.replace('calendar_events-', ''),
      values,
    );
    this.saving.set(false);
    if (!ok) {
      this.saveError.set(this.data.error() || 'Non è stato possibile aggiornare l’evento.');
      return false;
    }
    await this.refreshEntries();
    return true;
  }
  documentsForSelectedChild(): DiaryRow[] {
    return this.documentSearchResults();
  }
  selectedChildName(): string {
    return this.children().find((child) => child.id === this.childId())?.name ?? '';
  }
  setAssociatedFiles(files: File[]): void {
    const nextFiles = [...files];
    this.associatedFiles.set(nextFiles);
    const retained = new Set(nextFiles);
    this.associatedFileTexts.update((items) => items.filter((item) => retained.has(item.file)));
    const activeFile = this.activeAssociatedFile();
    if (activeFile && !retained.has(activeFile)) this.closeAssociatedFileEditor();
  }
  editAssociatedFile(file: File): void {
    if (!this.associatedFiles().includes(file)) return;
    this.resetAssociatedFileEditor();
    this.data.error.set('');
    this.saveError.set('');
    this.activeAssociatedFile.set(file);
    this.eventPdfTextSeed.set(this.associatedFileTexts().find((item) => item.file === file)?.text ?? '');
    if (isImageFile(file)) {
      this.editingImageFile.set(file);
      return;
    }
    if (!isPdfFile(file)) {
      this.resetAssociatedFileEditor();
      this.saveError.set('L’editor supporta PDF e immagini.');
      return;
    }
    this.documentTextProcessing.set(true);
    this.editingDocumentFile.set(file);
  }
  closeAssociatedFileEditor(): void {
    this.resetAssociatedFileEditor();
  }
  setImageConversionProcessing(processing: boolean): void {
    if (this.editingImageFile() && this.activeAssociatedFile() === this.editingImageFile())
      this.documentTextProcessing.set(processing);
  }
  setImagePdfFile(file: File): void {
    const currentFile = this.activeAssociatedFile();
    if (!currentFile || currentFile !== this.editingImageFile()) return;
    const files = this.associatedFiles();
    const index = files.indexOf(currentFile);
    if (index < 0) return;
    this.associatedFiles.set(files.map((item, itemIndex) => itemIndex === index ? file : item));
    const text = this.associatedFileTexts().find((item) => item.file === currentFile)?.text ?? '';
    this.associatedFileTexts.update((items) => [
      ...items.filter((item) => item.file !== currentFile && item.file !== file),
      ...(text ? [{ file, text }] : []),
    ]);
    this.activeAssociatedFile.set(file);
    this.editingImageFile.set(null);
    this.eventPdfTextSeed.set(text);
    this.documentTextProcessing.set(true);
    this.editingDocumentFile.set(file);
  }
  setEventRedactedFile(file: File): void {
    const currentFile = this.activeAssociatedFile();
    if (!currentFile) return;
    const files = this.associatedFiles();
    const index = files.indexOf(currentFile);
    if (index < 0) return;
    this.associatedFiles.set(files.map((item, itemIndex) => itemIndex === index ? file : item));
    const text = this.associatedFileTexts().find((item) => item.file === currentFile)?.text ?? '';
    this.associatedFileTexts.update((items) => [
      ...items.filter((item) => item.file !== currentFile && item.file !== file),
      ...(text ? [{ file, text }] : []),
    ]);
    this.activeAssociatedFile.set(file);
    this.editingDocumentFile.set(file);
    this.eventPdfTextSeed.set(text);
  }
  setEventPdfTextForSaving(value: { file: File; text: string }): void {
    const activeFile = this.activeAssociatedFile();
    if (!activeFile || value.file !== this.editingDocumentFile()) return;
    this.associatedFileTexts.update((items) => [
      ...items.filter((item) => item.file !== activeFile),
      { file: activeFile, text: value.text },
    ]);
  }
  setEventPdfTextProcessing(value: { file: File; processing: boolean }): void {
    if (value.file === this.editingDocumentFile()) this.documentTextProcessing.set(value.processing);
  }
  searchDocuments(query: string): void {
    if (this.documentSearchTimer) clearTimeout(this.documentSearchTimer);
    const request = ++this.documentSearchRequest;
    const term = query.trim();
    this.documentSearchResults.set([]);
    if (term.length < 2 || !this.childId()) {
      this.documentSearchLoading.set(false);
      return;
    }
    this.documentSearchLoading.set(true);
    this.documentSearchTimer = setTimeout(() => {
      void this.data.searchDocuments(this.childId(), term).then((rows) => {
        if (request !== this.documentSearchRequest) return;
        this.documentSearchResults.set(rows);
        this.documentSearchLoading.set(false);
      });
    }, 250);
  }
  private async refreshEntries(): Promise<void> {
    const current = this.month();
    const startDate = dateKey(new Date(current.getFullYear(), current.getMonth(), 1));
    const endDate = dateKey(new Date(current.getFullYear(), current.getMonth() + 1, 0));
    this.entries.set(await this.data.loadCalendarEntries(startDate, endDate));
  }
  private async loadFocusedDocuments(event: CalendarEvent): Promise<void> {
    if (event.section !== 'calendar_events' || !event.childId) {
      this.focusedDocuments.set([]);
      return;
    }
    const ids = await this.data.loadDocumentLinks(
      'calendar_events', event.id.replace('calendar_events-', ''), event.childId,
    );
    this.focusedDocuments.set(await this.data.loadDocumentsByIds(event.childId, ids));
  }

  async openAssociatedDocument(doc: DiaryRow): Promise<void> {
    if (typeof doc['local_file_id'] === 'string') {
      if (!(await this.storage.openLocalFile(doc['local_file_id'])))
        this.data.error.set('Il file locale non è più disponibile in questo browser.');
      return;
    }
    if (typeof doc['file_data'] === 'string') {
      window.open(doc['file_data'], '_blank', 'noopener');
      return;
    }
    const path = doc['storage_path'];
    if (typeof path !== 'string' || !path) {
      this.data.error.set('Il documento non contiene un file allegato.');
      return;
    }
    const url = await this.storage.signedUrl(path);
    if (url) window.open(url, '_blank', 'noopener');
    else this.data.error.set('Impossibile aprire il file. Accedi al tuo account e riprova.');
  }
  private resetAssociatedFileEditor(): void {
    this.editingImageFile.set(null);
    this.editingDocumentFile.set(null);
    this.eventPdfTextSeed.set('');
    this.documentTextProcessing.set(false);
    this.activeAssociatedFile.set(null);
  }
  private async saveEventDocuments(targetIds: string[]): Promise<boolean> {
    const childId = this.childId();
    if (!childId) return false;
    const documentIds = this.selectedDocuments().map((doc) => doc.id);
    for (const file of this.associatedFiles()) {
      const documentId = crypto.randomUUID();
      const storagePath = await this.storage.upload(file, childId);
      if (!storagePath && this.supabase.configured && this.auth.user()) {
        this.data.error.set('Non è stato possibile caricare uno dei documenti allegati.');
        return false;
      }
      let localFileId = '';
      if (!storagePath) {
        try {
          localFileId = await this.storage.saveLocalFile(file);
        } catch {
          this.data.error.set('Il browser non ha potuto conservare localmente il file allegato.');
          return false;
        }
      }
      const extractedText = this.associatedFileTexts().find((item) => item.file === file)?.text.trim();
      const savedId = await this.data.saveWithId('documents', {
        id: documentId,
        title: file.name,
        category: 'Altro',
        date: dateKey(new Date()),
        ...(extractedText ? { extracted_text: extractedText } : {}),
        ...(storagePath ? { storage_path: storagePath } : { local_file_id: localFileId }),
      }, childId);
      if (!savedId) return false;
      documentIds.push(savedId);
      this.selectedDocuments.update((docs) => [...docs, {
        id: savedId,
        child_id: childId,
        title: file.name,
        category: 'Altro',
        date: dateKey(new Date()),
      } as DiaryRow]);
      this.setAssociatedFiles(this.associatedFiles().filter((pending) => pending !== file));
    }
    for (const targetId of targetIds) {
      if (!(await this.data.setDocumentLinks('calendar_events', targetId, childId, documentIds)))
        return false;
    }
    return true;
  }
  private selectedChildRows(section: string): DiaryRow[] {
    const childId = this.childId();
    if (!childId) return [];
    return this.entries()
      .filter((item) => item.section === section && item.row['child_id'] === childId)
      .map((item) => item.row);
  }
  contactNames(event: CalendarEvent): string[] {
    if (!event.contactIds.length) return [];
    const contacts = this.entries()
      .filter((item) => item.section === 'contacts' && item.row['child_id'] === event.childId)
      .map((item) => item.row);
    return event.contactIds.flatMap((id) => {
      const contact = contacts.find((row) => row.id === id);
      return contact ? [String(contact['name'] ?? '')] : [];
    });
  }
  toggleContact(contactId: string, checked: boolean): void {
    this.selectedContactIds.update((ids) => checked
      ? [...new Set([...ids, contactId])]
      : ids.filter((id) => id !== contactId));
  }
  searchContacts(query: string): void {
    if (this.contactSearchTimer) clearTimeout(this.contactSearchTimer);
    this.contactSearchLoading.set(true);
    this.contactSearchTimer = setTimeout(() => {
      this.contactSearchTerm.set(query.trim());
      this.contactSearchLoading.set(false);
    }, 600);
  }
  private resetContactSearch(): void {
    if (this.contactSearchTimer) clearTimeout(this.contactSearchTimer);
    this.contactSearchTerm.set('');
    this.contactSearchLoading.set(false);
  }
  private seriesSharedChanges(event: CalendarEvent): Record<string, unknown> {
    const changes: Record<string, unknown> = {};
    const addIfChanged = (key: string, value: string, current: string): void => {
      const normalized = value.trim();
      if (normalized !== current) changes[key] = normalized || null;
    };
    addIfChanged('title', this.title(), event.title);
    addIfChanged('category', this.eventCategory(), event.category);
    addIfChanged('specialist', this.specialist(), event.specialist);
    addIfChanged('location', this.location(), event.location);
    addIfChanged('time', this.eventTime(), event.time);
    const currentContactIds = [...new Set(event.contactIds)].sort();
    const nextContactIds = [...new Set(this.selectedContactIds())].sort();
    if (JSON.stringify(currentContactIds) !== JSON.stringify(nextContactIds)) {
      changes['contact_ids'] = nextContactIds;
    }
    return changes;
  }
  private suggestionValues(values: string[]): string[] {
    return [...new Set(values.map((value) => value.trim()).filter(Boolean))].sort((a, b) =>
      a.localeCompare(b, 'it'),
    );
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
function toEvents(entries: SearchableDiaryItem[], month: Date): CalendarEvent[] {
  const today = dateKey(new Date());
  const monthStart = dateKey(new Date(month.getFullYear(), month.getMonth(), 1));
  const monthEnd = dateKey(new Date(month.getFullYear(), month.getMonth() + 1, 0));
  const output: CalendarEvent[] = [];
  for (const { section, row } of entries) {
    if (section === 'medicine_cabinet') {
      const expiry = medicineCabinetExpiry(row);
      const date = expiry.effectiveDate ?? '';
      if (validDate(date))
        output.push({
          ...makeEvent(row, section, date),
          title: `${expiry.effectiveSource === 'after-opening' ? 'Da consumare entro' : 'Scadenza'}: ${String(row['name'] ?? 'Farmaco')}`,
        });
    } else if (section === 'calendar_events') {
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
      const schedules = medicationSchedulePeriods(row);
      const start = schedules.find((period) => period.start_date)?.start_date ?? String(row['start_date'] ?? '').slice(0, 10);
      const end = schedules.length > 1
        ? schedules.at(-1)?.end_date ?? ''
        : schedules[0]?.end_date ?? String(row['end_date'] ?? '').slice(0, 10);
      for (const period of schedules) {
        const periodStart = period.start_date || start;
        const periodEnd = period.end_date || (schedules.length === 1 ? end : '');
        const times = parseScheduleTimes(period.schedule_times);
        const firstDoseDate = validDate(periodStart)
          ? periodStart > monthStart ? periodStart : monthStart
          : monthStart;
        const lastDoseDate = validDate(periodEnd)
          ? periodEnd < monthEnd ? periodEnd : monthEnd
          : monthEnd;
        if (!times.length || firstDoseDate > lastDoseDate) continue;
        for (let cursor = parseDate(firstDoseDate)!; dateKey(cursor) <= lastDoseDate; cursor.setDate(cursor.getDate() + 1)) {
          const date = dateKey(cursor);
          for (const slot of times) {
            const time = slot.start;
            const dose = entries.find((item) => item.section === 'medication_doses' &&
              item.row['is_spot'] !== true &&
              item.row['medication_id'] === row.id && item.row['scheduled_date'] === date &&
              String(item.row['scheduled_time'] ?? '').slice(0, 5) === time);
            output.push({
              ...makeEvent(row, section, date),
              id: `dose-${row.id}-${date}-${time}`,
              title: `${String(row['name'] ?? 'Farmaco')} · ${period.dosage}`.trim(),
              time,
              endTime: slot.end,
              category: slot.end ? `Fascia ${slot.start}–${slot.end}` : `Orario ${slot.start}`,
              medicationId: row.id,
              doseTaken: !!dose && String(dose.row['status'] ?? 'Somministrata') !== 'Saltata',
              doseSkipped: String(dose?.row['status'] ?? '') === 'Saltata',
              status: String(dose?.row['status'] ?? '') === 'Saltata' ? 'Saltato' : undefined,
              skippedReason: String(dose?.row['skipped_reason'] ?? ''),
              takenAt: dose ? String(dose.row['taken_at'] ?? '') : undefined,
            });
          }
        }
      }
      for (const { row: dose } of entries.filter((item) =>
        item.section === 'medication_doses' && item.row['is_spot'] === true && item.row['medication_id'] === row.id,
      )) {
        const date = String(dose['scheduled_date'] ?? '').slice(0, 10);
        if (!validDate(date) || date < monthStart || date > monthEnd) continue;
        const time = String(dose['scheduled_time'] ?? '').slice(0, 5);
        const dosage = String(dose['administered_dosage'] ?? '').trim();
        output.push({
          ...makeEvent(row, section, date),
          id: `spot-dose-${dose.id}`,
          title: `${String(row['name'] ?? 'Farmaco')} · Dose spot`,
          time,
          category: 'Somministrazione fuori programma',
          detail: dosage ? `Dosaggio: ${dosage}` : '',
          medicationId: row.id,
          isSpotDose: true,
          doseTaken: true,
          takenAt: String(dose['taken_at'] ?? ''),
        });
      }
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
function medicationSchedulePeriods(
  row: DiaryRow,
): Array<{ start_date: string; end_date: string; dosage: string; schedule_times: string }> {
  const stored = row['schedule_periods'];
  if (Array.isArray(stored) && stored.length) {
    const periods = stored
      .filter((value): value is Record<string, unknown> => !!value && typeof value === 'object')
      .map((value) => ({
        start_date: String(value['start_date'] ?? '').slice(0, 10),
        end_date: String(value['end_date'] ?? '').slice(0, 10),
        dosage: String(value['dosage'] ?? row['dosage'] ?? ''),
        schedule_times: String(value['schedule_times'] ?? ''),
      }));
    if (periods.length) return periods;
  }
  return [{
    start_date: String(row['start_date'] ?? '').slice(0, 10),
    end_date: String(row['end_date'] ?? '').slice(0, 10),
    dosage: String(row['dosage'] ?? ''),
    schedule_times: String(row['schedule_times'] ?? ''),
  }];
}
function parseScheduleTimes(value: string): Array<{ start: string; end?: string }> {
  return value.split(',').flatMap((entry) => {
    const match = entry.trim().match(/^(\d{1,2}:\d{2})(?:\s*[-–]\s*(\d{1,2}:\d{2}))?$/);
    if (!match) return [];
    const start = normalizeTime(match[1]);
    const end = match[2] ? normalizeTime(match[2]) : undefined;
    if (!start || (match[2] && !end)) return [];
    if (end && end < start) return [];
    return [{ start, ...(end ? { end } : {}) }];
  });
}
function normalizeTime(value: string): string | null {
  const [hour, minute] = value.split(':').map(Number);
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return null;
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}
function validTime(value: string): boolean {
  return !!normalizeTime(value);
}
function makeEvent(row: DiaryRow, section: string, date: string): CalendarEvent {
  const rawTime = String(row['time'] ?? '');
  const time = rawTime.replace(/^(\d{2}:\d{2}):\d{2}(?:\.\d+)?$/, '$1');
  return {
    id: `${section}-${row.id}`,
    childId: row['child_id'] ? String(row['child_id']) : undefined,
    section,
    title: String(row['title'] ?? row['name'] ?? row['category'] ?? 'Evento'),
    date,
    time,
    category: String(row['category'] ?? ''),
    recurrenceGroupId: row['recurrence_group_id'] ? String(row['recurrence_group_id']) : undefined,
    specialist: String(row['specialist'] ?? ''),
    contactIds: Array.isArray(row['contact_ids']) ? row['contact_ids'].map(String) : [],
    location: String(row['location'] ?? ''),
    detail: String(row['notes'] ?? ''),
  };
}
function validDate(value: string): boolean {
  return !!parseDate(value);
}
function isPdfFile(file: File): boolean {
  return file.type === 'application/pdf' || /\.pdf$/i.test(file.name);
}
function isImageFile(file: File): boolean {
  return file.type.startsWith('image/') || /\.(?:avif|bmp|gif|heic|heif|jpe?g|png|webp)$/i.test(file.name);
}
