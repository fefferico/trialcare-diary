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
import { jsPDF } from 'jspdf';

interface CropArea {
  x: number;
  y: number;
  width: number;
  height: number;
}

@Component({
  selector: 'tc-image-to-pdf',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section
      class="mt-3 rounded-2xl border border-teal-200 bg-teal-50/70 p-4 dark:border-teal-900 dark:bg-teal-950/20"
      aria-labelledby="image-pdf-title"
    >
      <div class="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 id="image-pdf-title" class="font-semibold text-slate-800 dark:text-slate-100">
            Converti la foto in PDF
          </h3>
          <p class="mt-1 max-w-2xl text-xs leading-5 text-slate-600 dark:text-slate-300">
            Ruota l’immagine e trascina per scegliere l’area da includere. La conversione avviene su
            questo dispositivo.
          </p>
        </div>
        @if (ready()) {
          <div class="flex flex-wrap gap-2">
            <button
              type="button"
              class="button-secondary !min-h-10 !px-3"
              (click)="rotate(-90)"
              [disabled]="busy()"
              aria-label="Ruota la foto a sinistra"
            >
              <svg
                class="h-4 w-4 shrink-0"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="1.8"
                stroke-linecap="round"
                stroke-linejoin="round"
                aria-hidden="true"
              >
                <path d="M3 12a9 9 0 1 0 3-6.7L3 8" />
                <path d="M3 3v5h5" />
              </svg>
              <span>Ruota a sinistra</span>
            </button>
            <button
              type="button"
              class="button-secondary !min-h-10 !px-3"
              (click)="rotate(90)"
              [disabled]="busy()"
              aria-label="Ruota la foto a destra"
            >
              <svg
                class="h-4 w-4 shrink-0"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="1.8"
                stroke-linecap="round"
                stroke-linejoin="round"
                aria-hidden="true"
              >
                <path d="M21 12a9 9 0 1 1-3-6.7L21 8" />
                <path d="M21 3v5h-5" />
              </svg>
              <span>Ruota a destra</span>
            </button>
            <button
              type="button"
              class="button-secondary !min-h-10 !px-3"
              (click)="resetCrop()"
              [disabled]="busy()"
            >
              <svg
                class="h-4 w-4 shrink-0"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="1.8"
                stroke-linecap="round"
                stroke-linejoin="round"
                aria-hidden="true"
              >
                <path d="M6 2v14a2 2 0 0 0 2 2h14" />
                <path d="M18 22V8a2 2 0 0 0-2-2H2" />
              </svg>
              <span>Ripristina ritaglio</span>
            </button>
          </div>
        }
      </div>

      @if (loading()) {
        <p class="mt-3 text-sm text-slate-600 dark:text-slate-300" role="status">
          Apertura della foto…
        </p>
      }
      <div [hidden]="!ready()">
        <div
          class="mt-3 overflow-hidden rounded-xl border border-slate-200 bg-slate-900 dark:border-slate-700"
        >
          <canvas
            #preview
            class="block h-auto max-h-[55vh] w-full touch-none object-contain"
            aria-label="Anteprima della foto: trascina per selezionare l’area da ritagliare"
            (pointerdown)="startCrop($event)"
            (pointermove)="moveCrop($event)"
            (pointerup)="finishCrop($event)"
            (pointercancel)="finishCrop($event)"
          ></canvas>
        </div>
        <p class="mt-2 text-xs text-slate-500 dark:text-slate-400">
          Trascina sulla foto per delimitare il ritaglio. Se non selezioni un’area, verrà usata
          tutta l’immagine.
        </p>
        <button type="button" class="button-primary mt-3" [disabled]="busy()" (click)="convert()">
          {{ busy() ? 'Creazione del PDF…' : 'Converti e usa il PDF' }}
        </button>
      </div>
      @if (error()) {
        <p class="notice-error mt-3" role="alert">{{ error() }}</p>
      }
    </section>
  `,
})
export class ImageToPdfComponent implements OnChanges, OnDestroy {
  @Input({ required: true }) file!: File;
  @Output() converted = new EventEmitter<File>();
  @Output() processingChange = new EventEmitter<boolean>();
  @ViewChild('preview', { static: true }) private previewCanvas!: ElementRef<HTMLCanvasElement>;

  readonly loading = signal(false);
  readonly ready = signal(false);
  readonly busy = signal(false);
  readonly error = signal('');

  private image: HTMLImageElement | null = null;
  private objectUrl = '';
  private loadRequest = 0;
  private rotation = 0;
  private crop: CropArea | null = null;
  private dragStart: { x: number; y: number } | null = null;
  private previousCrop: CropArea | null = null;

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['file'] && this.file) void this.loadImage(this.file);
  }

  ngOnDestroy(): void {
    this.loadRequest++;
    this.releaseObjectUrl();
  }

  private async loadImage(file: File): Promise<void> {
    const request = ++this.loadRequest;
    this.releaseObjectUrl();
    this.image = null;
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
        this.error.set(
          'Il browser non riesce ad aprire questa immagine. Puoi comunque salvare il file originale o scegliere una foto JPEG, PNG o WebP.',
        );
      }
    } finally {
      if (this.objectUrl === url) this.releaseObjectUrl();
      if (request === this.loadRequest) this.loading.set(false);
    }
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

  async convert(): Promise<void> {
    if (!this.image || !this.ready() || this.busy()) return;
    this.busy.set(true);
    this.processingChange.emit(true);
    this.error.set('');

    try {
      const source = this.image;
      const preview = this.previewCanvas.nativeElement;
      const crop = this.crop ?? { x: 0, y: 0, width: preview.width, height: preview.height };
      const sideways = this.rotation % 180 !== 0;
      const orientedWidth = sideways ? source.naturalHeight : source.naturalWidth;
      const orientedHeight = sideways ? source.naturalWidth : source.naturalHeight;
      const outputScale = Math.min(1, 3200 / Math.max(orientedWidth, orientedHeight));
      const fullWidth = orientedWidth * outputScale;
      const fullHeight = orientedHeight * outputScale;
      const scaleX = fullWidth / preview.width;
      const scaleY = fullHeight / preview.height;
      const cropX = crop.x * scaleX;
      const cropY = crop.y * scaleY;
      const cropWidth = Math.max(1, Math.round(crop.width * scaleX));
      const cropHeight = Math.max(1, Math.round(crop.height * scaleY));
      const cropped = document.createElement('canvas');
      cropped.width = cropWidth;
      cropped.height = cropHeight;
      const context = cropped.getContext('2d');
      if (!context) throw new Error('canvas-unavailable');

      context.fillStyle = '#fff';
      context.fillRect(0, 0, cropWidth, cropHeight);
      context.save();
      context.translate(-cropX, -cropY);
      context.translate(fullWidth / 2, fullHeight / 2);
      context.rotate((this.rotation * Math.PI) / 180);
      context.drawImage(
        source,
        (-source.naturalWidth * outputScale) / 2,
        (-source.naturalHeight * outputScale) / 2,
        source.naturalWidth * outputScale,
        source.naturalHeight * outputScale,
      );
      context.restore();

      const maxJpegBytes = Math.min(4 * 1024 * 1024, Math.max(160 * 1024, this.file.size * 0.88));
      const optimized = await optimizeJpeg(cropped, maxJpegBytes);
      const pdf = new jsPDF({
        orientation: cropWidth > cropHeight ? 'landscape' : 'portrait',
        unit: 'mm',
        format: 'a4',
        compress: true,
      });
      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();
      const margin = 8;
      const fit = Math.min(
        (pageWidth - margin * 2) / optimized.width,
        (pageHeight - margin * 2) / optimized.height,
      );
      const imageWidth = optimized.width * fit;
      const imageHeight = optimized.height * fit;
      const imageData = new Uint8Array(await optimized.blob.arrayBuffer());
      pdf.addImage(
        imageData,
        'JPEG',
        (pageWidth - imageWidth) / 2,
        (pageHeight - imageHeight) / 2,
        imageWidth,
        imageHeight,
        undefined,
        'FAST',
      );

      const blob = pdf.output('blob');
      const baseName = this.file.name.replace(/\.[^.]+$/, '') || 'immagine';
      this.converted.emit(new File([blob], `${baseName}.pdf`, { type: 'application/pdf' }));
    } catch {
      this.error.set(
        'Non è stato possibile creare il PDF. Riprova con un’immagine più piccola o in formato JPEG, PNG o WebP.',
      );
    } finally {
      this.busy.set(false);
      this.processingChange.emit(false);
    }
  }

  private canvasPoint(event: PointerEvent): { x: number; y: number } | null {
    const canvas = this.previewCanvas.nativeElement;
    const bounds = canvas.getBoundingClientRect();
    if (!bounds.width || !bounds.height) return null;
    return {
      x: Math.min(
        canvas.width,
        Math.max(0, ((event.clientX - bounds.left) / bounds.width) * canvas.width),
      ),
      y: Math.min(
        canvas.height,
        Math.max(0, ((event.clientY - bounds.top) / bounds.height) * canvas.height),
      ),
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
      this.error.set('L’anteprima dell’immagine non è disponibile in questo browser.');
      return;
    }

    context.fillStyle = '#fff';
    context.fillRect(0, 0, canvas.width, canvas.height);
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
    context.fillStyle = '#fff';
    context.fillRect(0, 0, canvas.width, canvas.height);
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

async function optimizeJpeg(
  source: HTMLCanvasElement,
  targetBytes: number,
): Promise<{ blob: Blob; width: number; height: number }> {
  let canvas = source;
  let width = source.width;
  let height = source.height;
  let blob = await canvasToJpeg(canvas, 0.96);

  for (const quality of [0.94, 0.92, 0.9, 0.88]) {
    if (blob.size <= targetBytes) break;
    blob = await canvasToJpeg(canvas, quality);
  }

  for (let attempt = 0; blob.size > targetBytes && attempt < 3 && Math.max(width, height) > 1200; attempt++) {
    const scale = Math.max(0.72, Math.min(0.94, Math.sqrt(targetBytes / blob.size) * 0.96));
    width = Math.max(1, Math.round(width * scale));
    height = Math.max(1, Math.round(height * scale));
    const resized = document.createElement('canvas');
    resized.width = width;
    resized.height = height;
    const context = resized.getContext('2d');
    if (!context) throw new Error('canvas-unavailable');
    context.drawImage(source, 0, 0, width, height);
    canvas = resized;
    blob = await canvasToJpeg(canvas, 0.92);
  }

  return { blob, width, height };
}

function canvasToJpeg(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('image-encoding-failed'))),
      'image/jpeg',
      quality,
    );
  });
}
