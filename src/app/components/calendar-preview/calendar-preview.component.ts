import { CommonModule } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../core/auth.service';
import { DiaryDataService, SearchableDiaryItem } from '../../core/diary-data.service';
import { medicineCabinetExpiry } from '../../models/medicine-cabinet-expiry';
import { ToastService } from '../../core/toast.service';

interface PreviewItem {
  id: string;
  highlightId: string;
  childId?: string;
  title: string;
  date: string;
  time?: string;
  status?: string;
  doseTaken?: boolean;
  specialist?: string;
  location?: string;
  kind: string;
  path: string;
  monthOnly?: boolean;
  isMedicationDose?: boolean;
}
interface MedicationSchedulePeriod {
  start_date: string;
  end_date: string;
  start_time: string;
  end_time: string;
  dosage: string;
  schedule_times: string;
}
@Component({
  selector: 'tc-calendar-preview',
  standalone: true,
  imports: [CommonModule, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './calendar-preview.component.scss',
  templateUrl: './calendar-preview.component.html',
})
export class CalendarPreviewComponent implements OnInit {
  private readonly host = inject(ElementRef<HTMLElement>);
  private readonly auth = inject(AuthService);
  private readonly data = inject(DiaryDataService);
  private readonly toast = inject(ToastService);
  readonly entries = signal<SearchableDiaryItem[]>([]);
  readonly loading = signal(true);
  readonly savingDose = signal(false);
  readonly doseError = signal('');
  readonly skipReason = signal('');
  readonly skipDose = signal<{ medicationId: string; childId: string; time: string; label: string } | null>(null);
  readonly selectedView = signal<'today' | 'upcoming'>('today');
  private readonly windowEnd = addDays(dateKey(new Date()), 30);
  private readonly today = dateKey(new Date());
  readonly upcoming = computed(() =>
    [
    ...this.entries()
      .filter((item) => item.section === 'calendar_events')
      .map((item): PreviewItem => {
        const rawTime = String(item.row['time'] ?? '');
        const time = rawTime.replace(/^(\d{2}:\d{2}):\d{2}(?:\.\d+)?$/, '$1');
        return {
          id: item.row.id,
          highlightId: item.row.id,
          childId: item.row['child_id'] ? String(item.row['child_id']) : undefined,
          title: String(item.row['title'] ?? 'Evento'),
          date: String(item.row['date'] ?? '').slice(0, 10),
          status: String(item.row['status'] ?? ''),
          time: /^\d{2}:\d{2}/.test(rawTime) ? rawTime.slice(0, 5) : undefined,
          specialist: String(item.row['specialist'] ?? ''),
          location: String(item.row['location'] ?? ''),
          kind: [time, String(item.row['category'] ?? '').trim() || 'Appuntamento']
            .filter(Boolean)
            .join(' · '),
          path: '/calendar',
        };
      })
      .filter((item) => isBetween(item.date, this.today, this.windowEnd))
      .sort(byDateAndTime),
    ...this.entries()
      .filter((item) => item.section === 'medication_doses' && item.row['is_spot'] === true)
      .map((item): PreviewItem => {
        const medication = this.entries().find((entry) =>
          entry.section === 'medications' && entry.row.id === item.row['medication_id'],
        );
        const date = String(item.row['scheduled_date'] ?? '').slice(0, 10);
        const time = String(item.row['scheduled_time'] ?? '').slice(0, 5);
        const dosage = String(item.row['administered_dosage'] ?? '').trim();
        return {
          id: `spot-dose-${item.row.id}`,
          highlightId: String(medication?.row.id ?? ''),
          childId: item.row['child_id'] ? String(item.row['child_id']) : undefined,
          title: `${String(medication?.row['name'] ?? 'Farmaco')} · Dose spot`,
          date,
          time,
          status: 'Somministrata',
          doseTaken: true,
          kind: ['Somministrazione fuori programma', time, dosage].filter(Boolean).join(' · '),
          path: '/calendar',
        };
      })
      .filter((item) => isBetween(item.date, this.today, this.windowEnd))
      .sort(byDateAndTime),
    ...this.entries()
      .filter((item) => item.section === 'medications')
      .flatMap((item) => {
        const periods = medicationSchedulePeriods(item.row);
        const doses = this.entries().filter((dose) => dose.section === 'medication_doses' && dose.row['medication_id'] === item.row.id);
        const output: PreviewItem[] = [];
        for (const period of periods) {
          const periodStart = period.start_date || String(item.row['start_date'] ?? '');
          const periodEnd = period.end_date || (periods.length === 1 ? String(item.row['end_date'] ?? '') : '');
          const from = periodStart && periodStart > this.today ? periodStart : this.today;
          const until = periodEnd && periodEnd < this.windowEnd ? periodEnd : this.windowEnd;
          if (from > until) continue;
          const times = parseScheduleTimes(period.schedule_times);
          for (let cursor = parseDate(from); cursor && dateKey(cursor) <= until; cursor.setDate(cursor.getDate() + 1)) {
            const date = dateKey(cursor);
            for (const slot of times) {
              const time = slot.start;
              if (!medicationDoseWithinPeriod(period, date, time, periodStart, periodEnd)) continue;
              const dose = doses.find((candidate) => candidate.row['is_spot'] !== true && candidate.row['scheduled_date'] === date && String(candidate.row['scheduled_time'] ?? '').slice(0, 5) === time);
              const taken = !!dose;
              output.push({
                id: `dose-${item.row.id}-${date}-${time}`,
                highlightId: String(item.row.id),
                childId: item.row['child_id'] ? String(item.row['child_id']) : undefined,
                title: `${String(item.row['name'] ?? 'Farmaco')} · ${period.dosage}`.trim(),
                date,
                time,
                status: taken ? 'Fatto' : (slot.end ? `Fascia ${slot.start}–${slot.end}` : `Orario ${slot.start}`),
                doseTaken: taken,
                isMedicationDose: true,
                kind: [slot.end ? `Fascia ${slot.start}–${slot.end}` : `Orario ${slot.start}`,
                  dose?.row['taken_at'] ? `somministrata alle ${new Date(String(dose.row['taken_at'])).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })}` : ''].filter(Boolean).join(' · '),
                path: '/calendar',
              });
            }
          }
        }
        return output;
      }),
    ].sort(byDateAndTime),
  );
  readonly todayItems = computed(() => this.upcoming().filter((item) => item.date === this.today));
  readonly futureItems = computed(() => this.upcoming().filter((item) => item.date > this.today));
  readonly todayCalendarEvents = computed(() => this.todayItems().filter((item) => !item.isMedicationDose));
  readonly futureCalendarEvents = computed(() => this.futureItems().filter((item) => !item.isMedicationDose));
  readonly futureMedicationDoses = computed(() => this.futureItems().filter((item) => item.isMedicationDose));
  readonly activeTherapies = computed(() =>
    this.entries()
      .filter((item) => item.section === 'therapies' || item.section === 'medications')
      .filter((item) => {
        if (item.section === 'medications') {
          return medicationSchedulePeriods(item.row).some((period, index, periods) => {
            const start = period.start_date || String(item.row['start_date'] ?? '');
            const end = period.end_date || (periods.length === 1 ? String(item.row['end_date'] ?? '') : '');
            return (!start || start <= this.today) && (!end || end >= this.today);
          });
        }
        const start = String(item.row['start_date'] ?? '');
        const end = String(item.row['end_date'] ?? '');
        return (!start || start <= this.today) && (!end || end >= this.today);
      })
      .map((item) => {
        const dosesToday = item.section === 'medications'
          ? medicationSchedulePeriods(item.row)
            .filter((period, index, periods) => {
              const start = period.start_date || String(item.row['start_date'] ?? '');
              const end = period.end_date || (periods.length === 1 ? String(item.row['end_date'] ?? '') : '');
              return (!start || start <= this.today) && (!end || end >= this.today);
            })
            .flatMap((period, index, periods) => {
              const start = period.start_date || String(item.row['start_date'] ?? '');
              const end = period.end_date || (periods.length === 1 ? String(item.row['end_date'] ?? '') : '');
              return parseScheduleTimes(period.schedule_times)
                .filter((slot) => medicationDoseWithinPeriod(period, this.today, slot.start, start, end))
                .map((slot) => {
                  const dose = this.entries().find((entry) => entry.section === 'medication_doses' &&
                    entry.row['is_spot'] !== true &&
                    entry.row['medication_id'] === item.row.id && entry.row['scheduled_date'] === this.today &&
                    String(entry.row['scheduled_time'] ?? '').slice(0, 5) === slot.start);
                  const takenAt = dose?.row['taken_at'] ? new Date(String(dose.row['taken_at'])) : null;
                  return {
                    id: slot.start,
                    label: slot.end ? `Fascia ${slot.start}–${slot.end}` : slot.start,
                    taken: !!dose?.row['taken_at'] && !dose?.row['skipped_reason'],
                    skipped: !!dose?.row['skipped_reason'] || dose?.row['status'] === 'Saltata',
                    medicationId: String(item.row.id),
                    childId: item.row['child_id'] ? String(item.row['child_id']) : undefined,
                    actualTime: takenAt && !Number.isNaN(takenAt.getTime())
                      ? takenAt.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })
                      : '',
                  };
                });
            })
          : [];
        return {
          id: item.row.id,
          highlightId: item.row.id,
          childId: item.row['child_id'] ? String(item.row['child_id']) : undefined,
          title: String(item.row['name'] ?? 'Terapia'),
          date: '',
          kind:
            (item.section === 'medications'
              ? medicationSchedulePeriods(item.row)
                .filter((period, index, periods) => {
                  const start = period.start_date || String(item.row['start_date'] ?? '');
                  const end = period.end_date || (periods.length === 1 ? String(item.row['end_date'] ?? '') : '');
                  return (!start || start <= this.today) && (!end || end >= this.today);
                })
                .map((period) => period.dosage)
                .filter(Boolean)
                .join(' | ')
              : [item.row['frequency'], item.row['facility']].filter(Boolean).join(' · ')) || 'In corso',
          dosesToday,
          allDosesTaken: dosesToday.length > 0 && dosesToday.every((dose) => dose.taken && !dose.skipped),
          path: item.section === 'medications' ? '/medications' : '/therapies',
        };
      })
      .sort((a, b) => Number(b.allDosesTaken) - Number(a.allDosesTaken)),
  );
  readonly todayMedicationDoses = computed(() =>
    this.activeTherapies().flatMap((item) => item.dosesToday),
  );
  readonly allTodayMedicationDosesAccountedFor = computed(() => {
    const doses = this.todayMedicationDoses();
    return doses.length > 0 && doses.every((dose) => dose.taken || dose.skipped);
  });
  readonly deadlines = computed(() =>
    this.entries()
      .flatMap((item) => {
        const medicineExpiry = item.section === 'medicine_cabinet'
          ? medicineCabinetExpiry(item.row)
          : null;
        const dates =
          medicineExpiry?.effectiveDate
            ? [{
                date: medicineExpiry.effectiveDate,
                kind: medicineExpiry.effectiveSource === 'after-opening' ? 'Scadenza dopo apertura' : 'Scadenza farmaco',
                monthOnly: medicineExpiry.monthOnly,
              }]
            : ['medications', 'therapies'].includes(item.section) && item.row['end_date']
              ? [
                {
                  date: String(item.row['end_date']),
                  kind: item.section === 'therapies' ? 'Fine terapia' : 'Fine farmaco',
                },
              ]
              : item.section === 'documents' && item.row['due_date']
                ? [{ date: String(item.row['due_date']), kind: 'Documento' }]
                : [];
        return dates
          .filter((d) => isBetween(d.date, this.today, this.windowEnd))
          .map((d) => ({
            id: `${item.row.id}-${d.kind}`,
            highlightId: item.row.id,
            childId: item.row['child_id'] ? String(item.row['child_id']) : undefined,
            title: String(item.row['name'] ?? item.row['title'] ?? d.kind),
            date: d.date,
            kind: d.kind,
            monthOnly: 'monthOnly' in d ? d.monthOnly : false,
            path: `/${item.section}`,
          }));
      })
      .sort(byDate),
  );
  readonly medicineWarnings = computed(() =>
    this.entries()
      .filter((item) => item.section === 'medicine_cabinet')
      .map((item) => {
        const expiry = medicineCabinetExpiry(item.row);
        return {
          id: item.row.id,
          childId: item.row['child_id'] ? String(item.row['child_id']) : undefined,
          title: String(item.row['name'] ?? 'Farmaco'),
          date: expiry.effectiveDate ?? '',
          monthOnly: expiry.monthOnly,
        };
      })
      .filter((item) => isBetween(item.date, this.today, this.windowEnd))
      .sort(byDate),
  );
  readonly todayDeadlines = computed(() => this.deadlines().filter((item) => item.date === this.today));
  readonly futureDeadlines = computed(() => this.deadlines().filter((item) => item.date > this.today));
  readonly todayMedicineWarnings = computed(() => this.medicineWarnings().filter((item) => item.date === this.today));
  readonly futureMedicineWarnings = computed(() => this.medicineWarnings().filter((item) => item.date > this.today));
  async ngOnInit(): Promise<void> {
    await this.auth.ready;
    this.entries.set(await this.data.loadAllForSearch());
    this.loading.set(false);
    this.centerNextEvent();
  }
  canMarkDose(time: string): boolean {
    if (this.today !== dateKey(new Date())) return false;
    const now = new Date();
    const currentTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    return currentTime >= time;
  }
  completedDoseTimes(doses: Array<{ actualTime: string; label: string }>): string {
    return doses.map((dose) => dose.actualTime || dose.label).join(' · ');
  }
  async markDoseTaken(
    item: { id: string; childId?: string; title: string },
    dose: { id: string; taken: boolean; label: string },
  ): Promise<void> {
    if (!item.childId || dose.taken || !this.canMarkDose(dose.id) || this.savingDose()) return;
    const now = new Date();
    const actualDate = parseDate(this.today);
    if (!actualDate) return;
    const slot = this.scheduledDoseSlot(item.id, dose.id);
    const currentMinutes = now.getHours() * 60 + now.getMinutes();
    const startMinutes = slot ? timeToMinutes(slot.start) : null;
    const endMinutes = slot?.end ? timeToMinutes(slot.end) : null;
    if (
      startMinutes !== null &&
      endMinutes !== null &&
      (currentMinutes < startMinutes || currentMinutes > endMinutes)
    ) {
      const midpointSeconds = Math.floor((startMinutes + endMinutes) * 30);
      actualDate.setHours(
        Math.floor(midpointSeconds / 3600),
        Math.floor((midpointSeconds % 3600) / 60),
        midpointSeconds % 60,
        0,
      );
    } else {
      actualDate.setHours(now.getHours(), now.getMinutes(), 0, 0);
    }
    this.savingDose.set(true);
    this.doseError.set('');
    const saved = await this.data.markMedicationDoseTaken(
      item.id,
      item.childId,
      this.today,
      dose.id,
      actualDate.toISOString(),
    );
    this.savingDose.set(false);
    if (!saved) {
      this.doseError.set(this.data.error() || 'Non è stato possibile registrare la somministrazione.');
      return;
    }
    const recordedTime = actualDate.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });
    const scheduledLabel = dose.label.startsWith('Fascia ')
      ? dose.label
      : `Orario previsto ${dose.label}`;
    this.toast.showSuccess(
      'Somministrazione registrata',
      `${item.title} · ${scheduledLabel} · registrata alle ${recordedTime}`,
    );
    this.entries.set(await this.data.loadAllForSearch());
  }
  private scheduledDoseSlot(
    medicationId: string,
    scheduledTime: string,
  ): { start: string; end?: string } | undefined {
    const medication = this.entries().find(
      (entry) => entry.section === 'medications' && String(entry.row.id) === medicationId,
    );
    if (!medication) return undefined;

    const periods = medicationSchedulePeriods(medication.row);
    for (const period of periods) {
      const startDate = period.start_date || String(medication.row['start_date'] ?? '');
      const endDate = period.end_date || (periods.length === 1 ? String(medication.row['end_date'] ?? '') : '');
      if ((startDate && startDate > this.today) || (endDate && endDate < this.today)) continue;
      const slot = parseScheduleTimes(period.schedule_times).find((candidate) => candidate.start === scheduledTime);
      if (slot) return slot;
    }
    return undefined;
  }
  openSkipDose(item: { id: string; childId?: string }, dose: { id: string; label: string }): void {
    if (!item.childId || !this.canMarkDose(dose.id) || this.savingDose()) return;
    this.doseError.set('');
    this.skipReason.set('');
    this.skipDose.set({ medicationId: item.id, childId: item.childId, time: dose.id, label: dose.label });
  }
  closeSkipDose(): void {
    this.skipDose.set(null);
    this.doseError.set('');
  }
  async markDoseSkipped(): Promise<void> {
    const dose = this.skipDose();
    const reason = this.skipReason().trim();
    if (!dose || !reason || this.savingDose()) return;
    this.savingDose.set(true);
    this.doseError.set('');
    const saved = await this.data.markMedicationDoseSkipped(
      dose.medicationId,
      dose.childId,
      this.today,
      dose.time,
      reason,
    );
    this.savingDose.set(false);
    if (!saved) {
      this.doseError.set(this.data.error() || 'Non è stato possibile registrare la dose saltata.');
      return;
    }
    this.skipDose.set(null);
    this.entries.set(await this.data.loadAllForSearch());
  }
  private centerNextEvent(): void {
    const now = new Date();
    const today = dateKey(now);
    const currentTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    const next = this.upcoming().find(
      (item) =>
        item.status !== 'Saltato' &&
        (item.date > today ||
          (item.date === today && (!item.time || item.time >= currentTime))),
    );
    const nextDose = this.activeTherapies()
      .flatMap((item) => item.dosesToday)
      .find((dose) => !dose.taken && !dose.skipped);
    if (!next && !nextDose) return;
    requestAnimationFrame(() => {
      if (nextDose) {
        const doseTarget = Array.from(
          this.host.nativeElement.querySelectorAll('[data-medication-dose-id]') as NodeListOf<HTMLElement>,
        ).find((element) => element.dataset['medicationDoseId'] === nextDose.id);
        if (doseTarget) {
          doseTarget.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' });
          return;
        }
      }
      if (!next) return;
      const target = Array.from(
        this.host.nativeElement.querySelectorAll('[data-event-id]') as NodeListOf<HTMLElement>,
      ).find((element) => element.dataset['eventId'] === next.id);
      target?.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' });
    });
  }
  shortDate(date: string): string {
    return new Date(`${date}T12:00:00`).toLocaleDateString('it-IT', {
      day: '2-digit',
      month: 'short',
    });
  }
  monthYear(date: string): string {
    return new Date(`${date}T12:00:00`).toLocaleDateString('it-IT', { month: 'short', year: 'numeric' });
  }
}
function dateKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}
function medicationSchedulePeriods(row: SearchableDiaryItem['row']): MedicationSchedulePeriod[] {
  const stored = row['schedule_periods'];
  if (Array.isArray(stored)) {
    const periods = stored
      .filter((value): value is Record<string, unknown> => !!value && typeof value === 'object')
      .map((value) => ({
        start_date: String(value['start_date'] ?? '').slice(0, 10),
        end_date: String(value['end_date'] ?? '').slice(0, 10),
        start_time: String(value['start_time'] ?? ''),
        end_time: String(value['end_time'] ?? ''),
        dosage: String(value['dosage'] ?? row['dosage'] ?? ''),
        schedule_times: String(value['schedule_times'] ?? ''),
      }));
    if (periods.length) return periods;
  }
  return [{
    start_date: String(row['start_date'] ?? '').slice(0, 10),
    end_date: String(row['end_date'] ?? '').slice(0, 10),
    start_time: '',
    end_time: '',
    dosage: String(row['dosage'] ?? ''),
    schedule_times: String(row['schedule_times'] ?? ''),
  }];
}
function addDays(date: string, days: number): string {
  const [y, m, d] = date.split('-').map(Number);
  const result = new Date(y, m - 1, d + days);
  return dateKey(result);
}
function isBetween(date: string, from: string, to: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(date) && date >= from && date <= to;
}
function byDate<T extends { date: string }>(a: T, b: T): number {
  return a.date.localeCompare(b.date);
}
function byDateAndTime<T extends { date: string; time?: string }>(a: T, b: T): number {
  return byDate(a, b) || (a.time ?? '').localeCompare(b.time ?? '');
}
function parseDate(value: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  return dateKey(date) === value ? date : null;
}
function parseScheduleTimes(value: string): Array<{ start: string; end?: string }> {
  return value.split(',').flatMap((entry) => {
    const match = entry.trim().match(/^(\d{1,2}:\d{2})(?:\s*[-–]\s*(\d{1,2}:\d{2}))?$/);
    if (!match) return [];
    const start = normalizeTime(match[1]);
    const end = match[2] ? normalizeTime(match[2]) : undefined;
    if (!start || (match[2] && (!end || end < start))) return [];
    return [{ start, ...(end ? { end } : {}) }];
  });
}
function medicationDoseWithinPeriod(
  period: MedicationSchedulePeriod,
  date: string,
  time: string,
  periodStart: string,
  periodEnd: string,
): boolean {
  return !(date === periodStart && period.start_time && time < period.start_time) &&
    !(date === periodEnd && period.end_time && time > period.end_time);
}
function normalizeTime(value: string): string | null {
  const [hour, minute] = value.split(':').map(Number);
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return null;
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}
function timeToMinutes(value: string): number {
  const [hour, minute] = value.split(':').map(Number);
  return hour * 60 + minute;
}
