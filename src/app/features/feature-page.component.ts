import { CommonModule } from '@angular/common';
import { Component, Input, OnDestroy, OnInit, effect, inject, signal } from '@angular/core';
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
import { GlobalWorkerOptions, getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { AppDropdownComponent } from '../shared/app-dropdown.component';
import { AppDatepickerComponent } from '../shared/app-datepicker.component';
import { AppTimepickerComponent } from '../shared/app-timepicker.component';
import { AppAutocompleteComponent } from '../shared/app-autocomplete.component';
import { DocumentAssociationPickerComponent } from '../shared/document-association-picker.component';
import { TooltipDirective } from '../shared/directives/tooltip.directive';
import {
  DiaryRow,
  FieldDefinition,
  MedicationSchedulePeriod,
  SectionDefinition,
  SectionId,
  sectionById,
} from '../models/diary.models';

interface MedicationScheduleDraft {
  start_date: string;
  end_date: string;
  dosage: string;
  formulation: string;
  spray_count: string;
  administration_duration_seconds: string;
  schedule_times: string;
  planned_pause: string;
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
    TooltipDirective,
    PdfRedactionComponent,
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
                  Esporta le voci della sezione corrente in un PDF pronto per la visita.
                </p>
              </div>
              <button type="button" class="button-primary" (click)="exportReport()">
                Scarica PDF
              </button>
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
                  @for (field of visibleFields(row); track field.key) {
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
                        } @else {
                          {{ value(row, field.key) }}
                        }
                      </span>
                    }
                  }
                </div>
                @if (section.id === 'medications' && medicationSchedulePeriods(row).length > 1) {
                  <p class="mt-2 text-xs font-medium text-teal-700 dark:text-teal-300">
                    {{ medicationSchedulePeriods(row).length }} periodi di terapia
                  </p>
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
            [class.pdf-preview-modal]="section.id === 'documents' && isPdfAttachment()"
            (click)="$event.stopPropagation()"
          >
            <header
              class="flex items-start justify-between border-b border-slate-100 px-5 py-4 dark:border-slate-800"
            >
              <div>
                <p class="eyebrow">NUOVA REGISTRAZIONE</p>
                <h2 id="dialog-title" class="text-xl font-semibold">
                  {{
                    section.id === 'children'
                      ? 'Profilo bambino'
                      : section.id === 'contacts'
                        ? 'Nuovo contatto'
                        : 'Aggiungi una voce'
                  }}
                </h2>
              </div>
              <button type="button" class="icon-button" aria-label="Chiudi" (click)="closeForm()">
                ×
              </button>
            </header>
            <form class="space-y-4 overflow-y-auto px-5 py-5" (ngSubmit)="save()">
              @if (data.error()) {
                <p class="notice-error" role="alert">{{ data.error() }}</p>
              }
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
              }
              @if (section.id === 'medications') {
                <div class="rounded-2xl border border-teal-100 bg-teal-50/70 p-3 text-xs leading-5 text-slate-600 dark:border-teal-900/60 dark:bg-teal-950/20 dark:text-slate-300 sm:p-4">
                  <strong class="block text-sm text-teal-900 dark:text-teal-200">Regime iniziale</strong>
                  <span>Inserisci qui il primo dosaggio. Potrai aggiungere variazioni con date e orari diversi mantenendo lo storico nella stessa terapia.</span>
                </div>
              }
              <div class="grid gap-4 sm:grid-cols-2">
                @for (field of section.fields; track field.key) {
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
                            type="text"
                            [name]="field.key"
                            [(ngModel)]="form[field.key]"
                            [required]="field.required ?? false"
                            [placeholder]="field.placeholder ?? ''"
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
                        @if (section.id === 'documents' && isPdfAttachment()) {
                          <tc-pdf-redaction
                            [file]="attachedFile!"
                            [initialTerms]="selectedChildName()"
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
                          [step]="['spray_count', 'administration_duration_seconds'].includes(field.key) ? 1 : field.kind === 'number' ? 'any' : null"
                          [min]="['spray_count', 'administration_duration_seconds'].includes(field.key) ? 1 : null"
                        />
                      }
                    }
                  </div>
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
              @if (section.id === 'medications' || section.id === 'orthoses') {
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
                      <h3 id="medication-schedule-title" class="font-semibold">Variazioni della terapia</h3>
                      <p class="mt-1 text-xs leading-5 text-slate-500 dark:text-slate-400">Aggiungi un nuovo periodo quando cambiano dosaggio, date o orari. Ogni periodo parte dopo la fine del precedente.</p>
                    </div>
                    <button type="button" class="button-secondary shrink-0 !px-3 !py-2 text-xs" (click)="addMedicationSchedule()">＋ Aggiungi periodo</button>
                  </div>
                  @for (period of additionalMedicationSchedules(); track $index; let index = $index) {
                    <article class="space-y-3 rounded-xl bg-slate-50 p-3 dark:bg-slate-800/60">
                      <div class="flex items-center justify-between gap-2">
                        <h4 class="text-sm font-semibold">Periodo {{ index + 2 }}</h4>
                        <button type="button" class="text-xs font-semibold text-rose-700 hover:underline dark:text-rose-300" (click)="removeMedicationSchedule(index)">Rimuovi</button>
                      </div>
                      <div class="grid gap-3 sm:grid-cols-2">
                        <label class="form-field"><span>Dal <i class="text-rose-500">*</i></span><app-datepicker [label]="'Inizio periodo ' + (index + 2)" [value]="period.start_date" (dateChange)="updateMedicationSchedule(index, 'start_date', $event)" /></label>
                        <label class="form-field"><span>Al</span><app-datepicker [label]="'Fine periodo ' + (index + 2)" [value]="period.end_date" (dateChange)="updateMedicationSchedule(index, 'end_date', $event)" /></label>
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
            </form>
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
              <dl class="grid gap-4 sm:grid-cols-2">
                @for (field of detailFields(row); track field.key) {
                  @if (value(row, field.key)) {
                    <div class="min-w-0">
                      <dt class="text-xs font-semibold uppercase tracking-wide text-slate-500">{{ field.label }}</dt>
                      <dd class="mt-1 whitespace-pre-wrap break-words text-sm">{{ value(row, field.key) }}</dd>
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
                    @if (value(row, 'expiry_date')) {
                      <div><dt class="text-xs font-medium text-slate-500">Scadenza</dt><dd class="mt-1 text-sm font-semibold">{{ value(row, 'expiry_date') | date: (row['expiry_precision'] === 'month' ? 'MM/yyyy' : 'd MMMM y') }}</dd></div>
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
              @if ((section.id === 'medications' || section.id === 'orthoses') && detailDocuments().length) {
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
  readonly detailRow = signal<DiaryRow | null>(null);
  readonly documentSearchResults = signal<DiaryRow[]>([]);
  readonly selectedDocuments = signal<DiaryRow[]>([]);
  readonly documentSearchLoading = signal(false);
  readonly detailDocuments = signal<DiaryRow[]>([]);
  readonly saving = signal(false);
  readonly extracting = signal(false);
  readonly documentTextProcessing = signal(false);
  readonly documentLinksLoading = signal(false);
  readonly exporting = signal(false);
  readonly initialized = signal(false);
  readonly recording = signal(false);
  readonly audioSpectrum = signal<number[]>(Array.from({ length: 28 }, () => 4));
  readonly selectedChildId = signal('');
  readonly selectedChildName = signal('');
  readonly highlightedId = signal('');
  readonly shareNoticeId = signal('');
  readonly shareNotice = signal('');
  readonly reportFrom = signal('');
  readonly reportTo = signal('');
  readonly reportCategory = signal('');
  readonly reportCategories = [
    'Farmaci',
    'Eventi e sintomi',
    'Percorsi terapeutici',
    'Ortesi e ausili',
    'Documenti',
    'Spese e rimborsi',
  ];
  readonly medicationFormulations = ['Compressa', 'Sciroppo', 'Gocce', 'Spray', 'Aerosol', 'Crema', 'Altro'];
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
  attachedFile: File | null = null;
  private pdfTextForSaving: { file: File; text: string } | null = null;
  recordedVoice: Blob | null = null;
  recordedVoiceUrl = '';
  private recorder?: MediaRecorder;
  private mediaStream?: MediaStream;
  private audioContext?: AudioContext;
  private analyser?: AnalyserNode;
  private spectrumFrame = 0;
  private editingId = '';
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
  normalizeScheduleTimesInput(): void {
    this.form['schedule_times'] = (this.form['schedule_times'] ?? '')
      .split(',')
      .map((entry) => entry.replace(/\b(\d):([0-5]\d)\b/g, '0$1:$2'))
      .join(', ');
  }
  addMedicationSchedule(): void {
    const previous = this.additionalMedicationSchedules().at(-1);
    const source = previous ?? this.form;
    this.additionalMedicationSchedules.update((periods) => [
      ...periods,
      {
        start_date: '',
        end_date: '',
        dosage: String(source['dosage'] ?? ''),
        formulation: String(source['formulation'] ?? ''),
        spray_count: String(source['spray_count'] ?? ''),
        administration_duration_seconds: String(source['administration_duration_seconds'] ?? ''),
        schedule_times: String(source['schedule_times'] ?? ''),
        planned_pause: String(source['planned_pause'] ?? ''),
      },
    ]);
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
    return this.data.rows().filter((row) => {
      const date = String(row['date'] ?? row['start_date'] ?? '').slice(0, 10);
      if (this.sectionId === 'health_events' && (!date || date > todayDate)) return false;
      if (
        this.sectionId === 'health_events' &&
        (String(row['category'] ?? '') === 'Appuntamento' ||
          ['Da confermare', 'Saltato'].includes(String(row['status'] ?? '')) ||
          !!row['skipped_reason'] ||
          !!row['recurrence_group_id'])
      )
        return false;
      const category = String(row['record_type'] ?? '');
      const categoryLabel =
        (
          {
            medications: 'Farmaci',
            health_events: 'Eventi e sintomi',
            therapies: 'Percorsi terapeutici',
            orthoses: 'Ortesi e ausili',
            documents: 'Documenti',
            expenses: 'Spese e rimborsi',
          } as Record<string, string>
        )[category] ?? '';
      return (
        (!this.reportFrom() || date >= this.reportFrom()) &&
        (!this.reportTo() || date <= this.reportTo()) &&
        (!this.reportCategory() || categoryLabel === this.reportCategory())
      );
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
        return;
      }
      await this.data.load(this.sectionId);
      this.data.rows.set(
        this.data.rows().filter((row) => row['child_id'] === this.selectedChildId()),
      );
      return;
    }
    await this.data.load(this.sectionId);
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
  detailFields(row: DiaryRow): FieldDefinition[] {
    const fields = this.visibleFields(row);
    if (this.sectionId === 'medicine_cabinet') {
      const stockFields = new Set([
        'quantity',
        'planned_dosage',
        'price',
        'purchase_date',
        'opened_date',
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
    const expiry = String(row['expiry_date'] ?? '').slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(expiry)) return 'Scadenza non indicata';
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
  setField(field: FieldDefinition, value: string): void {
    this.form[field.key] = value;
  }
  isPdfAttachment(): boolean {
    return !!this.attachedFile &&
      (this.attachedFile.type === 'application/pdf' || this.attachedFile.name.toLowerCase().endsWith('.pdf'));
  }
  isEditing(): boolean {
    return !!this.editingId;
  }
  setFile(field: FieldDefinition, event: Event): void {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (file) {
      this.attachedFile = file;
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
    this.form['file'] = file.name;
    this.form['extracted_text'] = '';
    this.pdfTextForSaving = null;
    this.documentTextProcessing.set(true);
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
    this.attachedFile = null;
    this.pdfTextForSaving = null;
    this.documentTextProcessing.set(false);
    this.clearVoice();
    this.editingId = '';
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
    if (this.sectionId === 'children') {
      this.selectedChildId.set(row.id);
      this.selectedChildName.set(String(row['name'] ?? ''));
      void this.loadMeasurements();
    }
    this.ui.setModal(true);
    if (['medications', 'orthoses'].includes(this.sectionId) && row['child_id']) {
      void this.data.loadDocumentLinks(this.sectionId as 'medications' | 'orthoses', row.id, String(row['child_id']))
        .then((ids) => this.data.loadDocumentsByIds(String(row['child_id']), ids))
        .then((docs) => this.detailDocuments.set(docs));
    } else this.detailDocuments.set([]);
  }
  closeDetails(): void {
    this.detailRow.set(null);
    this.detailDocuments.set([]);
    this.ui.setModal(false);
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
    this.selectedDocuments.set([]);
    this.documentLinksLoading.set(false);
    this.associatedFiles = [];
    this.attachedFile = null;
    this.pdfTextForSaving = null;
    this.documentTextProcessing.set(false);
    for (const field of this.section.fields) {
      const value = row[field.key];
      if (field.key === 'expiry_precision' && this.sectionId === 'medicine_cabinet') {
        this.form[field.key] = value === 'month' ? 'Mese e anno' : 'Data completa';
      } else if (value != null && typeof value !== 'object') this.form[field.key] = String(value);
    }
    if (this.sectionId === 'documents')
      this.form['extracted_text'] = String(row['extracted_text'] ?? '');
    const savedSchedules = this.medicationSchedulePeriods(row);
    if (this.sectionId === 'medications' && Array.isArray(row['schedule_periods']) && savedSchedules.length) {
      const first = savedSchedules[0];
      for (const key of [
        'start_date',
        'end_date',
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
        dosage: period.dosage,
        formulation: period.formulation ?? '',
        spray_count: period.spray_count == null ? '' : String(period.spray_count),
        administration_duration_seconds: period.administration_duration_seconds == null ? '' : String(period.administration_duration_seconds),
        schedule_times: period.schedule_times ?? '',
        planned_pause: period.planned_pause ?? '',
      })));
    } else this.additionalMedicationSchedules.set([]);
    this.editingId = row.id;
    if (['medications', 'orthoses'].includes(this.sectionId) && row['child_id']) {
      this.documentLinksLoading.set(true);
      void this.data
        .loadDocumentLinks(this.sectionId as 'medications' | 'orthoses', row.id, String(row['child_id']))
        .then((ids) => this.data.loadDocumentsByIds(String(row['child_id']), ids))
        .then((docs) => this.selectedDocuments.set(docs))
        .finally(() => this.documentLinksLoading.set(false));
    }
    this.isFormOpen.set(true);
    this.ui.setModal(true);
  }
  closeForm(): void {
    if (this.documentSearchTimer) clearTimeout(this.documentSearchTimer);
    this.documentSearchRequest++;
    this.documentSearchLoading.set(false);
    this.stopRecording();
    this.clearVoice();
    this.attachedFile = null;
    this.associatedFiles = [];
    this.pdfTextForSaving = null;
    this.documentTextProcessing.set(false);
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
    const drafts: MedicationScheduleDraft[] = [
      {
        start_date: String(initial['start_date'] ?? ''),
        end_date: String(initial['end_date'] ?? ''),
        dosage: String(initial['dosage'] ?? ''),
        formulation: String(initial['formulation'] ?? ''),
        spray_count: String(initial['spray_count'] ?? ''),
        administration_duration_seconds: String(initial['administration_duration_seconds'] ?? ''),
        schedule_times: String(initial['schedule_times'] ?? ''),
        planned_pause: String(initial['planned_pause'] ?? ''),
      },
      ...this.additionalMedicationSchedules(),
    ];
    const hasChanges = drafts.length > 1;
    if (hasChanges) {
      for (const [index, period] of drafts.entries()) {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(period.start_date)) {
          this.data.error.set(`Inserisci la data di inizio del periodo ${index + 1}.`);
          return null;
        }
        if (!period.dosage.trim()) {
          this.data.error.set(`Inserisci il dosaggio del periodo ${index + 1}.`);
          return null;
        }
        if (period.end_date && period.end_date < period.start_date) {
          this.data.error.set(`La fine del periodo ${index + 1} precede il suo inizio.`);
          return null;
        }
        if (index > 0) {
          const previous = drafts[index - 1];
          if (!previous.end_date || previous.end_date >= period.start_date) {
            this.data.error.set(
              `Imposta la fine del periodo ${index} prima dell’inizio del periodo ${index + 1}.`,
            );
            return null;
          }
        }
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
  async save(): Promise<void> {
    if (this.documentLinksLoading()) return;
    if (this.sectionId === 'documents' && this.documentTextProcessing()) {
      this.data.error.set('Attendi che la lettura del PDF sia completata prima di salvare.');
      return;
    }
    this.saving.set(true);
    const value: Record<string, unknown> = { ...this.form };
    this.data.error.set('');
    if (this.sectionId === 'medicine_cabinet') {
      const monthOnly = value['expiry_precision'] === 'Mese e anno';
      value['expiry_precision'] = monthOnly ? 'month' : 'day';
      const expiry = String(value['expiry_date'] ?? '').slice(0, 10);
      if (monthOnly && /^\d{4}-\d{2}-\d{2}$/.test(expiry)) {
        const [year, month] = expiry.split('-').map(Number);
        value['expiry_date'] = `${year}-${String(month).padStart(2, '0')}-${String(new Date(year, month, 0).getDate()).padStart(2, '0')}`;
      }
    }
    if (this.sectionId === 'medications') {
      const schedules = this.buildMedicationSchedules(value);
      if (!schedules) {
        this.saving.set(false);
        return;
      }
      value['schedule_periods'] = schedules;
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
    if (
      this.attachedFile &&
      this.selectedChildId() &&
      ['documents', 'expenses'].includes(this.sectionId)
    ) {
      const path = await this.storage.upload(this.attachedFile, this.selectedChildId());
      if (path) value[this.sectionId === 'documents' ? 'storage_path' : 'receipt_path'] = path;
      else if (this.supabase.configured && this.auth.user()) {
        this.data.error.set(
          'Upload non autorizzato. Applica le migrazioni Storage aggiornate su Supabase e riprova.',
        );
        this.saving.set(false);
        return;
      }
    }
    if (this.sectionId === 'documents' && value['storage_path']) delete value['file'];
    if (this.sectionId === 'expenses' && value['receipt_path']) delete value['receipt'];
    const targetId = this.editingId || crypto.randomUUID();
    const targetChildId = this.selectedChildId();
    let ok = this.editingId
      ? await this.data.update(this.sectionId, this.editingId, value)
      : !!(await this.data.saveWithId(
          this.sectionId,
          { ...value, id: targetId },
          this.sectionId === 'children' ? undefined : targetChildId || undefined,
        ));
    if (ok && !this.editingId && ['medications', 'orthoses'].includes(this.sectionId))
      this.editingId = targetId;
    if (ok && ['medications', 'orthoses'].includes(this.sectionId) && targetChildId) {
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
        this.sectionId as 'medications' | 'orthoses', targetId, targetChildId, documentIds,
      );
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
      await this.data.remove(this.sectionId, row);
      if (this.sectionId === 'documents' && row['local_file_id'] && !this.data.error())
        await this.storage.removeLocalFile(String(row['local_file_id']));
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
  exportReport(): void {
    this.pdf.export(this.section, this.filteredRows, this.selectedChildName());
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
