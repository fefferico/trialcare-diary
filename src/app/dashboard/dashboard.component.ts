import { CommonModule } from '@angular/common';
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AuthService } from '../core/auth.service';
import { DiaryDataService, SearchableDiaryItem } from '../core/diary-data.service';
import { SECTIONS, SectionId } from '../models/diary.models';

interface SearchResult { section: Exclude<SectionId, 'reports'>; title: string; detail: string; path: string; childId?: string; score: number; }

@Component({selector:'tc-dashboard',standalone:true,imports:[CommonModule,RouterLink],template:`
  <section class="space-y-6"><div class="welcome-card"><div class="relative z-10 max-w-2xl"><p class="text-sm font-semibold text-teal-100">IL TUO SPAZIO DI CURA</p><h1 class="mt-3 text-3xl font-semibold leading-tight tracking-tight sm:text-4xl">Un diario chiaro,<br class="sm:hidden"> al vostro fianco.</h1><p class="mt-3 max-w-lg text-sm leading-6 text-teal-50/85">Raccogli informazioni e piccoli dettagli quotidiani. Potrai ritrovarli e condividerli con il team clinico quando serve.</p><a routerLink="/children" class="mt-5 inline-flex rounded-xl bg-white px-4 py-3 text-sm font-semibold !text-teal-900 shadow-sm transition hover:bg-teal-50">Crea un profilo <span class="ml-2">→</span></a></div><div aria-hidden="true" class="welcome-orbit">♡</div></div>
  <section class="panel relative z-20" aria-label="Ricerca globale"><label for="global-search" class="block text-sm font-semibold">Cerca in tutto il diario</label><div class="relative mt-2"><div class="search-input-box"><svg aria-hidden="true" class="search-icon" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M9 3.5a5.5 5.5 0 100 11 5.5 5.5 0 000-11zM2 9a7 7 0 1112.452 4.391l3.328 3.329a.75.75 0 11-1.06 1.06l-3.329-3.328A7 7 0 012 9z" clip-rule="evenodd" /></svg><input id="global-search" type="search" class="field-control" placeholder="Un nome, un farmaco, una struttura…" autocomplete="off" [value]="query()" (input)="query.set($any($event.target).value)" [attr.aria-expanded]="query().trim().length >= 2" aria-controls="global-search-results" aria-describedby="global-search-hint"></div><span id="global-search-hint" class="mt-2 block text-xs text-slate-500 dark:text-slate-400">Ricerca anche con piccoli errori di battitura tra contatti, profili, farmaci, eventi, terapie, documenti e spese.</span>
  @if(query().trim().length >= 2){<div id="global-search-results" class="absolute left-0 right-0 top-full z-30 mt-2 max-h-[min(65vh,28rem)] overflow-y-auto rounded-2xl border border-slate-200 bg-white p-2 shadow-xl dark:border-slate-700 dark:bg-slate-900" role="listbox" aria-label="Risultati della ricerca">@if(loading()){<p class="px-3 py-4 text-sm text-slate-500">Cerco nel diario…</p>}@else if(results().length){@for(result of results();track result.section+result.path){<a role="option" [routerLink]="'/' + result.section" [queryParams]="{highlight:result.path,child:result.childId || null}" class="block rounded-xl px-3 py-3 hover:bg-teal-50 focus:bg-teal-50 focus:outline-none dark:hover:bg-slate-800 dark:focus:bg-slate-800"><span class="flex items-center justify-between gap-3"><strong class="truncate text-sm">{{result.title}}</strong><span class="shrink-0 rounded-full bg-teal-50 px-2 py-1 text-[11px] font-semibold text-teal-800 dark:bg-teal-900/40 dark:text-teal-200">{{sectionLabel(result.section)}}</span></span>@if(result.detail){<span class="mt-1 block truncate text-xs text-slate-500 dark:text-slate-400">{{result.detail}}</span>}</a>} }@else{<p class="px-3 py-4 text-sm text-slate-500">Nessun risultato trovato. Prova con un termine più breve.</p>}</div>}
  </div></section>
  <div class="flex items-end justify-between gap-4"><div><p class="eyebrow">ACCESSO RAPIDO</p><h2 class="mt-1 text-xl font-semibold">Il diario di oggi</h2></div><a routerLink="/reports" class="text-sm font-semibold text-teal-700 hover:underline dark:text-teal-300">Prepara report →</a></div>
  <div class="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">@for(item of quickLinks;track item.id){<a class="quick-card group" [routerLink]="'/' + item.id"><div class="flex items-start justify-between"><span class="quick-icon">{{item.glyph}}</span><span class="text-slate-300 transition group-hover:translate-x-1 group-hover:text-teal-600">↗</span></div><h3 class="mt-4 font-semibold">{{item.title}}</h3><p class="mt-1 text-sm leading-5 text-slate-500 dark:text-slate-400">{{item.description}}</p></a>}</div>
  <div class="panel flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between"><div class="flex items-start gap-3"><span class="mt-0.5 text-xl text-amber-500">✦</span><div><h2 class="font-semibold">Piccoli appunti, grande aiuto</h2><p class="mt-1 text-sm leading-5 text-slate-500 dark:text-slate-400">Anche un sintomo lieve o una ricevuta possono essere utili alla prossima visita.</p></div></div><a routerLink="/health_events" class="button-secondary shrink-0">Registra un evento</a></div></section>`})
