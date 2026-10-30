import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  EventEmitter,
  Input,
  OnChanges,
  OnDestroy,
  Output,
  SimpleChanges,
  ViewChild,
  signal,
} from '@angular/core';
import { CommonModule } from '@angular/common';

interface CropArea {
  x: number;
  y: number;
  width: number;
  height: number;
}

@Component({
  selector: 'tc-medicine-image-editor',
  standalone: true,
  imports: [CommonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="fixed inset-0 z-[70] flex items-end justify-center bg-slate-950/70 p-0 backdrop-blur-sm sm:items-center sm:p-4" (click)="dismiss()">
      <section
        class="flex max-h-[100dvh] w-full max-w-2xl flex-col overflow-hidden rounded-t-3xl border border-slate-200 bg-white shadow-2xl dark:border-slate-700 dark:bg-slate-900 sm:max-h-[92dvh] sm:rounded-3xl"
        role="dialog"
        aria-modal="true"
        aria-labelledby="medicine-image-editor-title"
        (click)="$event.stopPropagation()"
        (keydown.escape)="dismiss()"
      >
        <header class="flex items-start justify-between gap-4 border-b border-slate-100 px-5 py-4 dark:border-slate-800">
          <div>
            <p class="eyebrow">FOTO DEL FARMACO</p>
            <h2 id="medicine-image-editor-title" class="text-xl font-semibold">Modifica e ritaglia</h2>
          </div>
          <button type="button" class="icon-button" aria-label="Annulla modifica" (click)="dismiss()">×</button>
        </header>

        <div class="space-y-4 overflow-y-auto px-5 py-4" (paste)="onImagePaste($event)">
          <p class="text-sm leading-6 text-slate-600 dark:text-slate-300">
            Trascina sulla foto per scegliere l’area da tenere. Puoi ruotarla prima di salvare.
            L’immagine viene elaborata sul dispositivo e compressa.
          </p>

          <div class="flex flex-wrap gap-2">
            <label class="button-secondary cursor-pointer" [class.pointer-events-none]="busy()" [class.opacity-50]="busy()">
              <span>Scegli o scatta una foto</span>
              <input class="sr-only" type="file" accept="image/*" capture="environment" [disabled]="busy()" (change)="selectFile($event)" />
            </label>
            <button type="button" class="button-secondary" [disabled]="busy()" (click)="pasteFromClipboard()">Incolla immagine</button>
          </div>

          @if (loading()) {
            <p class="rounded-xl bg-slate-50 p-4 text-sm text-slate-600 dark:bg-slate-800 dark:text-slate-300" role="status">
              Apertura della foto…
            </p>
          }
          @if (ready()) {
            <div class="flex min-h-48 items-center justify-center overflow-auto rounded-2xl border border-slate-200 bg-slate-100 p-2 dark:border-slate-700 dark:bg-slate-800">
              <canvas
                #preview
                class="block h-auto max-h-[48dvh] w-auto max-w-full touch-none select-none object-contain"
                aria-label="Anteprima della foto. Trascina per selezionare l’area da ritagliare."
                (pointerdown)="startCrop($event)"
                (pointermove)="moveCrop($event)"
                (pointerup)="finishCrop($event)"
                (pointercancel)="finishCrop($event)"
              ></canvas>
            </div>
            <div class="flex flex-wrap gap-2">
              <button type="button" class="button-secondary" (click)="rotate(-90)" [disabled]="busy()">
                <svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/></svg>
                Ruota a sinistra
              </button>
              <button type="button" class="button-secondary" (click)="rotate(90)" [disabled]="busy()">
                <svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 12a9 9 0 1 1-3-6.7L21 8"/><path d="M21 3v5h-5"/></svg>
                Ruota a destra
              </button>
              <button type="button" class="button-secondary" (click)="resetCrop()" [disabled]="busy()">
                Ripristina
              </button>
            </div>
            <p class="text-xs leading-5 text-slate-500 dark:text-slate-400">
              Il file finale avrà al massimo 512 pixel sul lato più lungo e punterà a circa 60 KB.
            </p>
          }
          @if (error()) {
            <p class="notice-error" role="alert">{{ error() }}</p>
          }
        </div>

        <footer class="flex flex-wrap justify-end gap-2 border-t border-slate-100 px-5 py-4 dark:border-slate-800">
          <button type="button" class="button-secondary" [disabled]="busy()" (click)="dismiss()">Annulla</button>
          <button type="button" class="button-primary" [disabled]="!ready() || busy()" (click)="saveEditedImage()">
            {{ busy() ? 'Ottimizzazione…' : 'Usa questa immagine' }}
          </button>
        </footer>
      </section>
    </div>
  `,
})
export class MedicineImageEditorComponent implements OnChanges, OnDestroy {
  @Input() file: File | null = null;
  @Input() imageUrl: string | null = null;
  @Output() saved = new EventEmitter<File>();
  @Output() dismissed = new EventEmitter<void>();
  @ViewChild('preview', { static: true }) private previewCanvas!: ElementRef<HTMLCanvasElement>;

  readonly loading = signal(false);
  readonly ready = signal(false);
  readonly busy = signal(false);
  readonly error = signal('');

  private image: HTMLImageElement | null = null;
  private sourceFile: File | null = null;
  private objectUrl = '';
  private loadRequest = 0;
  private rotation = 0;
  private crop: CropArea | null = null;
  private dragStart: { x: number; y: number } | null = null;
  private previousCrop: CropArea | null = null;

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['file'] && this.file) void this.loadImage(this.file);
    else if (changes['imageUrl'] && this.imageUrl && !this.file) void this.loadImageFromUrl(this.imageUrl);
  }

  ngOnDestroy(): void {
    this.loadRequest++;
    this.releaseObjectUrl();
  }

  dismiss(): void {
    if (this.busy()) return;
    this.dismissed.emit();
  }

  selectFile(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    if (!this.isSupportedImageType(file.type) || file.size > 20 * 1024 * 1024) {
      this.error.set('Scegli una foto JPEG, PNG, WebP o HEIC/HEIF fino a 20 MB.');
      input.value = '';
      return;
    }
    void this.loadImage(file);
  }

  async pasteFromClipboard(): Promise<void> {
    this.error.set('');
    if (!navigator.clipboard?.read) {
      this.error.set('Il browser non consente l’accesso alla clipboard da questo pulsante. Puoi usare Ctrl+V o Cmd+V dopo aver copiato un’immagine.');
      return;
    }
    try {
      const items = await navigator.clipboard.read();
      for (const item of items) {
        const type = item.types.find((candidate) => this.isSupportedImageType(candidate));
        if (!type) continue;
        const blob = await item.getType(type);
        const extension = type === 'image/jpeg' ? 'jpg' : type.slice('image/'.length);
        const file = new File([blob], `farmaco.${extension}`, { type });
        if (file.size > 20 * 1024 * 1024) {
          this.error.set('L’immagine copiata supera il limite di 20 MB.');
          return;
        }
        await this.loadImage(file);
        return;
      }
      this.error.set('La clipboard non contiene un’immagine JPEG, PNG, WebP o HEIC/HEIF.');
    } catch {
      this.error.set('Non è stato possibile leggere la clipboard. Verifica il permesso del browser o usa Ctrl+V/Cmd+V.');
    }
  }

  onImagePaste(event: ClipboardEvent): void {
    const image = Array.from(event.clipboardData?.items ?? []).find(
      (item) => item.kind === 'file' && this.isSupportedImageType(item.type),
    );
    const file = image?.getAsFile();
    if (!file) return;
    event.preventDefault();
    if (file.size > 20 * 1024 * 1024) {
      this.error.set('L’immagine copiata supera il limite di 20 MB.');
      return;
    }
    void this.loadImage(file);
  }

  rotate(degrees: number): void {
    this.rotation = (this.rotation + degrees + 360) % 360;
    this.crop = null;
    this.error.set('');
    this.drawPreview();
  }

  resetCrop(): void {
    this.crop = null;
    this.error.set('');
    this.drawPreview();
  }

  startCrop(event: PointerEvent): void {
    if (!this.image || this.busy() || event.button !== 0) return;
    const point = this.canvasPoint(event);
    if (!point) return;
    event.preventDefault();
    this.previewCanvas.nativeElement.setPointerCapture(event.pointerId);
    this.previousCrop = this.crop ? { ...this.crop } : null;
    this.dragStart = point;
    this.crop = { x: point.x, y: point.y, width: 1, height: 1 };
    this.error.set('');
    this.drawPreview();
  }

  moveCrop(event: PointerEvent): void {
    if (!this.dragStart || !this.image) return;
    const point = this.canvasPoint(event);
    if (!point) return;
    this.crop = this.areaFromPoints(this.dragStart, point);
    this.drawPreview();
  }

  finishCrop(event: PointerEvent): void {
    if (!this.dragStart || !this.image) return;
    const point = this.canvasPoint(event);
    if (point) this.crop = this.areaFromPoints(this.dragStart, point);
    this.dragStart = null;
    if (!this.crop || this.crop.width < 12 || this.crop.height < 12) {
      this.crop = this.previousCrop;
      this.error.set('Trascina per selezionare un’area più grande.');
    }
    this.previousCrop = null;
    this.drawPreview();
  }

  async saveEditedImage(): Promise<void> {
    if (!this.image || !this.ready() || this.busy()) return;
    this.busy.set(true);
    this.error.set('');
    try {
      const cropped = this.createCroppedCanvas();
      const optimized = await this.optimizeImage(cropped);
      const baseName = this.sourceFile?.name.replace(/\.[^.]+$/, '') || 'farmaco';
      const extension = optimized.type === 'image/webp' ? 'webp' : 'jpg';
      this.saved.emit(new File([optimized], `${baseName}.${extension}`, { type: optimized.type }));
    } catch {
      this.error.set('Non è stato possibile ottimizzare la foto. Scegli un’altra immagine e riprova.');
    } finally {
      this.busy.set(false);
    }
  }

  private async loadImage(file: File): Promise<void> {
    const request = ++this.loadRequest;
    this.releaseObjectUrl();
    this.image = null;
    this.sourceFile = file;
    this.crop = null;
    this.rotation = 0;
    this.ready.set(false);
    this.loading.set(true);
    this.error.set('');

    const url = URL.createObjectURL(file);
    this.objectUrl = url;
    const image = new Image();
    image.src = url;
    try {
      await image.decode();
      if (request !== this.loadRequest) return;
      this.image = image;
      this.ready.set(true);
      this.drawPreview();
    } catch {
      if (request === this.loadRequest) {
        this.error.set('Il browser non riesce ad aprire questa foto. Prova con JPEG, PNG, WebP o HEIC/HEIF supportato dal dispositivo.');
      }
    } finally {
      if (this.objectUrl === url) this.releaseObjectUrl();
      if (request === this.loadRequest) this.loading.set(false);
    }
  }

  private async loadImageFromUrl(url: string): Promise<void> {
    const request = ++this.loadRequest;
    this.loading.set(true);
    this.ready.set(false);
    this.error.set('');
    try {
      const response = await fetch(url);
      if (!response.ok) throw new Error('image-fetch-failed');
      const blob = await response.blob();
      if (request !== this.loadRequest) return;
      const type = blob.type || 'image/jpeg';
      if (!this.isSupportedImageType(type) || blob.size > 20 * 1024 * 1024)
        throw new Error('unsupported-image');
      const extension = type === 'image/jpeg' ? 'jpg' : type.slice('image/'.length);
      await this.loadImage(new File([blob], `farmaco-originale.${extension}`, { type }));
    } catch {
      if (request === this.loadRequest) {
        this.loading.set(false);
        this.error.set('Non è stato possibile aprire la foto salvata. Puoi sceglierne o incollarne un’altra.');
      }
    }
  }

  private isSupportedImageType(type: string): boolean {
    return ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'].includes(type.toLocaleLowerCase());
  }

  private createCroppedCanvas(): HTMLCanvasElement {
    const image = this.image;
    if (!image) throw new Error('image-unavailable');
    const preview = this.previewCanvas.nativeElement;
    const crop = this.crop ?? { x: 0, y: 0, width: preview.width, height: preview.height };
    const sideways = this.rotation % 180 !== 0;
    const orientedWidth = sideways ? image.naturalHeight : image.naturalWidth;
    const orientedHeight = sideways ? image.naturalWidth : image.naturalHeight;
    const outputScale = Math.min(1, 1400 / Math.max(orientedWidth, orientedHeight));
    const fullWidth = orientedWidth * outputScale;
    const fullHeight = orientedHeight * outputScale;
    const scaleX = fullWidth / preview.width;
    const scaleY = fullHeight / preview.height;
    const cropX = crop.x * scaleX;
    const cropY = crop.y * scaleY;
    const cropWidth = Math.max(1, Math.round(crop.width * scaleX));
    const cropHeight = Math.max(1, Math.round(crop.height * scaleY));
    const output = document.createElement('canvas');
    output.width = cropWidth;
    output.height = cropHeight;
    const context = output.getContext('2d');
    if (!context) throw new Error('canvas-unavailable');
    context.save();
    context.translate(-cropX, -cropY);
    context.translate(fullWidth / 2, fullHeight / 2);
    context.rotate((this.rotation * Math.PI) / 180);
    context.drawImage(
      image,
      (-image.naturalWidth * outputScale) / 2,
      (-image.naturalHeight * outputScale) / 2,
      image.naturalWidth * outputScale,
      image.naturalHeight * outputScale,
    );
    context.restore();
    return output;
  }

  private async optimizeImage(source: HTMLCanvasElement): Promise<Blob> {
    const targetBytes = 64 * 1024;
    let best: Blob | null = null;
    for (const maxDimension of [512, 448, 384, 320, 256]) {
      const scale = Math.min(1, maxDimension / Math.max(source.width, source.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(source.width * scale));
      canvas.height = Math.max(1, Math.round(source.height * scale));
      const context = canvas.getContext('2d');
      if (!context) throw new Error('canvas-unavailable');
      context.drawImage(source, 0, 0, canvas.width, canvas.height);

      for (const quality of [0.78, 0.64, 0.5, 0.38, 0.3]) {
        let blob = await this.canvasBlob(canvas, 'image/webp', quality);
        if (blob.type !== 'image/webp') {
          const jpegCanvas = document.createElement('canvas');
          jpegCanvas.width = canvas.width;
          jpegCanvas.height = canvas.height;
          const jpegContext = jpegCanvas.getContext('2d');
          if (!jpegContext) throw new Error('canvas-unavailable');
          jpegContext.fillStyle = '#fff';
          jpegContext.fillRect(0, 0, jpegCanvas.width, jpegCanvas.height);
          jpegContext.drawImage(canvas, 0, 0);
          blob = await this.canvasBlob(jpegCanvas, 'image/jpeg', quality);
        }
        best = blob;
        if (blob.size <= targetBytes) return blob;
      }
    }
    if (!best) throw new Error('image-encoding-failed');
    return best;
  }

  private canvasBlob(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob> {
    return new Promise((resolve, reject) => {
      canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error('image-encoding-failed')), type, quality);
    });
  }

  private canvasPoint(event: PointerEvent): { x: number; y: number } | null {
    const canvas = this.previewCanvas.nativeElement;
    const bounds = canvas.getBoundingClientRect();
    if (!bounds.width || !bounds.height) return null;
    return {
      x: Math.min(canvas.width, Math.max(0, ((event.clientX - bounds.left) / bounds.width) * canvas.width)),
      y: Math.min(canvas.height, Math.max(0, ((event.clientY - bounds.top) / bounds.height) * canvas.height)),
    };
  }

  private areaFromPoints(start: { x: number; y: number }, end: { x: number; y: number }): CropArea {
    return {
      x: Math.min(start.x, end.x),
      y: Math.min(start.y, end.y),
      width: Math.abs(end.x - start.x),
      height: Math.abs(end.y - start.y),
    };
  }

  private drawPreview(): void {
    const image = this.image;
    const canvas = this.previewCanvas?.nativeElement;
    if (!image || !canvas) return;
    const sideways = this.rotation % 180 !== 0;
    const orientedWidth = sideways ? image.naturalHeight : image.naturalWidth;
    const orientedHeight = sideways ? image.naturalWidth : image.naturalHeight;
    const scale = Math.min(1, 1400 / Math.max(orientedWidth, orientedHeight));
    canvas.width = Math.max(1, Math.round(orientedWidth * scale));
    canvas.height = Math.max(1, Math.round(orientedHeight * scale));
    const context = canvas.getContext('2d');
    if (!context) {
      this.error.set('L’anteprima della foto non è disponibile in questo browser.');
      return;
    }

    context.clearRect(0, 0, canvas.width, canvas.height);
    context.save();
    context.translate(canvas.width / 2, canvas.height / 2);
    context.rotate((this.rotation * Math.PI) / 180);
    context.drawImage(
      image,
      (-image.naturalWidth * scale) / 2,
      (-image.naturalHeight * scale) / 2,
      image.naturalWidth * scale,
      image.naturalHeight * scale,
    );
    context.restore();

    if (!this.crop) this.crop = { x: 0, y: 0, width: canvas.width, height: canvas.height };
    context.fillStyle = 'rgba(15, 23, 42, 0.55)';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.save();
    context.beginPath();
    context.rect(this.crop.x, this.crop.y, this.crop.width, this.crop.height);
    context.clip();
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.translate(canvas.width / 2, canvas.height / 2);
    context.rotate((this.rotation * Math.PI) / 180);
    context.drawImage(
      image,
      (-image.naturalWidth * scale) / 2,
      (-image.naturalHeight * scale) / 2,
      image.naturalWidth * scale,
      image.naturalHeight * scale,
    );
    context.restore();
    context.strokeStyle = '#5eead4';
    context.lineWidth = Math.max(2, canvas.width / 350);
    context.strokeRect(this.crop.x, this.crop.y, this.crop.width, this.crop.height);
  }

  private releaseObjectUrl(): void {
    if (!this.objectUrl) return;
    URL.revokeObjectURL(this.objectUrl);
    this.objectUrl = '';
  }
}
