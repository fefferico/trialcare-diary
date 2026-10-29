import { CommonModule } from '@angular/common';
import { Component, ElementRef, EventEmitter, OnDestroy, Output, ViewChild, computed, signal } from '@angular/core';
import { jsPDF } from 'jspdf';
import { AppDropdownComponent } from '../shared/app-dropdown.component';

type ScanLook = 'colore' | 'grigio' | 'bianco-nero';

interface ScanCrop {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface ScanPage {
  id: string;
  blob: Blob;
  previewUrl: string;
  crop: ScanCrop;
  rotation: number;
  look: ScanLook;
  brightness: number;
  contrast: number;
  warmth: number;
}

interface DetectionBox extends ScanCrop {}

const MAX_SCAN_PAGES = 30;
const MAX_SCAN_FILE_BYTES = 25 * 1024 * 1024;
const MAX_IMAGE_EDGE = 2800;

@Component({
  selector: 'tc-document-scanner',
  standalone: true,
  imports: [CommonModule, AppDropdownComponent],
  template: `
    <section class="space-y-3 rounded-xl border border-teal-200 bg-white p-3 dark:border-teal-800 dark:bg-slate-900" aria-labelledby="scanner-title">
      <header class="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 id="scanner-title" class="font-semibold text-slate-800 dark:text-slate-100">Scanner documenti</h3>
          <p class="mt-1 text-xs leading-5 text-slate-500 dark:text-slate-400">Le immagini vengono elaborate solo su questo dispositivo. Puoi acquisire pagine, importare foto, riordinarle, ritagliarle e migliorarle prima di creare il PDF.</p>
        </div>
        <button type="button" class="button-secondary !px-3 !py-1.5 text-xs" (click)="dismiss.emit()">Chiudi scanner</button>
      </header>

      <div class="flex flex-wrap gap-2">
        <button type="button" class="button-secondary" [disabled]="busy()" (click)="cameraActive() ? stopCamera() : startCamera()">
          {{ cameraActive() ? 'Spegni fotocamera' : 'Apri fotocamera' }}
        </button>
        <label class="button-secondary inline-flex cursor-pointer items-center">
          Aggiungi foto
          <input class="sr-only" type="file" accept="image/*" multiple (change)="importImages($event)" [disabled]="busy()" />
        </label>
        <span class="self-center text-xs text-slate-500">{{ pages().length }}/{{ maxPages }} pagine</span>
      </div>

      <div class="relative mx-auto max-h-[55vh] overflow-hidden rounded-xl bg-slate-950" [hidden]="!cameraActive()">
        <video #cameraVideo class="block max-h-[55vh] w-full object-contain" [srcObject]="cameraStream" autoplay playsinline muted aria-label="Inquadratura della fotocamera"></video>
        @if (cameraDetection(); as box) {
          <div class="pointer-events-none absolute border-2 border-teal-300 shadow-[0_0_0_999px_rgba(15,23,42,0.22)]" [style.left.px]="cameraOverlay()?.left" [style.top.px]="cameraOverlay()?.top" [style.width.px]="cameraOverlay()?.width" [style.height.px]="cameraOverlay()?.height" aria-hidden="true"></div>
        }
        @if (cameraActive() && !cameraDetection()) {
          <div class="pointer-events-none absolute inset-[10%] rounded-lg border-2 border-dashed border-white/70" aria-hidden="true"></div>
        }
      </div>
      @if (cameraActive()) {
        <div class="space-y-2">
          <p class="text-xs text-slate-500 dark:text-slate-400" role="status" aria-live="polite">
            @if (cameraDetection()) { Pagina rilevata: centra il foglio e mantieni ferma la fotocamera. } @else { Inquadra un foglio ben illuminato; puoi scattare anche senza rilevamento automatico. }
          </p>
          <div class="flex flex-wrap items-center gap-2">
            <button type="button" class="button-primary" [disabled]="busy()" (click)="capturePage()">Scatta pagina</button>
            <label class="flex min-h-10 cursor-pointer items-center gap-2 rounded-lg border border-slate-200 px-3 text-sm dark:border-slate-700">
              <input type="checkbox" class="accent-teal-700" [checked]="autoCapture()" (change)="setAutoCapture($any($event.target).checked)" />
              Scatto automatico quando il foglio è fermo
            </label>
          </div>
        </div>
      }

      @if (pages().length) {
        <div class="space-y-3 border-t border-slate-100 pt-3 dark:border-slate-800">
          <div class="flex items-center justify-between gap-2">
            <div class="flex items-center gap-2">
              <button type="button" class="button-secondary !px-3 !py-1.5" aria-label="Pagina precedente" [disabled]="activeIndex() === 0 || busy()" (click)="selectPage(activeIndex() - 1)">‹</button>
              <span class="text-sm font-medium">Pagina {{ activeIndex() + 1 }} di {{ pages().length }}</span>
              <button type="button" class="button-secondary !px-3 !py-1.5" aria-label="Pagina successiva" [disabled]="activeIndex() >= pages().length - 1 || busy()" (click)="selectPage(activeIndex() + 1)">›</button>
            </div>
            <div class="flex gap-2">
              <button type="button" class="button-secondary !px-3 !py-1.5" aria-label="Ruota pagina a sinistra" [disabled]="busy()" (click)="rotate(-90)">Ruota a sinistra</button>
              <button type="button" class="button-secondary !px-3 !py-1.5" aria-label="Ruota pagina a destra" [disabled]="busy()" (click)="rotate(90)">Ruota a destra</button>
            </div>
          </div>

          <div class="overflow-hidden rounded-xl border border-slate-200 bg-slate-950 dark:border-slate-700">
            <canvas #editorCanvas class="block h-auto max-h-[55vh] w-full touch-none object-contain" aria-label="Anteprima pagina; trascina per ritagliare" (pointerdown)="startCrop($event)" (pointermove)="moveCrop($event)" (pointerup)="finishCrop($event)" (pointercancel)="finishCrop($event)"></canvas>
          </div>
          <div class="flex flex-wrap items-center gap-2">
            <label class="form-field min-w-40 flex-1"><span>Colore</span><app-dropdown [options]="lookOptions" [value]="lookLabel()" placeholder="Scegli filtro" (selection)="setLook($event)" /></label>
            <button type="button" class="button-secondary self-end" [disabled]="busy()" (click)="resetCrop()">Ripristina ritaglio</button>
            <button type="button" class="button-secondary self-end" [disabled]="busy()" (click)="movePage(-1)">Sposta su</button>
            <button type="button" class="button-secondary self-end" [disabled]="busy()" (click)="movePage(1)">Sposta giù</button>
            <button type="button" class="button-secondary self-end !text-rose-700 dark:!text-rose-300" [disabled]="busy()" (click)="removePage()">Elimina pagina</button>
          </div>
          <div class="grid gap-x-4 gap-y-2 sm:grid-cols-2">
            <label class="form-field"><span>Luminosità · {{ brightness() }}%</span><input class="w-full accent-teal-700" type="range" min="70" max="140" step="1" [value]="brightness()" (input)="setBrightness($any($event.target).value)" /></label>
            <label class="form-field"><span>Contrasto · {{ contrast() }}%</span><input class="w-full accent-teal-700" type="range" min="70" max="160" step="1" [value]="contrast()" (input)="setContrast($any($event.target).value)" /></label>
            <label class="form-field sm:col-span-2"><span>Temperatura colore · {{ warmth() > 0 ? 'calda' : warmth() < 0 ? 'fredda' : 'neutra' }} ({{ warmth() }})</span><input class="w-full accent-teal-700" type="range" min="-35" max="35" step="1" [value]="warmth()" (input)="setWarmth($any($event.target).value)" /><small class="text-xs text-slate-500">Sposta il cursore verso sinistra per raffreddare i colori o verso destra per scaldarli.</small></label>
          </div>
          <p class="text-xs text-slate-500 dark:text-slate-400">Trascina sulla pagina per scegliere il ritaglio. Le regolazioni si applicano solo a questa pagina.</p>
          <div class="grid grid-cols-3 gap-2 sm:grid-cols-5">
            @for (page of pages(); track page.id; let index = $index) {
              <div class="rounded-lg border p-1.5" [class.border-teal-500]="index === activeIndex()" [class.border-slate-200]="index !== activeIndex()" [class.dark:border-teal-500]="index === activeIndex()" [class.dark:border-slate-700]="index !== activeIndex()">
                <button type="button" class="block w-full" [disabled]="busy()" (click)="selectPage(index)" [attr.aria-label]="'Modifica pagina ' + (index + 1)"><img class="mx-auto h-20 w-full object-contain" [src]="page.previewUrl" alt="" /><span class="block text-center text-xs">{{ index + 1 }}</span></button>
                <div class="mt-1 flex justify-center gap-2"><button type="button" class="text-xs text-teal-700 underline dark:text-teal-300" [disabled]="index === 0 || busy()" (click)="movePageAt(index, -1)">Su</button><button type="button" class="text-xs text-teal-700 underline dark:text-teal-300" [disabled]="index === pages().length - 1 || busy()" (click)="movePageAt(index, 1)">Giù</button></div>
              </div>
            }
          </div>
          <div class="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-3 dark:border-slate-800">
            <p class="max-w-xl text-xs leading-5 text-slate-500">Il PDF viene compresso localmente mantenendo alta risoluzione e qualità visiva. Il file resta entro il limite di archiviazione dell’app quando possibile.</p>
            <button type="button" class="button-primary" [disabled]="busy() || !pages().length" (click)="createPdf()">{{ busy() ? 'Preparazione PDF…' : 'Crea PDF con ' + pages().length + (pages().length === 1 ? ' pagina' : ' pagine') }}</button>
          </div>
        </div>
      }

      @if (error()) { <p class="notice-error" role="alert">{{ error() }}</p> }
      <canvas #detectorCanvas class="hidden" aria-hidden="true"></canvas>
    </section>
  `,
})
export class DocumentScannerComponent implements OnDestroy {
  @Output() readonly completed = new EventEmitter<File>();
  @Output() readonly dismiss = new EventEmitter<void>();
  @ViewChild('cameraVideo', { static: true }) private cameraVideo!: ElementRef<HTMLVideoElement>;
  @ViewChild('editorCanvas', { static: true }) private editorCanvas!: ElementRef<HTMLCanvasElement>;
  @ViewChild('detectorCanvas', { static: true }) private detectorCanvas!: ElementRef<HTMLCanvasElement>;

