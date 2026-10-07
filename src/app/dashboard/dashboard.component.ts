import { CommonModule } from '@angular/common';
import {
  Component,
  ElementRef,
  HostListener,
  OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { AuthService } from '../core/auth.service';
import { DiaryDataService, SearchableDiaryItem } from '../core/diary-data.service';
import { SECTIONS, SectionId } from '../models/diary.models';
import { CalendarPreviewComponent } from '../components/calendar-preview/calendar-preview.component';

interface SearchResult {
  section: Exclude<SectionId, 'reports'>;
  title: string;
  detail: string;
  path: string;
  childId?: string;
  score: number;
}

@Component({
  selector: 'tc-dashboard',
  standalone: true,
  imports: [CommonModule, RouterLink, CalendarPreviewComponent],
  template: ` <section class="space-y-6">
    @if (!loading() && !hasChildren()) {
      <div class="welcome-card">
        <div class="relative z-10 max-w-2xl">
          <p class="text-sm font-semibold text-teal-100">IL TUO SPAZIO DI CURA</p>
          <h1 class="mt-3 text-3xl font-semibold leading-tight tracking-tight sm:text-4xl">
            Un diario chiaro,<br class="sm:hidden" />
            al vostro fianco.
          </h1>
          <p class="mt-3 max-w-lg text-sm leading-6 text-teal-50/85">
            Raccogli informazioni e piccoli dettagli quotidiani. Potrai ritrovarli e condividerli con
            il team clinico quando serve.
          </p>
          <a
            routerLink="/children"
            class="mt-5 inline-flex rounded-xl bg-white px-4 py-3 text-sm font-semibold !text-teal-900 shadow-sm transition hover:bg-teal-50"
            >Crea un profilo <span class="ml-2">→</span></a
          >
        </div>
        <div aria-hidden="true" class="welcome-orbit">♡</div>
      </div>
    }
    <tc-calendar-preview />
    <section class="panel relative z-20 mt-4" aria-label="Ricerca globale">
      <label for="global-search" class="block text-sm font-semibold"
        >Cerca in tutto il diario</label
      >
      <div class="relative mt-2">
        <div class="search-input-box">
          <svg aria-hidden="true" class="search-icon" viewBox="0 0 20 20" fill="currentColor">
            <path
              fill-rule="evenodd"
              d="M9 3.5a5.5 5.5 0 100 11 5.5 5.5 0 000-11zM2 9a7 7 0 1112.452 4.391l3.328 3.329a.75.75 0 11-1.06 1.06l-3.329-3.328A7 7 0 012 9z"
              clip-rule="evenodd"
            /></svg
          ><input
            id="global-search"
            type="search"
            class="field-control"
            placeholder="Un nome, un farmaco, una struttura…"
            autocomplete="off"
            [value]="query()"
            (focus)="isOpen.set(true)"
            (input)="query.set($any($event.target).value); isOpen.set(true)"
            [attr.aria-expanded]="showResults()"
            aria-controls="global-search-results"
            aria-describedby="global-search-hint"
          />
        </div>
        @if (showResults()) {
          <div
            id="global-search-results"
            class="absolute left-0 right-0 top-[48px] z-30 max-h-[min(65vh,28rem)] overflow-y-auto rounded-2xl border border-slate-200 bg-white p-2 shadow-xl dark:border-slate-700 dark:bg-slate-900"
            role="listbox"
            aria-label="Risultati della ricerca"
          >
            @if (loading()) {
              <p class="px-3 py-4 text-sm text-slate-500">Cerco nel diario…</p>
            } @else if (results().length) {
              @for (result of results(); track result.section + result.path) {
                <a
                  role="option"
                  [routerLink]="'/' + result.section"
                  [queryParams]="{ highlight: result.path, child: result.childId || null }"
                  (click)="isOpen.set(false)"
                  class="block rounded-xl px-3 py-3 hover:bg-teal-50 focus:bg-teal-50 focus:outline-none dark:hover:bg-slate-800 dark:focus:bg-slate-800"
                  ><span class="flex items-center justify-between gap-3"
                    ><strong class="truncate text-sm">{{ result.title }}</strong
                    ><span
                      class="shrink-0 rounded-full bg-teal-50 px-2 py-1 text-[11px] font-semibold text-teal-800 dark:bg-teal-900/40 dark:text-teal-200"
                      >{{ sectionLabel(result.section) }}</span
                    ></span
                  >
                  @if (result.detail) {
                    <span class="mt-1 block truncate text-xs text-slate-500 dark:text-slate-400">{{
                      result.detail
                    }}</span>
                  }
                </a>
              }
            } @else {
              <p class="px-3 py-4 text-sm text-slate-500">
                Nessun risultato trovato. Prova con un termine più breve.
              </p>
            }
          </div>
        }
        <span id="global-search-hint" class="mt-2 block text-xs text-slate-500 dark:text-slate-400"
          >Ricerca anche con piccoli errori di battitura tra contatti, profili, farmaci, ortesi,
          eventi, terapie, documenti e spese.</span
        >
      </div>
    </section>
    <div class="flex items-end justify-between gap-4">
      <div>
        <p class="eyebrow">ACCESSO RAPIDO</p>
        <h2 class="mt-1 text-xl font-semibold">Il diario di oggi</h2>
      </div>
      <a
        routerLink="/reports"
        class="text-sm font-semibold text-teal-700 hover:underline dark:text-teal-300"
        >Prepara report →</a
      >
    </div>
    <div class="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
      @for (item of quickLinks; track item.id) {
        <a class="quick-card group" [routerLink]="'/' + item.id"
          ><div class="flex items-start justify-between">
            <span class="quick-icon">
              @if (item.id === 'medications' || item.id === 'medicine_cabinet') {
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
                  <path [attr.d]="medicationIconPath(item.id)" />
                </svg>
              } @else {
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
                  <path [attr.d]="sectionIconPath(item.id)" />
                </svg>
              }</span
            ><span
              class="text-slate-300 transition group-hover:translate-x-1 group-hover:text-teal-600"
              >↗</span
            >
          </div>
          <h3 class="mt-4 font-semibold">{{ item.title }}</h3>
          <p class="mt-1 text-sm leading-5 text-slate-500 dark:text-slate-400">
            {{ item.description }}
          </p></a
        >
      }
    </div>
    <div class="panel flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
      <div class="flex items-start gap-3">
        <span class="mt-0.5 text-xl text-amber-500">✦</span>
        <div>
          <h2 class="font-semibold">Piccoli appunti, grande aiuto</h2>
          <p class="mt-1 text-sm leading-5 text-slate-500 dark:text-slate-400">
            Anche un sintomo lieve o una ricevuta possono essere utili alla prossima visita.
          </p>
        </div>
      </div>
      <a
        routerLink="/health_events"
        [queryParams]="{ action: 'new' }"
        class="button-secondary shrink-0"
        >Registra un evento</a
      >
    </div>
  </section>`,
})
export class DashboardComponent implements OnInit {
  private readonly data = inject(DiaryDataService);
  private readonly auth = inject(AuthService);
  private readonly elementRef = inject(ElementRef);
  readonly query = signal('');
  readonly isOpen = signal(false);
  readonly entries = signal<SearchableDiaryItem[]>([]);
  readonly loading = signal(true);
  readonly quickLinks = SECTIONS.filter((item) => item.id !== 'children' && item.id !== 'reports')
    .slice(0, 7)
    .map((item, index) => ({ ...item, glyph: ['◉', '⌁', '♡', '▤', '€', '☎', '◇'][index] }));
  readonly results = computed(() => this.rank(this.query(), this.entries()).slice(0, 10));
  readonly showResults = computed(() => this.isOpen() && this.query().trim().length >= 2);
  readonly hasChildren = computed(() =>
    this.entries().some((item) => item.section === 'children'),
  );

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent): void {
    if (!this.elementRef.nativeElement.contains(event.target)) {
      this.isOpen.set(false);
    }
  }

  async ngOnInit(): Promise<void> {
    await this.auth.ready;
    this.entries.set(await this.data.loadAllForSearch());
    this.loading.set(false);
  }

  medicationIconPath(section: string): string {
    return section === 'medicine_cabinet'
      ? 'M9 3.5h6v3H9z M7 6.5h10v14H7z M7 10h10 M12 12v5 M9.5 14.5h5'
      : 'M8 5h8a3.5 3.5 0 0 1 0 7H8a3.5 3.5 0 0 1 0-7z M12 5v7';
  }

  sectionIconPath(section: string): string {
    return (
      {
        children: 'M16 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2 M10 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8 M20 8v6 M23 11h-6',
        medication_doses: 'M8 5h8a3.5 3.5 0 0 1 0 7H8a3.5 3.5 0 0 1 0-7z M12 5v7 M12 16v5 M9.5 18.5h5',
        health_events: 'M3 12h4l3-8 4 16 3-8h4',
        orthoses: 'M3 15c3 0 4-1 5-4l2-6h4l1 6c.4 2 2 4 6 4v3H3z M9 15h2 M13 15h2',
        calendar_events: 'M8 3v4 M16 3v4 M4 9h16 M5 5h14a1 1 0 0 1 1 1v13H4V6a1 1 0 0 1 1-1z M8 13h2 M14 13h2 M8 17h2',
        therapies: 'M12 21s-8.5-4.8-8.5-11a4.5 4.5 0 0 1 8.5-2.1A4.5 4.5 0 0 1 20.5 10c0 6.2-8.5 11-8.5 11z M12 8v7 M8.5 11.5h7',
        documents: 'M13 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V10z M13 3v7h7 M8 14h8 M8 17h6',
        expenses: 'M12 2v20 M17 6.5c-.8-1-2.2-1.5-4.5-1.5-2.5 0-4 1.1-4 3s1.5 4 4.5 4 4.5 2 4.5 4-1.5 3-4 3c-2 0-3.8-.7-5-2',
        contacts: 'M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2 M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8',
      } as Record<string, string>
    )[section] ?? 'M12 5v14 M5 12h14';
  }

  sectionLabel(section: Exclude<SectionId, 'reports'>): string {
    return SECTIONS.find((item) => item.id === section)?.label ?? section;
  }

  private rank(rawQuery: string, entries: SearchableDiaryItem[]): SearchResult[] {
    const query = normalize(rawQuery.trim());
    const terms = query.split(/\s+/).filter(Boolean);
    if (terms.length === 0 || query.length < 2) return [];
    const childNames = new Map(
      entries
        .filter((item) => item.section === 'children')
        .map((item) => [item.row.id, String(item.row['name'] ?? '')]),
    );
    const ranked: SearchResult[] = [];
    for (const item of entries) {
      const fields = Object.entries(item.row)
        .filter(
          ([key, value]) =>
            ![
              'id',
              'user_id',
              'child_id',
              'created_at',
              'updated_at',
              'storage_path',
              'receipt_path',
            ].includes(key) && ['string', 'number'].includes(typeof value),
        )
        .map(([, value]) => String(value));
      const searchable = normalize(fields.join(' '));
      const termScores = terms.map((term) => bestMatch(term, fields));
      if (termScores.some((score) => score < 0.48)) continue;
      let score = termScores.reduce((sum, value) => sum + value, 0) / termScores.length;
      if (searchable.includes(query)) score += 0.2;
      const title = String(
        item.row['name'] ??
        item.row['title'] ??
        item.row['category'] ??
        item.row['description'] ??
        'Voce del diario',
      );
      const detailKeys = [
        'role',
        'dosage',
        'category',
        'facility',
        'phone',
        'email',
        'date',
        'notes',
        'trial_id',
        'emergency_contact',
      ];
      const medicationDetails = item.section === 'medications'
        ? [
            item.row['dosage'],
            item.row['formulation'],
            item.row['start_date'] ? `Dal ${formatDate(item.row['start_date'])}` : '',
            item.row['end_date'] ? `Al ${formatDate(item.row['end_date'])}` : '',
            item.row['schedule_times'] ? `Orari: ${item.row['schedule_times']}` : '',
          ]
        : [];
      const pdfText =
        typeof item.row['extracted_text'] === 'string' ? item.row['extracted_text'] : '';
      const pdfExcerpt = pdfText.slice(0, 140);
      const detail = [
        childNames.get(String(item.row['child_id'] ?? '')),
        ...medicationDetails,
        ...detailKeys.map((key) => item.row[key]),
        ...(pdfExcerpt ? [`PDF: ${pdfExcerpt}${pdfText.length > 140 ? '…' : ''}`] : []),
      ]
        .filter(
          (value): value is string | number =>
            typeof value === 'string' || typeof value === 'number',
        )
        .map(String)
        .filter(Boolean)
        .join(' · ');
      ranked.push({
        section: item.section,
        title,
        detail,
        path: item.row.id,
        childId: item.row['child_id'] ? String(item.row['child_id']) : undefined,
        score,
      });
    }
    return ranked.sort((a, b) => b.score - a.score || a.title.localeCompare(b.title, 'it'));
  }
}

