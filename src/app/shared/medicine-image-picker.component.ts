import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output, signal } from '@angular/core';
import { MedicineImageEditorComponent } from './medicine-image-editor.component';

@Component({
  selector: 'tc-medicine-image-picker',
  standalone: true,
  imports: [CommonModule, MedicineImageEditorComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="flex flex-col gap-4 rounded-2xl border border-slate-200 p-3 dark:border-slate-700 sm:flex-row sm:items-center sm:p-4">
      <div class="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-teal-50 text-teal-700 dark:bg-teal-950/40 dark:text-teal-200" aria-hidden="true">
        @if (imageUrl) {
          <img class="h-full w-full object-contain" [src]="imageUrl" alt="" />
        } @else {
          <svg class="h-9 w-9" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="m10.5 3.5 10 10a4.24 4.24 0 0 1-6 6l-10-10a4.24 4.24 0 0 1 6-6Z"/><path d="m8 14 6-6"/></svg>
        }
      </div>
      <div class="min-w-0 flex-1 space-y-2">
        <button type="button" class="button-secondary" (click)="editorOpen.set(true)">
          {{ imageUrl ? 'Modifica o cambia foto' : 'Aggiungi una foto' }}
        </button>
        @if (imageUrl) {
          <button class="block text-xs font-semibold text-rose-700 underline dark:text-rose-300" type="button" (click)="imageRemoved.emit()">Rimuovi immagine</button>
        }
        @if (compressedFile) {
          <p class="text-xs font-medium text-teal-700 dark:text-teal-300">Immagine ottimizzata: {{ compressedFile.size / 1024 | number: '1.0-0' }} KB</p>
        }
        <p class="text-xs text-slate-500 dark:text-slate-400">Scegli, scatta o incolla una foto JPEG, PNG, WebP o HEIC/HEIF, poi ritagliala e ruotala. Verrà ridotta sul dispositivo a circa 60 KB. La foto resta privata e associata al profilo del bambino.</p>
      </div>
    </div>
    @if (editorOpen()) {
      <tc-medicine-image-editor
        [file]="compressedFile"
        [imageUrl]="editorImageUrl()"
        (saved)="saveImage($event)"
        (dismissed)="editorOpen.set(false)"
      />
    }
  `,
})
export class MedicineImagePickerComponent {
  @Input() imageUrl: string | null = null;
  @Input() compressedFile: File | null = null;
  @Output() imageSelected = new EventEmitter<File>();
  @Output() imageRemoved = new EventEmitter<void>();

  readonly editorOpen = signal(false);

  editorImageUrl(): string | null {
    return this.compressedFile ? null : this.imageUrl;
  }

  saveImage(file: File): void {
    this.editorOpen.set(false);
    this.imageSelected.emit(file);
  }
}
