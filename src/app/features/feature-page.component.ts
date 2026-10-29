import { CommonModule } from '@angular/common';
import { Component, ElementRef, Input, OnDestroy, OnInit, computed, effect, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { Subscription } from 'rxjs';
import { DiaryDataService } from '../core/diary-data.service';
import { ConfirmationService } from '../core/confirmation.service';
import { UiStateService } from '../core/ui-state.service';
import { AuthService } from '../core/auth.service';
import { PdfExportService } from '../core/pdf-export.service';
import { DataExportService } from '../core/data-export.service';
import { SupabaseClientService } from '../core/supabase-client.service';
import { StorageService } from '../core/storage.service';
import { PdfRedactionComponent } from '../documents/pdf-redaction.component';
import { ImageToPdfComponent } from '../documents/image-to-pdf.component';
import { DocumentScannerComponent } from '../documents/document-scanner.component';
import { GlobalWorkerOptions, getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { AppDropdownComponent } from '../shared/app-dropdown.component';
import { AppDatepickerComponent } from '../shared/app-datepicker.component';
import { AppTimepickerComponent } from '../shared/app-timepicker.component';
import { AppAutocompleteComponent } from '../shared/app-autocomplete.component';
import { DocumentAssociationPickerComponent } from '../shared/document-association-picker.component';
import { HighlightPipe } from '../shared/highlight.pipe';
import { TooltipDirective } from '../shared/directives/tooltip.directive';
import {
  DiaryRow,
  FieldDefinition,
  MedicationSchedulePeriod,
  SectionDefinition,
  SectionId,
  sectionById,
} from '../models/diary.models';
import { medicineCabinetExpiry } from '../models/medicine-cabinet-expiry';

interface MedicationScheduleDraft {
  start_date: string;
  end_date: string;
  start_time: string;
  end_time: string;
  dosage: string;
  formulation: string;
  spray_count: string;
  administration_duration_seconds: string;
  schedule_times: string;
  planned_pause: string;
}

interface HistoricalMedicationDose {
  scheduledDate: string;
  scheduledTime: string;
  takenAt: string;
}

type MedicationScheduleScope = 'single' | 'preceding' | 'following' | 'all';

const MEDICATION_SCHEDULE_FIELDS = [
  'start_time',
  'end_time',
  'dosage',
  'formulation',
  'spray_count',
  'administration_duration_seconds',
  'schedule_times',
  'planned_pause',
] as const;

function normalizeSearch(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('it')
    .trim();
}

function fuzzyTermMatch(term: string, value: string): boolean {
  if (value.includes(term)) return true;
  const words = value.split(/[^\p{L}\p{N}]+/u).filter(Boolean);
  const maxDistance = term.length < 4 ? 0 : term.length < 7 ? 1 : 2;
  return words.some((word) => {
    if (word.startsWith(term)) return true;
    if (!maxDistance || Math.abs(word.length - term.length) > maxDistance) return false;
    return searchEditDistance(term, word) <= maxDistance;
  });
}

function searchEditDistance(left: string, right: string): number {
  let previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let i = 1; i <= left.length; i++) {
    const current = [i];
    for (let j = 1; j <= right.length; j++) {
      current[j] = Math.min(
        current[j - 1] + 1,
        previous[j] + 1,
        previous[j - 1] + (left[i - 1] === right[j - 1] ? 0 : 1),
      );
    }
    previous = current;
  }
  return previous[right.length];
}

function medicationDateKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function normalizeMedicationTime(value: string): string | null {
  const [hour, minute] = value.split(':').map(Number);
  if (!Number.isInteger(hour) || !Number.isInteger(minute) || hour < 0 || hour > 23 || minute < 0 || minute > 59) return null;
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

function addMedicationDays(value: string, days: number): string {
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  date.setDate(date.getDate() + days);
  return medicationDateKey(date);
}

function validMedicationDate(value: string | null): value is string {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

function parseMedicationScheduleTimes(value: string): Array<{ start: string; end?: string }> {
  const entries = value.split(',').map((entry) => entry.trim());
  if (!value.trim() || entries.some((entry) => !entry)) return [];
  const slots = entries.flatMap((entry) => {
    const match = entry.trim().match(/^(\d{1,2}:\d{2})(?:\s*[-–]\s*(\d{1,2}:\d{2}))?$/);
    if (!match) return [];
    const start = normalizeMedicationTime(match[1]);
    const end = match[2] ? normalizeMedicationTime(match[2]) : null;
    if (!start || (match[2] && (!end || end < start))) return [];
    return [{ start, ...(end ? { end } : {}) }];
  });
  return slots.length === entries.length ? slots : [];
}

function timeToMinutes(value: string): number {
  const [hour, minute] = value.split(':').map(Number);
  return hour * 60 + minute;
}

function summarizeMedicationSchedule(period: MedicationScheduleDraft): { days: number; doses: number | null } | null {
  const start = period.start_date.trim();
  const end = period.end_date.trim();
  if (!validMedicationDate(start) || !validMedicationDate(end) || end < start) return null;

  const [startYear, startMonth, startDay] = start.split('-').map(Number);
  const [endYear, endMonth, endDay] = end.split('-').map(Number);
  const startDayNumber = Date.UTC(startYear, startMonth - 1, startDay) / 86_400_000;
  const endDayNumber = Date.UTC(endYear, endMonth - 1, endDay) / 86_400_000;
  const calendarDays = endDayNumber - startDayNumber + 1;
  const startTime = period.start_time ? normalizeMedicationTime(period.start_time) : null;
  const endTime = period.end_time ? normalizeMedicationTime(period.end_time) : null;
  if ((period.start_time && !startTime) || (period.end_time && !endTime)) return null;
  if (calendarDays === 1 && startTime && endTime && endTime < startTime) return null;
  const startAt = startDayNumber * 86_400_000 + (startTime ? timeToMinutes(startTime) * 60_000 : 0);
  const endAt = endDayNumber * 86_400_000 + (endTime ? timeToMinutes(endTime) * 60_000 : 86_400_000 - 1);
  const days = Math.ceil((endAt - startAt + 1) / 86_400_000);
  const slots = parseMedicationScheduleTimes(period.schedule_times);
  if (!slots.length) return { days, doses: null };

  if (calendarDays === 1) {
    const doses = slots.filter((slot) => (!startTime || slot.start >= startTime) && (!endTime || slot.start <= endTime)).length;
    return { days, doses };
  }
  const firstDaySlots = startTime ? slots.filter((slot) => slot.start >= startTime) : slots;
  const lastDaySlots = endTime ? slots.filter((slot) => slot.start <= endTime) : slots;
  return { days, doses: firstDaySlots.length + (calendarDays - 2) * slots.length + lastDaySlots.length };
}

function sameMedicationSchedule(
  left: MedicationSchedulePeriod,
  right: MedicationSchedulePeriod,
): boolean {
  return MEDICATION_SCHEDULE_FIELDS.every((key) => left[key] === right[key]);
}

function sameMedicationPeriods(
  left: MedicationSchedulePeriod[],
  right: MedicationSchedulePeriod[],
): boolean {
  return left.length === right.length && left.every((period, index) => {
    const other = right[index];
    return sameMedicationSchedule(period, other) &&
      period.start_date?.slice(0, 10) === other.start_date?.slice(0, 10) &&
      period.end_date?.slice(0, 10) === other.end_date?.slice(0, 10);
  });
}

function applyMedicationScheduleScope(
  existing: MedicationSchedulePeriod[],
  proposed: MedicationSchedulePeriod[],
  scope: MedicationScheduleScope,
  anchorDate: string,
): MedicationSchedulePeriod[] {
  if (scope === 'all') return proposed;

  const boundaries = new Set<string>([anchorDate, addMedicationDays(anchorDate, 1)]);
  for (const period of [...existing, ...proposed]) {
    const start = period.start_date?.slice(0, 10) ?? null;
    const end = period.end_date?.slice(0, 10) ?? null;
    if (validMedicationDate(start)) boundaries.add(start);
    if (validMedicationDate(end)) boundaries.add(addMedicationDays(end, 1));
  }
  const sortedBoundaries = [...boundaries].sort();
  const output: MedicationSchedulePeriod[] = [];

  for (let index = 0; index <= sortedBoundaries.length; index++) {
    const start = index === 0 ? null : sortedBoundaries[index - 1];
    const endExclusive = index === sortedBoundaries.length ? null : sortedBoundaries[index];
    const sampleDate = start ?? addMedicationDays(endExclusive!, -1);
    const useProposed = scope === 'single'
      ? sampleDate === anchorDate
      : scope === 'preceding'
        ? sampleDate <= anchorDate
        : sampleDate >= anchorDate;
    const source = useProposed ? proposed : existing;
    const period = source.find((candidate) => {
      const periodStart = candidate.start_date?.slice(0, 10) ?? null;
      const periodEnd = candidate.end_date?.slice(0, 10) ?? null;
      return (!validMedicationDate(periodStart) || periodStart <= sampleDate) &&
        (!validMedicationDate(periodEnd) || periodEnd >= sampleDate);
    });
    if (!period) continue;

    const periodStart = period.start_date?.slice(0, 10) ?? null;
    const periodEnd = period.end_date?.slice(0, 10) ?? null;
    const clippedStart = validMedicationDate(periodStart) && (!start || periodStart > start)
      ? periodStart
      : start;
    const periodEndExclusive = validMedicationDate(periodEnd) ? addMedicationDays(periodEnd, 1) : null;
    const clippedEndExclusive = endExclusive && periodEndExclusive
      ? (endExclusive < periodEndExclusive ? endExclusive : periodEndExclusive)
      : endExclusive ?? periodEndExclusive;
    const clipped: MedicationSchedulePeriod = {
      ...period,
      start_date: clippedStart,
      end_date: clippedEndExclusive ? addMedicationDays(clippedEndExclusive, -1) : null,
      start_time: validMedicationDate(periodStart) && clippedStart === periodStart
        ? period.start_time ?? null
        : null,
      end_time: validMedicationDate(periodEnd) && clippedEndExclusive &&
        addMedicationDays(clippedEndExclusive, -1) === periodEnd
        ? period.end_time ?? null
        : null,
    };
    const previous = output.at(-1);
    if (
      previous &&
      sameMedicationSchedule(previous, clipped) &&
      previous.end_date && clipped.start_date &&
      addMedicationDays(previous.end_date, 1) === clipped.start_date
    ) {
      previous.end_date = clipped.end_date;
    } else output.push(clipped);
  }

  return output;
}

@Component({
  selector: 'tc-feature-page',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    RouterLink,
    AppDropdownComponent,
    AppDatepickerComponent,
    AppTimepickerComponent,
    AppAutocompleteComponent,
    DocumentAssociationPickerComponent,
    HighlightPipe,
    TooltipDirective,
    PdfRedactionComponent,
    ImageToPdfComponent,
    DocumentScannerComponent,
  ],
  template: `
    @if (section) {
      <section class="space-y-5">
        <header class="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p class="eyebrow">IL TUO DIARIO · {{ section.label | uppercase }}</p>
            <h1 class="page-title">{{ section.title }}</h1>
            <p class="mt-2 max-w-2xl text-sm text-slate-500 dark:text-slate-400">
              {{ section.description }}
            </p>
          </div>
          <div class="flex gap-2">
            <button type="button" class="button-secondary" (click)="refresh()">Aggiorna</button>
            @if (section.id !== 'reports') {
              <button
                type="button"
                class="button-primary"
                [disabled]="section.id !== 'children' && !children.length"
                (click)="openForm()"
              >
                <span aria-hidden="true">＋</span> Aggiungi
              </button>
            }
          </div>
        </header>
        @if (section.id === 'expenses') {
          <div class="grid grid-cols-2 gap-3 lg:grid-cols-3">
            <div class="stat-card">
              <span>Totale registrato</span
              ><strong>{{ total | currency: 'EUR' : 'symbol' : '1.2-2' : 'it' }}</strong>
            </div>
            <div class="stat-card">
              <span>Chilometri</span><strong>{{ kilometers }} km</strong>
            </div>
            <div class="stat-card col-span-2 lg:col-span-1">
              <span>Quota chilometrica stimata</span
              ><strong>{{ kmRefund | currency: 'EUR' : 'symbol' : '1.2-2' : 'it' }}</strong>
            </div>
          </div>
        }
        @if (section.id === 'reports') {
          <div class="panel space-y-4">
            <div class="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 class="font-semibold">Report per il team clinico</h2>
                <p class="mt-1 text-sm text-slate-500">
                  Prepara un riepilogo cronologico del periodo da discutere durante la visita.
                </p>
              </div>
              <div class="flex flex-wrap gap-2">
                @if (reportPreviewOpen()) {
                  <button type="button" class="button-secondary" (click)="closeReportPreview()">Modifica filtri</button>
                  <button type="button" class="button-primary" [disabled]="!selectedChildId() || invalidReportPeriod" (click)="exportVisitSummary()">
                    Genera PDF
                  </button>
                } @else {
                  <button type="button" class="button-primary" [disabled]="!selectedChildId() || invalidReportPeriod" (click)="openReportPreview()">
                    Visualizza riepilogo
                  </button>
                }
              </div>
            </div>
            <div class="border-t border-slate-100 pt-4 dark:border-slate-800">
              <h3 class="font-semibold">Backup completo dei dati</h3>
              <p class="mt-1 text-sm text-slate-500">
                Scarica tutte le categorie del diario, inclusi i profili dei bambini. Conserva il
                file in un luogo sicuro.
              </p>
              <div class="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  class="button-secondary"
                  [disabled]="exporting()"
                  (click)="exportData('json')"
                >
                  JSON</button
                ><button
                  type="button"
                  class="button-secondary"
                  [disabled]="exporting()"
                  (click)="exportData('markdown')"
                >
                  Markdown</button
                ><button
                  type="button"
                  class="button-secondary"
                  [disabled]="exporting()"
                  (click)="exportData('doc')"
                >
                  Word (.doc)
                </button>
              </div>
              <p class="mt-2 text-xs text-slate-500">
                Gli allegati archiviati sono riportati con il loro percorso; i file stessi non sono
                inclusi.
              </p>
            </div>
          </div>
        }
        @if (section.id === 'reports') {
          @if (invalidReportPeriod) {
            <p class="notice-error" role="alert">La data iniziale deve precedere la data finale.</p>
          }
          <div class="panel grid gap-3 sm:grid-cols-3">
            <label class="form-field"
              ><span>Dal</span
              ><app-datepicker
                label="Data iniziale"
                [value]="reportFrom()"
                (dateChange)="reportFrom.set($event)" /></label
            ><label class="form-field"
              ><span>Al</span
              ><app-datepicker
                label="Data finale"
                [value]="reportTo()"
                (dateChange)="reportTo.set($event)" /></label
            ><label class="form-field"
              ><span>Categoria</span
              ><app-dropdown
                [options]="reportCategories"
                [value]="reportCategory()"
                placeholder="Tutte le categorie"
                (selection)="reportCategory.set($event)"
            /></label>
          </div>
        }
        @if (section.id !== 'children' && children.length) {
          <div
            class="flex items-center gap-3 rounded-2xl bg-white px-4 py-3 shadow-sm dark:bg-slate-900"
          >
            <span class="text-xs font-semibold uppercase tracking-wide text-slate-400">Bambino</span
            ><app-dropdown
              class="w-full max-w-xs"
              [options]="childNames"
              [value]="selectedChildName()"
              placeholder="Scegli profilo"
              (selection)="selectChild($event)"
            />
          </div>
        }
        @if (section.id !== 'children' && !children.length) {
          <div
            class="notice-error !border-amber-200 !bg-amber-50 !text-amber-900 dark:!border-amber-800 dark:!bg-amber-950/40 dark:!text-amber-100"
          >
            Crea prima un profilo bambino per collegare in modo sicuro le registrazioni.
            <a routerLink="/children" class="font-bold underline">Vai ai profili</a>
          </div>
        }
        @if (data.error()) {
          <div class="notice-error" role="alert">{{ data.error() }}</div>
        }
        @if (supportsFuzzySearch && data.rows().length) {
          <label class="form-field max-w-xl">
            <span>Cerca in {{ section.label.toLocaleLowerCase('it') }}</span>
            <input
              class="field-control"
              type="search"
              maxlength="120"
              autocomplete="off"
              placeholder="Nome, descrizione, note…"
              [ngModel]="searchQuery()"
              (ngModelChange)="searchQuery.set($event)"
              [attr.aria-label]="'Cerca in ' + section.label"
            />
          </label>
        }
        @if (data.syncing()) {
          <div class="grid gap-3 md:grid-cols-2" aria-label="Caricamento voci" aria-busy="true">
            @for (placeholder of [1, 2, 3, 4]; track placeholder) {
              <div class="panel animate-pulse space-y-4 motion-reduce:animate-none">
                <div class="flex items-start justify-between gap-4">
                  <div class="w-full space-y-3">
                    <div class="h-3 w-1/4 rounded bg-slate-200 dark:bg-slate-700"></div>
                    <div class="h-5 w-2/3 rounded bg-slate-200 dark:bg-slate-700"></div>
                  </div>
                  <div class="h-6 w-16 rounded-full bg-slate-100 dark:bg-slate-800"></div>
                </div>
                <div class="h-3 w-full rounded bg-slate-100 dark:bg-slate-800"></div>
                <div class="h-3 w-3/5 rounded bg-slate-100 dark:bg-slate-800"></div>
              </div>
            }
          </div>
        } @else if (!filteredRows.length && section.id !== 'reports' && searchQuery().trim()) {
          <div class="panel flex flex-col items-center px-6 py-10 text-center">
            <h2 class="text-lg font-semibold">Nessun risultato</h2>
            <p class="mt-2 text-sm text-slate-500">Prova un altro termine o correggi la ricerca.</p>
            <button type="button" class="button-secondary mt-4" (click)="searchQuery.set('')">Cancella ricerca</button>
          </div>
        } @else if (!filteredRows.length && section.id !== 'reports') {
          <div class="panel flex flex-col items-center px-6 py-14 text-center">
            <div
              class="mb-4 grid h-14 w-14 place-items-center rounded-2xl bg-teal-50 text-2xl text-teal-700 dark:bg-teal-900/30 dark:text-teal-200"
            >
              {{ section.id === 'children' ? '♡' : '＋' }}
            </div>
            <h2 class="text-lg font-semibold">Ancora nessuna voce</h2>
            <p class="mt-2 max-w-sm text-sm text-slate-500">
              {{
                section.id === 'children'
                  ? 'Crea un profilo per iniziare a organizzare il diario.'
                  : 'Aggiungi la prima voce: potrai aggiornarla e condividerla durante la visita.'
              }}
            </p>
            <button class="button-primary mt-5" (click)="openForm()">
              {{ section.id === 'children' ? 'Aggiungi un bambino' : 'Aggiungi una voce' }}
            </button>
          </div>
        } @else if (section.id === 'reports' && reportPreviewOpen()) {
          <article id="visit-report-preview" class="panel mx-auto max-w-4xl space-y-6" aria-labelledby="visit-report-preview-title">
            <header class="space-y-3 border-b border-slate-100 pb-5 dark:border-slate-800">
              <p class="eyebrow">REPORT PER IL TEAM CLINICO</p>
              <h2 id="visit-report-preview-title" class="text-2xl font-semibold">Riepilogo per la visita</h2>
              <dl class="grid gap-3 rounded-2xl bg-slate-50 p-4 text-sm dark:bg-slate-800/60 sm:grid-cols-2">
                <div><dt class="text-slate-500 dark:text-slate-400">Profilo</dt><dd class="mt-1 font-semibold">{{ visitSummaryDocument().profile }}</dd></div>
                <div><dt class="text-slate-500 dark:text-slate-400">Periodo</dt><dd class="mt-1 font-semibold">{{ visitSummaryDocument().period }}</dd></div>
                <div class="sm:col-span-2"><dt class="text-slate-500 dark:text-slate-400">Voci incluse</dt><dd class="mt-1 font-semibold">{{ visitSummaryDocument().entryCount }}</dd></div>
              </dl>
              <p class="text-sm text-slate-600 dark:text-slate-300">
                Promemoria da discutere con il team clinico. Le informazioni sono state registrate dalla famiglia.
              </p>
            </header>

            @if (visitSummaryDocument().groups.length) {
              <div class="flex gap-2 overflow-x-auto pb-2" role="tablist" aria-label="Categorie del riepilogo">
                @for (group of visitSummaryDocument().groups; track group.key) {
                  <button
                    type="button"
                    role="tab"
                    class="inline-flex shrink-0 items-center whitespace-nowrap rounded-xl border px-3 py-2 text-sm font-semibold transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-600"
                    [class.border-teal-700]="activeVisitSummaryGroup().key === group.key"
                    [class.bg-teal-700]="activeVisitSummaryGroup().key === group.key"
                    [class.text-white]="activeVisitSummaryGroup().key === group.key"
                    [class.border-slate-200]="activeVisitSummaryGroup().key !== group.key"
                    [class.bg-white]="activeVisitSummaryGroup().key !== group.key"
                    [class.text-slate-700]="activeVisitSummaryGroup().key !== group.key"
                    [class.dark:border-slate-700]="activeVisitSummaryGroup().key !== group.key"
                    [class.dark:bg-slate-900]="activeVisitSummaryGroup().key !== group.key"
                    [class.dark:text-slate-200]="activeVisitSummaryGroup().key !== group.key"
                    [attr.id]="'visit-report-tab-' + group.key"
                    [attr.aria-controls]="'visit-report-panel-' + group.key"
                    [attr.aria-selected]="activeVisitSummaryGroup().key === group.key"
                    [attr.tabindex]="activeVisitSummaryGroup().key === group.key ? 0 : -1"
                    [attr.data-report-tab]="group.key"
                    [attr.aria-label]="group.label + ', ' + group.entries.length + ' voci'"
                    (click)="reportCategoryTab.set(group.key)"
                    (keydown)="onReportTabKeydown($event, group.key)"
                  >
                    {{ group.label }}
                    <span class="ml-2 rounded-full px-1.5 text-xs" [class.bg-white/20]="activeVisitSummaryGroup().key === group.key" [class.bg-slate-100]="activeVisitSummaryGroup().key !== group.key" [class.dark:bg-slate-800]="activeVisitSummaryGroup().key !== group.key">{{ group.entries.length }}</span>
                  </button>
                }
              </div>
              @if (activeVisitSummaryGroup(); as group) {
                <section
                  class="space-y-3"
                  role="tabpanel"
                  tabindex="0"
                  [attr.id]="'visit-report-panel-' + group.key"
                  [attr.aria-labelledby]="'visit-report-tab-' + group.key"
                >
                  <h3 class="flex items-center justify-between border-b border-slate-100 pb-2 font-semibold dark:border-slate-800">
                    <span>{{ group.label }}</span>
                    <span class="rounded-full bg-teal-50 px-2.5 py-1 text-xs text-teal-800 dark:bg-teal-900/40 dark:text-teal-200">{{ group.entries.length }}</span>
                  </h3>
                  @if (group.key === 'medication_doses') {
                    <div class="grid gap-3 lg:grid-cols-2">
                      @for (medication of group.medicationGroups; track medication.id) {
                        <article class="rounded-2xl border border-slate-200 p-3 dark:border-slate-700">
                          <header class="flex flex-wrap items-start justify-between gap-2">
                            <div>
                              <p class="text-xs font-semibold uppercase tracking-wide text-teal-700 dark:text-teal-300">Farmaco</p>
                              <h4 class="mt-1 font-semibold">{{ medication.name }}</h4>
                            </div>
                            <span class="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700 dark:bg-slate-800 dark:text-slate-200">
                              {{ medication.entries.length }} dosi
                            </span>
                          </header>

                          <section class="mt-3 border-t border-slate-100 pt-3 dark:border-slate-800" [attr.aria-label]="'Periodi terapeutici di ' + medication.name">
                            <h5 class="text-sm font-semibold">Periodi della terapia</h5>
                            @if (medication.periods.length) {
                              <ol class="mt-2 space-y-2">
                                @for (period of medication.periods; track period.id) {
                                  <li class="rounded-xl bg-teal-50/70 p-3 text-sm dark:bg-teal-950/30">
                                    <div class="flex flex-wrap items-start justify-between gap-2">
                                      <p class="font-semibold text-teal-950 dark:text-teal-100">{{ period.heading }}</p>
                                      <span class="rounded-full bg-teal-100 px-2 py-0.5 text-[11px] font-semibold text-teal-900 dark:bg-teal-900/60 dark:text-teal-100">{{ period.entries.length }} dosi</span>
                                    </div>
                                    <p class="mt-1 text-slate-700 dark:text-slate-200">{{ period.regimen }}</p>
                                    @if (period.pause) { <p class="mt-1 text-xs text-slate-600 dark:text-slate-300">{{ period.pause }}</p> }
                                    @if (period.recentEntries.length) {
                                      <ol class="mt-2 space-y-1 border-t border-teal-200/70 pt-2 dark:border-teal-900/70">
                                        @for (entry of period.recentEntries; track entry.id) {
                                          <li class="flex flex-wrap items-baseline gap-x-3 gap-y-1 text-xs">
                                            <time class="font-semibold">{{ entry.date || 'Data non specificata' }}</time>
                                            @for (detail of entry.details; track detail.label) {
                                              <span><b class="font-medium text-slate-600 dark:text-slate-300">{{ detail.label }}:</b> {{ detail.value }}</span>
                                            }
                                          </li>
                                        }
                                      </ol>
                                    } @else {
                                      <p class="mt-2 border-t border-teal-200/70 pt-2 text-xs text-slate-600 dark:border-teal-900/70 dark:text-slate-300">Nessuna somministrazione nel periodo selezionato.</p>
                                    }
                                    @if (period.additionalEntries.length) {
                                      <details class="mt-2 border-t border-teal-200/70 pt-2 dark:border-teal-900/70">
                                        <summary class="cursor-pointer text-xs font-semibold text-teal-900 dark:text-teal-100">Mostra altre {{ period.additionalEntries.length }} somministrazioni</summary>
                                        <ol class="mt-2 space-y-1">
                                          @for (entry of period.additionalEntries; track entry.id) {
                                            <li class="flex flex-wrap items-baseline gap-x-3 gap-y-1 text-xs">
                                              <time class="font-semibold">{{ entry.date || 'Data non specificata' }}</time>
                                              @for (detail of entry.details; track detail.label) {
                                                <span><b class="font-medium text-slate-600 dark:text-slate-300">{{ detail.label }}:</b> {{ detail.value }}</span>
                                              }
                                            </li>
                                          }
                                        </ol>
                                      </details>
                                    }
                                  </li>
                                }
                              </ol>
                            } @else {
                              <p class="mt-1 text-sm text-slate-500 dark:text-slate-400">Periodi terapeutici non disponibili.</p>
                            }
                          </section>

                          @if (medication.unassignedEntries.length) {
                            <details class="mt-3 border-t border-slate-100 pt-3 dark:border-slate-800">
                              <summary class="cursor-pointer text-xs font-semibold text-slate-600 dark:text-slate-300">Somministrazioni senza periodo associato ({{ medication.unassignedEntries.length }})</summary>
                              <ol class="mt-2 space-y-1.5">
                                @for (entry of medication.unassignedEntries; track entry.id) {
                                  <li class="flex flex-wrap items-baseline gap-x-3 gap-y-1 rounded-lg bg-slate-50 px-3 py-2 text-xs dark:bg-slate-800/60">
                                    <time class="font-semibold">{{ entry.date || 'Data non specificata' }}</time>
                                    @for (detail of entry.details; track detail.label) {
                                      <span><b class="font-medium text-slate-500 dark:text-slate-400">{{ detail.label }}:</b> {{ detail.value }}</span>
                                    }
                                  </li>
                                }
                              </ol>
                            </details>
                          }
                        </article>
                      }
                    </div>
                  } @else {
                    <div class="grid gap-3 md:grid-cols-2">
                      @for (entry of group.entries; track entry.id) {
                        <article class="rounded-2xl border border-slate-200 p-3 dark:border-slate-700">
                          <div class="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                            <p class="text-xs font-medium text-slate-500 dark:text-slate-400">{{ entry.date || 'Data non specificata' }}</p>
                            <h4 class="font-semibold">{{ entry.title }}</h4>
                          </div>
                          @if (entry.schedulePeriods.length) {
                            <div class="mt-3 grid gap-2 sm:grid-cols-2">
                              @for (period of entry.schedulePeriods; track period.id) {
                                <div class="rounded-xl bg-slate-50 p-2.5 text-sm dark:bg-slate-800/60">
                                  <h5 class="font-semibold">{{ period.heading }}</h5>
                                  <p class="mt-1 text-slate-600 dark:text-slate-300">{{ period.regimen }}</p>
                                  @if (period.pause) { <p class="mt-1 text-xs text-slate-600 dark:text-slate-300">{{ period.pause }}</p> }
                                </div>
                              }
                            </div>
                          }
                          @if (entry.details.length) {
                            <dl class="mt-3 grid gap-x-3 gap-y-1.5 border-t border-slate-100 pt-2.5 text-sm dark:border-slate-700">
                              @for (detail of entry.details; track detail.label) {
                                <div class="grid grid-cols-[minmax(5.5rem,auto)_minmax(0,1fr)] gap-x-3"><dt class="text-xs font-medium text-slate-500 dark:text-slate-400">{{ detail.label }}</dt><dd class="whitespace-pre-wrap">{{ detail.value }}</dd></div>
                              }
                            </dl>
                          }
                        </article>
                      }
                    </div>
                  }
                </section>
              }
            } @else {
              <p class="rounded-2xl bg-slate-50 p-5 text-center text-sm text-slate-600 dark:bg-slate-800/60 dark:text-slate-300">
                Nessuna voce registrata nel periodo selezionato.
              </p>
            }

            <section class="space-y-3 border-t border-slate-100 pt-5 dark:border-slate-800" aria-labelledby="visit-report-questions">
              <h3 id="visit-report-questions" class="font-semibold">Domande e punti da discutere</h3>
              <div class="space-y-5" aria-label="Spazio per annotazioni">
                <div class="border-b border-slate-300 dark:border-slate-600"></div>
                <div class="border-b border-slate-300 dark:border-slate-600"></div>
                <div class="border-b border-slate-300 dark:border-slate-600"></div>
              </div>
            </section>
          </article>
        } @else {
          <div class="grid gap-3 md:grid-cols-2">
            @for (row of filteredRows; track row['id']) {
              <article
                class="panel group cursor-pointer transition hover:border-teal-300 focus-visible:outline focus-visible:outline-2 focus-visible:outline-teal-600"
                role="button"
                tabindex="0"
                [attr.aria-label]="'Apri ' + (value(row, 'title') || value(row, 'name') || 'voce')"
                (click)="openDetailsFromCard($event, row)"
                (keydown)="openDetailsFromKeyboard($event, row)"
                [id]="'diary-row-' + row['id']"
                [class.search-result-highlight]="highlightedId() === row['id']"
                [attr.tabindex]="highlightedId() === row['id'] ? -1 : null"
              >
                <div class="flex items-start justify-between gap-4">
                  <div class="flex min-w-0 items-start gap-3">
                    @if (section.id === 'contacts') {
                      <div class="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-full bg-teal-100 text-sm font-semibold text-teal-800 dark:bg-teal-900/50 dark:text-teal-200" aria-hidden="true">
                        @if (contactAvatarUrls()[row.id]) {
                          <img class="h-full w-full object-cover" [src]="contactAvatarUrls()[row.id]" alt="" />
                        } @else {
                          {{ contactAvatarInitials(value(row, 'name')) }}
                        }
                      </div>
                    }
                    <div class="min-w-0">
                    <p
                      class="text-xs font-semibold uppercase tracking-wide text-teal-700 dark:text-teal-300"
                    >
                      @if (section.id === 'contacts') {
                        <span class="inline-flex rounded-full bg-teal-50 px-2.5 py-1 text-[11px] font-semibold normal-case tracking-normal text-teal-800 dark:bg-teal-900/40 dark:text-teal-200">
                          {{ value(row, 'category') }}
                        </span>
                      } @else {
                        {{ value(row, 'date') || value(row, 'start_date') | date: 'd MMM y' }}
                      }
                    </p>
                    <h2 class="mt-1 truncate text-base font-semibold">
                      {{
                        value(row, 'title') ||
                          value(row, 'name') ||
                          value(row, 'category') ||
                          'Voce del diario'
                      }}
                    </h2>
                    @if (section.id === 'contacts' && value(row, 'role')) {
                      <p class="mt-2 text-sm text-slate-600 dark:text-slate-300">
                        <span class="mr-1 text-xs font-medium text-slate-400">Professione o ruolo:</span>
                        {{ value(row, 'role') }}
                      </p>
                    }
                    </div>
                  </div>
                  <div class="flex gap-3">
                    <button
                      type="button"
                      class="record-action text-teal-700 dark:text-teal-300"
                      [attr.aria-label]="
                        'Modifica ' + (value(row, 'title') || value(row, 'name') || 'voce')
                      "
                      appTooltip="Modifica"
                      (click)="$event.stopPropagation(); edit(row)"
                    >
                      <svg class="action-icon" viewBox="0 0 24 24" aria-hidden="true">
                        <path d="M12 20h9" />
                        <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L8 18l-4 1 1-4Z" /></svg
                      ><span class="action-label">Modifica</span></button
                    ><button
                      type="button"
                      class="record-action text-slate-500 hover:text-rose-600 dark:text-slate-300"
                      [attr.aria-label]="
                        'Elimina ' + (value(row, 'title') || value(row, 'name') || 'voce')
                      "
                      appTooltip="Elimina"
                      (click)="$event.stopPropagation(); remove(row)"
                    >
                      <svg class="action-icon" viewBox="0 0 24 24" aria-hidden="true">
                        <path d="M3 6h18" />
                        <path d="M8 6V4h8v2" />
                        <path d="m19 6-1 14H6L5 6" />
                        <path d="M10 11v5M14 11v5" /></svg
                      ><span class="action-label">Elimina</span>
                    </button>
                  </div>
                </div>
                <div class="mt-3 flex flex-wrap gap-2">
                  @for (field of visibleCardFields(row); track field.key) {
                    @if (value(row, field.key)) {
                      <span class="tag"
                        ><b>{{ field.label }}:</b>
                        @if (section.id === 'contacts' && field.key === 'phone') {
                          <a class="underline" [href]="'tel:' + value(row, field.key)" (click)="$event.stopPropagation()">{{
                            value(row, field.key)
                          }}</a>
                        } @else if (section.id === 'contacts' && field.key === 'email') {
                          <a class="underline" [href]="'mailto:' + value(row, field.key)" (click)="$event.stopPropagation()">{{
                            value(row, field.key)
                          }}</a>
                        } @else if (section.id === 'contacts' && field.key === 'website' && websiteHref(value(row, field.key))) {
                          <a class="underline" [href]="websiteHref(value(row, field.key))" target="_blank" rel="noopener noreferrer" (click)="$event.stopPropagation()">{{
                            value(row, field.key)
                          }}</a>
                        } @else {
                          {{ value(row, field.key) }}
                        }
                      </span>
                    }
                  }
                </div>
                @if (section.id === 'documents' && searchQuery().trim()) {
                  @let ocrPreview = documentOcrPreview(row);
                  @if (ocrPreview) {
                    <div class="mt-3 rounded-xl border border-teal-100 bg-teal-50/70 p-3 dark:border-teal-900/60 dark:bg-teal-950/20">
                      <p class="text-xs font-semibold text-teal-800 dark:text-teal-200">Contesto OCR</p>
                      <p class="mt-1 line-clamp-3 whitespace-pre-wrap break-words text-sm text-slate-700 dark:text-slate-200" [innerHTML]="ocrPreview | highlight: searchQuery()"></p>
                    </div>
                  }
                }
                @if (section.id === 'medicine_cabinet') {
                  @let expiry = medicineCabinetExpiry(row);
                  <div class="mt-3 flex flex-wrap items-center gap-2 text-xs">
                    <span class="rounded-full px-2.5 py-1 font-semibold" [ngClass]="inventoryExpiryTone(row)">{{ inventoryExpiryLabel(row) }}</span>
                    @if (expiry.effectiveDate) {
                      <span class="text-slate-600 dark:text-slate-300">
                        {{ expiry.effectiveSource === 'after-opening' ? 'Da consumare entro' : 'Scadenza effettiva' }} · {{ expiry.effectiveDate | date: (expiry.monthOnly ? 'MM/yyyy' : 'd MMM y') }}
                      </span>
                    }
                  </div>
                }
                @if (section.id === 'medications' && medicationSchedulePeriods(row).length > 1) {
                  <p class="mt-2 text-xs font-medium text-teal-700 dark:text-teal-300">
                    {{ medicationSchedulePeriods(row).length }} periodi di terapia
                  </p>
                }
                @if (section.id === 'medications') {
                  @let summary = medicationQuickSummary(row);
                  <section class="mt-4 space-y-2 rounded-xl border border-teal-100 bg-teal-50/70 p-3 dark:border-teal-900 dark:bg-teal-950/30" aria-label="Riepilogo rapido della terapia">
                    <div class="flex flex-wrap items-center justify-between gap-2">
                      <h3 class="text-xs font-semibold uppercase tracking-wide text-teal-900 dark:text-teal-100">Riepilogo rapido</h3>
                      <span class="rounded-full bg-white px-2.5 py-1 text-[11px] font-semibold text-teal-800 dark:bg-slate-900 dark:text-teal-200">{{ summary.status }}</span>
                    </div>
                    @for (period of summary.periods; track $index; let index = $index) {
                      <div class="text-sm text-slate-700 dark:text-slate-200">
                        @if (summary.periods.length > 1) {
                          <p class="text-xs font-semibold text-slate-500 dark:text-slate-400">Regime {{ index + 1 }}</p>
                        }
                        <p><strong>{{ period.dosage || 'Dosaggio non indicato' }}</strong>@if (period.formulation) { <span> · {{ period.formulation }}</span> }</p>
                        <p class="mt-0.5 text-xs">Orari: {{ period.schedule_times || 'non indicati' }}</p>
                        @if (period.start_date || period.end_date) {
                          <p class="mt-0.5 text-xs">Periodo: {{ period.start_date ? (period.start_date | date: 'd MMM y') : 'inizio non indicato' }}@if (period.end_date) { – {{ period.end_date | date: 'd MMM y' }} }</p>
                        }
                        @if (period.spray_count != null || period.administration_duration_seconds != null) {
                          <p class="mt-0.5 text-xs">
                            @if (period.spray_count != null) { {{ period.spray_count }} puff o spruzzi }
                            @if (period.spray_count != null && period.administration_duration_seconds != null) { · }
                            @if (period.administration_duration_seconds != null) { {{ period.administration_duration_seconds }} secondi }
                          </p>
                        }
                        @if (period.planned_pause) {
                          <p class="mt-0.5 whitespace-pre-wrap text-xs">Pause previste: {{ period.planned_pause }}</p>
                        }
                      </div>
                    }
                  </section>
                }
                @if (value(row, 'voice_note_data')) {
                  <audio
                    controls
                    preload="none"
                    class="mt-3 h-10 w-full max-w-sm"
                    [src]="value(row, 'voice_note_data')"
                    aria-label="Nota vocale"
                  ></audio>
                }
                @if (value(row, 'voice_note_path')) {
                  <button
                    type="button"
                    class="mt-3 text-sm font-semibold text-teal-700 hover:underline dark:text-teal-300"
                    (click)="$event.stopPropagation(); openVoice(row)"
                  >
                    ▶ Ascolta nota vocale
                  </button>
                }
                @if (section.id === 'contacts') {
                  <div
                    class="mt-4 flex flex-wrap gap-2 border-t border-slate-100 pt-3 dark:border-slate-800"
                  >
                    @if (value(row, 'phone')) {
                      <a class="button-primary" [href]="'tel:' + value(row, 'phone')" (click)="$event.stopPropagation()">☎ Chiama</a>
                    }
                    @if (value(row, 'email')) {
                      <a class="button-secondary" [href]="'mailto:' + value(row, 'email')" (click)="$event.stopPropagation()"
                        >✉ Email</a
                      >
                    }
                    <button type="button" class="button-secondary" (click)="$event.stopPropagation(); shareContact(row)">
                      ↗ Condividi
                    </button>
                  </div>
                  @if (shareNoticeId() === row.id) {
                    <p class="mt-2 text-xs text-teal-700 dark:text-teal-300" role="status">
                      {{ shareNotice() }}
                    </p>
                  }
                }
                @if (
                  (section.id === 'documents' && value(row, 'storage_path')) ||
                  (section.id === 'documents' && value(row, 'local_file_id')) ||
                  (section.id === 'expenses' && value(row, 'receipt_path'))
                ) {
                  <button
                    type="button"
                    class="record-action mt-3 text-sm font-semibold text-teal-700 dark:text-teal-300"
                    aria-label="Visualizza allegato"
                    appTooltip="Visualizza allegato"
                    (click)="$event.stopPropagation(); openDocument(row)"
                  >
                    <svg class="action-icon" viewBox="0 0 24 24" aria-hidden="true">
                      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z" />
                      <circle cx="12" cy="12" r="3" /></svg
                    ><span class="action-label">Visualizza allegato</span>
                  </button>
                }
              </article>
            }
          </div>
        }
        @if (section.id === 'children' && children.length) {
          <section class="panel space-y-4" aria-labelledby="measurements-title">
            <div class="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 id="measurements-title" class="text-lg font-semibold">Crescita e misure</h2>
                <p class="mt-1 text-sm text-slate-500">Registra le misure con la data; lo storico aiuta a seguirne l’andamento nel tempo.</p>
              </div>
              <label class="form-field min-w-48"><span>Profilo</span><app-dropdown [options]="childNames" [value]="selectedChildName()" placeholder="Scegli bambino" (selection)="selectChild($event)" /></label>
            </div>
            @if (selectedChildId()) {
              <form class="grid gap-3 sm:grid-cols-2 lg:grid-cols-5" (ngSubmit)="saveMeasurement()">
                <label class="form-field"><span>Data</span><app-datepicker label="Data misurazione" [value]="measurementForm['date']" (dateChange)="measurementForm['date'] = $event" /></label>
                <label class="form-field"><span>Peso (kg)</span><input class="field-control" type="number" min="0" max="300" step="0.01" [(ngModel)]="measurementForm['weight_kg']" name="weight_kg" /></label>
                <label class="form-field"><span>Altezza (cm)</span><input class="field-control" type="number" min="0" max="250" step="0.1" [(ngModel)]="measurementForm['height_cm']" name="height_cm" /></label>
                <label class="form-field"><span>Circonferenza testa (cm)</span><input class="field-control" type="number" min="0" max="100" step="0.1" [(ngModel)]="measurementForm['head_circumference_cm']" name="head_circumference_cm" /></label>
                <div class="flex items-end"><button class="button-primary w-full" type="submit" [disabled]="measurementSaving()">{{ measurementSaving() ? 'Salvataggio…' : 'Registra misure' }}</button></div>
              </form>
              @if (measurementError()) { <p class="notice-error" role="alert">{{ measurementError() }}</p> }
              @if (measurementLoading()) {
                <div class="space-y-3" aria-label="Caricamento misurazioni" aria-busy="true">
                  @for (placeholder of [1, 2, 3]; track placeholder) {
                    <div class="h-5 animate-pulse rounded bg-slate-100 dark:bg-slate-800 motion-reduce:animate-none"></div>
                  }
                </div>
              } @else if (measurementRows().length) {
                <div class="grid gap-4 lg:grid-cols-2">
                  @for (metric of measurementMetrics; track metric.key) {
                    @if (hasMeasurement(metric.key)) {
                      <div class="rounded-xl border border-slate-100 p-4 dark:border-slate-800">
                        <h3 class="font-semibold">{{ metric.label }}</h3>
                        <p class="text-xs text-slate-500">{{ measurementTrend(metric.key) }}</p>
                        <svg viewBox="0 0 320 90" class="mt-3 h-24 w-full" role="img" [attr.aria-label]="'Andamento ' + metric.label + ' nel tempo'">
                          <path d="M8 80H312" stroke="currentColor" class="text-slate-200 dark:text-slate-700" />
                          <polyline [attr.points]="measurementPoints(metric.key)" fill="none" stroke="#0f8b83" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" />
                        </svg>
                      </div>
                    }
                  }
                </div>
                <ol class="divide-y divide-slate-100 dark:divide-slate-800">
                  @for (measurement of measurementRows(); track measurement.id) {
                    <li class="flex flex-wrap gap-x-5 gap-y-1 py-2 text-sm"><time class="font-medium">{{ value(measurement, 'date') | date:'d MMM y' }}</time>@if (measurement['weight_kg'] != null) { <span>Peso: {{ measurement['weight_kg'] }} kg</span> }@if (measurement['height_cm'] != null) { <span>Altezza: {{ measurement['height_cm'] }} cm</span> }@if (measurement['head_circumference_cm'] != null) { <span>Testa: {{ measurement['head_circumference_cm'] }} cm</span> }</li>
                  }
                </ol>
              } @else { <p class="text-sm text-slate-500">Nessuna misurazione registrata.</p> }
            }
          </section>
        }
      </section>
      @if (isFormOpen()) {
        <div class="modal-backdrop" (click)="closeForm()">
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="dialog-title"
            class="modal-panel"
            [class.medication-modal]="section.id === 'medications'"
            [class.document-modal]="section.id === 'documents'"
            [class.document-scanner-modal]="section.id === 'documents' && documentScannerOpen()"
            [class.pdf-preview-modal]="section.id === 'documents' && isPdfAttachment()"
            (click)="$event.stopPropagation()"
          >
            <header
              class="flex items-start justify-between border-b border-slate-100 px-5 py-4 dark:border-slate-800"
            >
              <div>
                <p class="eyebrow">{{ section.id === 'documents' && documentScannerOpen() ? 'SCANSIONE DOCUMENTI' : 'NUOVA REGISTRAZIONE' }}</p>
                <h2 id="dialog-title" class="text-xl font-semibold">
                  {{
                    section.id === 'children'
                      ? 'Profilo bambino'
                      : section.id === 'contacts'
                        ? (isEditing() ? 'Modifica contatto' : 'Nuovo contatto')
                        : section.id === 'documents' && documentScannerOpen()
                          ? 'Scansiona documento'
                        : 'Aggiungi una voce'
                  }}
                </h2>
              </div>
              <button type="button" class="icon-button" aria-label="Chiudi" (click)="closeForm()">
                <svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18"/></svg>
              </button>
            </header>
            <form class="space-y-4 overflow-y-auto px-5 py-5" (ngSubmit)="save()">
              @if (data.error()) {
                <p class="notice-error" role="alert">{{ data.error() }}</p>
              }
              @if (section.id === 'documents' && documentScannerOpen()) {
                <div class="scanner-modal-body">
                  @defer {
                    <tc-document-scanner (completed)="setScannedDocument($event)" (dismiss)="documentScannerOpen.set(false)" />
                  } @placeholder {
                    <p class="text-sm text-slate-500" role="status">Preparazione scanner…</p>
                  }
                </div>
              } @else {
              @if (section.id === 'contacts') {
                <div class="grid gap-3 rounded-2xl border border-teal-100 bg-teal-50/70 p-3 text-xs leading-5 dark:border-teal-900/60 dark:bg-teal-950/20 sm:grid-cols-2 sm:p-4">
                  <p class="text-slate-600 dark:text-slate-300">
                    <strong class="block text-teal-900 dark:text-teal-200">Professione o ruolo</strong>
                    Cosa fa la persona: medico, chirurgo, terapista. Puoi anche inserire un ruolo personalizzato.
                  </p>
                  <p class="text-slate-600 dark:text-slate-300">
                    <strong class="block text-teal-900 dark:text-teal-200">Ambito del contatto</strong>
                    In quale gruppo ritrovarla: team clinico, centro trial, emergenze o altri ambiti.
                  </p>
                </div>
                <div class="flex items-center gap-4 rounded-2xl border border-slate-200 p-3 dark:border-slate-700 sm:col-span-2">
                  <div class="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-full bg-teal-100 text-lg font-semibold text-teal-800 dark:bg-teal-900/50 dark:text-teal-200" aria-hidden="true">
                    @if (contactAvatarPreviewSource()) {
                      <img class="h-full w-full object-cover" [src]="contactAvatarPreviewSource()!" alt="" />
                    } @else {
                      {{ contactAvatarInitials(form['name'] || '') }}
                    }
                  </div>
                  <div class="min-w-0 flex-1 space-y-2" (paste)="onContactAvatarPaste($event)">
                    <div class="flex flex-col gap-2 sm:flex-row sm:items-end">
                      <label class="form-field min-w-0 flex-1">
                        <span>Foto del dottore o del contatto</span>
                        <input class="field-control file:mr-3 file:rounded-lg file:border-0 file:bg-teal-50 file:px-3 file:py-2 file:font-medium file:text-teal-800" type="file" accept="image/jpeg,image/png,image/webp" (change)="selectContactAvatar($event)" />
                      </label>
                      <button type="button" class="button-secondary shrink-0" (click)="pasteContactAvatar()">Incolla immagine</button>
                    </div>
                    @if (contactAvatarPreviewSource()) {
                      <button class="text-xs font-semibold text-rose-700 underline dark:text-rose-300" type="button" (click)="clearContactAvatar()">Rimuovi foto</button>
                    }
                    <p class="text-xs text-slate-500 dark:text-slate-400">JPEG, PNG o WebP, massimo 2 MB. Puoi anche usare Ctrl+V o Cmd+V dopo aver copiato un’immagine. La foto resta privata e collegata al profilo del bambino.</p>
                  </div>
                </div>
              }
              @if (section.id === 'medications') {
                <div class="rounded-2xl border border-teal-100 bg-teal-50/70 p-3 text-xs leading-5 text-slate-600 dark:border-teal-900/60 dark:bg-teal-950/20 dark:text-slate-300 sm:p-4">
                  <strong class="block text-sm text-teal-900 dark:text-teal-200">Regime iniziale</strong>
                  <span>Inserisci qui il primo dosaggio. Potrai aggiungere variazioni con date e orari diversi mantenendo lo storico nella stessa terapia.</span>
                </div>
              }
              @if (section.id === 'medicine_cabinet') {
                <div class="rounded-2xl border border-teal-100 bg-teal-50/70 p-3 text-xs leading-5 text-slate-600 dark:border-teal-900/60 dark:bg-teal-950/20 dark:text-slate-300 sm:p-4">
                  <strong class="block text-sm text-teal-900 dark:text-teal-200">Scadenza dopo apertura</strong>
                  <span>Se il foglietto indica un numero di giorni dall’apertura, inserisci la durata e la data di apertura. Il promemoria considera la scadenza più vicina tra quella calcolata e quella riportata sulla confezione.</span>
                </div>
              }
              <div class="grid gap-4 sm:grid-cols-2">
                @for (field of formFields; track field.key) {
                  @if (
                    !(section.id === 'medications' &&
                      ['spray_count', 'administration_duration_seconds'].includes(field.key)) ||
                    ['spray', 'aerosol'].includes((form['formulation'] || '').toLocaleLowerCase())
                  ) {
                  <div
                    class="form-field"
                    [class.full-span]="field.kind === 'textarea' || field.kind === 'file'"
                    ><span
                      >{{ field.label }}
                      @if (field.required && !(field.kind === 'file' && isEditing())) {
                        <i class="text-rose-500"> *</i>
                      }
                    </span>
                    @switch (field.kind) {
                      @case ('text') {
                        @if (section.id === 'contacts' && field.key === 'role') {
                          <app-autocomplete
                            [options]="contactRoleSuggestions"
                            [value]="form[field.key] || ''"
                            [placeholder]="field.placeholder ?? 'Inserisci professione o ruolo'"
                            [maxLength]="120"
                            [maxOptions]="contactRoleSuggestions.length"
                            (valueChange)="setField(field, $event)"
                          />
                        } @else {
                          <input
                            class="field-control"
                            [type]="section.id === 'contacts' && field.key === 'website' ? 'url' : 'text'"
                            [name]="field.key"
                            [(ngModel)]="form[field.key]"
                            [required]="field.required ?? false"
                            [placeholder]="field.placeholder ?? ''"
                            [attr.autocomplete]="section.id === 'contacts' && field.key === 'website' ? 'url' : null"
                            (blur)="section.id === 'medications' && field.key === 'schedule_times' && normalizeScheduleTimesInput()"
                          />
                          @if (section.id === 'medications' && field.key === 'schedule_times') {
                            <small class="text-xs text-slate-500">
                              Inserisci un orario come 08:00 oppure una fascia come 08:00-10:00, separando le dosi con una virgola. Riporta le indicazioni concordate con il team clinico.
                            </small>
                          }
                        }
                      }
                      @case ('select') {
                        <app-dropdown
                          [options]="field.options ?? []"
                          [value]="form[field.key]"
                          [placeholder]="field.placeholder ?? 'Seleziona'"
                          (selection)="setField(field, $event)"
                        />
                      }
                      @case ('date') {
                        <app-datepicker
                          [label]="field.label"
                          [value]="form[field.key]"
                          [rangeStart]="section.id === 'medications' ? form['start_date'] : ''"
                          [rangeEnd]="section.id === 'medications' ? form['end_date'] : ''"
                          [lenient]="section.id === 'medicine_cabinet' && field.key === 'expiry_date'"
                          [monthOnly]="section.id === 'medicine_cabinet' && field.key === 'expiry_date' && form['expiry_precision'] === 'Mese e anno'"
                          (monthOnlyDetected)="form['expiry_precision'] = 'Mese e anno'"
                          (dateChange)="setField(field, $event)"
                        />
                      }
                      @case ('time') {
                        <app-timepicker
                          [label]="field.label"
                          [value]="form[field.key]"
                          (timeChange)="setField(field, $event)"
                        />
                      }
                      @case ('textarea') {
                        <textarea
                          class="field-control min-h-24 resize-y"
                          [name]="field.key"
                          [(ngModel)]="form[field.key]"
                          [required]="field.required ?? false"
                          rows="3"
                        ></textarea>
                      }
                      @case ('file') {
                        <input
                          class="field-control file:mr-3 file:rounded-lg file:border-0 file:bg-teal-50 file:px-3 file:py-2 file:font-medium file:text-teal-800"
                          type="file"
                          [required]="(field.required ?? false) && !isEditing()"
                          accept=".pdf,image/jpeg,image/png,image/webp,image/heic"
                          (change)="setFile(field, $event)"
                        /><small class="text-xs text-slate-400"
                          >I file vengono caricati nel bucket privato quando Supabase è configurato.
                          Il testo estratto o scritto a mano viene salvato con il documento per la
                          ricerca.</small
                        >
                        @if (section.id === 'documents') {
                          @if (!documentScannerOpen()) {
                            <button type="button" class="button-secondary mt-2 inline-flex items-center gap-2" (click)="documentScannerOpen.set(true)">
                              <svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 7h3l1.5-2h7L17 7h3v12H4z"/><circle cx="12" cy="13" r="3.5"/></svg>
                              Scansiona con la fotocamera
                            </button>
                          }
                        }
                        @if (section.id === 'documents' && isImageAttachment()) {
                          <tc-image-to-pdf [file]="attachedFile!" (converted)="setImagePdfFile($event)" />
                        }
                        @if (section.id === 'documents' && isEditing() && hasExistingPdf() && !isPdfAttachment()) {
                          <button type="button" class="button-secondary mt-2" [disabled]="loadingExistingPdf()" (click)="loadExistingPdf()">
                            {{ loadingExistingPdf() ? 'Apertura del PDF…' : 'Apri il PDF allegato per oscurarlo' }}
                          </button>
                        }
                        @if (section.id === 'documents' && isPdfAttachment()) {
                          <tc-pdf-redaction
                            [file]="attachedFile!"
                            [initialTerms]="selectedChildName()"
                            [initialExtractedText]="pdfTextSeed"
                            (redacted)="setRedactedFile($event)"
                            (textForSaving)="setPdfTextForSaving($event)"
                            (processingChange)="setPdfTextProcessing($event)"
                          />
                        }
                      }
                      @default {
                        <input
                          class="field-control"
                          [type]="field.kind === 'number' ? 'number' : 'text'"
                          [name]="field.key"
                          [(ngModel)]="form[field.key]"
                          [required]="field.required ?? false"
                          [placeholder]="field.placeholder ?? ''"
                          [step]="['spray_count', 'administration_duration_seconds', 'opened_expiry_days'].includes(field.key) ? 1 : field.kind === 'number' ? 'any' : null"
                          [min]="['spray_count', 'administration_duration_seconds', 'opened_expiry_days'].includes(field.key) ? 1 : null"
                        />
                      }
                    }
                  </div>
                  @if (section.id === 'medications' && field.key === 'end_date') {
                    <div class="sm:col-span-2 grid gap-3 sm:grid-cols-2">
                      <label class="form-field">
                        <span>Ora di avvio nel primo giorno (facoltativa)</span>
                        <app-timepicker
                          label="Ora di avvio del periodo 1"
                          [value]="form['start_time']"
                          (timeChange)="form['start_time'] = $event"
                        />
                      </label>
                      <label class="form-field">
                        <span>Ora di fine nell’ultimo giorno (facoltativa)</span>
                        <app-timepicker
                          label="Ora di fine del periodo 1"
                          [value]="form['end_time']"
                          (timeChange)="form['end_time'] = $event"
                        />
                      </label>
                      @if (medicationScheduleRangeMessage(0); as rangeMessage) {
                        <p class="text-xs font-medium text-rose-700 dark:text-rose-300 sm:col-span-2" role="alert">{{ rangeMessage }}</p>
                      }
                    </div>
                  }
                  @if (section.id === 'medications' && field.key === 'schedule_times') {
                    <div class="sm:col-span-2 space-y-3 rounded-xl border border-slate-200 p-3 dark:border-slate-700">
                      <div>
                        <h3 class="text-sm font-semibold">Imposta la durata prescritta</h3>
                        <p class="mt-1 text-xs text-slate-500 dark:text-slate-400">Calcolo la fine alla somministrazione che completa la durata indicata, partendo da data, orario iniziale e frequenza giornaliera.</p>
                      </div>
                      <div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]">
                        <label class="form-field">
                          <span>Durata</span>
                          <input
                            class="field-control"
                            type="number"
                            min="1"
                            max="10000"
                            step="1"
                            [ngModel]="medicationDurationValue()"
                            [ngModelOptions]="{ standalone: true }"
                            (ngModelChange)="medicationDurationValue.set($event)"
                          />
                        </label>
                        <label class="form-field">
                          <span>Unità</span>
                          <app-dropdown
                            [options]="medicationDurationUnits"
                            [value]="medicationDurationUnit()"
                            (selection)="medicationDurationUnit.set($event)"
                          />
                        </label>
                        <div class="flex items-end">
                          <button type="button" class="button-secondary w-full lg:w-auto" [disabled]="!canCalculateMedicationEnd" (click)="calculateMedicationEnd()">Calcola fine prevista</button>
                        </div>
                      </div>
                      <p class="text-xs text-slate-500 dark:text-slate-400">“Giorni” considera tutti gli orari prescritti ogni giorno; “Somministrazioni” imposta il numero totale. Il calcolo non applica le pause annotate sotto.</p>
                      @if (medicationScheduleSummaryAt(0); as summary) {
                        <p class="rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-700 dark:bg-slate-800/60 dark:text-slate-200" aria-live="polite" aria-atomic="true">
                          Giorni previsti: <strong>{{ summary.days }}</strong>
                          @if (summary.doses !== null) {
                            <span> · Somministrazioni previste: <strong>{{ summary.doses }}</strong></span>
                          } @else {
                            <span> · Inserisci gli orari per calcolare le somministrazioni</span>
                          }
                        </p>
                      }
                    </div>
                  }
                  }
                }
              </div>
              @if (section.id === 'documents' && !isPdfAttachment()) {
                <label class="form-field">
                  <span>Testo del documento per la ricerca</span>
                  <textarea
                    class="field-control min-h-40 resize-y"
                    name="extracted_text"
                    [(ngModel)]="form['extracted_text']"
                    rows="6"
                    placeholder="Scrivi o correggi il testo da associare al documento…"
                  ></textarea>
                </label>
              }
              @if (section.id === 'medications' || section.id === 'orthoses' || section.id === 'health_events') {
                <tc-document-association-picker
                  [documents]="documentSearchResults()"
                  [selectedDocuments]="selectedDocuments()"
                  (selectedDocumentsChange)="selectedDocuments.set($event)"
                  (searchChange)="searchDocuments($event)"
                  [searching]="documentSearchLoading()"
                  [files]="associatedFiles"
                  (filesChange)="associatedFiles = $event"
                />
              }
              @if (section.id === 'medications') {
                <section class="space-y-4 rounded-2xl border border-slate-200 p-4 dark:border-slate-700" aria-labelledby="medication-schedule-title">
                  <div class="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <h3 id="medication-schedule-title" class="font-semibold">Periodi della terapia</h3>
                      <p class="mt-1 text-xs leading-5 text-slate-500 dark:text-slate-400">Aggiungi un periodo quando cambiano dosaggio, date o orari. Ogni periodo successivo deve iniziare dopo la fine del precedente; puoi lasciare senza fine solo l’ultimo, se è ancora in corso.</p>
                    </div>
                    <button type="button" class="button-secondary shrink-0 !px-3 !py-2 text-xs" (click)="addMedicationSchedule()">＋ Aggiungi periodo</button>
                  </div>
                  <article class="space-y-2 rounded-xl border border-teal-200 bg-gradient-to-r from-teal-50 to-white p-3 dark:border-teal-900/70 dark:from-teal-950/40 dark:to-slate-900">
                    <div class="flex items-center justify-between gap-2">
                      <h4 class="text-sm font-semibold">Periodo 1 <span class="font-normal text-slate-500 dark:text-slate-400">· Regime iniziale</span></h4>
                    </div>
                    <div class="grid grid-cols-[minmax(0,1fr)_3rem_minmax(0,1fr)] items-center gap-2 rounded-xl border border-white/80 bg-white/80 px-3 py-2.5 dark:border-slate-700 dark:bg-slate-900/60">
                      <div class="min-w-0">
                        <span class="block text-[10px] font-bold uppercase tracking-wider text-teal-700 dark:text-teal-300">Dal</span>
                        <strong class="block truncate text-sm text-slate-800 dark:text-slate-100">{{ form['start_date'] ? (form['start_date'] | date: 'd MMM y') : 'Data da definire' }}</strong>
                      </div>
                      <div class="flex items-center" aria-hidden="true"><span class="h-2 w-2 shrink-0 rounded-full bg-teal-600 dark:bg-teal-400"></span><span class="h-0.5 flex-1 bg-gradient-to-r from-teal-500 to-slate-300 dark:to-slate-600"></span><span class="h-2 w-2 shrink-0 rounded-full bg-slate-300 dark:bg-slate-600"></span></div>
                      <div class="min-w-0 text-right">
                        <span class="block text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Al</span>
                        <strong class="block truncate text-sm text-slate-700 dark:text-slate-200">{{ form['end_date'] ? (form['end_date'] | date: 'd MMM y') : (form['start_date'] ? 'In corso' : 'Data da definire') }}</strong>
                      </div>
                    </div>
                  </article>
                  @for (period of additionalMedicationSchedules(); track $index; let index = $index) {
                    <article class="space-y-3 rounded-xl bg-slate-50 p-3 dark:bg-slate-800/60" [attr.data-medication-schedule-index]="index">
                      <div class="flex items-center justify-between gap-2">
                        <h4 class="text-sm font-semibold">Periodo {{ index + 2 }}</h4>
                        <button type="button" class="text-xs font-semibold text-rose-700 hover:underline dark:text-rose-300" (click)="removeMedicationSchedule(index)">Rimuovi</button>
                      </div>
                      <div class="grid gap-3 sm:grid-cols-2">
                        <label class="form-field"><span>Dal <i class="text-rose-500">*</i></span><app-datepicker [label]="'Inizio periodo ' + (index + 2)" [value]="period.start_date" [rangeStart]="period.start_date" [rangeEnd]="period.end_date" (dateChange)="updateMedicationSchedule(index, 'start_date', $event)" /></label>
                        <label class="form-field"><span>Al</span><app-datepicker [label]="'Fine periodo ' + (index + 2)" [value]="period.end_date" [rangeStart]="period.start_date" [rangeEnd]="period.end_date" (dateChange)="updateMedicationSchedule(index, 'end_date', $event)" /></label>
                        <label class="form-field"><span>Ora di avvio nel primo giorno (facoltativa)</span><app-timepicker [label]="'Ora di avvio del periodo ' + (index + 2)" [value]="period.start_time" (timeChange)="updateMedicationSchedule(index, 'start_time', $event)" /></label>
                        <label class="form-field"><span>Ora di fine nell’ultimo giorno (facoltativa)</span><app-timepicker [label]="'Ora di fine del periodo ' + (index + 2)" [value]="period.end_time" (timeChange)="updateMedicationSchedule(index, 'end_time', $event)" /></label>
                        <p class="text-xs text-slate-500 dark:text-slate-400 sm:col-span-2">Nel primo e nell’ultimo giorno si contano solo gli orari compresi nell’intervallo indicato. Se lasci vuota un’ora, quel giorno viene conteggiato per intero. Ogni fascia vale al suo orario iniziale.</p>
                        @if (medicationScheduleSummary(period); as summary) {
                          <p class="rounded-lg bg-white px-3 py-2 text-sm text-slate-700 dark:bg-slate-900 sm:col-span-2 dark:text-slate-200" aria-live="polite" aria-atomic="true">
                            Giorni previsti: <strong>{{ summary.days }}</strong>
                            @if (summary.doses !== null) {
                              <span> · Somministrazioni previste: <strong>{{ summary.doses }}</strong></span>
                            } @else {
                              <span> · Inserisci gli orari per calcolare le somministrazioni</span>
                            }
                          </p>
                        }
                        <!-- <div class="grid grid-cols-[minmax(0,1fr)_3rem_minmax(0,1fr)] items-center gap-2 rounded-xl border border-white/80 bg-white/80 px-3 py-2.5 dark:border-slate-700 dark:bg-slate-900/60 sm:col-span-2">
                          <div class="min-w-0">
                            <span class="block text-[10px] font-bold uppercase tracking-wider text-teal-700 dark:text-teal-300">Dal</span>
                            <strong class="block truncate text-sm text-slate-800 dark:text-slate-100">{{ period.start_date ? (period.start_date | date: 'd MMM y') : 'Data da definire' }}</strong>
                          </div>
                          <div class="flex items-center" aria-hidden="true"><span class="h-2 w-2 shrink-0 rounded-full bg-teal-600 dark:bg-teal-400"></span><span class="h-0.5 flex-1 bg-gradient-to-r from-teal-500 to-slate-300 dark:to-slate-600"></span><span class="h-2 w-2 shrink-0 rounded-full bg-slate-300 dark:bg-slate-600"></span></div>
                          <div class="min-w-0 text-right">
                            <span class="block text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Al</span>
                            <strong class="block truncate text-sm text-slate-700 dark:text-slate-200">{{ period.end_date ? (period.end_date | date: 'd MMM y') : (period.start_date ? 'In corso' : 'Data da definire') }}</strong>
                          </div>
                        </div> -->
                        @if (medicationScheduleRangeMessage(index + 1); as rangeMessage) {
                          <p class="text-xs font-medium text-rose-700 dark:text-rose-300 sm:col-span-2" role="alert">{{ rangeMessage }}</p>
                        }
                        <label class="form-field"><span>Dosaggio <i class="text-rose-500">*</i></span><input class="field-control" type="text" [ngModel]="period.dosage" [ngModelOptions]="{ standalone: true }" (ngModelChange)="updateMedicationSchedule(index, 'dosage', $event)" placeholder="Es. 2 puff" /></label>
                        <label class="form-field"><span>Formulazione</span><app-dropdown [options]="medicationFormulations" [value]="period.formulation" placeholder="Seleziona" (selection)="updateMedicationSchedule(index, 'formulation', $event)" /></label>
                        <label class="form-field sm:col-span-2"><span>Orari o fasce orarie</span><input class="field-control" type="text" [ngModel]="period.schedule_times" [ngModelOptions]="{ standalone: true }" (ngModelChange)="updateMedicationSchedule(index, 'schedule_times', $event)" placeholder="Es. 08:00-10:00, 14:00-16:00" /></label>
                        @if (['spray', 'aerosol'].includes(period.formulation.toLocaleLowerCase())) {
                          <label class="form-field"><span>Puff o spruzzi per somministrazione</span><input class="field-control" type="number" min="1" step="1" [ngModel]="period.spray_count" [ngModelOptions]="{ standalone: true }" (ngModelChange)="updateMedicationSchedule(index, 'spray_count', $event)" /></label>
                          <label class="form-field"><span>Durata (secondi)</span><input class="field-control" type="number" min="1" step="1" [ngModel]="period.administration_duration_seconds" [ngModelOptions]="{ standalone: true }" (ngModelChange)="updateMedicationSchedule(index, 'administration_duration_seconds', $event)" /></label>
                        }
                        <label class="form-field sm:col-span-2"><span>Pause previste</span><textarea class="field-control min-h-20" [ngModel]="period.planned_pause" [ngModelOptions]="{ standalone: true }" (ngModelChange)="updateMedicationSchedule(index, 'planned_pause', $event)" rows="2"></textarea></label>
                      </div>
                    </article>
                  }
                </section>
              }
              <div class="form-field full-span">
                <span>Nota vocale</span>
                <div class="flex items-center gap-2">
                  <button
                    type="button"
                    class="button-secondary"
                    [disabled]="!recordingSupported"
                    (click)="toggleRecording()"
                  >
                    {{ recording() ? '■ Ferma registrazione' : 'Registra una nota' }}
                  </button>
                  @if (recordedVoice) {
                    <button
                      type="button"
                      class="text-sm text-slate-500 underline"
                      (click)="clearVoice()"
                    >
                      Rimuovi
                    </button>
                  }
                </div>
                <p class="text-xs text-slate-500">
                  Registra un promemoria da riordinare in seguito.
                </p>
                @if (recording()) {
                  <div
                    class="mt-2 flex h-16 items-center gap-1 rounded-xl border border-teal-200 bg-teal-50/70 px-3 dark:border-teal-900 dark:bg-teal-950/30"
                    role="img"
                    aria-label="Spettro audio del microfono in tempo reale"
                  >
                    @for (level of audioSpectrum(); track $index) {
                      <span
                        class="min-w-1 flex-1 rounded-full bg-teal-600 transition-[height] duration-75 dark:bg-teal-400"
                        [style.height.%]="level"
                      ></span>
                    }
                  </div>
                  <p class="text-xs text-teal-700 dark:text-teal-300" role="status">
                    Registrazione in corso · lo spettro si muove quando il microfono rileva audio.
                  </p>
                }
                @if (recordedVoice) {
                  <audio
                    controls
                    class="h-10 max-w-sm"
                    [src]="recordedVoiceUrl"
                    aria-label="Anteprima nota vocale"
                  ></audio>
                }
              </div>
              @if (section.id === 'children' && !form['user_id']) {
                <p class="text-xs text-slate-500">
                  I dati restano privati e sono associati al tuo account.
                </p>
              }
              <footer
                class="flex justify-end gap-2 border-t border-slate-100 pt-4 dark:border-slate-800"
              >
                <button type="button" class="button-secondary" (click)="closeForm()">Annulla</button
                ><button class="button-primary" type="submit" [disabled]="saving() || documentTextProcessing() || documentLinksLoading()">
                  {{
                    extracting()
                      ? 'Estrazione testo…'
                      : saving()
                        ? 'Salvataggio…'
                        : 'Salva nel diario'
                  }}
                </button>
              </footer>
              }
            </form>
          </section>
        </div>
      }
      @if (medicationScopePrompt()) {
        <div class="modal-backdrop z-50" (click)="medicationScopePrompt.set(false)">
          <section class="modal-panel max-w-lg" role="dialog" aria-modal="true" aria-labelledby="medication-scope-title"
            (click)="$event.stopPropagation()">
            <div class="border-b border-slate-100 px-5 py-4 dark:border-slate-800">
              <p class="eyebrow">TERAPIA FARMACOLOGICA</p>
              <h2 id="medication-scope-title" class="text-xl font-semibold">A quali episodi applicare le modifiche?</h2>
              <p class="mt-2 text-sm text-slate-500 dark:text-slate-400">
                Il piano di somministrazione verrà aggiornato da oggi in base alla scelta. Nome del farmaco e note si
                applicano all’intera scheda; le somministrazioni già registrate restano invariate.
              </p>
            </div>
            <div class="grid gap-2 p-5">
              <button type="button" class="button-secondary justify-start" [disabled]="saving()"
                (click)="save('single')">
                Solo questo episodio
              </button>
              <button type="button" class="button-secondary justify-start" [disabled]="saving()"
                (click)="save('preceding')">
                Questo e tutti quelli passati
              </button>
              <button type="button" class="button-secondary justify-start" [disabled]="saving()"
                (click)="save('following')">
                Questo e tutti quelli futuri
              </button>
              <button type="button" class="button-primary justify-start" [disabled]="saving()"
                (click)="save('all')">
                Tutti gli episodi, passati e futuri
              </button>
              <button type="button" class="mt-1 text-sm text-slate-500 hover:underline"
                (click)="medicationScopePrompt.set(false)">
                Torna alla modifica
              </button>
            </div>
          </section>
        </div>
      }
      @if (detailRow(); as row) {
        <div class="modal-backdrop" (click)="closeDetails()">
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="detail-dialog-title"
            class="modal-panel"
            [class.medication-modal]="section.id === 'medications'"
            [class.document-modal]="section.id === 'documents'"
            (click)="$event.stopPropagation()"
          >
            <header class="flex items-start justify-between border-b border-slate-100 px-5 py-4 dark:border-slate-800">
              <div>
                <p class="eyebrow">{{ section.label | uppercase }} · SOLA LETTURA</p>
                <h2 id="detail-dialog-title" class="text-xl font-semibold">
                  {{ value(row, 'title') || value(row, 'name') || value(row, 'category') || 'Voce del diario' }}
                </h2>
              </div>
              <button type="button" class="icon-button" aria-label="Chiudi" (click)="closeDetails()">×</button>
            </header>
            <div class="space-y-4 overflow-y-auto px-5 py-5">
              @if (section.id === 'contacts') {
                <div class="flex justify-center py-2">
                  <div
                    class="flex h-44 w-44 items-center justify-center overflow-hidden rounded-full border-4 border-white bg-teal-100 text-4xl font-semibold text-teal-800 shadow-lg ring-4 ring-teal-100 dark:border-slate-800 dark:bg-teal-900/50 dark:text-teal-100 dark:ring-teal-900/50"
                    role="img"
                    [attr.aria-label]="'Avatar di ' + value(row, 'name')"
                  >
                    @if (contactAvatarUrls()[row.id]) {
                      <img class="h-full w-full object-cover" [src]="contactAvatarUrls()[row.id]" alt="" />
                    } @else {
                      {{ contactAvatarInitials(value(row, 'name')) }}
                    }
                  </div>
                </div>
              }
              <dl class="grid grid-cols-2 gap-x-4 gap-y-5 sm:grid-cols-2">
                @for (field of detailFields(row); track field.key) {
                  @if (value(row, field.key)) {
                    <div class="min-w-0" [class.col-span-2]="field.kind === 'textarea' || field.key === 'notes'">
                      <dt class="text-xs font-semibold uppercase tracking-wide text-slate-500">{{ field.label }}</dt>
                      <dd class="mt-1 whitespace-pre-wrap break-words text-sm">
                        @if (section.id === 'contacts' && field.key === 'website' && websiteHref(value(row, field.key))) {
                          <a class="underline" [href]="websiteHref(value(row, field.key))" target="_blank" rel="noopener noreferrer">{{ value(row, field.key) }}</a>
                        } @else {
                          {{ value(row, field.key) }}
                        }
                      </dd>
                    </div>
                  }
                }
              </dl>
              @if (section.id === 'medicine_cabinet') {
                <section class="space-y-4 border-t border-slate-100 pt-4 dark:border-slate-800" aria-labelledby="medicine-stock-title">
                  <div class="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <h3 id="medicine-stock-title" class="font-semibold">Dettagli della confezione</h3>
                      <p class="mt-1 text-xs text-slate-500">Disponibilità, uso previsto e date del farmaco.</p>
                    </div>
                    <span class="rounded-full px-3 py-1 text-xs font-semibold" [ngClass]="inventoryExpiryTone(row)">
                      {{ inventoryExpiryLabel(row) }}
                    </span>
                  </div>
                  <div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    @if (value(row, 'quantity')) {
                      <div class="rounded-xl bg-slate-50 p-3 dark:bg-slate-800/60">
                        <p class="text-xs font-medium text-slate-500">Quantità disponibile</p>
                        <p class="mt-1 font-semibold">{{ value(row, 'quantity') }}</p>
                      </div>
                    }
                    @if (value(row, 'planned_dosage')) {
                      <div class="rounded-xl bg-slate-50 p-3 dark:bg-slate-800/60 sm:col-span-2 lg:col-span-1">
                        <p class="text-xs font-medium text-slate-500">Dosaggio previsto</p>
                        <p class="mt-1 whitespace-pre-wrap font-semibold">{{ value(row, 'planned_dosage') }}</p>
                      </div>
                    }
                    @if (row['price'] != null && value(row, 'price') !== '') {
                      <div class="rounded-xl bg-slate-50 p-3 dark:bg-slate-800/60">
                        <p class="text-xs font-medium text-slate-500">Prezzo registrato</p>
                        <p class="mt-1 font-semibold">{{ value(row, 'price') | currency: 'EUR' : 'symbol' : '1.2-2' : 'it' }}</p>
                      </div>
                    }
                  </div>
                  <dl class="grid gap-3 sm:grid-cols-3">
                    @if (value(row, 'purchase_date')) {
                      <div><dt class="text-xs font-medium text-slate-500">Acquistato il</dt><dd class="mt-1 text-sm">{{ value(row, 'purchase_date') | date: 'd MMMM y' }}</dd></div>
                    }
                    @if (value(row, 'opened_date')) {
                      <div><dt class="text-xs font-medium text-slate-500">Aperto il</dt><dd class="mt-1 text-sm">{{ value(row, 'opened_date') | date: 'd MMMM y' }}</dd></div>
                    }
                    @if (medicineCabinetExpiry(row); as expiry) {
                      @if (expiry.packageDate) {
                        <div><dt class="text-xs font-medium text-slate-500">Scadenza confezione</dt><dd class="mt-1 text-sm">{{ expiry.packageDate | date: (row['expiry_precision'] === 'month' ? 'MM/yyyy' : 'd MMMM y') }}</dd></div>
                      }
                      @if (value(row, 'opened_expiry_days')) {
                        <div><dt class="text-xs font-medium text-slate-500">Validità dopo apertura</dt><dd class="mt-1 text-sm">{{ value(row, 'opened_expiry_days') }} giorni</dd></div>
                      }
                      @if (expiry.afterOpeningDate) {
                        <div><dt class="text-xs font-medium text-slate-500">Da consumare entro dopo apertura</dt><dd class="mt-1 text-sm font-semibold">{{ expiry.afterOpeningDate | date: 'd MMMM y' }}</dd></div>
                      }
                    }
                  </dl>
                </section>
              }
              @if (section.id === 'medications') {
                <section class="space-y-3 border-t border-slate-100 pt-4 dark:border-slate-800" aria-labelledby="medication-plan-title">
                  <div>
                    <h3 id="medication-plan-title" class="font-semibold">Piano di somministrazione</h3>
                    <p class="mt-1 text-xs text-slate-500">Dosaggi e indicazioni per ciascun periodo della terapia.</p>
                  </div>
                  <ol class="space-y-2">
                    @for (period of medicationSchedulePeriods(row); track $index; let index = $index) {
                      <li class="rounded-xl bg-slate-50 p-3 dark:bg-slate-800/60">
                        <div class="flex flex-wrap items-start justify-between gap-2">
                          <strong class="text-sm">{{ medicationSchedulePeriods(row).length > 1 ? 'Periodo ' + (index + 1) : 'Regime' }} · {{ period.dosage }}</strong>
                          <span class="rounded-full bg-teal-100 px-2 py-0.5 text-[11px] font-semibold text-teal-800 dark:bg-teal-900/50 dark:text-teal-200">
                            {{ period.start_date ? (period.start_date | date: 'd MMM y') : 'Inizio non specificato' }}
                            @if (period.end_date) { – {{ period.end_date | date: 'd MMM y' }} } @else { · in corso }
                          </span>
                        </div>
                        <dl class="mt-3 grid gap-3 text-sm sm:grid-cols-2">
                          @if (period.formulation) {
                            <div><dt class="text-xs font-medium text-slate-500">Formulazione</dt><dd class="mt-0.5">{{ period.formulation }}</dd></div>
                          }
                          @if (period.schedule_times) {
                            <div><dt class="text-xs font-medium text-slate-500">Orari o fasce</dt><dd class="mt-0.5">{{ period.schedule_times }}</dd></div>
                          }
                          @if (period.start_time) {
                            <div><dt class="text-xs font-medium text-slate-500">Avvio del primo giorno</dt><dd class="mt-0.5">Dalle {{ period.start_time }}</dd></div>
                          }
                          @if (period.end_time) {
                            <div><dt class="text-xs font-medium text-slate-500">Fine dell’ultimo giorno</dt><dd class="mt-0.5">Alle {{ period.end_time }}</dd></div>
                          }
                          @if (period.spray_count != null) {
                            <div><dt class="text-xs font-medium text-slate-500">Puff o spruzzi per somministrazione</dt><dd class="mt-0.5">{{ period.spray_count }}</dd></div>
                          }
                          @if (period.administration_duration_seconds != null) {
                            <div><dt class="text-xs font-medium text-slate-500">Durata della somministrazione</dt><dd class="mt-0.5">{{ period.administration_duration_seconds }} secondi</dd></div>
                          }
                          @if (period.planned_pause) {
                            <div class="sm:col-span-2"><dt class="text-xs font-medium text-slate-500">Pause previste</dt><dd class="mt-0.5 whitespace-pre-wrap">{{ period.planned_pause }}</dd></div>
                          }
                        </dl>
                      </li>
                    }
                  </ol>
                </section>
              }
              @if (section.id === 'children') {
                <section class="space-y-4 border-t border-slate-100 pt-4 dark:border-slate-800" aria-labelledby="detail-measurements-title">
                  <div>
                    <h3 id="detail-measurements-title" class="font-semibold">Andamento fisiologico</h3>
                    <p class="mt-1 text-sm text-slate-500">Peso, altezza e circonferenza della testa nel tempo.</p>
                  </div>
                  @if (measurementError()) { <p class="notice-error" role="alert">{{ measurementError() }}</p> }
                  @if (measurementRows().length) {
                    <div class="grid gap-3 sm:grid-cols-2">
                      @for (metric of measurementMetrics; track metric.key) {
                        @if (hasMeasurement(metric.key)) {
                          <div class="rounded-xl border border-slate-100 p-3 dark:border-slate-800">
                            <h4 class="text-sm font-semibold">{{ metric.label }}</h4>
                            <p class="text-xs text-slate-500">{{ measurementTrend(metric.key) }}</p>
                            <svg viewBox="0 0 320 90" class="mt-2 h-20 w-full" role="img" [attr.aria-label]="'Andamento ' + metric.label + ' nel tempo'">
                              <path d="M8 80H312" stroke="currentColor" class="text-slate-200 dark:text-slate-700" />
                              <polyline [attr.points]="measurementPoints(metric.key)" fill="none" stroke="#0f8b83" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" />
                            </svg>
                          </div>
                        }
                      }
                    </div>
                    <ol class="max-h-36 divide-y divide-slate-100 overflow-y-auto text-sm dark:divide-slate-800">
                      @for (measurement of measurementRows(); track measurement.id) {
                        <li class="flex flex-wrap gap-x-4 gap-y-1 py-2"><time>{{ value(measurement, 'date') | date:'d MMM y' }}</time>@if (measurement['weight_kg'] != null) { <span>{{ measurement['weight_kg'] }} kg</span> }@if (measurement['height_cm'] != null) { <span>{{ measurement['height_cm'] }} cm</span> }@if (measurement['head_circumference_cm'] != null) { <span>Testa {{ measurement['head_circumference_cm'] }} cm</span> }</li>
                      }
                    </ol>
                  } @else {
                    <p class="rounded-xl bg-slate-50 p-3 text-sm text-slate-500 dark:bg-slate-800/60">Non ci sono ancora misurazioni. Aggiungi peso o altezza qui sotto per iniziare a vedere l’andamento.</p>
                  }
                  <form class="grid gap-3 sm:grid-cols-2" (ngSubmit)="saveMeasurement()">
                    <label class="form-field"><span>Data</span><app-datepicker label="Data misurazione" [value]="measurementForm['date']" (dateChange)="measurementForm['date'] = $event" /></label>
                    <label class="form-field"><span>Peso (kg)</span><input class="field-control" type="number" min="0" max="300" step="0.01" [(ngModel)]="measurementForm['weight_kg']" name="detail_weight_kg" /></label>
                    <label class="form-field"><span>Altezza (cm)</span><input class="field-control" type="number" min="0" max="250" step="0.1" [(ngModel)]="measurementForm['height_cm']" name="detail_height_cm" /></label>
                    <label class="form-field"><span>Circonferenza testa (cm)</span><input class="field-control" type="number" min="0" max="100" step="0.1" [(ngModel)]="measurementForm['head_circumference_cm']" name="detail_head_circumference_cm" /></label>
                    <div class="sm:col-span-2"><button class="button-primary" type="submit" [disabled]="measurementSaving()">{{ measurementSaving() ? 'Salvataggio…' : 'Registra misure' }}</button></div>
                  </form>
                </section>
              }
              @if (section.id === 'medications') {
                <section class="space-y-3 border-t border-slate-100 pt-4 dark:border-slate-800" aria-labelledby="spot-dose-title">
                  <div class="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <h3 id="spot-dose-title" class="font-semibold">Somministrazioni fuori programma</h3>
                      <p class="mt-1 text-sm text-slate-500">Registra una dose occasionale senza modificare gli orari del piano.</p>
                    </div>
                    @if (!spotDoseFormOpen()) {
                      <button type="button" class="button-secondary" (click)="openSpotDoseForm(row)">Registra dose spot</button>
                    }
                  </div>
                  @if (spotDoseError()) { <p class="notice-error" role="alert">{{ spotDoseError() }}</p> }
                  @if (spotDoseSaved()) { <p class="text-sm font-medium text-emerald-700 dark:text-emerald-300" role="status">Somministrazione spot registrata.</p> }
                  @if (spotDoseFormOpen()) {
                    <form class="grid gap-3 rounded-xl bg-slate-50 p-3 dark:bg-slate-800/60 sm:grid-cols-2" (ngSubmit)="saveSpotDose(row)">
                      <label class="form-field"><span>Data</span><app-datepicker label="Data della somministrazione" [value]="spotDoseForm.date" (dateChange)="spotDoseForm.date = $event" /></label>
                      <label class="form-field"><span>Ora</span><app-timepicker label="Ora della somministrazione" [value]="spotDoseForm.time" (timeChange)="spotDoseForm.time = $event" /></label>
                      <label class="form-field sm:col-span-2"><span>Dosaggio somministrato</span><input class="field-control" type="text" [(ngModel)]="spotDoseForm.dosage" name="spot_dose_dosage" [placeholder]="spotDoseFormDefault || 'Inserisci il dosaggio, se utile'" /></label>
                      <p class="text-xs text-slate-500 sm:col-span-2">Il dosaggio del regime alla data scelta viene proposto come punto di partenza: controllalo e modificalo se necessario.</p>
                      <div class="flex justify-end gap-2 sm:col-span-2">
                        <button type="button" class="button-secondary" (click)="closeSpotDoseForm()">Annulla</button>
                        <button type="submit" class="button-primary" [disabled]="savingSpotDose()">{{ savingSpotDose() ? 'Salvataggio…' : 'Registra somministrazione' }}</button>
                      </div>
                    </form>
                  }
                  @if (medicationDoseLoading()) {
                    <p class="text-sm text-slate-500">Caricamento dello storico…</p>
                  } @else if (detailMedicationDoses().length) {
                    <ol class="divide-y divide-slate-100 rounded-xl border border-slate-100 dark:divide-slate-800 dark:border-slate-800">
                      @for (dose of detailMedicationDoses(); track dose.id) {
                        <li class="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 px-3 py-2 text-sm">
                          <time class="font-medium">{{ dose['scheduled_date'] }} · {{ spotDoseTime(dose) }}</time>
                          @if (dose['administered_dosage']) { <span class="text-slate-600 dark:text-slate-300">{{ dose['administered_dosage'] }}</span> }
                        </li>
                      }
                    </ol>
                  } @else if (!spotDoseError()) {
                    <p class="rounded-xl bg-slate-50 p-3 text-sm text-slate-500 dark:bg-slate-800/60">Nessuna somministrazione spot registrata per questo farmaco.</p>
                  }
                </section>
              }
              @if ((section.id === 'medications' || section.id === 'orthoses' || section.id === 'health_events') && detailDocuments().length) {
                <section class="space-y-2 border-t border-slate-100 pt-4 dark:border-slate-800">
                  <h3 class="font-semibold">Documenti collegati</h3>
                  @for (doc of detailDocuments(); track doc.id) {
                    <button type="button" class="block text-left text-sm text-teal-700 underline dark:text-teal-300" (click)="openDocument(doc)">
                      {{ doc['title'] || 'Documento' }}
                    </button>
                  }
                </section>
              }
              @if (value(row, 'voice_note_data')) {
                <audio controls preload="none" class="h-10 w-full max-w-sm" [src]="value(row, 'voice_note_data')" aria-label="Nota vocale"></audio>
              }
              @if (value(row, 'voice_note_path')) {
                <button type="button" class="button-secondary" (click)="openVoice(row)">Ascolta nota vocale</button>
              }
              @if ((section.id === 'documents' && (value(row, 'storage_path') || value(row, 'local_file_id'))) || (section.id === 'expenses' && value(row, 'receipt_path'))) {
                <button type="button" class="button-secondary" (click)="openDocument(row)">Visualizza allegato</button>
              }
            </div>
            <footer class="flex justify-end gap-2 border-t border-slate-100 px-5 py-4 dark:border-slate-800">
              <button type="button" class="button-secondary" (click)="closeDetails()">Chiudi</button>
              <button type="button" class="button-secondary" (click)="editFromDetails(row)">Modifica</button>
              <button type="button" class="button-secondary text-rose-700" (click)="removeFromDetails(row)">Elimina</button>
            </footer>
          </section>
        </div>
      }
    }
  `,
})
export class FeaturePageComponent implements OnInit, OnDestroy {
  private readonly host = inject(ElementRef<HTMLElement>);
  readonly contactRoleSuggestions = [
    'Medico',
    'Pediatra',
    'Chirurgo',
    'Neurologo',
    'Cardiologo',
    'Oncologo',
    'Genetista',
    'Logopedista',
    'Fisiatra',
    'Fisioterapista',
    'Infermiere',
    'Coordinatore del trial',
    'Case manager',
    'Terapista',
    'Psicologo',
    'Assistente sociale',
    'Farmacista',
    'Tecnico ortopedico',
    'Altro',
  ];
  @Input({ required: true }) sectionId!: SectionId;
  readonly data = inject(DiaryDataService);
  readonly ui = inject(UiStateService);
  private readonly auth = inject(AuthService);
  private readonly pdf = inject(PdfExportService);
  private readonly dataExport = inject(DataExportService);
  private readonly supabase = inject(SupabaseClientService);
  private readonly storage = inject(StorageService);
  private readonly confirmation = inject(ConfirmationService);
  readonly isFormOpen = signal(false);
  readonly documentScannerOpen = signal(false);
  readonly medicationScopePrompt = signal(false);
  readonly detailRow = signal<DiaryRow | null>(null);
  readonly contactAvatarUrls = signal<Record<string, string>>({});
  readonly selectedContactAvatarPreview = signal<string | null>(null);
  readonly documentSearchResults = signal<DiaryRow[]>([]);
  readonly selectedDocuments = signal<DiaryRow[]>([]);
  readonly documentSearchLoading = signal(false);
  readonly detailDocuments = signal<DiaryRow[]>([]);
  readonly detailMedicationDoses = signal<DiaryRow[]>([]);
  readonly medicationDoseLoading = signal(false);
  readonly spotDoseFormOpen = signal(false);
  readonly savingSpotDose = signal(false);
  readonly spotDoseError = signal('');
  readonly spotDoseSaved = signal(false);
  spotDoseForm = { date: '', time: '', dosage: '' };
  spotDoseFormDefault = '';
  readonly saving = signal(false);
  private pendingHistoricalDoseMedicationId = '';
  readonly extracting = signal(false);
  readonly documentTextProcessing = signal(false);
  readonly loadingExistingPdf = signal(false);
  readonly documentLinksLoading = signal(false);
  readonly exporting = signal(false);
  readonly initialized = signal(false);
  readonly recording = signal(false);
  readonly audioSpectrum = signal<number[]>(Array.from({ length: 28 }, () => 4));
  readonly selectedChildId = signal('');
  readonly selectedChildName = signal('');
  readonly highlightedId = signal('');
  readonly searchQuery = signal('');
  private readonly documentSearchPreviewCache = new Map<string, { query: string; source: string; preview: string }>();
  get supportsFuzzySearch(): boolean {
    return ['medications', 'medicine_cabinet', 'orthoses', 'health_events', 'therapies', 'documents', 'expenses', 'contacts'].includes(this.sectionId);
  }
  readonly shareNoticeId = signal('');
  readonly shareNotice = signal('');
  readonly reportFrom = signal('');
  readonly reportTo = signal('');
  readonly reportCategory = signal('');
  readonly reportPreviewOpen = signal(false);
  readonly reportCategoryTab = signal('');
  readonly visitSummaryDocument = computed(() =>
    this.pdf.createVisitSummary(
      this.visitSummaryRows,
      this.selectedChildName(),
      this.reportFrom(),
      this.reportTo(),
      this.data.rows().filter((row) => row['record_type'] === 'medications'),
    ),
  );
  readonly activeVisitSummaryGroup = computed(() => {
    const groups = this.visitSummaryDocument().groups;
    return groups.find((group) => group.key === this.reportCategoryTab()) ??
      groups.find((group) => group.key === 'medication_doses') ??
      groups[0] ??
      null;
  });
  readonly reportCategories = [
    'Farmaci',
    'Eventi e sintomi',
    'Percorsi terapeutici',
    'Ortesi e ausili',
    'Documenti',
    'Spese e rimborsi',
    'Appuntamenti',
    'Somministrazioni',
    'Misurazioni',
  ];
  readonly medicationFormulations = ['Compressa', 'Sciroppo', 'Gocce', 'Spray', 'Aerosol', 'Crema', 'Doccia nasale', 'Altro'];
  readonly measurementRows = signal<DiaryRow[]>([]);
  readonly measurementLoading = signal(false);
  readonly measurementSaving = signal(false);
  readonly measurementError = signal('');
  readonly measurementMetrics = [
    { key: 'weight_kg', label: 'Peso (kg)' },
    { key: 'height_cm', label: 'Altezza (cm)' },
    { key: 'head_circumference_cm', label: 'Circonferenza testa (cm)' },
  ];
  measurementForm: Record<string, string> = { date: new Date().toISOString().slice(0, 10) };
  readonly children: DiaryRow[] = [];
  form: Record<string, string> = {};
  associatedFiles: File[] = [];
  private documentSearchTimer?: ReturnType<typeof setTimeout>;
  private documentSearchRequest = 0;
  readonly additionalMedicationSchedules = signal<MedicationScheduleDraft[]>([]);
  readonly medicationDurationUnits = ['Giorni', 'Somministrazioni'];
  readonly medicationDurationValue = signal<number | null>(null);
  readonly medicationDurationUnit = signal('Giorni');
  attachedFile: File | null = null;
  pdfTextSeed = '';
  private attachmentModified = false;
  private pdfTextForSaving: { file: File; text: string } | null = null;
  recordedVoice: Blob | null = null;
  recordedVoiceUrl = '';
  private recorder?: MediaRecorder;
  private mediaStream?: MediaStream;
  private audioContext?: AudioContext;
  private analyser?: AnalyserNode;
  private spectrumFrame = 0;
  private editingId = '';
  private editingContactRow: DiaryRow | null = null;
  private contactAvatarFile: File | null = null;
  private contactAvatarCleared = false;
  private contactAvatarLoadVersion = 0;
  private editingDocumentRow: DiaryRow | null = null;
  private requestedChildId = '';
  private loadedUserId: string | null = null;
  private routeSubscription?: Subscription;
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private openNewEventAfterLoad = false;
  private handledNewEventRequest = false;
  get recordingSupported(): boolean {
    return (
      typeof navigator !== 'undefined' &&
      !!navigator.mediaDevices?.getUserMedia &&
      typeof MediaRecorder !== 'undefined'
    );
  }
  private readonly accountChangeEffect = effect(() => {
    const ready = this.initialized();
    const userId = this.auth.user()?.id ?? null;
    if (ready && userId !== this.loadedUserId) {
      this.loadedUserId = userId;
      queueMicrotask(() => void this.reloadForAccount());
    }
  });
  get section(): SectionDefinition {
    return sectionById(this.sectionId)!;
  }
  get formFields(): FieldDefinition[] {
    const fields = this.section.fields;
    if (this.sectionId !== 'medications') return fields;
    const order = ['name', 'dosage', 'start_date', 'end_date', 'formulation', 'spray_count', 'administration_duration_seconds', 'schedule_times', 'planned_pause', 'notes'];
    return [...fields].sort((left, right) => order.indexOf(left.key) - order.indexOf(right.key));
  }
  normalizeScheduleTimesInput(): void {
    this.form['schedule_times'] = (this.form['schedule_times'] ?? '')
      .split(',')
      .map((entry) => entry.replace(/\b(\d):([0-5]\d)\b/g, '0$1:$2'))
      .join(', ');
  }
  addMedicationSchedule(): void {
    const previous = this.additionalMedicationSchedules().at(-1);
    const source = previous ?? this.form;
    const newIndex = this.additionalMedicationSchedules().length;
    this.additionalMedicationSchedules.update((periods) => [
      ...periods,
      {
        start_date: '',
        end_date: '',
        start_time: '',
        end_time: '',
        dosage: String(source['dosage'] ?? ''),
        formulation: String(source['formulation'] ?? ''),
        spray_count: String(source['spray_count'] ?? ''),
        administration_duration_seconds: String(source['administration_duration_seconds'] ?? ''),
        schedule_times: String(source['schedule_times'] ?? ''),
        planned_pause: String(source['planned_pause'] ?? ''),
      },
    ]);
    requestAnimationFrame(() => {
      const target = this.host.nativeElement.querySelector(
        `[data-medication-schedule-index="${newIndex}"]`,
      ) as HTMLElement | null;
      target?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
  }
  updateMedicationSchedule(
    index: number,
    key: keyof MedicationScheduleDraft,
    value: unknown,
  ): void {
    this.additionalMedicationSchedules.update((periods) =>
      periods.map((period, current) => current === index
        ? { ...period, [key]: value == null ? '' : String(value) }
        : period),
    );
  }
  private medicationScheduleDrafts(initial: Record<string, unknown> = this.form): MedicationScheduleDraft[] {
    return [
      {
        start_date: String(initial['start_date'] ?? ''),
        end_date: String(initial['end_date'] ?? ''),
        start_time: String(initial['start_time'] ?? ''),
        end_time: String(initial['end_time'] ?? ''),
        dosage: String(initial['dosage'] ?? ''),
        formulation: String(initial['formulation'] ?? ''),
        spray_count: String(initial['spray_count'] ?? ''),
        administration_duration_seconds: String(initial['administration_duration_seconds'] ?? ''),
        schedule_times: String(initial['schedule_times'] ?? ''),
        planned_pause: String(initial['planned_pause'] ?? ''),
      },
      ...this.additionalMedicationSchedules(),
    ];
  }
  medicationScheduleSummary(period: MedicationScheduleDraft): { days: number; doses: number | null } | null {
    return summarizeMedicationSchedule(period);
  }
  medicationScheduleSummaryAt(index: number): { days: number; doses: number | null } | null {
    const period = this.medicationScheduleDrafts()[index];
    return period ? summarizeMedicationSchedule(period) : null;
  }
  get canCalculateMedicationEnd(): boolean {
    const period = this.medicationScheduleDrafts()[0];
    const value = Number(this.medicationDurationValue());
    const slots = parseMedicationScheduleTimes(period?.schedule_times ?? '');
    const amount = this.medicationDurationUnit() === 'Somministrazioni' ? value : value * slots.length;
    return !!period && Number.isInteger(value) && value > 0 && value <= 10_000 &&
      validMedicationDate(period.start_date) && slots.length > 0 &&
      (!period.start_time || !!normalizeMedicationTime(period.start_time)) &&
      Number.isSafeInteger(amount) && amount > 0 && amount <= 100_000;
  }
  calculateMedicationEnd(): void {
    const period = this.medicationScheduleDrafts()[0];
    if (!period || !this.canCalculateMedicationEnd) return;
    const slots = parseMedicationScheduleTimes(period.schedule_times);
    const duration = Number(this.medicationDurationValue());
    let remaining = this.medicationDurationUnit() === 'Somministrazioni'
      ? duration
      : duration * slots.length;
    const firstDayStartTime = period.start_time ? normalizeMedicationTime(period.start_time) : null;
    let date = period.start_date;

    for (let dayIndex = 0; dayIndex < 36_500; dayIndex++) {
      const dailySlots = dayIndex === 0 && firstDayStartTime
        ? slots.filter((slot) => slot.start >= firstDayStartTime)
        : slots;
      for (const slot of dailySlots) {
        remaining--;
        if (remaining === 0) {
          this.form['end_date'] = date;
          this.form['end_time'] = slot.start;
          this.data.error.set('');
          return;
        }
      }
      date = addMedicationDays(date, 1);
    }
  }
  medicationScheduleRangeMessage(index: number, periods = this.medicationScheduleDrafts()): string {
    const period = periods[index];
    if (!period) return '';

    const start = period.start_date.trim();
    const end = period.end_date.trim();
    if (start && !validMedicationDate(start)) return 'Inserisci una data di inizio valida.';
    if (end && !validMedicationDate(end)) return 'Inserisci una data di fine valida.';
    if (end && !start) return 'Indica la data di inizio prima della data di fine.';
    if (start && end && end < start) return 'La data di fine deve essere uguale o successiva alla data di inizio.';
    if (period.start_time && !start) return 'Indica la data di inizio prima dell’orario di avvio.';
    if (period.end_time && !end) return 'Indica la data di fine prima dell’orario di fine.';
    if (period.start_time && !normalizeMedicationTime(period.start_time)) return 'Inserisci un orario di avvio valido per il primo giorno.';
    if (period.end_time && !normalizeMedicationTime(period.end_time)) return 'Inserisci un orario di fine valido per l’ultimo giorno.';
    if (start && start === end && period.start_time && period.end_time && period.end_time < period.start_time) {
      return 'L’ora di fine deve essere uguale o successiva all’ora di avvio se il periodo dura un solo giorno.';
    }
    if (periods.length > 1 && !start) return 'Indica la data di inizio di questo periodo.';

    if (index > 0) {
      const previous = periods[index - 1];
      if (!previous.end_date || !validMedicationDate(previous.end_date)) {
        return `Indica la data di fine del periodo ${index} prima di iniziare questo.`;
      }
      if (start && previous.end_date >= start) {
        return `Questo periodo deve iniziare dopo la fine del periodo ${index}.`;
      }
    }

    if (index < periods.length - 1) {
      const next = periods[index + 1];
      if (!end) return `Indica la data di fine prima del periodo ${index + 2}.`;
      if (next.start_date && validMedicationDate(next.start_date) && end >= next.start_date) {
        return `La fine deve precedere l’inizio del periodo ${index + 2}.`;
      }
    }
    return '';
  }
  removeMedicationSchedule(index: number): void {
    this.additionalMedicationSchedules.update((periods) => periods.filter((_, i) => i !== index));
  }
  medicationSchedulePeriods(row: DiaryRow): MedicationSchedulePeriod[] {
    const schedules = row['schedule_periods'];
    if (Array.isArray(schedules) && schedules.length) {
      return schedules.filter((value): value is Record<string, unknown> => !!value && typeof value === 'object')
        .map((value) => ({
          start_date: value['start_date'] ? String(value['start_date']) : null,
          end_date: value['end_date'] ? String(value['end_date']) : null,
          start_time: value['start_time'] ? String(value['start_time']) : null,
          end_time: value['end_time'] ? String(value['end_time']) : null,
          dosage: String(value['dosage'] ?? ''),
          formulation: value['formulation'] ? String(value['formulation']) : null,
          spray_count: value['spray_count'] == null ? null : Number(value['spray_count']),
          administration_duration_seconds: value['administration_duration_seconds'] == null ? null : Number(value['administration_duration_seconds']),
          schedule_times: value['schedule_times'] ? String(value['schedule_times']) : null,
          planned_pause: value['planned_pause'] ? String(value['planned_pause']) : null,
        }));
    }
    return [{
      start_date: row['start_date'] ? String(row['start_date']) : null,
      end_date: row['end_date'] ? String(row['end_date']) : null,
      start_time: null,
      end_time: null,
      dosage: String(row['dosage'] ?? ''),
      formulation: row['formulation'] ? String(row['formulation']) : null,
      spray_count: row['spray_count'] == null ? null : Number(row['spray_count']),
      administration_duration_seconds: row['administration_duration_seconds'] == null ? null : Number(row['administration_duration_seconds']),
      schedule_times: row['schedule_times'] ? String(row['schedule_times']) : null,
      planned_pause: row['planned_pause'] ? String(row['planned_pause']) : null,
    }];
  }
  get childNames(): string[] {
    return this.children.map((c) => String(c['name']));
  }
  get total(): number {
    return this.data
      .rows()
      .reduce(
        (sum, row) =>
          sum +
          (Number(row['amount']) ||
            (Number(row['distance_km']) || 0) * (Number(row['rate_per_km']) || 0)),
        0,
      );
  }
  get kilometers(): number {
    return this.data.rows().reduce((sum, row) => sum + (Number(row['distance_km']) || 0), 0);
  }
  get kmRefund(): number {
    return this.data
      .rows()
      .reduce(
        (sum, row) => sum + (Number(row['distance_km']) || 0) * (Number(row['rate_per_km']) || 0),
        0,
      );
  }
  get filteredRows(): DiaryRow[] {
    const today = new Date();
    const todayDate = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    const rows = this.data.rows().filter((row) => {
      const date = String(row['date'] ?? row['start_date'] ?? '').slice(0, 10);
      const category = String(row['record_type'] ?? '');
      if (
        this.sectionId === 'reports' &&
        ['calendar_events', 'medication_doses'].includes(category) &&
        date > todayDate
      ) return false;
      if (this.sectionId === 'health_events' && (!date || date > todayDate)) return false;
      if (
        this.sectionId === 'health_events' &&
        (String(row['category'] ?? '') === 'Appuntamento' ||
          ['Da confermare', 'Saltato'].includes(String(row['status'] ?? '')) ||
          !!row['skipped_reason'] ||
          !!row['recurrence_group_id'])
      )
        return false;
      const categoryLabel =
        (
          {
            medications: 'Farmaci',
            health_events: 'Eventi e sintomi',
            therapies: 'Percorsi terapeutici',
            orthoses: 'Ortesi e ausili',
            documents: 'Documenti',
            expenses: 'Spese e rimborsi',
            calendar_events: 'Appuntamenti',
            medication_doses: 'Somministrazioni',
            child_measurements: 'Misurazioni',
          } as Record<string, string>
        )[category] ?? '';
      return (
        (!this.reportFrom() || date >= this.reportFrom()) &&
        (!this.reportTo() || date <= this.reportTo()) &&
        (!this.reportCategory() || categoryLabel === this.reportCategory())
      );
    });
    const query = normalizeSearch(this.searchQuery().trim());
    const terms = query.split(/\s+/).filter(Boolean);
    const filteredRows = query
      ? rows.filter((row) => {
        const values = Object.entries(row)
          .filter(([key, value]) =>
            !['id', 'user_id', 'child_id', 'created_at', 'updated_at', 'storage_path', 'receipt_path'].includes(key) &&
            (typeof value === 'string' || typeof value === 'number'),
          )
          .map(([, value]) => normalizeSearch(String(value)));
        return terms.every((term) => values.some((value) => fuzzyTermMatch(term, value)));
      })
      : rows;
    return this.sectionId === 'medications' ? this.sortMedicationRows(filteredRows) : filteredRows;
  }
  private sortMedicationRows(rows: DiaryRow[]): DiaryRow[] {
    const today = medicationDateKey(new Date());
    const sortInfo = rows.map((row, index) => {
      const periods = this.medicationSchedulePeriods(row);
      const isCurrent = periods.some((period) =>
        (!period.start_date || period.start_date <= today) &&
        (!period.end_date || period.end_date >= today),
      );
      const upcomingStart = periods
        .map((period) => period.start_date)
        .filter((date): date is string => !!date && date > today)
        .sort()[0];
      const latestEnd = periods
        .map((period) => period.end_date)
        .filter((date): date is string => !!date && date < today)
        .sort()
        .at(-1);
      const latestStart = periods
        .map((period) => period.start_date)
        .filter((date): date is string => !!date && date < today)
        .sort()
        .at(-1);

      return {
        row,
        index,
        group: isCurrent ? 0 : upcomingStart ? 1 : 2,
        date: isCurrent ? '' : upcomingStart ?? latestEnd ?? latestStart ?? '',
      };
    });

    sortInfo.sort((left, right) => {
      if (left.group !== right.group) return left.group - right.group;
      if (left.date !== right.date) {
        return left.group === 1
          ? left.date.localeCompare(right.date)
          : right.date.localeCompare(left.date);
      }
      return left.index - right.index;
    });
    return sortInfo.map(({ row }) => row);
  }
  get invalidReportPeriod(): boolean {
    return !!this.reportFrom() && !!this.reportTo() && this.reportFrom() > this.reportTo();
  }
  get visitSummaryRows(): DiaryRow[] {
    const now = new Date();
    const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    return this.data.rows().filter((row) => {
      const type = String(row['record_type'] ?? '');
      const date = String(row['date'] ?? row['scheduled_date'] ?? row['start_date'] ?? '').slice(0, 10);
      if (['calendar_events', 'medication_doses', 'health_events'].includes(type) && date > today) return false;
      if (type === 'medications') {
        const start = String(row['start_date'] ?? '');
        const end = String(row['end_date'] ?? '');
        return (!this.reportTo() || !start || start <= this.reportTo()) &&
          (!this.reportFrom() || !end || end >= this.reportFrom());
      }
      if (!date) return false;
      const endDate = !this.reportTo() || this.reportTo() > today ? today : this.reportTo();
      return (!this.reportFrom() || date >= this.reportFrom()) && date <= endDate;
    });
  }
  async ngOnInit(): Promise<void> {
    this.routeSubscription = this.route.queryParamMap.subscribe((params) => {
      this.highlightedId.set(params.get('highlight') ?? '');
      const childId = params.get('child') ?? '';
      const childChanged = childId !== this.requestedChildId;
      this.requestedChildId = childId;
      if (
        this.sectionId === 'health_events' &&
        params.get('action') === 'new' &&
        !this.handledNewEventRequest
      ) {
        this.handledNewEventRequest = true;
        this.openNewEventAfterLoad = true;
      }
      if (this.initialized()) {
        const child = childChanged
          ? this.children.find((item) => item.id === this.requestedChildId)
          : undefined;
        if (child) {
          this.selectedChildId.set(child.id);
          this.selectedChildName.set(String(child['name']));
          void this.refresh().then(() => {
            this.scrollToHighlighted();
            this.openHighlightedDetails();
          });
        } else {
          this.scrollToHighlighted();
          this.openHighlightedDetails();
        }
        if (this.openNewEventAfterLoad) this.openRequestedNewEvent();
      }
    });
    await this.auth.ready;
    this.loadedUserId = this.auth.user()?.id ?? null;
    await this.loadChildren();
    await this.refresh();
    this.initialized.set(true);
    this.scrollToHighlighted();
    this.openHighlightedDetails();
    if (this.openNewEventAfterLoad) this.openRequestedNewEvent();
  }
  ngOnDestroy(): void {
    this.routeSubscription?.unsubscribe();
    if (this.documentSearchTimer) clearTimeout(this.documentSearchTimer);
    if (this.isFormOpen()) this.closeForm();
    else this.ui.resetBodyScroll();
    this.clearContactAvatarUrls();
  }
  async refresh(): Promise<void> {
    if (this.sectionId === 'reports') {
      await this.data.loadReport(this.selectedChildId() || undefined);
      return;
    }
    if (this.sectionId !== 'children' && this.selectedChildId()) {
      const client = this.supabase.client;
      if (client && this.auth.user()) {
        this.data.syncing.set(true);
        const dateField: Partial<Record<SectionId, string>> = {
          medications: 'start_date',
          medicine_cabinet: 'expiry_date',
          orthoses: 'start_date',
          health_events: 'date',
          therapies: 'start_date',
          documents: 'date',
          expenses: 'date',
        };
        let query = client.from(this.sectionId).select('*').eq('child_id', this.selectedChildId());
        const field = dateField[this.sectionId];
        if (field) query = query.order(field, { ascending: false, nullsFirst: false });
        const { data, error } = await query;
        if (!error) this.data.rows.set((data ?? []) as DiaryRow[]);
        else this.data.error.set(error.message);
        this.data.syncing.set(false);
        await this.loadContactAvatars();
        return;
      }
      await this.data.load(this.sectionId);
      this.data.rows.set(
        this.data.rows().filter((row) => row['child_id'] === this.selectedChildId()),
      );
      await this.loadContactAvatars();
      return;
    }
    await this.data.load(this.sectionId);
    await this.loadContactAvatars();
  }
  searchDocuments(query: string): void {
    if (this.documentSearchTimer) clearTimeout(this.documentSearchTimer);
    const request = ++this.documentSearchRequest;
    const term = query.trim();
    this.documentSearchResults.set([]);
    if (term.length < 2 || !this.selectedChildId()) {
      this.documentSearchLoading.set(false);
      return;
    }
    this.documentSearchLoading.set(true);
    this.documentSearchTimer = setTimeout(() => {
      void this.data.searchDocuments(this.selectedChildId(), term).then((rows) => {
        if (request !== this.documentSearchRequest) return;
        this.documentSearchResults.set(rows);
        this.documentSearchLoading.set(false);
      });
    }, 250);
  }
  value(row: DiaryRow, key: string): string {
    const value = row[key];
    if (value == null) return '';
    if (key === 'time' && typeof value === 'string') {
      const match = value.match(/^([01]\d|2[0-3]):([0-5]\d)(?::[0-5]\d)?$/);
      if (match) return `${match[1]}:${match[2]}`;
    }
    return String(value);
  }
  documentOcrPreview(row: DiaryRow): string {
    if (this.sectionId !== 'documents') return '';
    const query = normalizeSearch(this.searchQuery().trim());
    const source = String(row['extracted_text'] ?? '');
    if (!query || !source) return '';
    const cached = this.documentSearchPreviewCache.get(row.id);
    if (cached?.query === query && cached.source === source) return cached.preview;

    const terms = query.split(/\s+/).filter(Boolean);
    let match: RegExpExecArray | null = null;
    for (const word of source.matchAll(/[\p{L}\p{N}]+/gu)) {
      const normalizedWord = normalizeSearch(word[0]);
      if (terms.some((term) => fuzzyTermMatch(term, normalizedWord))) {
        match = word;
        break;
      }
    }
    if (!match) {
      this.documentSearchPreviewCache.set(row.id, { query, source, preview: '' });
      return '';
    }

    const start = Math.max(0, (match.index ?? 0) - 70);
    const end = Math.min(source.length, start + 160);
    const preview = `${start > 0 ? '…' : ''}${source.slice(start, end).trim()}${end < source.length ? '…' : ''}`;
    this.documentSearchPreviewCache.set(row.id, { query, source, preview });
    return preview;
  }
  visibleFields(row: DiaryRow): FieldDefinition[] {
    if (this.sectionId === 'reports')
      return (
        [
          { key: 'record_type', label: 'Categoria', kind: 'text' },
          { key: 'notes', label: 'Note', kind: 'text' },
        ] as FieldDefinition[]
      ).filter((field) => row[field.key] != null);
    return this.section.fields.filter(
      (field) =>
        !['file', 'name', 'expiry_precision'].includes(field.key) && field.key !== 'title' && row[field.key] != null,
    );
  }
  visibleCardFields(row: DiaryRow): FieldDefinition[] {
    const fields = this.visibleFields(row);
    if (this.sectionId === 'medicine_cabinet') {
      return fields.filter((field) => !['expiry_date', 'opened_expiry_days'].includes(field.key));
    }
    if (this.sectionId !== 'medications') return fields;
    const summaryFields = new Set([
      'dosage',
      'formulation',
      'spray_count',
      'administration_duration_seconds',
      'start_date',
      'end_date',
      'schedule_times',
      'planned_pause',
    ]);
    return fields.filter((field) => !summaryFields.has(field.key));
  }
  medicationQuickSummary(row: DiaryRow): { status: string; periods: MedicationSchedulePeriod[] } {
    const periods = this.medicationSchedulePeriods(row);
    const today = medicationDateKey(new Date());
    const current = periods.filter((period) =>
      (!period.start_date || period.start_date <= today) &&
      (!period.end_date || period.end_date >= today),
    );
    if (current.length) return { status: 'In corso', periods: current };

    const upcoming = periods
      .filter((period) => !!period.start_date && period.start_date > today)
      .sort((left, right) => String(left.start_date).localeCompare(String(right.start_date)))[0];
    if (upcoming) return { status: 'Prossimo periodo', periods: [upcoming] };

    const last = [...periods].sort((left, right) =>
      String(right.end_date ?? right.start_date ?? '').localeCompare(String(left.end_date ?? left.start_date ?? '')),
    )[0];
    return { status: 'Terapia conclusa', periods: last ? [last] : [] };
  }
  detailFields(row: DiaryRow): FieldDefinition[] {
    const fields = this.visibleFields(row);
    if (this.sectionId === 'medicine_cabinet') {
      const stockFields = new Set([
        'quantity',
        'planned_dosage',
        'price',
        'purchase_date',
        'opened_date',
        'opened_expiry_days',
        'expiry_date',
      ]);
      return fields.filter((field) => !stockFields.has(field.key));
    }
    if (this.sectionId !== 'medications') return fields;
    const regimenFields = new Set([
      'dosage',
      'formulation',
      'spray_count',
      'administration_duration_seconds',
      'start_date',
      'end_date',
      'schedule_times',
      'planned_pause',
    ]);
    return fields.filter((field) => !regimenFields.has(field.key));
  }
  inventoryExpiryLabel(row: DiaryRow): string {
    const medicineExpiry = medicineCabinetExpiry(row);
    const expiry = medicineExpiry.effectiveDate ?? '';
    if (!/^\d{4}-\d{2}-\d{2}$/.test(expiry)) {
      const shelfLifeDays = Number(row['opened_expiry_days']);
      return Number.isSafeInteger(shelfLifeDays) && shelfLifeDays > 0 && !medicineExpiry.afterOpeningDate
        ? 'Da calcolare all’apertura'
        : 'Scadenza non indicata';
    }
    const [year, month, day] = expiry.split('-').map(Number);
    const expiryDay = Date.UTC(year, month - 1, day);
    const now = new Date();
    const today = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
    const remainingDays = Math.floor((expiryDay - today) / 86_400_000);
    if (remainingDays < 0) return 'Scaduto';
    if (remainingDays === 0) return 'Scade oggi';
    if (remainingDays <= 30) return `Scade tra ${remainingDays} giorni`;
    return 'Scadenza oltre 30 giorni';
  }
  inventoryExpiryTone(row: DiaryRow): string {
    const label = this.inventoryExpiryLabel(row);
    if (label === 'Scaduto') return 'bg-rose-100 text-rose-800 dark:bg-rose-900/40 dark:text-rose-200';
    if (label.startsWith('Scade')) return 'bg-amber-100 text-amber-900 dark:bg-amber-900/40 dark:text-amber-200';
    if (label === 'Scadenza oltre 30 giorni') return 'bg-teal-100 text-teal-800 dark:bg-teal-900/40 dark:text-teal-200';
    return 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300';
  }
  medicineCabinetExpiry(row: DiaryRow) {
    return medicineCabinetExpiry(row);
  }
  setField(field: FieldDefinition, value: string): void {
    this.form[field.key] = value;
  }
  contactAvatarInitials(name: string): string {
    return name
      .trim()
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => Array.from(part)[0]?.toLocaleUpperCase('it') ?? '')
      .join('') || '?';
  }
  contactAvatarPreviewSource(): string | null {
    if (this.contactAvatarCleared) return null;
    return this.selectedContactAvatarPreview() ??
      (this.editingId ? this.contactAvatarUrls()[this.editingId] ?? null : null);
  }
  selectContactAvatar(event: Event): void {
    const input = event.target as HTMLInputElement;
    this.setContactAvatarFile(input.files?.[0] ?? null);
    if (this.data.error()) input.value = '';
  }
  async pasteContactAvatar(): Promise<void> {
    this.data.error.set('');
    if (!navigator.clipboard?.read) {
      this.data.error.set('Il browser non consente l’accesso alla clipboard da questo pulsante. Puoi usare Ctrl+V o Cmd+V dopo aver copiato un’immagine.');
      return;
    }
    try {
      const items = await navigator.clipboard.read();
      for (const item of items) {
        const type = item.types.find((candidate) => this.isSupportedContactAvatarType(candidate));
        if (!type) continue;
        const blob = await item.getType(type);
        const extension = type === 'image/jpeg' ? 'jpg' : type.slice('image/'.length);
        this.setContactAvatarFile(new File([blob], `avatar.${extension}`, { type }));
        return;
      }
      this.data.error.set('La clipboard non contiene un’immagine JPEG, PNG o WebP.');
    } catch {
      this.data.error.set('Non è stato possibile leggere la clipboard. Verifica il permesso del browser o usa Ctrl+V/Cmd+V.');
    }
  }
  onContactAvatarPaste(event: ClipboardEvent): void {
    const items = Array.from(event.clipboardData?.items ?? []);
    const image = items.find((item) => item.kind === 'file' && this.isSupportedContactAvatarType(item.type));
    const file = image?.getAsFile();
    if (!file) return;
    event.preventDefault();
    this.setContactAvatarFile(file);
  }
  private isSupportedContactAvatarType(type: string): boolean {
    return ['image/jpeg', 'image/png', 'image/webp'].includes(type.toLocaleLowerCase());
  }
  private setContactAvatarFile(file: File | null): void {
    this.releaseContactAvatarPreview();
    this.contactAvatarFile = null;
    this.data.error.set('');
    if (!file) return;
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 2 * 1024 * 1024) {
      this.data.error.set('Scegli un’immagine JPEG, PNG o WebP fino a 2 MB.');
      return;
    }
    this.contactAvatarFile = file;
    this.contactAvatarCleared = false;
    this.selectedContactAvatarPreview.set(URL.createObjectURL(file));
  }
  clearContactAvatar(): void {
    this.releaseContactAvatarPreview();
    this.contactAvatarFile = null;
    this.contactAvatarCleared = true;
  }
  private releaseContactAvatarPreview(): void {
    const preview = this.selectedContactAvatarPreview();
    if (preview) URL.revokeObjectURL(preview);
    this.selectedContactAvatarPreview.set(null);
  }
  private async loadContactAvatars(): Promise<void> {
    if (this.sectionId !== 'contacts') return;
    const version = ++this.contactAvatarLoadVersion;
    const rows = this.data.rows();
    const loaded = await Promise.all(rows.map(async (row) => {
      const path = String(row['avatar_path'] ?? '');
      return path ? [row.id, await this.storage.loadContactAvatar(path)] as const : [row.id, null] as const;
    }));
    const next: Record<string, string> = {};
    for (const [id, url] of loaded) if (url) next[id] = url;
    if (version !== this.contactAvatarLoadVersion) {
      for (const url of Object.values(next)) URL.revokeObjectURL(url);
      return;
    }
    const previous = this.contactAvatarUrls();
    this.contactAvatarUrls.set(next);
    for (const url of Object.values(previous)) URL.revokeObjectURL(url);
  }
  private clearContactAvatarUrls(): void {
    this.contactAvatarLoadVersion++;
    for (const url of Object.values(this.contactAvatarUrls())) URL.revokeObjectURL(url);
    this.contactAvatarUrls.set({});
  }
  websiteHref(value: unknown): string {
    const raw = String(value ?? '').trim();
    if (!raw) return '';
    const candidate = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
    try {
      const url = new URL(candidate);
      return url.protocol === 'http:' || url.protocol === 'https:' ? url.href : '';
    } catch {
      return '';
    }
  }
  isPdfAttachment(): boolean {
    return !!this.attachedFile &&
      (this.attachedFile.type === 'application/pdf' || this.attachedFile.name.toLowerCase().endsWith('.pdf'));
  }
  isImageAttachment(): boolean {
    return !!this.attachedFile && !this.isPdfAttachment() &&
      (this.attachedFile.type.startsWith('image/') || /\.(?:jpe?g|png|webp|heic)$/i.test(this.attachedFile.name));
  }
  isEditing(): boolean {
    return !!this.editingId;
  }
  hasExistingPdf(): boolean {
    const row = this.editingDocumentRow;
    const isPdf = /\.pdf$/i.test(String(row?.['title'] ?? '')) ||
      /\.pdf$/i.test(String(row?.['storage_path'] ?? '')) ||
      (!!String(row?.['extracted_text'] ?? '').trim() &&
        (typeof row?.['storage_path'] === 'string' || typeof row?.['local_file_id'] === 'string'));
    return !!row && isPdf &&
      (typeof row['storage_path'] === 'string' || typeof row['local_file_id'] === 'string');
  }
  async loadExistingPdf(): Promise<void> {
    const row = this.editingDocumentRow;
    if (!row || !this.hasExistingPdf() || this.loadingExistingPdf()) return;
    this.loadingExistingPdf.set(true);
    this.data.error.set('');
    try {
      let file: File | null = null;
      if (typeof row['storage_path'] === 'string') {
        const blob = await this.storage.downloadDocument(String(row['storage_path']));
        if (blob) file = new File([blob], String(row['title'] || 'documento.pdf'), { type: blob.type });
      } else if (typeof row['local_file_id'] === 'string') {
        file = await this.storage.getLocalFile(String(row['local_file_id']));
      }
      if (!file) {
        this.data.error.set('Non è stato possibile aprire il PDF allegato.');
        return;
      }
      const header = await file.slice(0, 1024).text();
      if (!header.includes('%PDF-')) {
        this.data.error.set('L’allegato non è un PDF e non può essere aperto nell’editor.');
        return;
      }
      if (!/\.pdf$/i.test(file.name))
        file = new File([file], `${file.name}.pdf`, { type: 'application/pdf' });
      this.attachedFile = file;
      this.form['file'] = file.name;
      this.pdfTextForSaving = null;
      this.documentTextProcessing.set(true);
    } catch {
      this.data.error.set('Non è stato possibile aprire il PDF allegato.');
    } finally {
      this.loadingExistingPdf.set(false);
    }
  }
  setFile(field: FieldDefinition, event: Event): void {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (file) {
      this.attachedFile = file;
      this.attachmentModified = true;
      this.pdfTextSeed = '';
      this.form[field.key] = file.name;
      if (this.sectionId === 'documents') {
        this.pdfTextForSaving = null;
        this.form['extracted_text'] = '';
        this.documentTextProcessing.set(this.isPdfAttachment());
      }
    }
  }
  setRedactedFile(file: File): void {
    this.attachedFile = file;
    this.attachmentModified = true;
    this.form['file'] = file.name;
    this.form['extracted_text'] = '';
    this.pdfTextForSaving = null;
    this.documentTextProcessing.set(true);
  }
  setImagePdfFile(file: File): void {
    this.attachedFile = file;
    this.attachmentModified = true;
    this.form['file'] = file.name;
    this.form['extracted_text'] = '';
    this.pdfTextSeed = '';
    this.pdfTextForSaving = null;
    this.documentTextProcessing.set(true);
  }
  setScannedDocument(file: File): void {
    this.setImagePdfFile(file);
    this.documentScannerOpen.set(false);
  }
  setPdfTextForSaving(value: { file: File; text: string }): void {
    if (value.file === this.attachedFile) this.pdfTextForSaving = value;
  }
  setPdfTextProcessing(value: { file: File; processing: boolean }): void {
    if (value.file === this.attachedFile) this.documentTextProcessing.set(value.processing);
  }
  selectChild(name: string): void {
    if (this.documentSearchTimer) clearTimeout(this.documentSearchTimer);
    this.documentSearchRequest++;
    this.documentSearchLoading.set(false);
    const child = this.children.find((item) => item['name'] === name);
    this.selectedChildName.set(name);
    this.selectedChildId.set(child?.id ?? '');
    this.documentSearchResults.set([]);
    this.selectedDocuments.set([]);
    void this.refresh();
    void this.loadMeasurements();
  }
  async loadMeasurements(): Promise<void> {
    const childId = this.selectedChildId();
    if (!childId) { this.measurementRows.set([]); return; }
    this.measurementLoading.set(true);
    this.measurementError.set('');
    const client = this.supabase.client;
    if (client && this.auth.user()) {
      const { data, error } = await client.from('child_measurements').select('*').eq('child_id', childId).order('date', { ascending: true });
      if (error) { this.measurementError.set(error.message); this.measurementRows.set([]); this.measurementLoading.set(false); return; }
      this.measurementRows.set((data ?? []) as DiaryRow[]);
      this.measurementLoading.set(false);
      return;
    }
    this.measurementRows.set(this.data.localMeasurements(childId));
    this.measurementLoading.set(false);
  }
  async saveMeasurement(): Promise<void> {
    const values = Object.fromEntries(Object.entries(this.measurementForm).filter(([key, value]) => key === 'date' || value !== '').map(([key, value]) => [key, key === 'date' ? value : Number(value)]));
    if (Object.keys(values).length < 2) { this.measurementError.set('Inserisci almeno una misura.'); return; }
    this.measurementSaving.set(true);
    const ok = await this.data.saveMeasurement(this.selectedChildId(), values);
    this.measurementSaving.set(false);
    if (ok) { this.measurementError.set(''); this.measurementForm = { date: new Date().toISOString().slice(0, 10) }; await this.loadMeasurements(); }
    else this.measurementError.set(this.data.error() || 'Non è stato possibile salvare la misurazione.');
  }
  measurementTrend(key: string): string {
    const values = this.measurementRows().filter(row => row[key] != null);
    if (values.length < 2) return 'Aggiungi altre rilevazioni per vedere il trend';
    const first = Number(values[0][key]); const last = Number(values.at(-1)?.[key]);
    const delta = last - first;
    return `${delta > 0 ? '+' : ''}${delta.toFixed(1)} rispetto alla prima rilevazione`;
  }
  hasMeasurement(key: string): boolean {
    return this.measurementRows().some((row) => row[key] != null);
  }
  measurementPoints(key: string): string {
    const values = this.measurementRows().filter(row => row[key] != null).map(row => Number(row[key]));
    if (values.length === 1) return `160,45 312,45`;
    const min = Math.min(...values); const max = Math.max(...values); const spread = max - min || 1;
    return values.map((value, index) => `${8 + index * (304 / (values.length - 1))},${80 - ((value - min) / spread) * 64}`).join(' ');
  }
  openForm(): void {
    if (this.documentSearchTimer) clearTimeout(this.documentSearchTimer);
    this.documentSearchRequest++;
    this.documentSearchLoading.set(false);
    this.form = this.sectionId === 'medicine_cabinet' ? { expiry_precision: 'Data completa' } : {};
    this.documentSearchResults.set([]);
    this.selectedDocuments.set([]);
    this.associatedFiles = [];
    this.additionalMedicationSchedules.set([]);
    this.medicationDurationValue.set(null);
    this.medicationDurationUnit.set('Giorni');
    this.attachedFile = null;
    this.attachmentModified = false;
    this.pdfTextSeed = '';
    this.pdfTextForSaving = null;
    this.documentTextProcessing.set(false);
    this.documentScannerOpen.set(false);
    this.clearVoice();
    this.releaseContactAvatarPreview();
    this.contactAvatarFile = null;
    this.contactAvatarCleared = false;
    this.editingId = '';
    this.editingContactRow = null;
    this.editingDocumentRow = null;
    this.medicationScopePrompt.set(false);
    this.isFormOpen.set(true);
    this.ui.setModal(true);
  }
  private openRequestedNewEvent(): void {
    this.openNewEventAfterLoad = false;
    this.openForm();
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { action: null },
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
  }
  openDetailsFromCard(event: MouseEvent, row: DiaryRow): void {
    if ((event.target as HTMLElement).closest('button, a, audio')) return;
    this.openDetails(row);
  }
  openDetailsFromKeyboard(event: KeyboardEvent, row: DiaryRow): void {
    if (event.target !== event.currentTarget || !['Enter', ' '].includes(event.key)) return;
    event.preventDefault();
    this.openDetails(row);
  }
  private openDetails(row: DiaryRow): void {
    this.detailRow.set(row);
    this.detailMedicationDoses.set([]);
    this.medicationDoseLoading.set(false);
    this.spotDoseFormOpen.set(false);
    this.spotDoseError.set('');
    this.spotDoseSaved.set(false);
    if (this.sectionId === 'children') {
      this.selectedChildId.set(row.id);
      this.selectedChildName.set(String(row['name'] ?? ''));
      void this.loadMeasurements();
    }
    this.ui.setModal(true);
    if (['medications', 'orthoses', 'health_events'].includes(this.sectionId) && row['child_id']) {
      void this.data.loadDocumentLinks(this.sectionId as 'medications' | 'orthoses' | 'health_events', row.id, String(row['child_id']))
        .then((ids) => this.data.loadDocumentsByIds(String(row['child_id']), ids))
        .then((docs) => this.detailDocuments.set(docs));
    } else this.detailDocuments.set([]);
    if (this.sectionId === 'medications') void this.loadDetailMedicationDoses(row);
  }
  closeDetails(): void {
    this.detailRow.set(null);
    this.detailDocuments.set([]);
    this.detailMedicationDoses.set([]);
    this.medicationDoseLoading.set(false);
    this.spotDoseFormOpen.set(false);
    this.ui.setModal(false);
  }
  private async loadDetailMedicationDoses(row: DiaryRow): Promise<void> {
    this.medicationDoseLoading.set(true);
    const doses = await this.data.loadMedicationDoses(row.id);
    if (this.detailRow()?.id === row.id) {
      this.detailMedicationDoses.set(doses);
      this.medicationDoseLoading.set(false);
      if (this.data.error()) this.spotDoseError.set('Non è stato possibile caricare lo storico delle somministrazioni spot.');
    }
  }
  openSpotDoseForm(row: DiaryRow): void {
    const now = new Date();
    const date = medicationDateKey(now);
    const time = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    this.spotDoseFormDefault = this.medicationDosageForDate(row, date);
    this.spotDoseForm = { date, time, dosage: this.spotDoseFormDefault };
    this.spotDoseError.set('');
    this.spotDoseSaved.set(false);
    this.spotDoseFormOpen.set(true);
  }
  closeSpotDoseForm(): void {
    this.spotDoseFormOpen.set(false);
    this.spotDoseError.set('');
  }
  spotDoseTime(dose: DiaryRow): string {
    return String(dose['scheduled_time'] ?? '').slice(0, 5);
  }
  async saveSpotDose(row: DiaryRow): Promise<void> {
    if (this.savingSpotDose()) return;
    const date = this.spotDoseForm.date.trim();
    const time = normalizeMedicationTime(this.spotDoseForm.time.trim());
    const dateMatch = date.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!dateMatch || !time) {
      this.spotDoseError.set('Inserisci una data e un’ora valide.');
      return;
    }
    const [year, month, day] = dateMatch.slice(1).map(Number);
    const [hour, minute] = time.split(':').map(Number);
    const takenDate = new Date(year, month - 1, day, hour, minute, 0, 0);
    if (takenDate.getFullYear() !== year || takenDate.getMonth() !== month - 1 || takenDate.getDate() !== day) {
      this.spotDoseError.set('Inserisci una data valida.');
      return;
    }
    if (takenDate.getTime() > Date.now()) {
      this.spotDoseError.set('La data e l’ora della somministrazione non possono essere future.');
      return;
    }
    const childId = String(row['child_id'] ?? '');
    if (!childId) {
      this.spotDoseError.set('Il farmaco non è collegato a un profilo bambino.');
      return;
    }
    this.savingSpotDose.set(true);
    this.spotDoseError.set('');
    const saved = await this.data.recordMedicationSpotDose(
      row.id,
      childId,
      date,
      time,
      takenDate.toISOString(),
      this.spotDoseForm.dosage,
    );
    this.savingSpotDose.set(false);
    if (!saved) {
      this.spotDoseError.set(this.data.error() || 'Non è stato possibile registrare la somministrazione spot.');
      return;
    }
    this.detailMedicationDoses.update((doses) => [saved, ...doses]);
    this.spotDoseFormOpen.set(false);
    this.spotDoseSaved.set(true);
  }
  private medicationDosageForDate(row: DiaryRow, date: string): string {
    const period = this.medicationSchedulePeriods(row).find((item) =>
      (!item.start_date || item.start_date <= date) && (!item.end_date || item.end_date >= date),
    );
    return period?.dosage ?? '';
  }
  editFromDetails(row: DiaryRow): void {
    this.closeDetails();
    this.edit(row);
  }
  async removeFromDetails(row: DiaryRow): Promise<void> {
    this.closeDetails();
    await this.remove(row);
  }
  private openHighlightedDetails(): void {
    const id = this.highlightedId();
    if (!id) return;
    const row = this.data.rows().find((item) => item.id === id);
    if (row) this.openDetails(row);
  }
  edit(row: DiaryRow): void {
    this.form = {};
    this.documentSearchResults.set([]);
    this.medicationScopePrompt.set(false);
    this.medicationDurationValue.set(null);
    this.medicationDurationUnit.set('Giorni');
    this.selectedDocuments.set([]);
    this.documentLinksLoading.set(false);
    this.associatedFiles = [];
    this.attachedFile = null;
    this.attachmentModified = false;
    this.pdfTextSeed = '';
    this.pdfTextForSaving = null;
    this.documentTextProcessing.set(false);
    this.releaseContactAvatarPreview();
    this.contactAvatarFile = null;
    this.contactAvatarCleared = false;
    this.editingDocumentRow = this.sectionId === 'documents' ? row : null;
    for (const field of this.section.fields) {
      const value = row[field.key];
      if (field.key === 'expiry_precision' && this.sectionId === 'medicine_cabinet') {
        this.form[field.key] = value === 'month' ? 'Mese e anno' : 'Data completa';
      } else if (value != null && typeof value !== 'object') this.form[field.key] = String(value);
    }
    if (this.sectionId === 'documents') {
      this.form['extracted_text'] = String(row['extracted_text'] ?? '');
      this.pdfTextSeed = String(row['extracted_text'] ?? '');
    }
    const savedSchedules = this.medicationSchedulePeriods(row);
    if (this.sectionId === 'medications' && Array.isArray(row['schedule_periods']) && savedSchedules.length) {
      const first = savedSchedules[0];
      for (const key of [
        'start_date',
        'end_date',
        'start_time',
        'end_time',
        'dosage',
        'formulation',
        'spray_count',
        'administration_duration_seconds',
        'schedule_times',
        'planned_pause',
      ] as const) {
        const value = first[key];
        this.form[key] = value == null ? '' : String(value);
      }
      this.additionalMedicationSchedules.set(savedSchedules.slice(1).map((period) => ({
        start_date: period.start_date ?? '',
        end_date: period.end_date ?? '',
        start_time: period.start_time ?? '',
        end_time: period.end_time ?? '',
        dosage: period.dosage,
        formulation: period.formulation ?? '',
        spray_count: period.spray_count == null ? '' : String(period.spray_count),
        administration_duration_seconds: period.administration_duration_seconds == null ? '' : String(period.administration_duration_seconds),
        schedule_times: period.schedule_times ?? '',
        planned_pause: period.planned_pause ?? '',
      })));
    } else this.additionalMedicationSchedules.set([]);
    this.editingId = row.id;
    this.editingContactRow = this.sectionId === 'contacts' ? row : null;
    if (['medications', 'orthoses', 'health_events'].includes(this.sectionId) && row['child_id']) {
      this.documentLinksLoading.set(true);
      void this.data
        .loadDocumentLinks(this.sectionId as 'medications' | 'orthoses' | 'health_events', row.id, String(row['child_id']))
        .then((ids) => this.data.loadDocumentsByIds(String(row['child_id']), ids))
        .then((docs) => this.selectedDocuments.set(docs))
        .finally(() => this.documentLinksLoading.set(false));
    }
    this.isFormOpen.set(true);
    this.ui.setModal(true);
    if (this.sectionId === 'documents' && this.hasExistingPdf()) void this.loadExistingPdf();
  }
  closeForm(): void {
    if (this.documentSearchTimer) clearTimeout(this.documentSearchTimer);
    this.documentSearchRequest++;
    this.documentSearchLoading.set(false);
    this.stopRecording();
    this.documentScannerOpen.set(false);
    this.clearVoice();
    this.attachedFile = null;
    this.attachmentModified = false;
    this.pdfTextSeed = '';
    this.associatedFiles = [];
    this.pdfTextForSaving = null;
    this.documentTextProcessing.set(false);
    this.loadingExistingPdf.set(false);
    this.editingDocumentRow = null;
    this.editingContactRow = null;
    this.contactAvatarFile = null;
    this.contactAvatarCleared = false;
    this.releaseContactAvatarPreview();
    this.medicationScopePrompt.set(false);
    this.isFormOpen.set(false);
    this.ui.setModal(false);
  }
  async toggleRecording(): Promise<void> {
    if (this.recording()) {
      this.stopRecording();
      return;
    }
    try {
      this.mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const chunks: BlobPart[] = [];
      this.recorder = new MediaRecorder(this.mediaStream);
      this.recorder.ondataavailable = (event) => {
        if (event.data.size) chunks.push(event.data);
      };
      this.recorder.onstop = () => {
        if (chunks.length) {
          this.recordedVoice = new Blob(chunks, { type: this.recorder?.mimeType || 'audio/webm' });
          this.recordedVoiceUrl = URL.createObjectURL(this.recordedVoice);
        }
        this.mediaStream?.getTracks().forEach((track) => track.stop());
        this.mediaStream = undefined;
        this.stopSpectrum();
        this.recording.set(false);
      };
      this.audioContext = new AudioContext();
      this.analyser = this.audioContext.createAnalyser();
      this.analyser.fftSize = 64;
      this.audioContext.createMediaStreamSource(this.mediaStream).connect(this.analyser);
      this.recorder.start();
      this.recording.set(true);
      this.updateSpectrum();
    } catch {
      this.stopSpectrum();
      this.mediaStream?.getTracks().forEach((track) => track.stop());
      this.mediaStream = undefined;
      this.data.error.set('Impossibile accedere al microfono. Controlla i permessi del browser.');
    }
  }
  private updateSpectrum(): void {
    const analyser = this.analyser;
    if (!analyser) return;
    const values = new Uint8Array(analyser.frequencyBinCount);
    analyser.getByteFrequencyData(values);
    this.audioSpectrum.set(
      Array.from(values, (value) => Math.max(4, Math.round((value / 255) * 96))),
    );
    this.spectrumFrame = requestAnimationFrame(() => this.updateSpectrum());
  }
  private stopSpectrum(): void {
    cancelAnimationFrame(this.spectrumFrame);
    this.spectrumFrame = 0;
    this.analyser?.disconnect();
    this.analyser = undefined;
    if (this.audioContext && this.audioContext.state !== 'closed') void this.audioContext.close();
    this.audioContext = undefined;
    this.audioSpectrum.set(Array.from({ length: 28 }, () => 4));
  }
  private stopRecording(): void {
    if (this.recorder && this.recorder.state !== 'inactive') this.recorder.stop();
    else {
      this.mediaStream?.getTracks().forEach((track) => track.stop());
      this.stopSpectrum();
      this.recording.set(false);
    }
  }
  clearVoice(): void {
    this.stopRecording();
    if (this.recordedVoiceUrl) URL.revokeObjectURL(this.recordedVoiceUrl);
    this.recordedVoice = null;
    this.recordedVoiceUrl = '';
  }
  private buildMedicationSchedules(
    initial: Record<string, unknown>,
  ): MedicationSchedulePeriod[] | null {
    const drafts = this.medicationScheduleDrafts(initial);
    const hasChanges = drafts.length > 1;
    for (const [index, period] of drafts.entries()) {
      const rangeMessage = this.medicationScheduleRangeMessage(index, drafts);
      if (rangeMessage) {
        this.data.error.set(`Periodo ${index + 1}: ${rangeMessage}`);
        return null;
      }
      if (hasChanges && !period.dosage.trim()) {
        this.data.error.set(`Inserisci il dosaggio del periodo ${index + 1}.`);
        return null;
      }
    }
    const output: MedicationSchedulePeriod[] = [];
    for (const [index, period] of drafts.entries()) {
      const formulation = period.formulation.trim();
      const usesSpray = ['spray', 'aerosol'].includes(formulation.toLocaleLowerCase());
      const parsePositiveInteger = (raw: string, label: string): number | null | false => {
        if (!usesSpray || !raw.trim()) return null;
        const value = Number(raw);
        if (!Number.isInteger(value) || value < 1) {
          this.data.error.set(`Inserisci un valore intero maggiore di zero per ${label} nel periodo ${index + 1}.`);
          return false;
        }
        return value;
      };
      const sprayCount = parsePositiveInteger(period.spray_count, 'puff o spruzzi');
      const duration = parsePositiveInteger(period.administration_duration_seconds, 'durata');
      if (sprayCount === false || duration === false) return null;
      output.push({
        start_date: period.start_date || null,
        end_date: period.end_date || null,
        start_time: period.start_time || null,
        end_time: period.end_time || null,
        dosage: period.dosage.trim(),
        formulation: formulation || null,
        spray_count: sprayCount,
        administration_duration_seconds: duration,
        schedule_times: period.schedule_times.trim() || null,
        planned_pause: period.planned_pause.trim() || null,
      });
    }
    return output;
  }
  private historicalMedicationDoses(
    periods: MedicationSchedulePeriod[],
  ): HistoricalMedicationDose[] {
    const now = new Date();
    const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    const doses: HistoricalMedicationDose[] = [];
    for (const period of periods) {
      const start = String(period.start_date ?? '').slice(0, 10);
      const end = String(period.end_date ?? '').slice(0, 10);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(start) || start >= today) continue;
      const lastDate = end && end < today ? end : medicationDateKey(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1));
      if (lastDate < start) continue;
      const slots = String(period.schedule_times ?? '').split(',').flatMap((entry) => {
        const match = entry.trim().match(/^(\d{1,2}:\d{2})(?:\s*[-–]\s*(\d{1,2}:\d{2}))?$/);
        if (!match) return [];
        const startTime = normalizeMedicationTime(match[1]);
        const endTime = match[2] ? normalizeMedicationTime(match[2]) : null;
        if (!startTime || (match[2] && !endTime) || (endTime && endTime < startTime)) return [];
        const scheduledTime = startTime;
        let actualTime = startTime;
        if (endTime) {
          const toMinutes = (value: string) => {
            const [hour, minute] = value.split(':').map(Number);
            return hour * 60 + minute;
          };
          const midpoint = Math.floor((toMinutes(startTime) + toMinutes(endTime)) / 2);
          actualTime = `${String(Math.floor(midpoint / 60)).padStart(2, '0')}:${String(midpoint % 60).padStart(2, '0')}`;
        }
        return [{ scheduledTime, actualTime }];
      });
      if (!slots.length) continue;
      const firstDayStartTime = period.start_time ? normalizeMedicationTime(period.start_time) : null;
      const lastDayEndTime = period.end_time ? normalizeMedicationTime(period.end_time) : null;
      const [year, month, day] = start.split('-').map(Number);
      const cursor = new Date(year, month - 1, day);
      while (medicationDateKey(cursor) <= lastDate) {
        const scheduledDate = medicationDateKey(cursor);
        for (const slot of slots) {
          if (scheduledDate === start && firstDayStartTime && slot.scheduledTime < firstDayStartTime) continue;
          if (scheduledDate === end && lastDayEndTime && slot.scheduledTime > lastDayEndTime) continue;
          const [hour, minute] = slot.actualTime.split(':').map(Number);
          const takenAt = new Date(cursor.getFullYear(), cursor.getMonth(), cursor.getDate(), hour, minute).toISOString();
          doses.push({ scheduledDate, scheduledTime: slot.scheduledTime, takenAt });
        }
        cursor.setDate(cursor.getDate() + 1);
      }
    }
    return doses;
  }
  async save(medicationScope?: MedicationScheduleScope): Promise<void> {
    if (this.documentLinksLoading()) return;
    if (this.sectionId === 'contacts') {
      const requiredContactFields = this.section.fields.filter((field) => field.required);
      for (const field of requiredContactFields) {
        if (!String(this.form[field.key] ?? '').trim()) {
          const message = field.key === 'category'
            ? 'Seleziona una categoria per il contatto prima di salvarlo.'
            : `Inserisci ${field.key === 'name' ? 'il nome' : 'la professione o il ruolo'} del contatto prima di salvarlo.`;
          this.data.error.set(message);
          return;
        }
      }
    }
    if (this.sectionId === 'documents' && this.documentTextProcessing()) {
      this.data.error.set('Attendi che la lettura del PDF sia completata prima di salvare.');
      return;
    }
    this.saving.set(true);
    const value: Record<string, unknown> = { ...this.form };
    this.data.error.set('');
    if (this.sectionId === 'contacts') {
      for (const key of ['name', 'role', 'category']) {
        value[key] = String(value[key] ?? '').trim();
      }
    }
    if (this.sectionId === 'medicine_cabinet') {
      const monthOnly = value['expiry_precision'] === 'Mese e anno';
      value['expiry_precision'] = monthOnly ? 'month' : 'day';
      const expiry = String(value['expiry_date'] ?? '').slice(0, 10);
      if (monthOnly && /^\d{4}-\d{2}-\d{2}$/.test(expiry)) {
        const [year, month] = expiry.split('-').map(Number);
        value['expiry_date'] = `${year}-${String(month).padStart(2, '0')}-${String(new Date(year, month, 0).getDate()).padStart(2, '0')}`;
      }
      const shelfLifeDays = value['opened_expiry_days'] === '' || value['opened_expiry_days'] == null
        ? null
        : Number(value['opened_expiry_days']);
      if (shelfLifeDays !== null && (!Number.isInteger(shelfLifeDays) || shelfLifeDays < 1)) {
        this.data.error.set('Inserisci un numero intero maggiore di zero per i giorni di validità dopo l’apertura.');
        this.saving.set(false);
        return;
      }
      value['opened_expiry_days'] = shelfLifeDays;
    }
    if (this.sectionId === 'medications') {
      const schedules = this.buildMedicationSchedules(value);
      if (!schedules) {
        this.saving.set(false);
        return;
      }
      delete value['start_time'];
      delete value['end_time'];
      const editingRow = this.editingId
        ? this.data.rows().find((row) => row.id === this.editingId)
        : undefined;
      if (editingRow) {
        const existingSchedules = this.medicationSchedulePeriods(editingRow);
        if (!sameMedicationPeriods(existingSchedules, schedules) && !medicationScope) {
          this.medicationScopePrompt.set(true);
          this.saving.set(false);
          return;
        }
        if (medicationScope) {
          const today = medicationDateKey(new Date());
          const scopedSchedules = applyMedicationScheduleScope(
            existingSchedules,
            schedules,
            medicationScope,
            today,
          );
          value['schedule_periods'] = scopedSchedules;
          const firstSchedule = scopedSchedules[0];
          if (firstSchedule) {
            value['start_date'] = firstSchedule.start_date;
            value['end_date'] = firstSchedule.end_date;
            value['dosage'] = firstSchedule.dosage;
            value['formulation'] = firstSchedule.formulation;
            value['spray_count'] = firstSchedule.spray_count;
            value['administration_duration_seconds'] = firstSchedule.administration_duration_seconds;
            value['schedule_times'] = firstSchedule.schedule_times;
            value['planned_pause'] = firstSchedule.planned_pause;
          }
        } else value['schedule_periods'] = schedules;
      } else value['schedule_periods'] = schedules;
      if (!medicationScope || medicationScope === 'all') value['end_date'] = value['end_date'] || null;
      this.medicationScopePrompt.set(false);
    }
    if (this.recording()) {
      const recorder = this.recorder;
      this.stopRecording();
      if (recorder)
        await new Promise<void>((resolve) =>
          recorder.addEventListener('stop', () => resolve(), { once: true }),
        );
    }
    if (this.recordedVoice) {
      if (
        this.sectionId !== 'children' &&
        this.selectedChildId() &&
        this.supabase.configured &&
        this.auth.user()
      ) {
        const path = await this.storage.uploadVoice(
          new File([this.recordedVoice], 'nota-vocale.webm', { type: this.recordedVoice.type }),
          this.selectedChildId(),
        );
        if (!path) {
          this.data.error.set('Non è stato possibile caricare la nota vocale.');
          this.saving.set(false);
          return;
        }
        value['voice_note_path'] = path;
      } else value['voice_note_data'] = await this.blobDataUrl(this.recordedVoice);
    }
    for (const key of ['amount', 'distance_km', 'rate_per_km', 'price']) {
      if (value[key] === '' && key === 'price') value[key] = null;
      else if (value[key] !== '' && value[key] != null) value[key] = Number(value[key]);
    }
    if (this.sectionId === 'medications') {
      const sprayFormulation = ['spray', 'aerosol'].includes(
        String(value['formulation'] ?? '').toLocaleLowerCase(),
      );
      for (const key of ['spray_count', 'administration_duration_seconds']) {
        if (!sprayFormulation || value[key] === '' || value[key] == null) value[key] = null;
        else {
          const number = Number(value[key]);
          if (!Number.isInteger(number) || number < 1) {
            this.data.error.set('Inserisci un numero intero maggiore di zero per puff e durata.');
            this.saving.set(false);
            return;
          }
          value[key] = number;
        }
      }
    }
    if (this.sectionId === 'children' && this.auth.user()) value['user_id'] = this.auth.user()!.id;
    if (
      this.sectionId === 'documents' &&
      this.attachedFile &&
      (this.attachedFile.type === 'application/pdf' ||
        this.attachedFile.name.toLowerCase().endsWith('.pdf'))
    ) {
      this.extracting.set(true);
      try {
        value['extracted_text'] = this.pdfTextForSaving?.file === this.attachedFile
          ? this.pdfTextForSaving.text
          : await this.extractPdfText(this.attachedFile);
        if (!String(value['extracted_text'] ?? '').trim())
          this.data.error.set(
            'Il documento sarà salvato senza testo ricercabile. Puoi scriverlo nel riquadro prima di salvare.',
          );
      } catch {
        value['extracted_text'] = '';
        this.data.error.set(
          'Non è stato possibile estrarre il testo dal PDF; il documento verrà comunque salvato.',
        );
      } finally {
        this.extracting.set(false);
      }
    }
    let replacementLocalFileId = '';
    let replacementStoragePath = '';
    if (this.attachedFile && this.attachmentModified && this.sectionId === 'documents') {
      const childId = this.selectedChildId() || String(this.editingDocumentRow?.['child_id'] ?? '');
      if (this.supabase.configured && this.auth.user() && childId) {
        const path = await this.storage.upload(this.attachedFile, childId);
        if (path) {
          replacementStoragePath = path;
          value['storage_path'] = path;
          delete value['local_file_id'];
        }
      } else {
        try {
          replacementLocalFileId = await this.storage.saveLocalFile(this.attachedFile);
          value['local_file_id'] = replacementLocalFileId;
          delete value['storage_path'];
        } catch {
          this.data.error.set('Il browser non ha potuto conservare localmente il PDF modificato.');
          this.saving.set(false);
          return;
        }
      }
      if (!replacementStoragePath && this.supabase.configured && this.auth.user()) {
        this.data.error.set(
          'Upload non autorizzato. Applica le migrazioni Storage aggiornate su Supabase e riprova.',
        );
        this.saving.set(false);
        return;
      }
    } else if (this.attachedFile && this.sectionId === 'expenses' && this.selectedChildId()) {
      const path = await this.storage.upload(this.attachedFile, this.selectedChildId());
      if (path) value['receipt_path'] = path;
      else if (this.supabase.configured && this.auth.user()) {
        this.data.error.set(
          'Upload non autorizzato. Applica le migrazioni Storage aggiornate su Supabase e riprova.',
        );
        this.saving.set(false);
        return;
      }
    }
    if (
      this.sectionId === 'documents' &&
      (value['storage_path'] || value['local_file_id'] || this.editingDocumentRow?.['storage_path'] || this.editingDocumentRow?.['local_file_id'])
    ) delete value['file'];
    if (this.sectionId === 'expenses' && value['receipt_path']) delete value['receipt'];
    const targetId = this.editingId || crypto.randomUUID();
    const targetChildId = this.selectedChildId();
    let uploadedContactAvatarPath = '';
    const previousContactAvatarPath = String(this.editingContactRow?.['avatar_path'] ?? '');
    let nextContactAvatarPath = previousContactAvatarPath;
    if (this.sectionId === 'contacts') {
      if (!targetChildId) {
        this.data.error.set('Seleziona il profilo del bambino a cui associare il contatto.');
        this.saving.set(false);
        return;
      }
      if (this.contactAvatarCleared) nextContactAvatarPath = '';
      else if (this.contactAvatarFile) {
        const path = await this.storage.saveContactAvatar(this.contactAvatarFile, targetChildId, targetId);
        if (!path) {
          this.data.error.set(this.supabase.configured && this.auth.user()
            ? 'Non è stato possibile caricare la foto. Verifica le migrazioni Storage e riprova.'
            : 'Il browser non ha potuto conservare localmente la foto. Riprova.');
          this.saving.set(false);
          return;
        }
        uploadedContactAvatarPath = path;
        nextContactAvatarPath = path;
      }
      value['avatar_path'] = nextContactAvatarPath || null;
    }
    const shouldBackfillMedicationDoses = this.sectionId === 'medications' &&
      (!this.editingId || this.pendingHistoricalDoseMedicationId === targetId);
    let ok = this.editingId
      ? await this.data.update(this.sectionId, this.editingId, value)
      : !!(await this.data.saveWithId(
        this.sectionId,
        { ...value, id: targetId },
        this.sectionId === 'children' ? undefined : targetChildId || undefined,
      ));
    if (ok && !this.editingId && ['medications', 'orthoses', 'health_events'].includes(this.sectionId))
      this.editingId = targetId;
    if (ok && shouldBackfillMedicationDoses && targetChildId) {
      this.pendingHistoricalDoseMedicationId = targetId;
      const doses = this.historicalMedicationDoses(
        (value['schedule_periods'] as MedicationSchedulePeriod[] | undefined) ?? [],
      );
      ok = await this.data.markMedicationDosesTaken(targetId, targetChildId, doses);
      if (ok) this.pendingHistoricalDoseMedicationId = '';
    }
    if (!ok && replacementStoragePath) await this.storage.removeDocument(replacementStoragePath);
    if (!ok && replacementLocalFileId) {
      try {
        await this.storage.removeLocalFile(replacementLocalFileId);
      } catch {
        // The failed update must not replace the existing attachment.
      }
    }
    if (!ok && uploadedContactAvatarPath) await this.storage.removeContactAvatar(uploadedContactAvatarPath);
    if (ok && this.sectionId === 'documents' && this.editingDocumentRow && this.attachedFile && this.attachmentModified) {
      const oldStoragePath = this.editingDocumentRow['storage_path'];
      const oldLocalFileId = this.editingDocumentRow['local_file_id'];
      if (typeof oldStoragePath === 'string' && oldStoragePath !== replacementStoragePath) {
        if (!(await this.storage.removeDocument(oldStoragePath)))
          this.data.error.set('PDF aggiornato, ma non è stato possibile eliminare la copia precedente dal deposito.');
      }
      if (typeof oldLocalFileId === 'string' && oldLocalFileId !== replacementLocalFileId) {
        try {
          await this.storage.removeLocalFile(oldLocalFileId);
        } catch {
          this.data.error.set('PDF aggiornato, ma non è stato possibile eliminare la copia precedente dal browser.');
        }
      }
    }
    if (ok && ['medications', 'orthoses', 'health_events'].includes(this.sectionId) && targetChildId) {
      const documentIds = this.selectedDocuments().map((doc) => doc.id);
      for (const file of this.associatedFiles) {
        const documentId = crypto.randomUUID();
        const storagePath = await this.storage.upload(file, targetChildId);
        if (!storagePath && this.supabase.configured && this.auth.user()) {
          this.data.error.set('Non è stato possibile caricare uno dei documenti allegati.');
          ok = false;
          break;
        }
        let localFileId = '';
        if (!storagePath) {
          try {
            localFileId = await this.storage.saveLocalFile(file);
          } catch {
            this.data.error.set('Il browser non ha potuto conservare localmente il file allegato.');
            ok = false;
            break;
          }
        }
        const savedId = await this.data.saveWithId('documents', {
          id: documentId,
          title: file.name,
          category: 'Altro',
          date: new Date().toISOString().slice(0, 10),
          ...(storagePath ? { storage_path: storagePath } : { local_file_id: localFileId }),
        }, targetChildId);
        if (!savedId) {
          ok = false;
          break;
        }
        documentIds.push(savedId);
        this.selectedDocuments.update((docs) => [...docs, {
          id: savedId,
          child_id: targetChildId,
          title: file.name,
          category: 'Altro',
          date: new Date().toISOString().slice(0, 10),
        } as DiaryRow]);
        this.associatedFiles = this.associatedFiles.filter((pending) => pending !== file);
      }
      if (ok) ok = await this.data.setDocumentLinks(
        this.sectionId as 'medications' | 'orthoses' | 'health_events', targetId, targetChildId, documentIds,
      );
      await this.refresh();
    }
    if (ok && this.sectionId === 'contacts') {
      if (previousContactAvatarPath && previousContactAvatarPath !== nextContactAvatarPath)
        await this.storage.removeContactAvatar(previousContactAvatarPath);
      await this.refresh();
    }
    this.saving.set(false);
    if (ok) this.closeForm();
  }
  private blobDataUrl(blob: Blob): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(blob);
    });
  }
  private async extractPdfText(file: File): Promise<string> {
    GlobalWorkerOptions.workerSrc = new URL(
      'assets/pdfjs/pdf.worker.min.mjs',
      document.baseURI,
    ).toString();
    const pdf = await getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
    const pages: string[] = [];
    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber++) {
      const page = await pdf.getPage(pageNumber);
      const content = await page.getTextContent();
      pages.push(
        content.items
          .map((item) => ('str' in item ? item.str : ''))
          .filter(Boolean)
          .join(' '),
      );
    }
    await pdf.destroy();
    return pages
      .join('\n')
      .replace(/[ \t]+/g, ' ')
      .trim();
  }
  async remove(row: DiaryRow): Promise<void> {
    if (await this.confirmation.confirm('Vuoi eliminare questa voce dal diario?', {
      title: 'Elimina voce',
      confirmLabel: 'Elimina',
    })) {
      this.data.error.set('');
      if (this.sectionId === 'documents' && typeof row['storage_path'] === 'string') {
        const removed = await this.storage.removeDocument(String(row['storage_path']));
        if (!removed) {
          this.data.error.set('Non è stato possibile eliminare il file dal deposito. Il documento è rimasto nel diario.');
          return;
        }
      }
      await this.data.remove(this.sectionId, row);
      if (this.sectionId === 'documents' && row['local_file_id'] && !this.data.error())
        await this.storage.removeLocalFile(String(row['local_file_id']));
      if (this.sectionId === 'contacts' && !this.data.error()) {
        const avatarPath = String(row['avatar_path'] ?? '');
        if (avatarPath && !(await this.storage.removeContactAvatar(avatarPath)))
          this.data.error.set('Contatto eliminato, ma non è stato possibile rimuovere la foto dal deposito.');
        await this.refresh();
      }
    }
  }
  async shareContact(row: DiaryRow): Promise<void> {
    const lines = [
      row['name'],
      row['role'],
      row['category'],
      row['facility'],
      row['phone'],
      row['email'],
    ]
      .filter((value) => value != null && String(value).trim())
      .map((value) => String(value).trim());
    const text = lines.join('\n');
    try {
      if (navigator.share) {
        await navigator.share({ title: String(row['name'] || 'Contatto'), text });
        this.showShareNotice(row.id, 'Contatto condiviso.');
      } else if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
        this.showShareNotice(row.id, 'Contatto copiato negli appunti.');
      } else {
        this.showShareNotice(row.id, 'La condivisione non è disponibile in questo browser.');
      }
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') return;
      this.showShareNotice(row.id, 'Non è stato possibile condividere il contatto.');
    }
  }
  private showShareNotice(id: string, message: string): void {
    this.shareNoticeId.set(id);
    this.shareNotice.set(message);
  }
  openReportPreview(): void {
    if (!this.selectedChildId() || this.invalidReportPeriod) return;
    this.reportPreviewOpen.set(true);
    requestAnimationFrame(() =>
      this.host.nativeElement
        .querySelector('#visit-report-preview')
        ?.scrollIntoView({ behavior: 'smooth', block: 'start' }),
    );
  }
  closeReportPreview(): void {
    this.reportPreviewOpen.set(false);
  }
  onReportTabKeydown(event: KeyboardEvent, groupKey: string): void {
    const groups = this.visitSummaryDocument().groups;
    const currentIndex = groups.findIndex((group) => group.key === groupKey);
    if (currentIndex < 0 || !groups.length) return;

    let nextIndex: number;
    switch (event.key) {
      case 'ArrowRight':
        nextIndex = (currentIndex + 1) % groups.length;
        break;
      case 'ArrowLeft':
        nextIndex = (currentIndex - 1 + groups.length) % groups.length;
        break;
      case 'Home':
        nextIndex = 0;
        break;
      case 'End':
        nextIndex = groups.length - 1;
        break;
      default:
        return;
    }

    event.preventDefault();
    const nextGroup = groups[nextIndex];
    this.reportCategoryTab.set(nextGroup.key);
    requestAnimationFrame(() => {
      const tab = this.host.nativeElement.querySelector(
        `[data-report-tab="${nextGroup.key}"]`,
      ) as HTMLButtonElement | null;
      tab?.focus();
    });
  }
  exportVisitSummary(): void {
    if (!this.selectedChildId() || this.invalidReportPeriod) return;
    this.pdf.exportVisitSummary(this.visitSummaryDocument());
  }
  async exportData(format: 'json' | 'markdown' | 'doc'): Promise<void> {
    this.exporting.set(true);
    this.data.error.set('');
    try {
      await this.dataExport.export(format);
    } catch (error) {
      this.data.error.set(
        error instanceof Error ? error.message : 'Esportazione non riuscita. Riprova.',
      );
    } finally {
      this.exporting.set(false);
    }
  }
  async openVoice(row: DiaryRow): Promise<void> {
    const url = await this.storage.signedUrl(String(row['voice_note_path']));
    if (url) window.open(url, '_blank', 'noopener');
    else this.data.error.set('Impossibile aprire la nota vocale.');
  }
  async openDocument(row: DiaryRow): Promise<void> {
    if (typeof row['local_file_id'] === 'string') {
      if (!(await this.storage.openLocalFile(String(row['local_file_id']))))
        this.data.error.set('Il file locale non è più disponibile in questo browser.');
      return;
    }
    if (typeof row['file_data'] === 'string') {
      window.open(String(row['file_data']), '_blank', 'noopener');
      return;
    }
    const path = row['storage_path'] ?? row['receipt_path'];
    const url = await this.storage.signedUrl(String(path));
    if (url) window.open(url, '_blank', 'noopener');
    else this.data.error.set('Impossibile aprire il file. Accedi al tuo account e riprova.');
  }
  private async loadChildren(): Promise<void> {
    this.children.splice(0);
    if (this.sectionId === 'children') return;
    const client = this.supabase.client;
    if (client && this.auth.user()) {
      const { data } = await client.from('children').select('id,name').order('name');
      this.children.push(...((data ?? []) as DiaryRow[]));
    } else {
      const stored = JSON.parse(localStorage.getItem('trialcare-diary-v1') ?? '{}') as Record<
        string,
        DiaryRow[]
      >;
      this.children.push(...(stored['children'] ?? []));
    }
    const selected =
      this.children.find((item) => item.id === this.requestedChildId) ?? this.children[0];
    if (selected) {
      this.selectedChildId.set(selected.id);
      this.selectedChildName.set(String(selected['name']));
    } else {
      this.selectedChildId.set('');
      this.selectedChildName.set('');
    }
  }
  private scrollToHighlighted(): void {
    const id = this.highlightedId();
    if (!id) return;
    requestAnimationFrame(() => {
      const element = document.getElementById(`diary-row-${id}`);
      element?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      element?.focus({ preventScroll: true });
    });
  }
  private async reloadForAccount(): Promise<void> {
    await this.loadChildren();
    await this.refresh();
    if (this.sectionId === 'children') { const first = this.children[0]; if (first) { this.selectedChildId.set(first.id); this.selectedChildName.set(String(first['name'])); await this.loadMeasurements(); } }
  }
}