  readonly pages = signal<ScanPage[]>([]);
  readonly activeIndex = signal(0);
  readonly cameraActive = signal(false);
  readonly cameraDetection = signal<DetectionBox | null>(null);
  readonly cameraOverlay = computed(() => {
    const box = this.cameraDetection();
    const video = this.cameraVideo?.nativeElement;
    if (!box || !video?.videoWidth || !video.videoHeight) return null;
    const frame = video.getBoundingClientRect();
    const scale = Math.min(frame.width / video.videoWidth, frame.height / video.videoHeight);
    const contentWidth = video.videoWidth * scale;
    const contentHeight = video.videoHeight * scale;
    return {
      left: (frame.width - contentWidth) / 2 + box.x * contentWidth,
      top: (frame.height - contentHeight) / 2 + box.y * contentHeight,
      width: box.width * contentWidth,
      height: box.height * contentHeight,
    };
  });
  readonly autoCapture = signal(false);
  readonly busy = signal(false);
  readonly error = signal('');
  readonly look = signal<ScanLook>('colore');
  readonly lookOptions = ['Colore originale', 'Scala di grigi', 'Bianco e nero nitido'];
  readonly lookLabel = computed(() => this.look() === 'grigio'
    ? 'Scala di grigi'
    : this.look() === 'bianco-nero'
      ? 'Bianco e nero nitido'
      : 'Colore originale');
  readonly brightness = signal(100);
  readonly contrast = signal(100);
  readonly warmth = signal(0);
  readonly maxPages = MAX_SCAN_PAGES;
  readonly currentPage = computed(() => this.pages()[this.activeIndex()] ?? null);