export class DashboardComponent implements OnInit {
  private readonly data = inject(DiaryDataService);
  private readonly auth = inject(AuthService);
  readonly query = signal('');
  readonly entries = signal<SearchableDiaryItem[]>([]);
  readonly loading = signal(true);
  readonly quickLinks = SECTIONS.filter(item=>item.id!=='children' && item.id!=='reports').slice(0,6).map((item,index)=>({...item,glyph:['◉','⌁','♡','▤','€','☎'][index]}));
  readonly results = computed(() => this.rank(this.query(), this.entries()).slice(0, 10));

  async ngOnInit(): Promise<void> {
    await this.auth.ready;
    this.entries.set(await this.data.loadAllForSearch());
    this.loading.set(false);
  }

  sectionLabel(section: Exclude<SectionId, 'reports'>): string { return SECTIONS.find(item => item.id === section)?.label ?? section; }

  private rank(rawQuery: string, entries: SearchableDiaryItem[]): SearchResult[] {
    const query = normalize(rawQuery.trim());
    const terms = query.split(/\s+/).filter(Boolean);
    if (terms.length === 0 || query.length < 2) return [];
    const childNames = new Map(entries.filter(item => item.section === 'children').map(item => [item.row.id, String(item.row['name'] ?? '')]));
    const ranked: SearchResult[] = [];
    for (const item of entries) {
      const fields = Object.entries(item.row)
        .filter(([key, value]) => !['id','user_id','child_id','created_at','updated_at','storage_path','receipt_path'].includes(key) && ['string','number'].includes(typeof value))
        .map(([, value]) => String(value));
      const searchable = normalize(fields.join(' '));
      const termScores = terms.map(term => bestMatch(term, fields));
      if (termScores.some(score => score < 0.48)) continue;
      let score = termScores.reduce((sum, value) => sum + value, 0) / termScores.length;
      if (searchable.includes(query)) score += 0.2;
      const title = String(item.row['name'] ?? item.row['title'] ?? item.row['category'] ?? item.row['description'] ?? 'Voce del diario');
      const detailKeys = ['role','dosage','category','facility','phone','email','date','notes','trial_id','emergency_contact'];
      const pdfText = typeof item.row['extracted_text'] === 'string' ? item.row['extracted_text'] : '';
      const pdfExcerpt = pdfText.slice(0, 140);
      const detail = [childNames.get(String(item.row['child_id'] ?? '')), ...detailKeys.map(key => item.row[key]), ...(pdfExcerpt ? [`PDF: ${pdfExcerpt}${pdfText.length > 140 ? '…' : ''}`] : [])]
        .filter((value): value is string | number => typeof value === 'string' || typeof value === 'number')
        .map(String).filter(Boolean).join(' · ');
      ranked.push({ section: item.section, title, detail, path: item.row.id, childId: item.row['child_id'] ? String(item.row['child_id']) : undefined, score });
    }
    return ranked.sort((a, b) => b.score - a.score || a.title.localeCompare(b.title, 'it'));
  }
}

function normalize(value: string): string { return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('it').trim(); }

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
      previous[j] = Math.min(previous[j] + 1, previous[j - 1] + 1, diagonal + (a[i - 1] === b[j - 1] ? 0 : 1));
      diagonal = above;
    }
  }
  return previous[b.length];
}
