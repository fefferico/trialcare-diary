import { CommonModule } from '@angular/common';
import {
  Component,
  ElementRef,
  EventEmitter,
  Input,
  OnChanges,
  Output,
  SimpleChanges,
  ViewChild,
  signal,
} from '@angular/core';
import { GlobalWorkerOptions, getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { jsPDF } from 'jspdf';

interface Redaction {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface BrowserOcrWorker {
  recognize(image: HTMLCanvasElement): Promise<{ data: { text: string } }>;
  terminate(): Promise<unknown>;
}

interface OcrWorkerProgress {
  status: string;
  progress: number;
}

type ResizeCorner = 'nw' | 'ne' | 'sw' | 'se';

@Component({
  selector: 'tc-pdf-redaction',
  standalone: true,
  imports: [CommonModule],
  template: `<div class="full-span rounded-xl border border-slate-200 p-4 dark:border-slate-700">
    <h3 class="font-semibold">Oscuramento locale del PDF</h3>
    <p class="mt-1 text-sm text-slate-500">
      Le pagine saranno appiattite in immagini e le aree nere incorporate prima dell’upload. Il
      testo selezionabile verrà rimosso dalla copia.
    </p>
    <label class="form-field mt-3"
      ><span>Parole da cercare nel testo selezionabile</span
      ><input
        class="field-control"
        [value]="terms()"
        (input)="terms.set($any($event.target).value)"
        placeholder="Nome, cognome, ID trial…"
    /></label>
    <div class="mt-3 flex flex-wrap gap-2">
      <button type="button" class="button-secondary" [disabled]="busy()" (click)="findTerms()">
        Trova parole</button
      ><button
        type="button"
        class="button-secondary"
        [disabled]="busy() || !matches()"
        (click)="applyMatches()"
      >
        Oscura risultati ({{ matches() }})</button
      ><button type="button" class="button-secondary" [disabled]="busy()" (click)="clearPage()">
        Azzera pagina</button
      ><button
        type="button"
        class="button-primary"
        [disabled]="busy() || !redactionCount"
        (click)="apply()"
      >
        Usa PDF oscurato
      </button>
    </div>
    @if (notice()) {
      <p class="mt-2 text-sm" role="status">{{ notice() }}</p>
    }
    @if (pageCount()) {
      <div class="mt-3 flex items-center gap-3">
        <button
          type="button"
          class="button-secondary"
          [disabled]="page() <= 1"
          (click)="changePage(-1)"
        >
          Pagina precedente</button
        ><span class="text-sm"
          >Pagina {{ page() }} di {{ pageCount() }} · {{ redactionCount }} aree</span
        ><button
          type="button"
          class="button-secondary"
          [disabled]="page() >= pageCount()"
          (click)="changePage(1)"
        >
          Pagina successiva
        </button>
      </div>
      <div class="relative mt-3 overflow-auto">
        <canvas
          #preview
          class="block h-auto w-full border border-slate-200"
          style="touch-action: none"
          (pointerdown)="start($event)"
          (pointermove)="move($event)"
          (pointerup)="end($event)"
          (pointercancel)="cancelDrag($event)"
          aria-label="Anteprima PDF: trascina per aggiungere un’area di oscuramento"
        ></canvas>
        <svg
          class="pointer-events-none absolute inset-0 h-full w-full"
          [attr.viewBox]="'0 0 ' + pageWidth() + ' ' + pageHeight()"
          preserveAspectRatio="none"
          aria-label="Controlli delle zone oscurate"
          (pointermove)="moveZones($event)"
          (pointerup)="endZoneDrags($event)"
          (pointercancel)="endZoneDrags($event)"
        >
          @for (box of pageBoxes(); track $index; let index = $index) {
            <g>
              <rect
                [attr.x]="box.x"
                [attr.y]="box.y"
                [attr.width]="box.width"
                [attr.height]="box.height"
                fill="#000"
                fill-opacity="0.001"
                class="pointer-events-auto cursor-move"
                stroke="#ef4444"
                stroke-width="3"
                vector-effect="non-scaling-stroke"
                [attr.aria-label]="'Sposta zona ' + (index + 1)"
                role="button"
                tabindex="0"
                (pointerdown)="startZoneMove($event, index)"
                (keydown)="moveBoxOnKey($event, index)"
              />
              @for (corner of resizeCorners; track corner) {
                <circle
                  [attr.cx]="cornerX(box, corner)"
                  [attr.cy]="cornerY(box, corner)"
                  [attr.r]="handleRadius()"
                  fill="#fff"
                  stroke="#0f766e"
                  stroke-width="3"
                  vector-effect="non-scaling-stroke"
                  class="pointer-events-auto"
                  [class.cursor-nwse-resize]="corner === 'nw' || corner === 'se'"
                  [class.cursor-nesw-resize]="corner === 'ne' || corner === 'sw'"
                  [attr.aria-label]="'Ridimensiona zona ' + (index + 1)"
                  role="button"
                  tabindex="0"
                  (pointerdown)="startResize($event, index, corner)"
                  (keydown)="resizeOnKey($event, index, corner)"
                />
              }
              <g
                class="pointer-events-auto cursor-pointer"
                role="button"
                tabindex="0"
                [attr.aria-label]="'Elimina zona ' + (index + 1)"
                (click)="deleteBox(index, $event)"
                (keydown)="deleteBoxOnKey($event, index)"
              >
                <circle
                  [attr.cx]="trashX(box)"
                  [attr.cy]="trashY(box)"
                  r="12"
                  fill="#dc2626"
                  stroke="#fff"
                  stroke-width="2"
                  vector-effect="non-scaling-stroke"
                />
                <path
                  [attr.d]="trashPath(box)"
                  fill="none"
                  stroke="#fff"
                  stroke-width="2"
                  stroke-linecap="round"
                  vector-effect="non-scaling-stroke"
                />
              </g>
            </g>
          }
        </svg>
      </div>
      <section
        class="mt-4 rounded-xl border border-slate-200 p-3 dark:border-slate-700 sm:p-4"
        aria-labelledby="redaction-areas-title"
      >
        <h4 id="redaction-areas-title" class="font-semibold">Zone oscurate nella pagina</h4>
        @if (pageBoxes().length) {
          <p class="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Trascina la zona per spostarla; usa i quattro punti agli angoli per ridimensionarla.
            Il cestino rosso nell’anteprima la elimina.
          </p>
          <div class="mt-3 flex flex-wrap gap-2">
            @for (box of pageBoxes(); track $index; let index = $index) {
              <div class="flex items-center gap-2 rounded-lg bg-slate-50 px-3 py-2 dark:bg-slate-900">
                <p class="text-sm font-medium">Zona {{ index + 1 }}</p>
                <button
                  type="button"
                  class="button-secondary"
                  [attr.aria-label]="'Elimina zona ' + (index + 1)"
                  (click)="deleteBox(index, $event)"
                >
                  Elimina zona
                </button>
              </div>
            }
          </div>
        } @else {
          <p class="mt-2 text-sm text-slate-500 dark:text-slate-400">
            Disegna una zona sull’anteprima per oscurarla.
          </p>
        }
      </section>
      <section
        class="mt-4 rounded-xl border border-slate-200 p-3 dark:border-slate-700 sm:p-4"
        aria-labelledby="pdf-extracted-text-title"
      >
        <h4 id="pdf-extracted-text-title" class="font-semibold">Testo estratto dal documento</h4>
        <button
          type="button"
          class="button-secondary mt-2"
          [disabled]="busy()"
          (click)="runOcr()"
        >
          {{ ocrAttempted() ? 'Riprova OCR su tutte le pagine' : 'Riconosci testo con OCR' }}
        </button>
        @if (busy()) {
          <p class="mt-2 text-sm text-slate-500 dark:text-slate-400" role="status">
            {{ ocrProgress() || 'Lettura del documento in corso…' }}
          </p>
        } @else if (extractedText()) {
          <pre class="mt-2 max-h-64 overflow-auto whitespace-pre-wrap break-words rounded-lg bg-slate-50 p-3 text-sm leading-6 text-slate-700 dark:bg-slate-900 dark:text-slate-200">{{ extractedText() }}</pre>
          @if (ocrUsed()) {
            <p class="mt-2 text-xs leading-5 text-amber-700 dark:text-amber-300">
              Testo riconosciuto localmente con OCR: controlla attentamente nomi, date, codici e dosaggi perché la scansione può causare errori.
            </p>
          }
        } @else if (ocrAttempted()) {
          <p class="mt-2 text-sm text-amber-700 dark:text-amber-300">
            L’OCR non ha restituito testo per questo documento. Puoi riprovare oppure controllare
            manualmente la scansione.
          </p>
        } @else {
          <p class="mt-2 text-sm text-slate-500 dark:text-slate-400">
            Non è stato trovato testo selezionabile. Il documento potrebbe essere una scansione.
          </p>
        }
      </section>
      <p class="mt-2 text-xs text-amber-700 dark:text-amber-300">
        Trascina sull’anteprima per aggiungere aree nere. Controlla tutte le pagine prima di
        procedere: la ricerca automatica usa il testo selezionabile e non individua le parole
        riconosciute dall’OCR.
      </p>
    }
  </div>`,
})
export class PdfRedactionComponent implements OnChanges {
  readonly resizeCorners: ResizeCorner[] = ['nw', 'ne', 'sw', 'se'];
  @ViewChild('preview') preview?: ElementRef<HTMLCanvasElement>;
  @Input({ required: true }) file!: File;
  @Input() initialTerms = '';
  @Output() redacted = new EventEmitter<File>();
  readonly busy = signal(false);
  readonly page = signal(1);
  readonly pageCount = signal(0);
  readonly matches = signal(0);
  readonly notice = signal('');
  readonly terms = signal('');
  readonly extractedText = signal('');
  readonly ocrUsed = signal(false);
  readonly ocrAttempted = signal(false);
  readonly ocrProgress = signal('');
  private pdf: any;
  private pages: HTMLCanvasElement[] = [];
  private boxes: Redaction[][] = [];
  private dragStart?: { x: number; y: number };
  private resizeDrag?: { index: number; corner: ResizeCorner };
  private moveDrag?: { index: number; startX: number; startY: number; boxX: number; boxY: number };
  ngOnChanges(changes: SimpleChanges): void {
    if (changes['initialTerms']) this.terms.set(this.initialTerms);
    if (changes['file']) void this.load();
  }
  get redactionCount(): number {
    return this.boxes.reduce((sum, boxes) => sum + boxes.length, 0);
  }
  pageBoxes(): Redaction[] {
    return this.boxes[this.page() - 1] ?? [];
  }
  pageWidth(): number {
    return this.pages[this.page() - 1]?.width ?? 1;
  }
  pageHeight(): number {
    return this.pages[this.page() - 1]?.height ?? 1;
  }
  handleRadius(): number {
    return 14;
  }
  cornerX(box: Redaction, corner: ResizeCorner): number {
    return corner.endsWith('w') ? box.x : box.x + box.width;
  }
  cornerY(box: Redaction, corner: ResizeCorner): number {
    return corner.startsWith('n') ? box.y : box.y + box.height;
  }
  trashX(box: Redaction): number {
    return Math.min(box.x + box.width + 16, this.pageWidth() - 14);
  }
  trashY(box: Redaction): number {
    return Math.max(box.y - 16, 14);
  }
  trashPath(box: Redaction): string {
    const x = this.trashX(box);
    const y = this.trashY(box);
    return `M ${x - 4} ${y - 4} L ${x + 4} ${y + 4} M ${x + 4} ${y - 4} L ${x - 4} ${y + 4}`;
  }
  startResize(event: PointerEvent, index: number, corner: ResizeCorner): void {
    event.preventDefault();
    event.stopPropagation();
    (event.currentTarget as SVGCircleElement).setPointerCapture(event.pointerId);
    this.resizeDrag = { index, corner };
  }
  moveResize(event: PointerEvent): void {
    if (!this.resizeDrag) return;
    event.preventDefault();
    event.stopPropagation();
    const point = this.pagePoint(event);
    this.resizeTo(this.resizeDrag.index, this.resizeDrag.corner, point.x, point.y);
  }
  moveZones(event: PointerEvent): void {
    this.moveResize(event);
    this.moveZone(event);
  }
  endZoneDrags(event: PointerEvent): void {
    this.endResize(event);
    this.endZoneMove(event);
  }
  startZoneMove(event: PointerEvent, index: number): void {
    event.preventDefault();
    event.stopPropagation();
    (event.currentTarget as SVGRectElement).setPointerCapture(event.pointerId);
    const point = this.pagePoint(event);
    const box = this.pageBoxes()[index];
    if (!box) return;
    this.moveDrag = { index, startX: point.x, startY: point.y, boxX: box.x, boxY: box.y };
  }
  moveZone(event: PointerEvent): void {
    if (!this.moveDrag) return;
    event.preventDefault();
    event.stopPropagation();
    const point = this.pagePoint(event);
    const { index, startX, startY, boxX, boxY } = this.moveDrag;
    const box = this.pageBoxes()[index];
    if (!box) return;
    box.x = Math.round(Math.max(0, Math.min(boxX + point.x - startX, this.pageWidth() - box.width)));
    box.y = Math.round(Math.max(0, Math.min(boxY + point.y - startY, this.pageHeight() - box.height)));
    this.draw();
  }
  endZoneMove(event: PointerEvent): void {
    if (!this.moveDrag) return;
    event.preventDefault();
    event.stopPropagation();
    this.moveDrag = undefined;
  }
  moveBoxOnKey(event: KeyboardEvent, index: number): void {
    const deltas: Record<string, [number, number]> = {
      ArrowLeft: [-10, 0],
      ArrowRight: [10, 0],
      ArrowUp: [0, -10],
      ArrowDown: [0, 10],
    };
    const delta = deltas[event.key];
    const box = this.pageBoxes()[index];
    if (!delta || !box) return;
    event.preventDefault();
    box.x = Math.max(0, Math.min(box.x + delta[0], this.pageWidth() - box.width));
    box.y = Math.max(0, Math.min(box.y + delta[1], this.pageHeight() - box.height));
    this.draw();
  }
  endResize(event: PointerEvent): void {
    if (!this.resizeDrag) return;
    event.preventDefault();
    event.stopPropagation();
    this.resizeDrag = undefined;
  }
  resizeOnKey(event: KeyboardEvent, index: number, corner: ResizeCorner): void {
    const deltas: Record<string, [number, number]> = {
      ArrowLeft: [-10, 0],
      ArrowRight: [10, 0],
      ArrowUp: [0, -10],
      ArrowDown: [0, 10],
    };
    const delta = deltas[event.key];
    if (!delta) return;
    event.preventDefault();
    const box = this.pageBoxes()[index];
    if (!box) return;
    this.resizeTo(index, corner, this.cornerX(box, corner) + delta[0], this.cornerY(box, corner) + delta[1]);
  }
  private pagePoint(event: PointerEvent): { x: number; y: number } {
    const rect = this.preview?.nativeElement.getBoundingClientRect();
    if (!rect) return { x: 0, y: 0 };
    return {
      x: ((event.clientX - rect.left) * this.pageWidth()) / rect.width,
      y: ((event.clientY - rect.top) * this.pageHeight()) / rect.height,
    };
  }
  private resizeTo(index: number, corner: ResizeCorner, x: number, y: number): void {
    const box = this.pageBoxes()[index];
    if (!box) return;
    const west = corner.endsWith('w');
    const north = corner.startsWith('n');
    const fixedX = west ? box.x + box.width : box.x;
    const fixedY = north ? box.y + box.height : box.y;
    const movingX = Math.round(Math.max(west ? 0 : fixedX + 5, Math.min(x, west ? fixedX - 5 : this.pageWidth())));
    const movingY = Math.round(Math.max(north ? 0 : fixedY + 5, Math.min(y, north ? fixedY - 5 : this.pageHeight())));
    box.x = west ? movingX : fixedX;
    box.y = north ? movingY : fixedY;
    box.width = Math.abs(fixedX - movingX);
    box.height = Math.abs(fixedY - movingY);
    this.draw();
  }
  deleteBox(index: number, event?: Event): void {
    event?.stopPropagation();
    this.pageBoxes().splice(index, 1);
    this.matches.set(0);
    this.draw();
  }
  deleteBoxOnKey(event: KeyboardEvent, index: number): void {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    event.preventDefault();
    this.deleteBox(index, event);
  }
  async load(): Promise<void> {
    this.busy.set(true);
    this.notice.set('');
    this.extractedText.set('');
    this.ocrUsed.set(false);
    this.ocrAttempted.set(false);
    this.ocrProgress.set('');
    let ocrWorker: BrowserOcrWorker | null = null;
    let ocrFailed = false;
    try {
      GlobalWorkerOptions.workerSrc = new URL(
        'assets/pdfjs/pdf.worker.min.mjs',
        document.baseURI,
      ).toString();
      this.pdf = await getDocument({ data: new Uint8Array(await this.file.arrayBuffer()) }).promise;
      this.pageCount.set(this.pdf.numPages);
      this.pages = [];
      this.boxes = Array.from({ length: this.pdf.numPages }, () => []);
      const textPages: string[] = [];
      for (let n = 1; n <= this.pdf.numPages; n++) {
        const page = await this.pdf.getPage(n);
        const textContent = await page.getTextContent();
        const pageText = textContent.items
          .map((item: { str?: string }) => item.str ?? '')
          .filter(Boolean)
          .join(' ');
        const viewport = page.getViewport({ scale: 1.4 });
        const canvas = document.createElement('canvas');
        canvas.width = Math.ceil(viewport.width);
        canvas.height = Math.ceil(viewport.height);
        await page.render({ canvas, canvasContext: canvas.getContext('2d')!, viewport }).promise;
        this.pages.push(canvas);
        let recognizedText = pageText;
        if (pageText.replace(/\s/g, '').length < 30) {
          this.ocrAttempted.set(true);
          try {
            this.ocrProgress.set(`Avvio del motore OCR per la pagina ${n} di ${this.pdf.numPages}…`);
            ocrWorker ??= await this.createOcrWorker();
            this.ocrProgress.set(`Riconoscimento OCR della pagina ${n} di ${this.pdf.numPages}…`);
            recognizedText = await this.recognizePage(page, ocrWorker);
            if (recognizedText) this.ocrUsed.set(true);
          } catch {
            ocrFailed = true;
          }
        }
        if (recognizedText.trim()) textPages.push(`Pagina ${n}\n${recognizedText.trim()}`);
      }
      this.extractedText.set(textPages.join('\n\n').replace(/[ \t]+/g, ' ').trim());
      if (ocrFailed)
        this.notice.set('OCR non riuscito su alcune pagine. Puoi riprovare con il pulsante nella sezione del testo.');
      this.page.set(1);
      this.draw();
    } catch {
      this.notice.set('Impossibile leggere il PDF in questo browser.');
    } finally {
      await ocrWorker?.terminate().catch(() => undefined);
      this.ocrProgress.set('');
      this.busy.set(false);
    }
  }
  async runOcr(): Promise<void> {
    if (!this.pdf || this.busy()) return;
    this.busy.set(true);
    this.notice.set('');
    this.ocrUsed.set(false);
    this.ocrAttempted.set(true);
    const textPages: string[] = [];
    let worker: BrowserOcrWorker | null = null;
    try {
      this.ocrProgress.set('Avvio del motore OCR…');
      worker = await this.createOcrWorker();
      for (let n = 1; n <= this.pdf.numPages; n++) {
        this.ocrProgress.set(`Riconoscimento OCR della pagina ${n} di ${this.pdf.numPages}…`);
        const page = await this.pdf.getPage(n);
        const text = await this.recognizePage(page, worker);
        if (text) {
          textPages.push(`Pagina ${n}\n${text}`);
          this.ocrUsed.set(true);
        }
        this.extractedText.set(textPages.join('\n\n'));
      }
      if (!textPages.length) this.notice.set('Non è stato possibile riconoscere testo nelle pagine.');
    } catch {
      this.notice.set('OCR non riuscito. Riprova oppure controlla il documento manualmente.');
    } finally {
      await worker?.terminate().catch(() => undefined);
      this.ocrProgress.set('');
      this.busy.set(false);
    }
  }
  private async createOcrWorker(): Promise<BrowserOcrWorker> {
    const { createWorker } = await import('tesseract.js');
    const assetUrl = (path: string) => new URL(path, document.baseURI).toString();
    return createWorker('ita+eng', undefined, {
      workerPath: assetUrl('assets/tesseract/worker.min.js'),
      corePath: assetUrl('assets/tesseract/core/'),
      langPath: assetUrl('assets/tesseract/lang/'),
      workerBlobURL: false,
      logger: ({ status, progress }: OcrWorkerProgress) => {
        const percent = Math.round(progress * 100);
        const labels: Record<string, string> = {
          'loading tesseract core': 'Caricamento del motore OCR locale',
          'loading language traineddata': 'Caricamento dei modelli linguistici locali',
          'initializing tesseract': 'Preparazione del motore OCR',
          'initializing api': 'Preparazione del riconoscimento',
          'recognizing text': 'Lettura del testo della scansione',
        };
        this.ocrProgress.set(`${labels[status] ?? 'Elaborazione OCR'}… ${percent}%`);
      },
    }) as unknown as BrowserOcrWorker;
  }
  private async recognizePage(
    page: any,
    worker: BrowserOcrWorker,
  ): Promise<string> {
    // Higher resolution helps the low-quality OPBG scans, which have small print.
    const viewport = page.getViewport({ scale: 3.2 });
    const canvas = document.createElement('canvas');
    canvas.width = Math.ceil(viewport.width);
    canvas.height = Math.ceil(viewport.height);
    await page.render({ canvas, canvasContext: canvas.getContext('2d')!, viewport }).promise;
    let enhanced: HTMLCanvasElement | null = null;
    try {
      const initialText = (await worker.recognize(canvas)).data.text.trim();
      if (initialText.replace(/\s/g, '').length >= 24) return initialText;

      // Retry sparse results on a contrast-normalized black and white copy.
      enhanced = this.createHighContrastCopy(canvas);
      const enhancedText = (await worker.recognize(enhanced)).data.text.trim();
      return enhancedText.length > initialText.length ? enhancedText : initialText;
    } finally {
      canvas.width = 0;
      canvas.height = 0;
      if (enhanced) {
        enhanced.width = 0;
        enhanced.height = 0;
      }
    }
  }
  private createHighContrastCopy(source: HTMLCanvasElement): HTMLCanvasElement {
    const enhanced = document.createElement('canvas');
    enhanced.width = source.width;
    enhanced.height = source.height;
    const context = enhanced.getContext('2d', { willReadFrequently: true })!;
    context.drawImage(source, 0, 0);
    const image = context.getImageData(0, 0, enhanced.width, enhanced.height);
    const histogram = new Uint32Array(256);
    const luminance = new Uint8Array(image.data.length / 4);
    for (let pixel = 0; pixel < luminance.length; pixel++) {
      const offset = pixel * 4;
      const value = Math.round(
        image.data[offset] * 0.299 + image.data[offset + 1] * 0.587 + image.data[offset + 2] * 0.114,
      );
      luminance[pixel] = value;
      histogram[value]++;
    }
    const total = luminance.length;
    let sum = 0;
    for (let value = 0; value < 256; value++) sum += value * histogram[value];
    let backgroundWeight = 0;
    let backgroundSum = 0;
    let threshold = 160;
    let maximumVariance = 0;
    for (let value = 0; value < 256; value++) {
      backgroundWeight += histogram[value];
      if (!backgroundWeight) continue;
      const foregroundWeight = total - backgroundWeight;
      if (!foregroundWeight) break;
      backgroundSum += value * histogram[value];
      const meanBackground = backgroundSum / backgroundWeight;
      const meanForeground = (sum - backgroundSum) / foregroundWeight;
      const variance = backgroundWeight * foregroundWeight * (meanBackground - meanForeground) ** 2;
      if (variance > maximumVariance) {
        maximumVariance = variance;
        threshold = value;
      }
    }
    for (let pixel = 0; pixel < luminance.length; pixel++) {
      const color = luminance[pixel] <= threshold ? 0 : 255;
      const offset = pixel * 4;
      image.data[offset] = color;
      image.data[offset + 1] = color;
      image.data[offset + 2] = color;
      image.data[offset + 3] = 255;
    }
    context.putImageData(image, 0, 0);
    return enhanced;
  }
  private draw(preview?: Redaction): void {
    const visible = this.preview?.nativeElement;
    if (!visible || !this.pages.length) return;
    const source = this.pages[this.page() - 1];
    visible.width = source.width;
    visible.height = source.height;
    const ctx = visible.getContext('2d')!;
    ctx.drawImage(source, 0, 0);
    ctx.fillStyle = '#000';
    for (const box of this.boxes[this.page() - 1])
      ctx.fillRect(box.x, box.y, box.width, box.height);
    if (preview) ctx.fillRect(preview.x, preview.y, preview.width, preview.height);
  }
  changePage(delta: number): void {
    this.page.update((value) => value + delta);
    this.draw();
  }
  start(event: PointerEvent): void {
    event.preventDefault();
    event.stopPropagation();
    const canvas = event.currentTarget as HTMLCanvasElement;
    canvas.setPointerCapture(event.pointerId);
    const rect = canvas.getBoundingClientRect();
    this.dragStart = {
      x: ((event.clientX - rect.left) * canvas.width) / rect.width,
      y: ((event.clientY - rect.top) * canvas.height) / rect.height,
    };
  }
  move(event: PointerEvent): void {
    if (!this.dragStart) return;
    event.preventDefault();
    event.stopPropagation();
    const canvas = event.currentTarget as HTMLCanvasElement;
    const rect = canvas.getBoundingClientRect();
    const x = ((event.clientX - rect.left) * canvas.width) / rect.width;
    const y = ((event.clientY - rect.top) * canvas.height) / rect.height;
    const start = this.dragStart;
    this.draw({
      x: Math.min(x, start.x),
      y: Math.min(y, start.y),
      width: Math.abs(x - start.x),
      height: Math.abs(y - start.y),
    });
  }
  end(event: PointerEvent): void {
    event.preventDefault();
    event.stopPropagation();
    if (!this.dragStart) return;
    const canvas = event.currentTarget as HTMLCanvasElement;
    const rect = canvas.getBoundingClientRect();
    const x = ((event.clientX - rect.left) * canvas.width) / rect.width;
    const y = ((event.clientY - rect.top) * canvas.height) / rect.height;
    const start = this.dragStart;
    this.dragStart = undefined;
    const box = {
      x: Math.min(x, start.x),
      y: Math.min(y, start.y),
      width: Math.abs(x - start.x),
      height: Math.abs(y - start.y),
    };
    if (box.width > 4 && box.height > 4) {
      this.boxes[this.page() - 1].push(box);
      this.draw();
    }
  }
  cancelDrag(event: PointerEvent): void {
    event.stopPropagation();
    this.dragStart = undefined;
  }
  clearPage(): void {
    this.boxes[this.page() - 1] = [];
    this.matches.set(0);
    this.draw();
  }
  async findTerms(): Promise<void> {
    const terms = this.terms()
      .split(/[\n,;]+/)
      .map((term) => term.trim())
      .filter((term) => term.length > 1);
    if (!terms.length) {
      this.notice.set('Inserisci almeno una parola o frase da cercare.');
      return;
    }
    this.busy.set(true);
    this.matches.set(0);
    let count = 0;
    try {
      for (let i = 1; i <= this.pdf.numPages; i++) {
        const page = await this.pdf.getPage(i);
        const viewport = page.getViewport({ scale: 1.4 });
        const content = await page.getTextContent();
        for (const item of content.items) {
          if (!('str' in item) || !item.str.trim()) continue;
          const [, , , h, x, y] = item.transform;
          const measure = document.createElement('canvas').getContext('2d')!;
          const totalWidth = measure.measureText(item.str).width || 1;
          const pdfWidth = item.width * 1.4;
          for (const term of terms) {
            const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            const matches = item.str.matchAll(new RegExp(escaped, 'gi'));
            for (const match of matches) {
              const start = match.index ?? 0;
              const end = start + match[0].length;
              const left = (measure.measureText(item.str.slice(0, start)).width / totalWidth) * pdfWidth;
              const right = (measure.measureText(item.str.slice(0, end)).width / totalWidth) * pdfWidth;
              this.boxes[i - 1].push({
                x: x * 1.4 + left,
                y: viewport.height - y * 1.4 - h * 1.4,
                width: Math.max(right - left, 3),
                height: Math.max(h * 1.4, 10),
              });
              count++;
            }
          }
        }
      }
      this.matches.set(count);
      this.page.set(1);
      this.draw();
      this.notice.set(
        count
          ? `${count} elementi trovati; verifica le aree su ogni pagina.`
          : 'Nessuna corrispondenza nel testo selezionabile.',
      );
    } catch {
      this.notice.set('Ricerca nel testo non riuscita.');
    } finally {
      this.busy.set(false);
    }
  }
  applyMatches(): void {
    this.notice.set(
      `${this.matches()} aree individuate aggiunte. Verifica manualmente tutte le pagine.`,
    );
    this.matches.set(0);
    this.draw();
  }
  async apply(): Promise<void> {
    this.busy.set(true);
    try {
      const output = new jsPDF({
        unit: 'pt',
        format: [this.pages[0].width, this.pages[0].height],
        compress: true,
      });
      for (let i = 0; i < this.pages.length; i++) {
        const canvas = this.pages[i];
        const ctx = canvas.getContext('2d')!;
        ctx.fillStyle = '#000';
        for (const box of this.boxes[i]) ctx.fillRect(box.x, box.y, box.width, box.height);
        if (i) output.addPage([canvas.width, canvas.height]);
        output.addImage(
          canvas.toDataURL('image/jpeg', 0.92),
          'JPEG',
          0,
          0,
          canvas.width,
          canvas.height,
          undefined,
          'FAST',
        );
      }
      const blob = output.output('blob');
      this.redacted.emit(
        new File([blob], this.file.name.replace(/\.pdf$/i, '-oscurato.pdf'), {
          type: 'application/pdf',
        }),
      );
      this.notice.set('PDF oscurato pronto per il salvataggio.');
    } catch {
      this.notice.set('Creazione del PDF oscurato non riuscita.');
    } finally {
      this.busy.set(false);
    }
  }
}