  cameraStream: MediaStream | null = null;
  private currentImage: HTMLImageElement | null = null;
  private cameraTimer?: ReturnType<typeof setInterval>;
  private stableCandidate: DetectionBox | null = null;
  private stableFrames = 0;
  private waitingForPageChange = false;
  private lastAutoCaptureAt = 0;
  private cropRect: ScanCrop | null = null;
  private cropStart: { x: number; y: number } | null = null;
  private previousCrop: ScanCrop | null = null;
  private imageLoadVersion = 0;

  ngOnDestroy(): void {
    this.stopCamera();
    this.imageLoadVersion++;
    this.pages().forEach((page) => URL.revokeObjectURL(page.previewUrl));
  }

  async startCamera(): Promise<void> {
    this.error.set('');
    if (!navigator.mediaDevices?.getUserMedia) {
      this.error.set('La fotocamera non è disponibile. Usa “Aggiungi foto” per selezionare immagini dal dispositivo.');
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1440 } },
      });
      this.cameraStream = stream;
      this.cameraActive.set(true);
      const video = this.cameraVideo.nativeElement;
      video.srcObject = stream;
      await video.play();
      this.cameraTimer = setInterval(() => this.detectCameraPage(), 350);
    } catch {
      this.stopCamera();
      this.error.set('Impossibile aprire la fotocamera. Controlla i permessi del browser oppure aggiungi le foto dalla galleria.');
    }
  }

  stopCamera(): void {
    if (this.cameraTimer) clearInterval(this.cameraTimer);
    this.cameraTimer = undefined;
    this.cameraStream?.getTracks().forEach((track) => track.stop());
    this.cameraStream = null;
    const video = this.cameraVideo?.nativeElement;
    if (video) video.srcObject = null;
    this.cameraActive.set(false);
    this.cameraDetection.set(null);
    this.stableCandidate = null;
    this.stableFrames = 0;
  }

  setAutoCapture(enabled: boolean): void {
    this.autoCapture.set(enabled);
    this.stableCandidate = null;
    this.stableFrames = 0;
    this.waitingForPageChange = false;
  }

  async capturePage(automatic = false): Promise<void> {
    const video = this.cameraVideo.nativeElement;
    if (this.pages().length >= MAX_SCAN_PAGES) {
      this.error.set(`Hai raggiunto il limite di ${MAX_SCAN_PAGES} pagine.`);
      this.setAutoCapture(false);
      return;
    }
    if (!video.videoWidth || !video.videoHeight || this.busy()) return;
    if (automatic && Date.now() - this.lastAutoCaptureAt < 1800) return;
    if (this.autoCapture()) this.waitingForPageChange = true;
    this.error.set('');
    const canvas = document.createElement('canvas');
    const scale = Math.min(1, MAX_IMAGE_EDGE / Math.max(video.videoWidth, video.videoHeight));
    canvas.width = Math.max(1, Math.round(video.videoWidth * scale));
    canvas.height = Math.max(1, Math.round(video.videoHeight * scale));
    const context = canvas.getContext('2d');
    if (!context) {
      this.error.set('La fotocamera non ha prodotto un’immagine utilizzabile.');
      return;
    }
    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    const detected = this.cameraDetection();
    const crop = detected
      ? insetDetection(detected, canvas.width, canvas.height)
      : { x: 0, y: 0, width: 1, height: 1 };
    try {
      const blob = await canvasToJpeg(canvas, 0.95);
      this.addPage(blob, crop);
      if (automatic) this.lastAutoCaptureAt = Date.now();
    } catch {
      this.error.set('Non è stato possibile acquisire la pagina. Riprova con una foto più piccola.');
    }
  }

  async importImages(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const files = Array.from(input.files ?? []);
    input.value = '';
    this.error.set('');
    for (const file of files) {
      if (this.pages().length >= MAX_SCAN_PAGES) {
        this.error.set(`Puoi inserire al massimo ${MAX_SCAN_PAGES} pagine in uno stesso PDF.`);
        break;
      }
      if (!file.type.startsWith('image/') || file.size > MAX_SCAN_FILE_BYTES) {
        this.error.set('Scegli immagini leggibili dal browser, fino a 25 MB ciascuna.');
        continue;
      }
      try {
        const bitmap = await createImageBitmap(file);
        const scale = Math.min(1, MAX_IMAGE_EDGE / Math.max(bitmap.width, bitmap.height));
        let blob: Blob = file;
        if (scale < 1 || file.type !== 'image/jpeg') {
          const canvas = document.createElement('canvas');
          canvas.width = Math.max(1, Math.round(bitmap.width * scale));
          canvas.height = Math.max(1, Math.round(bitmap.height * scale));
          canvas.getContext('2d')?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
          blob = await canvasToJpeg(canvas, 0.95);
        }
        bitmap.close();
        this.addPage(blob, { x: 0, y: 0, width: 1, height: 1 });
      } catch {
        this.error.set(`Il browser non riesce a leggere “${file.name}”. Prova a convertirla in JPEG o PNG.`);
      }
    }
  }

  selectPage(index: number): void {
    if (index < 0 || index >= this.pages().length || index === this.activeIndex()) return;
    this.saveEditorState();
    this.activeIndex.set(index);
    void this.loadCurrentPage();
  }

  movePage(direction: number): void {
    this.movePageAt(this.activeIndex(), direction);
  }

  movePageAt(index: number, direction: number): void {
    const target = index + direction;
    const pages = [...this.pages()];
    if (target < 0 || target >= pages.length || this.busy()) return;
    this.saveEditorState();
    [pages[index], pages[target]] = [pages[target], pages[index]];
    this.pages.set(pages);
    if (this.activeIndex() === index) this.activeIndex.set(target);
    else if (this.activeIndex() === target) this.activeIndex.set(index);
    void this.loadCurrentPage();
  }

  removePage(): void {
    const pages = [...this.pages()];
    const [removed] = pages.splice(this.activeIndex(), 1);
    if (!removed) return;
    URL.revokeObjectURL(removed.previewUrl);
    this.pages.set(pages);
    this.activeIndex.set(Math.min(this.activeIndex(), pages.length - 1));
    if (pages.length) void this.loadCurrentPage();
    else this.clearEditor();
  }

  rotate(degrees: number): void {
    const page = this.currentPage();
    if (!page) return;
    this.cropRect = null;
    this.updateActivePage({ rotation: (page.rotation + degrees + 360) % 360, crop: { x: 0, y: 0, width: 1, height: 1 } });
    this.drawPreview();
  }

  resetCrop(): void {
    this.cropRect = null;
    this.updateActivePage({ crop: { x: 0, y: 0, width: 1, height: 1 } });
    this.drawPreview();
  }

  setLook(value: string): void {
    const look: ScanLook | null = value === 'Scala di grigi'
      ? 'grigio'
      : value === 'Bianco e nero nitido'
        ? 'bianco-nero'
        : value === 'Colore originale'
          ? 'colore'
          : null;
    if (!look) return;
    this.look.set(look);
    this.updateActivePage({ look });
    this.drawPreview();
  }

  setBrightness(value: string): void {
    const brightness = clamp(Number(value) || 100, 70, 140);
    this.brightness.set(brightness);
    this.updateActivePage({ brightness });
    this.drawPreview();
  }

  setContrast(value: string): void {
    const contrast = clamp(Number(value) || 100, 70, 160);
    this.contrast.set(contrast);
    this.updateActivePage({ contrast });
    this.drawPreview();
  }

  setWarmth(value: string): void {
    const warmth = clamp(Number(value) || 0, -35, 35);
    this.warmth.set(warmth);
    this.updateActivePage({ warmth });
    this.drawPreview();
  }

  startCrop(event: PointerEvent): void {
    if (!this.currentPage() || (event.button !== 0 && event.pointerType !== 'touch')) return;
    const point = this.canvasPoint(event);
    if (!point) return;
    event.preventDefault();
    this.editorCanvas.nativeElement.setPointerCapture(event.pointerId);
    this.previousCrop = this.cropRect ? { ...this.cropRect } : null;
    this.cropStart = point;
    this.cropRect = { x: point.x, y: point.y, width: 1, height: 1 };
    this.drawPreview();
  }

  moveCrop(event: PointerEvent): void {
    if (!this.cropStart) return;
    const point = this.canvasPoint(event);
    if (!point) return;
    this.cropRect = areaFromPoints(this.cropStart, point);
    this.drawPreview();
  }

  finishCrop(event: PointerEvent): void {
    if (!this.cropStart) return;
    const point = this.canvasPoint(event);
    if (point) this.cropRect = areaFromPoints(this.cropStart, point);
    this.cropStart = null;
    if (!this.cropRect || this.cropRect.width < 12 || this.cropRect.height < 12) {
      this.cropRect = this.previousCrop;
      this.error.set('Seleziona un’area più grande per ritagliare la pagina.');
    } else {
      this.error.set('');
      this.saveEditorState();
    }
    this.previousCrop = null;
    this.drawPreview();
  }

  async createPdf(): Promise<void> {
    if (!this.pages().length || this.busy()) return;
    this.saveEditorState();
    this.busy.set(true);
    this.error.set('');
    try {
      const pages = this.pages();
      const targetBytesPerPage = Math.min(1_200_000, Math.floor((15 * 1024 * 1024) / pages.length));
      let pdf: jsPDF | null = null;
      for (let index = 0; index < pages.length; index++) {
        const page = pages[index];
        const image = await decodeImage(page.previewUrl);
        const prepared = renderPage(image, page);
        const jpeg = await encodeWithinBudget(prepared, targetBytesPerPage);
        const orientation = prepared.width > prepared.height ? 'landscape' : 'portrait';
        if (!pdf) pdf = new jsPDF({ orientation, unit: 'mm', format: 'a4', compress: true });
        else pdf.addPage('a4', orientation);
        const width = pdf.internal.pageSize.getWidth();
        const height = pdf.internal.pageSize.getHeight();
        const margin = 5;
        const scale = Math.min((width - margin * 2) / prepared.width, (height - margin * 2) / prepared.height);
        const imageWidth = prepared.width * scale;
        const imageHeight = prepared.height * scale;
        pdf.addImage(new Uint8Array(await jpeg.arrayBuffer()), 'JPEG', (width - imageWidth) / 2, (height - imageHeight) / 2, imageWidth, imageHeight, undefined, 'MEDIUM');
        prepared.width = 0;
        prepared.height = 0;
      }
      if (!pdf) throw new Error('empty-document');
      const blob = pdf.output('blob');
      if (blob.size > 19 * 1024 * 1024) {
        throw new Error('document-too-large');
      }
      this.completed.emit(new File([blob], `scansione-${new Date().toISOString().slice(0, 10)}.pdf`, { type: 'application/pdf' }));
    } catch (error) {
      this.error.set(error instanceof Error && error.message === 'document-too-large'
        ? 'Il PDF supera il limite di 20 MB. Rimuovi alcune pagine oppure riduci la qualità delle immagini prima di riprovare.'
        : 'Non è stato possibile creare il PDF. Riprova o riduci il numero di pagine.');
    } finally {
      this.busy.set(false);
    }
  }

  private addPage(blob: Blob, crop: ScanCrop): void {
    const previewUrl = URL.createObjectURL(blob);
    const page: ScanPage = {
      id: crypto.randomUUID(), blob, previewUrl, crop, rotation: 0,
      look: 'colore', brightness: 100, contrast: 100, warmth: 0,
    };
    this.pages.update((pages) => [...pages, page]);
    this.activeIndex.set(this.pages().length - 1);
    this.loadSettings(page);
    void this.loadCurrentPage();
    if (this.pages().length >= MAX_SCAN_PAGES) this.error.set(`Hai raggiunto il limite di ${MAX_SCAN_PAGES} pagine.`);
  }

  private async loadCurrentPage(): Promise<void> {
    const page = this.currentPage();
    const version = ++this.imageLoadVersion;
    if (!page) {
      this.clearEditor();
      return;
    }
    try {
      const image = await decodeImage(page.previewUrl);
      if (version !== this.imageLoadVersion) return;
      this.currentImage = image;
      this.loadSettings(page);
      const previewScale = Math.min(1, 1400 / Math.max(orientedWidth(image, page.rotation), orientedHeight(image, page.rotation)));
      this.cropRect = normalizedToPixels(
        page.crop,
        Math.round(orientedWidth(image, page.rotation) * previewScale),
        Math.round(orientedHeight(image, page.rotation) * previewScale),
      );
      this.drawPreview();
    } catch {
      this.error.set('Non è stato possibile aprire la pagina selezionata.');
    }
  }

  private loadSettings(page: ScanPage): void {
    this.look.set(page.look);
    this.brightness.set(page.brightness);
    this.contrast.set(page.contrast);
    this.warmth.set(page.warmth);
  }

  private saveEditorState(): void {
    const page = this.currentPage();
    const canvas = this.editorCanvas?.nativeElement;
    if (!page || !canvas) return;
    const crop = this.cropRect ?? { x: 0, y: 0, width: canvas.width, height: canvas.height };
    const normalized = pixelsToNormalized(crop, canvas.width, canvas.height);
    this.updateActivePage({ crop: normalized, look: this.look(), brightness: this.brightness(), contrast: this.contrast(), warmth: this.warmth() });
  }

  private updateActivePage(changes: Partial<ScanPage>): void {
    const index = this.activeIndex();
    this.pages.update((pages) => pages.map((page, pageIndex) => pageIndex === index ? { ...page, ...changes } : page));
  }

  private clearEditor(): void {
    this.currentImage = null;
    this.cropRect = null;
    const canvas = this.editorCanvas?.nativeElement;
    canvas?.getContext('2d')?.clearRect(0, 0, canvas.width, canvas.height);
    this.look.set('colore');
    this.brightness.set(100);
    this.contrast.set(100);
    this.warmth.set(0);
  }

  private drawPreview(): void {
    const image = this.currentImage;
    const canvas = this.editorCanvas?.nativeElement;
    const page = this.currentPage();
    if (!image || !canvas || !page) return;
    const width = orientedWidth(image, page.rotation);
    const height = orientedHeight(image, page.rotation);
    const scale = Math.min(1, 1400 / Math.max(width, height));
    canvas.width = Math.max(1, Math.round(width * scale));
    canvas.height = Math.max(1, Math.round(height * scale));
    const crop = this.cropRect ?? normalizedToPixels(page.crop, canvas.width, canvas.height);
    drawAdjusted(canvas, image, page, this.look(), this.brightness(), this.contrast(), this.warmth());
    const context = canvas.getContext('2d');
    if (!context) return;
    context.fillStyle = 'rgba(15,23,42,.55)';
    context.fillRect(0, 0, canvas.width, crop.y);
    context.fillRect(0, crop.y + crop.height, canvas.width, canvas.height - crop.y - crop.height);
    context.fillRect(0, crop.y, crop.x, crop.height);
    context.fillRect(crop.x + crop.width, crop.y, canvas.width - crop.x - crop.width, crop.height);
    context.strokeStyle = '#5eead4';
    context.lineWidth = Math.max(2, canvas.width / 350);
    context.strokeRect(crop.x, crop.y, crop.width, crop.height);
  }

  private canvasPoint(event: PointerEvent): { x: number; y: number } | null {
    const canvas = this.editorCanvas.nativeElement;
    const rect = canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return null;
    return {
      x: clamp(((event.clientX - rect.left) / rect.width) * canvas.width, 0, canvas.width),
      y: clamp(((event.clientY - rect.top) / rect.height) * canvas.height, 0, canvas.height),
    };
  }

  private detectCameraPage(): void {
    const video = this.cameraVideo.nativeElement;
    if (!this.cameraActive() || !video.videoWidth || !video.videoHeight) return;
    const canvas = this.detectorCanvas.nativeElement;
    const scale = Math.min(1, 320 / Math.max(video.videoWidth, video.videoHeight));
    canvas.width = Math.max(1, Math.round(video.videoWidth * scale));
    canvas.height = Math.max(1, Math.round(video.videoHeight * scale));
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (!context) return;
    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    const detection = detectBrightPage(context.getImageData(0, 0, canvas.width, canvas.height));
    this.cameraDetection.set(detection);
    if (!detection) {
      this.stableCandidate = null;
      this.stableFrames = 0;
      this.waitingForPageChange = false;
      return;
    }
    if (this.waitingForPageChange && this.stableCandidate && boxesAreClose(this.stableCandidate, detection)) {
      this.stableFrames = 0;
      return;
    }
    this.waitingForPageChange = false;
    if (this.stableCandidate && boxesAreClose(this.stableCandidate, detection)) this.stableFrames++;
    else this.stableFrames = 0;
    this.stableCandidate = detection;
    if (this.autoCapture() && this.stableFrames >= 4) {
      this.stableFrames = 0;
      this.waitingForPageChange = true;
      void this.capturePage(true);
    }
  }
}