function normalize(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('it')
    .trim();
}

function formatDate(value: unknown): string {
  const raw = String(value ?? '');
  const parts = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw);
  return parts ? `${parts[3]}/${parts[2]}/${parts[1]}` : raw;
}

function bestMatch(term: string, fields: string[]): number {
  let best = 0;
  for (const field of fields) {
    const normalized = normalize(field);
    if (!normalized) continue;
    if (normalized === term) return 1.3;
    if (normalized.includes(term)) best = Math.max(best, 1.1);
    for (const word of normalized.split(/[^\p{L}\p{N}]+/u).filter(Boolean)) {
      if (word.startsWith(term)) best = Math.max(best, 1.0);
      const distance = editDistance(term, word);
      const similarity = 1 - distance / Math.max(term.length, word.length);
      if (distance <= Math.max(1, Math.floor(term.length * 0.3))) best = Math.max(best, similarity);
    }
  }
  return best;
}

function editDistance(a: string, b: string): number {
  const previous = Array.from({ length: b.length + 1 }, (_, index) => index);
  for (let i = 1; i <= a.length; i++) {
    let diagonal = previous[0];
    previous[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const above = previous[j];
      previous[j] = Math.min(
        previous[j] + 1,
        previous[j - 1] + 1,
        diagonal + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
      diagonal = above;
    }
  }
  return previous[b.length];
}
