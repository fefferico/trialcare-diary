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
  readonly entries = signal<SearchableDiaryItem[]>([]);
  readonly loading = signal(true);
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
      .filter((item) => item.section === 'medications')
      .flatMap((item) => {
        const start = String(item.row['start_date'] ?? '');
        const end = String(item.row['end_date'] ?? '');
        const from = start && start > this.today ? start : this.today;
        const until = end && end < this.windowEnd ? end : this.windowEnd;
        const times = parseScheduleTimes(String(item.row['schedule_times'] ?? ''));
        if (from > until) return [];
        const doses = this.entries().filter((dose) => dose.section === 'medication_doses' && dose.row['medication_id'] === item.row.id);
        const output: PreviewItem[] = [];
        for (let cursor = parseDate(from); cursor && dateKey(cursor) <= until; cursor.setDate(cursor.getDate() + 1)) {
          const date = dateKey(cursor);
          for (const slot of times) {
            const time = slot.start;
            const dose = doses.find((candidate) => candidate.row['scheduled_date'] === date && String(candidate.row['scheduled_time'] ?? '').slice(0, 5) === time);
            const taken = !!dose;
            output.push({
              id: `dose-${item.row.id}-${date}-${time}`,
              highlightId: String(item.row.id),
              childId: item.row['child_id'] ? String(item.row['child_id']) : undefined,
              title: `${String(item.row['name'] ?? 'Farmaco')} · ${String(item.row['dosage'] ?? '')}`.trim(),
              date,
              time,
              status: taken ? 'Fatto' : (slot.end ? `Fascia ${slot.start}–${slot.end}` : `Orario ${slot.start}`),
              doseTaken: taken,
              kind: [slot.end ? `Fascia ${slot.start}–${slot.end}` : `Orario ${slot.start}`,
                dose?.row['taken_at'] ? `somministrata alle ${new Date(String(dose.row['taken_at'])).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })}` : ''].filter(Boolean).join(' · '),
              path: '/calendar',
            });
          }
        }
        return output;
      }),
    ].sort(byDateAndTime),
  );
  readonly activeTherapies = computed(() =>
    this.entries()
      .filter((item) => item.section === 'therapies' || item.section === 'medications')
      .filter((item) => {
        const start = String(item.row['start_date'] ?? '');
        const end = String(item.row['end_date'] ?? '');
        return (!start || start <= this.today) && (!end || end >= this.today);
      })
      .map((item) => {
        const dosesToday = item.section === 'medications'
          ? parseScheduleTimes(String(item.row['schedule_times'] ?? '')).map((slot) => {
            const dose = this.entries().find((entry) => entry.section === 'medication_doses' &&
              entry.row['medication_id'] === item.row.id && entry.row['scheduled_date'] === this.today &&
              String(entry.row['scheduled_time'] ?? '').slice(0, 5) === slot.start);
            const takenAt = dose?.row['taken_at'] ? new Date(String(dose.row['taken_at'])) : null;
            return {
              id: slot.start,
              label: slot.end ? `Fascia ${slot.start}–${slot.end}` : slot.start,
              taken: !!dose,
              actualTime: takenAt && !Number.isNaN(takenAt.getTime())
                ? takenAt.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })
                : '',
            };
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
              ? [item.row['dosage'], item.row['schedule_times']].filter(Boolean).join(' · ')
              : [item.row['frequency'], item.row['facility']].filter(Boolean).join(' · ')) || 'In corso',
          dosesToday,
          path: item.section === 'medications' ? '/medications' : '/therapies',
        };
      }),
  );
  readonly deadlines = computed(() =>
    this.entries()
      .flatMap((item) => {
        const dates =
          item.section === 'medicine_cabinet' && item.row['expiry_date']
            ? [{ date: String(item.row['expiry_date']), kind: 'Scadenza farmaco' }]
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
            path: `/${item.section}`,
          }));
      })
      .sort(byDate),
  );
  readonly medicineWarnings = computed(() =>
    this.entries()
      .filter((item) => item.section === 'medicine_cabinet')
      .map((item) => ({
        id: item.row.id,
        childId: item.row['child_id'] ? String(item.row['child_id']) : undefined,
        title: String(item.row['name'] ?? 'Farmaco'),
        date: String(item.row['expiry_date'] ?? '').slice(0, 10),
      }))
      .filter((item) => isBetween(item.date, this.today, this.windowEnd))
      .sort(byDate),
  );
  async ngOnInit(): Promise<void> {
    await this.auth.ready;
    this.entries.set(await this.data.loadAllForSearch());
    this.loading.set(false);
    this.centerNextEvent();
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
    if (!next) return;
    requestAnimationFrame(() => {
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
}
function dateKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
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
function normalizeTime(value: string): string | null {
  const [hour, minute] = value.split(':').map(Number);
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return null;
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}