function detectBrightPage(image: ImageData): DetectionBox | null {
  const { width, height, data } = image;
  const count = width * height;
  const mask = new Uint8Array(count);
  const visited = new Uint8Array(count);
  const queue = new Int32Array(count);
  for (let index = 0, offset = 0; index < count; index++, offset += 4) {
    const red = data[offset], green = data[offset + 1], blue = data[offset + 2];
    const luminance = red * 0.299 + green * 0.587 + blue * 0.114;
    const saturation = Math.max(red, green, blue) - Math.min(red, green, blue);
    mask[index] = luminance > 183 && saturation < 105 || luminance > 156 && saturation < 30 ? 1 : 0;
  }
  let largest: { left: number; top: number; right: number; bottom: number; pixels: number } | null = null;
  for (let start = 0; start < count; start++) {
    if (!mask[start] || visited[start]) continue;
    let head = 0, tail = 0;
    queue[tail++] = start;
    visited[start] = 1;
    let left = width, top = height, right = 0, bottom = 0;
    while (head < tail) {
      const index = queue[head++];
      const x = index % width, y = (index / width) | 0;
      left = Math.min(left, x); top = Math.min(top, y); right = Math.max(right, x); bottom = Math.max(bottom, y);
      if (x > 0 && mask[index - 1] && !visited[index - 1]) { visited[index - 1] = 1; queue[tail++] = index - 1; }
      if (x + 1 < width && mask[index + 1] && !visited[index + 1]) { visited[index + 1] = 1; queue[tail++] = index + 1; }
      if (y > 0 && mask[index - width] && !visited[index - width]) { visited[index - width] = 1; queue[tail++] = index - width; }
      if (y + 1 < height && mask[index + width] && !visited[index + width]) { visited[index + width] = 1; queue[tail++] = index + width; }
    }
    if (!largest || tail > largest.pixels) largest = { left, top, right, bottom, pixels: tail };
  }
  if (!largest) return null;
  const boxWidth = largest.right - largest.left + 1;
  const boxHeight = largest.bottom - largest.top + 1;
  const areaRatio = (boxWidth * boxHeight) / count;
  const fill = largest.pixels / (boxWidth * boxHeight);
  const aspect = boxWidth / boxHeight;
  const margin = Math.min(largest.left / width, largest.top / height, (width - largest.right) / width, (height - largest.bottom) / height);
  if (areaRatio < 0.12 || areaRatio > 0.88 || fill < 0.42 || aspect < 0.42 || aspect > 2.2 || margin < 0.015) return null;
  return { x: largest.left / width, y: largest.top / height, width: boxWidth / width, height: boxHeight / height };
}

