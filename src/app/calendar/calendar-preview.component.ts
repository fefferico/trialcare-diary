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

interface PreviewItem {
  id: string;
  highlightId: string;
  childId?: string;
  title: string;
  date: string;
  kind: string;
  path: string;
}
@Component({
  selector: 'tc-calendar-preview',
  standalone: true,
  imports: [CommonModule, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: ` <section class="panel space-y-4">
    <div class="flex items-start justify-between gap-3">
      <div>
        <p class="eyebrow">PROSSIMI 30 GIORNI</p>
        <h2 class="mt-1 text-xl font-semibold">In programma</h2>
        <p class="mt-1 text-sm text-slate-500 dark:text-slate-400">
          Eventi, terapie attive e date da ricordare.
        </p>
      </div>
      <a routerLink="/calendar" class="button-secondary shrink-0">Apri calendario</a>
    </div>
    @if (loading()) {
      <p class="text-sm text-slate-500">Caricamento programma…</p>
    } @else {
      @if (medicineWarnings().length) {
        <section
          class="rounded-2xl border border-amber-300 bg-amber-50 p-4 dark:border-amber-800 dark:bg-amber-950/40"
          aria-live="polite"
        >
          <div class="flex items-start justify-between gap-3">
            <div>
              <p class="text-sm font-bold text-amber-900 dark:text-amber-100">
                Attenzione: farmaci prossimi alla scadenza
              </p>
              <p class="mt-1 text-xs text-amber-800 dark:text-amber-200">
                Controlla queste confezioni nel tuo inventario.
              </p>
            </div>
            <a
              routerLink="/medicine-cabinet"
              class="shrink-0 text-sm font-semibold text-amber-900 underline dark:text-amber-100"
              >Apri inventario</a
            >
          </div>
          <ul class="mt-3 grid gap-2 sm:grid-cols-2">
            @for (item of medicineWarnings().slice(0, 4); track item.id) {
              <li>
                <a
                  routerLink="/medicine-cabinet"
                  [queryParams]="{ highlight: item.id, child: item.childId || null }"
                  class="flex justify-between gap-3 rounded-xl bg-white/80 px-3 py-2 text-sm dark:bg-slate-900/70"
                  ><strong class="truncate">{{ item.title }}</strong
                  ><span class="shrink-0 text-amber-800 dark:text-amber-200">{{
                    shortDate(item.date)
                  }}</span></a
                >
              </li>
            }
          </ul>
        </section>
      }
      <div class="grid gap-4 md:grid-cols-3">
        <section>
          <h3 class="text-sm font-semibold">
            Eventi in arrivo <span class="text-slate-400">{{ upcoming().length }}</span>
          </h3>
          @if (upcoming().length) {
            <ul class="mt-2 space-y-2">
              @for (item of upcoming().slice(0, 3); track item.id) {
                <li>
                  <a
                    [routerLink]="item.path"
                    [queryParams]="{ highlight: item.highlightId, child: item.childId || null }"
                    class="flex gap-3 rounded-xl bg-slate-50 p-3 hover:bg-teal-50 dark:bg-slate-800/60 dark:hover:bg-slate-800"
                    ><span
                      class="min-w-12 text-xs font-semibold text-teal-700 dark:text-teal-300"
                      >{{ shortDate(item.date) }}</span
                    ><span class="min-w-0"
                      ><strong class="block truncate text-sm">{{ item.title }}</strong
                      ><span class="text-xs text-slate-500">{{ item.kind }}</span></span
                    ></a
                  >
                </li>
              }
            </ul>
          } @else {
            <p class="mt-2 text-sm text-slate-500">Nessun evento in arrivo.</p>
          }
        </section>
        <section>
          <h3 class="text-sm font-semibold">
            Terapie in corso <span class="text-slate-400">{{ activeTherapies().length }}</span>
          </h3>
          @if (activeTherapies().length) {
            <ul class="mt-2 space-y-2">
              @for (item of activeTherapies().slice(0, 3); track item.id) {
                <li>
                  <a
                    [routerLink]="item.path"
                    [queryParams]="{ highlight: item.highlightId, child: item.childId || null }"
                    class="block rounded-xl bg-slate-50 p-3 text-sm hover:bg-teal-50 dark:bg-slate-800/60 dark:hover:bg-slate-800"
                    ><strong class="block truncate">{{ item.title }}</strong
                    ><span class="text-xs text-slate-500">{{ item.kind }}</span></a
                  >
                </li>
              }
            </ul>
          } @else {
            <p class="mt-2 text-sm text-slate-500">Nessuna terapia attiva registrata.</p>
          }
        </section>
        <section>
          <h3 class="text-sm font-semibold">
            Scadenze prossime <span class="text-slate-400">{{ deadlines().length }}</span>
          </h3>
          @if (deadlines().length) {
            <ul class="mt-2 space-y-2">
              @for (item of deadlines().slice(0, 3); track item.id) {
                <li>
                  <a
                    [routerLink]="item.path"
                    [queryParams]="{ highlight: item.highlightId, child: item.childId || null }"
                    class="flex gap-3 rounded-xl bg-slate-50 p-3 hover:bg-amber-50 dark:bg-slate-800/60 dark:hover:bg-slate-800"
                    ><span
                      class="min-w-12 text-xs font-semibold text-amber-700 dark:text-amber-300"
                      >{{ shortDate(item.date) }}</span
                    ><span class="min-w-0"
                      ><strong class="block truncate text-sm">{{ item.title }}</strong
                      ><span class="text-xs text-slate-500">{{ item.kind }}</span></span
                    ></a
                  >
                </li>
              }
            </ul>
          } @else {
            <p class="mt-2 text-sm text-slate-500">Nessuna scadenza nei prossimi 30 giorni.</p>
          }
        </section>
      </div>
    }
  </section>`,
})
export class CalendarPreviewComponent implements OnInit {
  private readonly auth = inject(AuthService);
  private readonly data = inject(DiaryDataService);
  readonly entries = signal<SearchableDiaryItem[]>([]);
  readonly loading = signal(true);
  private readonly windowEnd = addDays(dateKey(new Date()), 30);
  private readonly today = dateKey(new Date());
  readonly upcoming = computed(() =>
    this.entries()
      .filter((item) => item.section === 'health_events')
      .map((item) => {
        const rawTime = String(item.row['time'] ?? '');
        const time = rawTime.replace(/^(\d{2}:\d{2}):\d{2}(?:\.\d+)?$/, '$1');
        return {
          id: item.row.id,
          highlightId: item.row.id,
          childId: item.row['child_id'] ? String(item.row['child_id']) : undefined,
          title: String(item.row['title'] ?? 'Evento'),
          date: String(item.row['date'] ?? '').slice(0, 10),
          kind: time ? `${time} · Appuntamento` : 'Appuntamento',
          path: '/health_events',
        };
      })
      .filter((item) => isBetween(item.date, this.today, this.windowEnd))
      .sort(byDate),
  );
  readonly activeTherapies = computed(() =>
    this.entries()
      .filter((item) => item.section === 'therapies')
      .filter((item) => {
        const start = String(item.row['start_date'] ?? '');
        const end = String(item.row['end_date'] ?? '');
        return (!start || start <= this.today) && (!end || end >= this.today);
      })
      .map((item) => ({
        id: item.row.id,
        highlightId: item.row.id,
        childId: item.row['child_id'] ? String(item.row['child_id']) : undefined,
        title: String(item.row['name'] ?? 'Terapia'),
        date: '',
        kind:
          [item.row['frequency'], item.row['facility']].filter(Boolean).join(' · ') || 'In corso',
        path: '/therapies',
      })),
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
