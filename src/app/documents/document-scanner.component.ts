import { CommonModule } from '@angular/common';
import { Component, ElementRef, EventEmitter, OnDestroy, Output, ViewChild, computed, signal } from '@angular/core';
import { jsPDF } from 'jspdf';
import { AppDropdownComponent } from '../shared/app-dropdown.component';

type ScanLook = 'colore' | 'grigio' | 'bianco-nero' | 'testo';
type PageOrientation = 'auto' | 'portrait' | 'landscape';

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
  sharpness: number;
}

interface DetectionBox extends ScanCrop { }

const MAX_SCAN_PAGES = 30;
const MAX_SCAN_FILE_BYTES = 25 * 1024 * 1024;
const MAX_IMAGE_EDGE = 2800;

@Component({
  selector: 'tc-document-scanner',
  standalone: true,
  imports: [CommonModule, AppDropdownComponent],
  template: `
    <section class="space-y-2 rounded-xl border border-teal-200 bg-white p-2 dark:border-teal-800 dark:bg-slate-900 sm:space-y-3 sm:p-3" aria-labelledby="scanner-title">
      <header class="flex items-center gap-2">
        <span class="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-teal-100 text-teal-800 dark:bg-teal-900/50 dark:text-teal-200" aria-hidden="true">
          <svg class="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7h3l1.5-2h7L17 7h3a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V8a1 1 0 0 1 1-1Z"/><circle cx="12" cy="13" r="3.5"/></svg>
        </span>
        <div class="min-w-0 flex-1">
          <h3 id="scanner-title" class="font-semibold text-slate-800 dark:text-slate-100">Scansiona documenti</h3>
          <p class="text-xs text-slate-500 dark:text-slate-400">Pagine e ritocchi restano su questo dispositivo.</p>
        </div>
        <button type="button" class="icon-button !h-9 !w-9 shrink-0" aria-label="Chiudi scanner" (click)="dismiss.emit()"><svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18"/></svg></button>
      </header>

      <div class="flex items-center gap-2">
        <button type="button" class="button-secondary inline-flex flex-1 items-center justify-center gap-2 !px-2.5 sm:flex-none sm:!px-3" [disabled]="busy() || cameraStarting()" (click)="cameraActive() ? stopCamera() : startCamera()">
          <svg class="h-4 w-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 7h3l1.5-2h7L17 7h3v12H4z"/><circle cx="12" cy="13" r="3.5"/></svg>
          {{ cameraStarting() ? 'Apertura fotocamera…' : cameraActive() ? 'Spegni fotocamera' : 'Apri fotocamera' }}
        </button>
        <label class="button-secondary inline-flex flex-1 cursor-pointer items-center justify-center gap-2 !px-2.5 sm:flex-none sm:!px-3">
          <svg class="h-4 w-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 16V4m0 0L7 9m5-5 5 5"/><path d="M4 15v4a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-4"/></svg>
          Aggiungi foto
          <input class="sr-only" type="file" accept="image/*" multiple (change)="importImages($event)" [disabled]="busy()" />
        </label>
        <span class="ml-auto whitespace-nowrap text-xs font-medium text-slate-500" aria-live="polite">{{ pages().length }}/{{ maxPages }}</span>
      </div>

      <div #cameraFrame class="relative mx-auto max-h-[38dvh] overflow-hidden rounded-xl bg-slate-950 sm:max-h-[55vh]" [hidden]="!cameraActive()">
        <video #cameraVideo class="block max-h-[38dvh] w-full object-contain sm:max-h-[55vh]" autoplay playsinline muted aria-label="Inquadratura della fotocamera"></video>
        @if (cameraDetection(); as box) {
          <div class="pointer-events-none absolute border-2 border-teal-300 shadow-[0_0_0_999px_rgba(15,23,42,0.22)]" [style.left.px]="cameraOverlay()?.left" [style.top.px]="cameraOverlay()?.top" [style.width.px]="cameraOverlay()?.width" [style.height.px]="cameraOverlay()?.height" aria-hidden="true"></div>
        }
        @if (cameraActive() && !cameraDetection()) {
          <div class="pointer-events-none absolute inset-[10%] rounded-lg border-2 border-dashed border-white/70" aria-hidden="true"></div>
        }
      </div>
      @if (cameraActive()) {
        <div class="space-y-1.5">
          @if (previewNeedsTap()) {
            <p class="text-sm text-amber-800 dark:text-amber-200" role="status">La fotocamera è attiva, ma Chrome non ha avviato l’anteprima.</p>
            <button type="button" class="button-primary" (click)="resumeCameraPreview()">Avvia anteprima</button>
          } @else {
            <div class="flex flex-wrap items-center justify-between gap-2">
              <p class="min-w-0 flex-1 text-xs text-slate-500 dark:text-slate-400" role="status" aria-live="polite">
                @if (cameraDetection()) { Foglio rilevato · mantieni fermo il telefono } @else { Inquadra il foglio; puoi scattare manualmente }
              </p>
              <div class="flex shrink-0 items-center gap-2">
                @if (manualRefocusSupported()) {
                  <button type="button" class="button-secondary !min-h-10 !px-2.5" aria-label="Rimetti a fuoco" title="Rimetti a fuoco" (click)="refocusCamera()"><svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="3"/><path d="M19 12a7 7 0 0 0-7-7m7 7a7 7 0 0 1-7 7m-7-7a7 7 0 0 0 7 7m-7-7a7 7 0 0 1 7-7"/></svg></button>
                }
                <button type="button" class="button-primary inline-flex items-center gap-2 !px-3" [disabled]="busy()" (click)="capturePage()"><svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="8"/></svg>Scatta</button>
              </div>
            </div>
            <label class="inline-flex min-h-9 cursor-pointer items-center gap-2 rounded-lg border border-slate-200 px-2.5 dark:border-slate-700">
              <input type="checkbox" class="accent-teal-700" [checked]="autoCapture()" (change)="setAutoCapture($any($event.target).checked)" />
              <span class="text-xs sm:text-sm">Scatto automatico</span>
            </label>
          }
        </div>
      }

      @if (pages().length) {
        <div class="space-y-3 border-t border-slate-100 pt-3 dark:border-slate-800">
          <div class="flex items-center justify-between gap-2">
            <div class="flex items-center gap-2">
              <button type="button" class="button-secondary !min-h-11 !w-11 !p-0" aria-label="Pagina precedente" title="Pagina precedente" [disabled]="activeIndex() === 0 || busy()" (click)="selectPage(activeIndex() - 1)"><svg class="mx-auto h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m15 18-6-6 6-6"/></svg></button>
              <span class="text-sm font-medium">Pagina {{ activeIndex() + 1 }} di {{ pages().length }}</span>
              <button type="button" class="button-secondary !min-h-11 !w-11 !p-0" aria-label="Pagina successiva" title="Pagina successiva" [disabled]="activeIndex() >= pages().length - 1 || busy()" (click)="selectPage(activeIndex() + 1)"><svg class="mx-auto h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m9 18 6-6-6-6"/></svg></button>
            </div>
            <div class="flex gap-2">
              <button type="button" class="button-secondary !min-h-9 !px-2.5" aria-label="Ruota pagina a sinistra" title="Ruota a sinistra" [disabled]="busy()" (click)="rotate(-90)"><svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/></svg></button>
              <button type="button" class="button-secondary !min-h-9 !px-2.5" aria-label="Ruota pagina a destra" title="Ruota a destra" [disabled]="busy()" (click)="rotate(90)"><svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 12a9 9 0 1 1-3-6.7L21 8"/><path d="M21 3v5h-5"/></svg></button>
            </div>
          </div>

          <div class="overflow-hidden rounded-xl border border-slate-200 bg-slate-950 dark:border-slate-700">
            <canvas #editorCanvas class="block h-auto max-h-[38dvh] w-full touch-none object-contain sm:max-h-[55vh]" aria-label="Anteprima pagina; trascina per ritagliare" (pointerdown)="startCrop($event)" (pointermove)="moveCrop($event)" (pointerup)="finishCrop($event)" (pointercancel)="finishCrop($event)"></canvas>
          </div>
          <div class="grid grid-cols-4 gap-2">
            <button type="button" class="button-secondary !min-h-11 !px-2" aria-label="Ripristina ritaglio" title="Ripristina ritaglio" [disabled]="busy()" (click)="resetCrop()"><svg class="mx-auto h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 9V4h5M20 15v5h-5M5.6 5.6A8 8 0 0 1 19 9m-.6 9.4A8 8 0 0 1 5 15"/></svg></button>
            <button type="button" class="button-secondary !min-h-11 !px-2" aria-label="Sposta pagina su" title="Sposta su" [disabled]="activeIndex() === 0 || busy()" (click)="movePage(-1)"><svg class="mx-auto h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 19V5m-7 7 7-7 7 7"/></svg></button>
            <button type="button" class="button-secondary !min-h-11 !px-2" aria-label="Sposta pagina giù" title="Sposta giù" [disabled]="activeIndex() >= pages().length - 1 || busy()" (click)="movePage(1)"><svg class="mx-auto h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 5v14m7-7-7 7-7-7"/></svg></button>
            <button type="button" class="button-secondary !min-h-11 !px-2 !text-rose-700 dark:!text-rose-300" aria-label="Elimina pagina" title="Elimina pagina" [disabled]="busy()" (click)="removePage()"><svg class="mx-auto h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 6h18M8 6V4h8v2m3 0-.8 14H5L4 6m5 4v6m6-6v6"/></svg></button>
          </div>
          <label class="form-field"><span>Migliora immagine</span><app-dropdown [options]="lookOptions" [value]="lookLabel()" placeholder="Scegli filtro" (selection)="setLook($event)" /></label>
          <details class="rounded-xl border border-slate-200 px-3 dark:border-slate-700">
            <summary class="flex min-h-11 cursor-pointer items-center font-medium">Regolazioni fini: luce, colore e nitidezza</summary>
            <div class="grid gap-x-4 gap-y-2 pb-3 sm:grid-cols-2">
              <label class="form-field"><span>Luminosità · {{ brightness() }}%</span><input class="w-full accent-teal-700" type="range" min="70" max="140" step="1" [value]="brightness()" (input)="setBrightness($any($event.target).value)" /></label>
              <label class="form-field"><span>Contrasto · {{ contrast() }}%</span><input class="w-full accent-teal-700" type="range" min="70" max="160" step="1" [value]="contrast()" (input)="setContrast($any($event.target).value)" /></label>
              <label class="form-field"><span>Nitidezza · {{ sharpness() }}%</span><input class="w-full accent-teal-700" type="range" min="0" max="100" step="1" [value]="sharpness()" (input)="setSharpness($any($event.target).value)" /><small class="text-xs text-slate-500">Aiuta con una lieve sfocatura; non può recuperare una foto fuori fuoco.</small></label>
              <label class="form-field sm:col-span-2"><span>Temperatura colore · {{ warmth() > 0 ? 'calda' : warmth() < 0 ? 'fredda' : 'neutra' }} ({{ warmth() }})</span><input class="w-full accent-teal-700" type="range" min="-35" max="35" step="1" [value]="warmth()" (input)="setWarmth($any($event.target).value)" /><small class="text-xs text-slate-500">Sposta il cursore verso sinistra per raffreddare i colori o verso destra per scaldarli.</small></label>
            </div>
          </details>
          @if (look() === 'testo') {
            <p class="rounded-lg bg-teal-50 px-3 py-2 text-xs leading-5 text-teal-900 dark:bg-teal-950/30 dark:text-teal-100">Il filtro OCR uniforma lo sfondo con una soglia locale adattiva e aumenta la nitidezza del testo. Controlla l’anteprima: timbri, firme e annotazioni colorate possono risultare meno visibili in bianco e nero.</p>
          }
          <p class="text-xs text-slate-500 dark:text-slate-400">Trascina sulla pagina per ritagliare. Le regolazioni valgono per questa pagina.</p>
          <div class="flex gap-2 overflow-x-auto pb-1">
            @for (page of pages(); track page.id; let index = $index) {
              <div class="w-24 shrink-0 rounded-lg border p-1.5" [class.border-teal-500]="index === activeIndex()" [class.border-slate-200]="index !== activeIndex()" [class.dark:border-teal-500]="index === activeIndex()" [class.dark:border-slate-700]="index !== activeIndex()">
                <button type="button" class="block min-h-11 w-full" [disabled]="busy()" (click)="selectPage(index)" [attr.aria-label]="'Modifica pagina ' + (index + 1)"><img class="mx-auto h-12 w-full object-contain" [src]="page.previewUrl" alt="" /><span class="block text-center text-xs">{{ index + 1 }}</span></button>
                <div class="mt-1 flex justify-center gap-1"><button type="button" class="button-secondary !min-h-11 !w-10 !p-0" [attr.aria-label]="'Sposta pagina ' + (index + 1) + ' su'" title="Sposta su" [disabled]="index === 0 || busy()" (click)="movePageAt(index, -1)"><svg class="mx-auto h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 19V5m-7 7 7-7 7 7"/></svg></button><button type="button" class="button-secondary !min-h-11 !w-10 !p-0" [attr.aria-label]="'Sposta pagina ' + (index + 1) + ' giù'" title="Sposta giù" [disabled]="index === pages().length - 1 || busy()" (click)="movePageAt(index, 1)"><svg class="mx-auto h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 5v14m7-7-7 7-7-7"/></svg></button></div>
              </div>
            }
          </div>
          <div class="sticky bottom-0 flex flex-col gap-2 border-t border-slate-100 bg-white/95 pt-2 backdrop-blur dark:border-slate-800 dark:bg-slate-900/95 sm:flex-row sm:items-end sm:justify-between">
            <label class="form-field sm:min-w-48"><span>Orientamento pagina A4</span><app-dropdown [options]="orientationOptions" [value]="orientationLabel()" placeholder="Orientamento" (selection)="setPageOrientation($event)" /></label>
            <button type="button" class="button-primary w-full !min-h-12 sm:w-auto" [disabled]="busy() || !pages().length" (click)="createPdf()">{{ busy() ? 'Preparazione PDF…' : 'Crea PDF · ' + pages().length + (pages().length === 1 ? ' pagina' : ' pagine') }}</button>
            <p class="text-xs leading-5 text-slate-500 sm:max-w-xl">PDF in formato A4; l’orientamento automatico segue il foglio. Immagini compresse localmente ad alta qualità.</p>
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
  @ViewChild('cameraFrame', { static: true }) private cameraFrame!: ElementRef<HTMLDivElement>;
  @ViewChild('editorCanvas') private editorCanvas!: ElementRef<HTMLCanvasElement>;
  @ViewChild('detectorCanvas', { static: true }) private detectorCanvas!: ElementRef<HTMLCanvasElement>;

  readonly pages = signal<ScanPage[]>([]);
  readonly activeIndex = signal(0);
  readonly cameraActive = signal(false);
  readonly cameraStarting = signal(false);
  readonly cameraDetection = signal<DetectionBox | null>(null);
  readonly previewNeedsTap = signal(false);
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
  readonly manualRefocusSupported = signal(false);
  readonly look = signal<ScanLook>('colore');
  readonly lookOptions = ['Colore originale', 'Scala di grigi', 'Bianco e nero nitido', 'Testo nitido (OCR)'];
  readonly lookLabel = computed(() => this.look() === 'grigio'
    ? 'Scala di grigi'
    : this.look() === 'bianco-nero'
      ? 'Bianco e nero nitido'
      : this.look() === 'testo'
        ? 'Testo nitido (OCR)'
        : 'Colore originale');
  readonly orientationOptions = ['Automatico (A4)', 'A4 verticale', 'A4 orizzontale'];
  readonly pageOrientation = signal<PageOrientation>('auto');
  readonly orientationLabel = computed(() => this.pageOrientation() === 'portrait'
    ? 'A4 verticale'
    : this.pageOrientation() === 'landscape'
      ? 'A4 orizzontale'
      : 'Automatico (A4)');
  readonly brightness = signal(100);
  readonly contrast = signal(100);
  readonly warmth = signal(0);
  readonly sharpness = signal(0);
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
  private cameraRequest = 0;
  private cameraFocusModes: string[] = [];
  private focusResetTimer?: ReturnType<typeof setTimeout>;

  ngOnDestroy(): void {
    this.stopCamera();
    this.imageLoadVersion++;
    this.pages().forEach((page) => URL.revokeObjectURL(page.previewUrl));
  }

  async startCamera(): Promise<void> {
    if (this.cameraStarting() || this.cameraActive()) return;
    this.error.set('');
    if (!navigator.mediaDevices?.getUserMedia) {
      this.error.set(!window.isSecureContext
        ? 'Chrome consente l’uso della fotocamera solo su una connessione sicura HTTPS. Usa “Aggiungi foto” oppure apri l’app tramite HTTPS.'
        : 'La fotocamera non è disponibile in questo browser. Usa “Aggiungi foto” per selezionare immagini dal dispositivo.');
      return;
    }
    const request = ++this.cameraRequest;
    this.cameraStarting.set(true);
    let stream: MediaStream | null = null;
    let cameraError: unknown;
    const constraints: MediaStreamConstraints[] = [
      { audio: false, video: { facingMode: { exact: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1440 } } },
      { audio: false, video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1440 } } },
      { audio: false, video: true },
    ];
    for (const constraint of constraints) {
      try {
        stream = await navigator.mediaDevices.getUserMedia(constraint);
        break;
      } catch (error) {
        cameraError = error;
        if (request !== this.cameraRequest) return;
        if (!['OverconstrainedError', 'NotFoundError'].includes(errorName(error))) break;
      }
    }
    if (!stream) {
      if (request !== this.cameraRequest) return;
      this.error.set(cameraAccessError(cameraError));
      this.cameraStarting.set(false);
      return;
    }

    if (request !== this.cameraRequest) {
      stream.getTracks().forEach((track) => track.stop());
      return;
    }

    this.cameraStream = stream;
    this.cameraStarting.set(false);
    this.cameraActive.set(true);
    this.previewNeedsTap.set(false);
    this.prepareCameraFocus(stream);
    const frame = this.cameraFrame.nativeElement;
    frame.hidden = false;
    const video = this.cameraVideo.nativeElement;
    video.muted = true;
    video.playsInline = true;
    video.srcObject = stream;
    try {
      await waitForVideoMetadata(video, 2500);
      if (request !== this.cameraRequest) return;
      await video.play();
    } catch {
      if (request !== this.cameraRequest) return;
      this.previewNeedsTap.set(true);
    }
    if (request !== this.cameraRequest) return;
    this.cameraTimer = setInterval(() => this.detectCameraPage(), 350);
  }

  async resumeCameraPreview(): Promise<void> {
    const video = this.cameraVideo.nativeElement;
    if (!this.cameraStream) return;
    try {
      video.muted = true;
      video.playsInline = true;
      await video.play();
      this.previewNeedsTap.set(false);
      this.error.set('');
    } catch {
      this.error.set('Chrome ha aperto la fotocamera ma non riproduce l’anteprima. Chiudi eventuali altre app che usano la fotocamera e riprova.');
    }
  }

  async refocusCamera(): Promise<void> {
    const track = this.cameraStream?.getVideoTracks()[0];
    if (!track || !this.cameraFocusModes.includes('single-shot')) return;
    try {
      await applyFocusMode(track, 'single-shot');
      if (this.cameraFocusModes.includes('continuous')) {
        if (this.focusResetTimer) clearTimeout(this.focusResetTimer);
        this.focusResetTimer = setTimeout(() => void applyFocusMode(track, 'continuous'), 800);
      }
    } catch {
      this.manualRefocusSupported.set(false);
    }
  }

  stopCamera(): void {
    this.cameraRequest++;
    this.cameraStarting.set(false);
    if (this.cameraTimer) clearInterval(this.cameraTimer);
    this.cameraTimer = undefined;
    if (this.focusResetTimer) clearTimeout(this.focusResetTimer);
    this.focusResetTimer = undefined;
    this.cameraStream?.getTracks().forEach((track) => track.stop());
    this.cameraStream = null;
    this.cameraFocusModes = [];
    this.manualRefocusSupported.set(false);
    const video = this.cameraVideo?.nativeElement;
    if (video) video.srcObject = null;
    if (this.cameraFrame?.nativeElement) this.cameraFrame.nativeElement.hidden = true;
    this.cameraActive.set(false);
    this.previewNeedsTap.set(false);
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

  private prepareCameraFocus(stream: MediaStream): void {
    const track = stream.getVideoTracks()[0];
    let modes: string[] = [];
    try {
      const capabilities = track?.getCapabilities() as MediaTrackCapabilities & { focusMode?: string[] };
      modes = capabilities?.focusMode ?? [];
    } catch {
      modes = [];
    }
    this.cameraFocusModes = modes;
    this.manualRefocusSupported.set(modes.includes('single-shot'));
    const initialMode = modes.includes('continuous') ? 'continuous' : modes.includes('single-shot') ? 'single-shot' : null;
    if (track && initialMode) {
      void applyFocusMode(track, initialMode).catch(() => this.manualRefocusSupported.set(false));
    }
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
        : value === 'Testo nitido (OCR)'
          ? 'testo'
        : value === 'Colore originale'
          ? 'colore'
          : null;
    if (!look) return;
    this.look.set(look);
    const sharpness = look === 'testo' && this.sharpness() === 0 ? 35 : this.sharpness();
    this.sharpness.set(sharpness);
    this.updateActivePage({ look, sharpness });
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

  setSharpness(value: string): void {
    const sharpness = clamp(Number(value) || 0, 0, 100);
    this.sharpness.set(sharpness);
    this.updateActivePage({ sharpness });
    this.drawPreview();
  }

  setPageOrientation(value: string): void {
    const orientation: PageOrientation | null = value === 'A4 verticale'
      ? 'portrait'
      : value === 'A4 orizzontale'
        ? 'landscape'
        : value === 'Automatico (A4)'
          ? 'auto'
          : null;
    if (orientation) this.pageOrientation.set(orientation);
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
        const requestedOrientation = this.pageOrientation();
        const orientation: 'landscape' | 'portrait' = requestedOrientation === 'auto'
          ? prepared.width > prepared.height ? 'landscape' : 'portrait'
          : requestedOrientation === 'landscape' ? 'landscape' : 'portrait';
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
      sharpness: 0,
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
    this.sharpness.set(page.sharpness);
  }

  private saveEditorState(): void {
    const page = this.currentPage();
    const canvas = this.editorCanvas?.nativeElement;
    if (!page || !canvas) return;
    const crop = this.cropRect ?? { x: 0, y: 0, width: canvas.width, height: canvas.height };
    const normalized = pixelsToNormalized(crop, canvas.width, canvas.height);
    this.updateActivePage({ crop: normalized, look: this.look(), brightness: this.brightness(), contrast: this.contrast(), warmth: this.warmth(), sharpness: this.sharpness() });
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
    this.sharpness.set(0);
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
    drawAdjusted(canvas, image, page, this.look(), this.brightness(), this.contrast(), this.warmth(), this.sharpness());
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
    const canvas = this.editorCanvas?.nativeElement;
    if (!canvas) return null;
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

function errorName(error: unknown): string {
  return error && typeof error === 'object' && 'name' in error
    ? String((error as { name: unknown }).name)
    : '';
}

function cameraAccessError(error: unknown): string {
  switch (errorName(error)) {
    case 'NotAllowedError':
    case 'SecurityError':
      return 'Chrome o Android hanno negato l’accesso alla fotocamera. Controlla i permessi del sito e dell’app Chrome nelle impostazioni del dispositivo.';
    case 'NotFoundError':
      return 'Non è stata trovata una fotocamera disponibile. Puoi aggiungere le pagine dalla galleria.';
    case 'NotReadableError':
      return 'La fotocamera è autorizzata ma non disponibile. Chiudi le altre app che la stanno usando e riprova.';
    case 'OverconstrainedError':
      return 'La fotocamera non supporta le impostazioni richieste. Riprova o aggiungi le immagini dalla galleria.';
    default:
      return 'Chrome non è riuscito ad avviare la fotocamera. Chiudi le altre app che la usano oppure aggiungi le immagini dalla galleria.';
  }
}

function applyFocusMode(track: MediaStreamTrack, mode: string): Promise<void> {
  const focusConstraint = { focusMode: mode } as unknown as MediaTrackConstraintSet;
  return track.applyConstraints({ advanced: [focusConstraint] });
}

function waitForVideoMetadata(video: HTMLVideoElement, timeoutMs: number): Promise<void> {
  if (video.readyState >= HTMLMediaElement.HAVE_METADATA) return Promise.resolve();
  return new Promise((resolve) => {
    const finish = () => {
      clearTimeout(timeout);
      video.removeEventListener('loadedmetadata', finish);
      resolve();
    };
    const timeout = setTimeout(finish, timeoutMs);
    video.addEventListener('loadedmetadata', finish, { once: true });
  });
}

function drawAdjusted(
  canvas: HTMLCanvasElement,
  image: HTMLImageElement | ImageBitmap | HTMLCanvasElement,
  page: Pick<ScanPage, 'rotation'>,
  look: ScanLook,
  brightness: number,
  contrast: number,
  warmth: number,
  sharpness: number,
): void {
  const context = canvas.getContext('2d');
  if (!context) throw new Error('canvas-unavailable');
  context.fillStyle = '#fff';
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.save();
  context.translate(canvas.width / 2, canvas.height / 2);
  context.rotate((page.rotation * Math.PI) / 180);
  context.filter = `brightness(${brightness}%) contrast(${contrast}%)${look === 'grigio' || look === 'bianco-nero' || look === 'testo' ? ' grayscale(1)' : ''}`;
  context.drawImage(image, -image.width / 2, -image.height / 2, image.width, image.height);
  context.restore();
  if (warmth || sharpness || look === 'bianco-nero' || look === 'testo') {
    const pixels = context.getImageData(0, 0, canvas.width, canvas.height);
    const amount = warmth * 0.45;
    if (look === 'testo') {
      enhanceTextLocally(pixels, sharpness);
    } else {
      if (sharpness) sharpenImage(pixels, sharpness);
      for (let offset = 0; offset < pixels.data.length; offset += 4) {
        if (look === 'bianco-nero') {
        const luminance = pixels.data[offset] * 0.299 + pixels.data[offset + 1] * 0.587 + pixels.data[offset + 2] * 0.114;
        const value = luminance > 174 ? 255 : 0;
        pixels.data[offset] = value;
        pixels.data[offset + 1] = value;
        pixels.data[offset + 2] = value;
        } else if (warmth) {
          pixels.data[offset] = clamp(pixels.data[offset] + amount, 0, 255);
          pixels.data[offset + 1] = clamp(pixels.data[offset + 1] + amount * 0.12, 0, 255);
          pixels.data[offset + 2] = clamp(pixels.data[offset + 2] - amount, 0, 255);
        }
      }
    }
    context.putImageData(pixels, 0, 0);
  }
  context.filter = 'none';
}

function sharpenImage(image: ImageData, amount: number): void {
  const { data, width, height } = image;
  const gray = new Uint8Array(width * height);
  for (let pixel = 0, offset = 0; pixel < gray.length; pixel++, offset += 4) {
    gray[pixel] = Math.round(data[offset] * 0.299 + data[offset + 1] * 0.587 + data[offset + 2] * 0.114);
  }
  const strength = (amount / 100) * 0.75;
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const pixel = y * width + x;
      const average = (gray[pixel - 1] + gray[pixel + 1] + gray[pixel - width] + gray[pixel + width]) / 4;
      const delta = (gray[pixel] - average) * strength;
      const offset = pixel * 4;
      data[offset] = clamp(data[offset] + delta, 0, 255);
      data[offset + 1] = clamp(data[offset + 1] + delta, 0, 255);
      data[offset + 2] = clamp(data[offset + 2] + delta, 0, 255);
    }
  }
}

function enhanceTextLocally(image: ImageData, sharpness: number): void {
  const { data, width, height } = image;
  const pixelCount = width * height;
  const gray = new Uint8Array(pixelCount);
  const tileSize = clamp(Math.round(Math.min(width, height) / 60), 24, 64);
  const tileColumns = Math.ceil(width / tileSize);
  const tileRows = Math.ceil(height / tileSize);
  const tileSums = new Float64Array(tileColumns * tileRows);
  const tileCounts = new Uint32Array(tileSums.length);

  for (let pixel = 0, offset = 0; pixel < pixelCount; pixel++, offset += 4) {
    const luminance = Math.round(data[offset] * 0.299 + data[offset + 1] * 0.587 + data[offset + 2] * 0.114);
    gray[pixel] = luminance;
    const x = pixel % width;
    const y = (pixel / width) | 0;
    const tile = ((y / tileSize) | 0) * tileColumns + ((x / tileSize) | 0);
    tileSums[tile] += luminance;
    tileCounts[tile]++;
  }

  const tileMeans = new Float32Array(tileSums.length);
  for (let tile = 0; tile < tileSums.length; tile++) {
    tileMeans[tile] = tileCounts[tile] ? tileSums[tile] / tileCounts[tile] : 255;
  }
  const smoothMeans = new Float32Array(tileMeans.length);
  for (let y = 0; y < tileRows; y++) {
    for (let x = 0; x < tileColumns; x++) {
      let sum = 0;
      let count = 0;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const neighborX = x + dx;
          const neighborY = y + dy;
          if (neighborX < 0 || neighborY < 0 || neighborX >= tileColumns || neighborY >= tileRows) continue;
          sum += tileMeans[neighborY * tileColumns + neighborX];
          count++;
        }
      }
      smoothMeans[y * tileColumns + x] = count ? sum / count : 255;
    }
  }

  const strength = (sharpness / 100) * 0.75;
  for (let y = 0, offset = 0; y < height; y++) {
    const tileRow = ((y / tileSize) | 0) * tileColumns;
    for (let x = 0; x < width; x++, offset += 4) {
      const pixel = y * width + x;
      let value = gray[pixel];
      if (strength && x > 0 && y > 0 && x < width - 1 && y < height - 1) {
        const average = (gray[pixel - 1] + gray[pixel + 1] + gray[pixel - width] + gray[pixel + width]) / 4;
        value = clamp(value + (value - average) * strength, 0, 255);
      }
      const localMean = smoothMeans[tileRow + ((x / tileSize) | 0)];
      const threshold = clamp(localMean * 0.92 - 12, 100, 238);
      const binary = value < threshold ? 0 : 255;
      data[offset] = binary;
      data[offset + 1] = binary;
      data[offset + 2] = binary;
      data[offset + 3] = 255;
    }
  }
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
  drawAdjusted(oriented, scaledImage, page, page.look, page.brightness, page.contrast, page.warmth, page.sharpness);
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