function boxesAreClose(a: DetectionBox, b: DetectionBox): boolean {
  return Math.abs(a.x - b.x) < 0.035 && Math.abs(a.y - b.y) < 0.035 && Math.abs(a.width - b.width) < 0.05 && Math.abs(a.height - b.height) < 0.05;
}

function insetDetection(box: DetectionBox, width: number, height: number): ScanCrop {
  const insetX = Math.min(0.012, 1 / Math.max(1, box.width * width));
  const insetY = Math.min(0.012, 1 / Math.max(1, box.height * height));
  return { x: box.x + insetX, y: box.y + insetY, width: Math.max(0.1, box.width - insetX * 2), height: Math.max(0.1, box.height - insetY * 2) };
}

function decodeImage(url: string): Promise<HTMLImageElement> {
  const image = new Image();
  image.src = url;
  return image.decode().then(() => image);
}

function orientedWidth(image: HTMLImageElement | ImageBitmap, rotation: number): number {
  return rotation % 180 ? image.height : image.width;
}

function orientedHeight(image: HTMLImageElement | ImageBitmap, rotation: number): number {
  return rotation % 180 ? image.width : image.height;
}

function normalizedToPixels(crop: ScanCrop, width: number, height: number): ScanCrop {
  return { x: crop.x * width, y: crop.y * height, width: crop.width * width, height: crop.height * height };
}

