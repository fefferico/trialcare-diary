import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, Output } from '@angular/core';
import { DiaryRow } from '../models/diary.models';

@Component({
  selector: 'tc-document-association-picker',
  standalone: true,
  imports: [CommonModule],
  template: `
    <section class="form-field rounded-xl border border-slate-200 p-3 dark:border-slate-700">
      <div>
        <span class="font-semibold">Documenti collegati</span>
        <p class="mt-1 text-xs text-slate-500">Cerca nell’archivio oppure aggiungi nuovi file.</p>
      </div>
      <input class="field-control mt-3" type="search" maxlength="120" autocomplete="off"
        placeholder="Cerca per titolo (almeno 2 caratteri)" [value]="query"
        (input)="search($any($event.target).value)" aria-label="Cerca documenti già caricati" />
      @if (selectedDocuments.length) {
        <div class="mt-3 space-y-1">
          <span class="text-xs font-semibold">Selezionati ({{ selectedDocuments.length }})</span>
          @for (doc of selectedDocuments; track doc.id) {
            <div class="flex items-center justify-between gap-2 rounded-lg bg-teal-50 px-2 py-1.5 text-sm dark:bg-teal-950/30">
              <span class="truncate">{{ doc['title'] || 'Documento' }}</span>
              <button type="button" class="shrink-0 text-rose-700 underline dark:text-rose-300"
                [attr.aria-label]="'Rimuovi ' + (doc['title'] || 'documento')" (click)="remove(doc.id)">Rimuovi</button>
            </div>
          }
        </div>
      }
      @if (searching) {
        <p class="mt-2 text-sm text-slate-500" role="status">Ricerca documenti…</p>
      } @else if (query.trim().length < 2) {
        <p class="mt-2 text-sm text-slate-500">Digita almeno 2 caratteri per cercare.</p>
      } @else if (documents.length) {
        <div class="mt-2 max-h-40 space-y-2 overflow-y-auto">
          @for (doc of documents; track doc.id) {
            <label class="flex cursor-pointer items-start gap-2 text-sm">
              <input type="checkbox" class="mt-1 accent-teal-700" [checked]="isSelected(doc.id)"
                (change)="toggle(doc, $any($event.target).checked)" />
              <span class="min-w-0"><span class="block truncate font-medium">{{ doc['title'] || 'Documento' }}</span>
                <span class="text-xs text-slate-500">{{ doc['category'] || 'Documento' }}@if (doc['date']) { · {{ documentDate(doc) }} }</span>
              </span>
            </label>
          }
        </div>
      } @else if (query.trim().length >= 2 && !searching) {
        <p class="mt-2 text-sm text-slate-500">Nessun documento trovato.</p>
      }
      @if (documents.length === 30) {
        <p class="mt-1 text-xs text-slate-500">Mostrati i primi 30 risultati: aggiungi altri caratteri per restringere la ricerca.</p>
      }
      <label class="button-secondary mt-3 inline-flex cursor-pointer items-center gap-2">
        <span>Aggiungi file</span>
        <input class="sr-only" type="file" multiple accept=".pdf,image/*" (change)="addFiles($event)" />
      </label>
      @if (files.length) {
        <ul class="mt-2 space-y-1 text-xs text-slate-600 dark:text-slate-300">
          @for (file of files; track $index) {
            <li class="flex items-center justify-between gap-2"><span class="truncate">{{ file.name }}</span>
              <button type="button" class="text-rose-700 underline dark:text-rose-300" (click)="removeFile($index)">Rimuovi</button>
            </li>
          }
        </ul>
      }
    </section>
  `,
})
export class DocumentAssociationPickerComponent {
  @Input() documents: DiaryRow[] = [];
  @Input() selectedDocuments: DiaryRow[] = [];
  @Input() files: File[] = [];
  @Input() searching = false;
  @Output() selectedDocumentsChange = new EventEmitter<DiaryRow[]>();
  @Output() searchChange = new EventEmitter<string>();
  @Output() filesChange = new EventEmitter<File[]>();
  query = '';

  documentDate(doc: DiaryRow): string {
    const value = String(doc['date'] ?? '').slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
    return new Date(`${value}T12:00:00`).toLocaleDateString('it-IT', { day: 'numeric', month: 'short', year: 'numeric' });
  }

  search(query: string): void {
    this.query = query;
    this.searchChange.emit(query);
  }

  isSelected(id: string): boolean {
    return this.selectedDocuments.some((doc) => doc.id === id);
  }

  toggle(doc: DiaryRow, checked: boolean): void {
    const selected = new Map(this.selectedDocuments.map((item) => [item.id, item]));
    if (checked) selected.set(doc.id, doc);
    else selected.delete(doc.id);
    this.selectedDocumentsChange.emit([...selected.values()]);
  }

  remove(id: string): void {
    this.selectedDocumentsChange.emit(this.selectedDocuments.filter((doc) => doc.id !== id));
  }

  addFiles(event: Event): void {
    const input = event.target as HTMLInputElement;
    const added = Array.from(input.files ?? []);
    this.filesChange.emit([...this.files, ...added]);
    input.value = '';
  }

  removeFile(index: number): void {
    this.filesChange.emit(this.files.filter((_, fileIndex) => fileIndex !== index));
  }
}