function pixelsToNormalized(crop: ScanCrop, width: number, height: number): ScanCrop {
  return { x: crop.x / width, y: crop.y / height, width: crop.width / width, height: crop.height / height };
}

function areaFromPoints(start: { x: number; y: number }, end: { x: number; y: number }): ScanCrop {
  return { x: Math.min(start.x, end.x), y: Math.min(start.y, end.y), width: Math.abs(end.x - start.x), height: Math.abs(end.y - start.y) };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function drawAdjusted(
  canvas: HTMLCanvasElement,
  image: HTMLImageElement | ImageBitmap | HTMLCanvasElement,
  page: Pick<ScanPage, 'rotation'>,
  look: ScanLook,
  brightness: number,
  contrast: number,
  warmth: number,
): void {
  const context = canvas.getContext('2d');
  if (!context) throw new Error('canvas-unavailable');
  context.fillStyle = '#fff';
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.save();
  context.translate(canvas.width / 2, canvas.height / 2);
  context.rotate((page.rotation * Math.PI) / 180);
  context.filter = `brightness(${brightness}%) contrast(${contrast}%)${look === 'grigio' || look === 'bianco-nero' ? ' grayscale(1)' : ''}`;
  context.drawImage(image, -image.width / 2, -image.height / 2, image.width, image.height);
  context.restore();
  if (warmth || look === 'bianco-nero') {
    const pixels = context.getImageData(0, 0, canvas.width, canvas.height);
    const amount = warmth * 0.45;
    for (let offset = 0; offset < pixels.data.length; offset += 4) {
      if (look === 'bianco-nero') {
        const luminance = pixels.data[offset] * 0.299 + pixels.data[offset + 1] * 0.587 + pixels.data[offset + 2] * 0.114;
        const value = luminance > 174 ? 255 : 0;
        pixels.data[offset] = value;
        pixels.data[offset + 1] = value;
        pixels.data[offset + 2] = value;
      } else {
        pixels.data[offset] = clamp(pixels.data[offset] + amount, 0, 255);
        pixels.data[offset + 1] = clamp(pixels.data[offset + 1] + amount * 0.12, 0, 255);
        pixels.data[offset + 2] = clamp(pixels.data[offset + 2] - amount, 0, 255);
      }
    }
    context.putImageData(pixels, 0, 0);
  }
  context.filter = 'none';
}

function renderPage(image: HTMLImageElement, page: ScanPage): HTMLCanvasElement {
  const scale = Math.min(1, MAX_IMAGE_EDGE / Math.max(image.naturalWidth, image.naturalHeight));
  const width = Math.max(1, Math.round(orientedWidth(image, page.rotation) * scale));
  const height = Math.max(1, Math.round(orientedHeight(image, page.rotation) * scale));
  const oriented = document.createElement('canvas');
  oriented.width = width;
  oriented.height = height;
  const scaledImage = document.createElement('canvas');
  scaledImage.width = Math.max(1, Math.round(image.naturalWidth * scale));
  scaledImage.height = Math.max(1, Math.round(image.naturalHeight * scale));
  const scaledContext = scaledImage.getContext('2d');
  if (!scaledContext) throw new Error('canvas-unavailable');
  scaledContext.drawImage(image, 0, 0, scaledImage.width, scaledImage.height);
  drawAdjusted(oriented, scaledImage, page, page.look, page.brightness, page.contrast, page.warmth);
  const crop = normalizedToPixels(page.crop, width, height);
  const left = clamp(Math.floor(crop.x), 0, width - 1);
  const top = clamp(Math.floor(crop.y), 0, height - 1);
  const cropWidth = clamp(Math.ceil(crop.width), 1, width - left);
  const cropHeight = clamp(Math.ceil(crop.height), 1, height - top);
  const output = document.createElement('canvas');
  output.width = cropWidth;
  output.height = cropHeight;
  const outputContext = output.getContext('2d');
  if (!outputContext) throw new Error('canvas-unavailable');
  outputContext.fillStyle = '#fff';
  outputContext.fillRect(0, 0, cropWidth, cropHeight);
  outputContext.drawImage(oriented, left, top, cropWidth, cropHeight, 0, 0, cropWidth, cropHeight);
  oriented.width = 0;
  oriented.height = 0;
  scaledImage.width = 0;
  scaledImage.height = 0;
  return output;
}

async function encodeWithinBudget(canvas: HTMLCanvasElement, targetBytes: number): Promise<Blob> {
  const qualities = [0.96, 0.94, 0.92, 0.9, 0.88, 0.86];
  let blob = await canvasToJpeg(canvas, qualities[0]);
  for (const quality of qualities.slice(1)) {
    if (blob.size <= targetBytes) break;
    blob = await canvasToJpeg(canvas, quality);
  }
  for (let attempt = 0; blob.size > targetBytes && attempt < 3; attempt++) {
    const factor = Math.max(0.72, Math.min(0.94, Math.sqrt(targetBytes / blob.size) * 0.96));
    const smaller = document.createElement('canvas');
    smaller.width = Math.max(1, Math.round(canvas.width * factor));
    smaller.height = Math.max(1, Math.round(canvas.height * factor));
    smaller.getContext('2d')?.drawImage(canvas, 0, 0, smaller.width, smaller.height);
    blob = await canvasToJpeg(smaller, 0.9);
    smaller.width = 0;
    smaller.height = 0;
  }
  return blob;
}

function canvasToJpeg(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error('jpeg-encoding-failed')), 'image/jpeg', quality));
}
