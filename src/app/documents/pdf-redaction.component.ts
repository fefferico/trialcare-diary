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

interface OcrBbox {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

interface OcrWordItem {
  text: string;
  bbox: OcrBbox;
}

interface OcrLineItem {
  text: string;
  bbox: OcrBbox;
  words?: OcrWordItem[];
}

interface OcrPageData {
  text: string;
  lines: OcrLineItem[];
  canvasWidth: number;
  canvasHeight: number;
}

interface NativeWordItem {
  text: string;
  box: Redaction;
}

interface NativeLineItem {
  words: NativeWordItem[];
}

interface BrowserOcrWorker {
  recognize(
    image: HTMLCanvasElement,
    options?: Record<string, unknown>,
    output?: { text?: boolean; blocks?: boolean },
  ): Promise<{
    data: {
      text: string;
      blocks?: any[] | null;
    };
  }>;
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
      ><span>Parole da cercare (se non trova risultati, prova l’OCR locale)</span><input
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
      <div class="mt-4 grid items-start gap-4 lg:grid-cols-2">
      <div class="min-w-0">
      <div class="flex items-center gap-3">
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
      </div>
      <section
        class="min-w-0 rounded-xl border border-slate-200 p-3 dark:border-slate-700 sm:p-4"
        aria-labelledby="pdf-extracted-text-title"
      >
        <div class="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <h4 id="pdf-extracted-text-title" class="font-semibold">Testo estratto dal documento</h4>
          <button
            type="button"
            class="button-secondary text-sm"
            [disabled]="busy()"
            (click)="runOcr()"
          >
            {{ ocrAttempted() ? 'Riprova OCR su tutte le pagine' : 'Estrai testo con OCR (facoltativo)' }}
          </button>
        </div>
        @if (busy()) {
          <p class="mt-2 text-sm text-slate-500 dark:text-slate-400" role="status">
            {{ ocrProgress() || 'Elaborazione in corso…' }}
          </p>
        }
        @if (!busy()) {
          @if (textEdited()) {
            <p class="mt-2 text-xs leading-5 text-teal-700 dark:text-teal-300">
              È conservato il testo già associato al documento. Se aggiungi nuove zone oscurate e vuoi aggiornarlo, esegui l’OCR dopo averle disegnate.
            </p>
          }
          <label class="form-field mt-3">
            <span>Testo da salvare con il documento (le aree oscurate sono escluse automaticamente)</span>
            <textarea
              class="field-control min-h-64 resize-y font-mono text-sm leading-6"
              rows="12"
              [value]="extractedText()"
              (input)="editExtractedText($event)"
              placeholder="Scrivi o correggi qui il testo del documento…"
            ></textarea>
          </label>
          <p class="mt-2 text-xs leading-5 text-slate-500 dark:text-slate-400">
            Il testo sotto le zone oscurate viene escluso automaticamente dal salvataggio. Correggi nomi, date e dosaggi prima di salvare.
          </p>
          @if (textEdited()) {
            <p class="mt-1 text-xs text-amber-700 dark:text-amber-300">
              Hai modificato manualmente il testo. L’esecuzione dell’OCR sostituirà le modifiche scritte qui.
            </p>
          }
        }
        @if (!busy() && ocrError()) {
          <p class="mt-2 text-sm text-amber-700 dark:text-amber-300" role="alert">
            {{ ocrError() }}
          </p>
        } @else if (!busy() && !extractedText() && ocrAttempted()) {
          <p class="mt-2 text-sm text-amber-700 dark:text-amber-300">
            L’OCR non ha restituito testo per questo documento. Puoi riprovare oppure controllare manualmente la scansione.
          </p>
        } @else if (!busy() && !extractedText()) {
          <p class="mt-2 text-sm text-slate-500 dark:text-slate-400">
            Nessun testo selezionabile rilevato nel PDF (possibile scansione). L’estrazione OCR è facoltativa: premi "Estrai testo con OCR (facoltativo)" se desideri renderlo ricercabile, oppure digita il testo a mano.
          </p>
        }
      </section>
      </div>
      <p class="mt-2 text-xs text-slate-500 dark:text-slate-400">
        Trascina sull’anteprima per aggiungere aree nere. Le zone oscurate non vengono incluse nel testo salvato.
        Controlla tutte le pagine prima di procedere.
      </p>
    }
  </div>`,
})
export class PdfRedactionComponent implements OnChanges {
  readonly resizeCorners: ResizeCorner[] = ['nw', 'ne', 'sw', 'se'];
  @ViewChild('preview') preview?: ElementRef<HTMLCanvasElement>;
  @Input({ required: true }) file!: File;
  @Input() initialTerms = '';
  @Input() initialExtractedText = '';
  @Output() redacted = new EventEmitter<File>();
  @Output() textForSaving = new EventEmitter<{ file: File; text: string }>();
  @Output() processingChange = new EventEmitter<{ file: File; processing: boolean }>();
  readonly busy = signal(false);
  readonly page = signal(1);
  readonly pageCount = signal(0);
  readonly matches = signal(0);
  readonly notice = signal('');
  readonly terms = signal('');
  readonly extractedText = signal('');
  readonly textEdited = signal(false);
  readonly ocrUsed = signal(false);
  readonly ocrAttempted = signal(false);
  readonly ocrError = signal('');
  readonly ocrProgress = signal('');
  private pdf: any;
  private pages: HTMLCanvasElement[] = [];
  private boxes: Redaction[][] = [];
  private ocrPages: (OcrPageData | null)[] = [];
  private nativePages: NativeLineItem[][] = [];
  private lastAppliedFile?: File;
  private lastAppliedText = '';
  private dragStart?: { x: number; y: number };
  private resizeDrag?: { index: number; corner: ResizeCorner };
  private moveDrag?: { index: number; startX: number; startY: number; boxX: number; boxY: number };
  ngOnChanges(changes: SimpleChanges): void {
    if (changes['initialTerms']) this.terms.set(this.initialTerms);
    if (changes['file']) {
      if (this.file === this.lastAppliedFile) {
        void this.loadAppliedRedactedFile();
      } else {
        void this.load();
      }
    }
  }
  get redactionCount(): number {
    return this.boxes.reduce((sum, boxes) => sum + boxes.length, 0);
  }
  pageBoxes(): Redaction[] {
    return this.boxes[this.page() - 1] ?? [];
  }
  editExtractedText(event: Event): void {
    this.textEdited.set(true);
    this.setTextForSaving((event.target as HTMLTextAreaElement).value);
  }
  private setTextForSaving(text: string): void {
    this.extractedText.set(text);
    this.textForSaving.emit({ file: this.file, text });
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
    this.recomputeExtractedText();
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
    this.recomputeExtractedText();
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
    this.recomputeExtractedText();
  }
  endResize(event: PointerEvent): void {
    if (!this.resizeDrag) return;
    event.preventDefault();
    event.stopPropagation();
    this.resizeDrag = undefined;
    this.recomputeExtractedText();
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
    this.recomputeExtractedText();
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
    this.recomputeExtractedText();
  }
  deleteBoxOnKey(event: KeyboardEvent, index: number): void {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    event.preventDefault();
    this.deleteBox(index, event);
  }
  private async loadAppliedRedactedFile(): Promise<void> {
    const file = this.file;
    this.busy.set(true);
    this.processingChange.emit({ file, processing: true });
    try {
      this.pdf = await getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
      this.pageCount.set(this.pdf.numPages);
      this.pages = [];
      this.boxes = Array.from({ length: this.pdf.numPages }, () => []);
      this.ocrPages = Array.from({ length: this.pdf.numPages }, () => null);
      this.nativePages = Array.from({ length: this.pdf.numPages }, () => []);
      for (let n = 1; n <= this.pdf.numPages; n++) {
        const page = await this.pdf.getPage(n);
        const viewport = page.getViewport({ scale: 1.4 });
        const canvas = document.createElement('canvas');
        canvas.width = Math.ceil(viewport.width);
        canvas.height = Math.ceil(viewport.height);
        await page.render({ canvas, canvasContext: canvas.getContext('2d')!, viewport }).promise;
        this.pages.push(canvas);
      }
      this.page.set(1);
      this.draw();
      this.setTextForSaving(this.lastAppliedText);
      this.notice.set('PDF oscurato pronto per il salvataggio. Il testo memorizzato esclude le zone oscurate.');
    } catch {
      this.notice.set('Impossibile visualizzare il PDF oscurato.');
    } finally {
      this.busy.set(false);
      this.processingChange.emit({ file, processing: false });
    }
  }
  async load(): Promise<void> {
    const file = this.file;
    this.busy.set(true);
    this.processingChange.emit({ file, processing: true });
    this.notice.set('');
    this.extractedText.set('');
    this.textEdited.set(false);
    this.ocrUsed.set(false);
    this.ocrAttempted.set(false);
    this.ocrError.set('');
    this.ocrProgress.set('');
    try {
      GlobalWorkerOptions.workerSrc = new URL(
        'assets/pdfjs/pdf.worker.min.mjs',
        document.baseURI,
      ).toString();
      this.pdf = await getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
      this.pageCount.set(this.pdf.numPages);
      this.pages = [];
      this.boxes = Array.from({ length: this.pdf.numPages }, () => []);
      this.ocrPages = Array.from({ length: this.pdf.numPages }, () => null);
      this.nativePages = [];
      for (let n = 1; n <= this.pdf.numPages; n++) {
        const page = await this.pdf.getPage(n);
        const viewport = page.getViewport({ scale: 1.4 });
        const canvas = document.createElement('canvas');
        canvas.width = Math.ceil(viewport.width);
        canvas.height = Math.ceil(viewport.height);
        await page.render({ canvas, canvasContext: canvas.getContext('2d')!, viewport }).promise;
        this.pages.push(canvas);

        const textContent = await page.getTextContent();
        const pageLines = this.extractNativeLines(textContent, viewport);
        this.nativePages.push(pageLines);
      }
      const extractedText = this.buildExtractedText();
      const initialText = this.initialExtractedText.trim() || extractedText;
      if (this.file === file) {
        this.textEdited.set(!!this.initialExtractedText.trim());
        this.setTextForSaving(initialText);
      }
      this.page.set(1);
      this.draw();
    } catch {
      this.notice.set('Impossibile leggere il PDF in questo browser.');
    } finally {
      this.busy.set(false);
      this.processingChange.emit({ file, processing: false });
    }
  }
  async runOcr(preserveExistingText = false): Promise<void> {
    if (!this.pdf || this.busy()) return;
    const file = this.file;
    const savedText = this.extractedText();
    const textWasEdited = this.textEdited();
    this.busy.set(true);
    this.processingChange.emit({ file, processing: true });
    this.notice.set('');
    this.ocrUsed.set(false);
    this.ocrAttempted.set(true);
    this.ocrError.set('');
    let worker: BrowserOcrWorker | null = null;
    try {
      this.ocrProgress.set('Avvio del motore OCR…');
      worker = await this.createOcrWorker();
      for (let n = 1; n <= this.pdf.numPages; n++) {
        this.ocrProgress.set(`Riconoscimento OCR della pagina ${n} di ${this.pdf.numPages}…`);
        const page = await this.pdf.getPage(n);
        const ocrResult = await this.recognizePage(page, worker, n - 1);
        if (ocrResult) {
          this.ocrPages[n - 1] = ocrResult;
          this.ocrUsed.set(true);
        }
      }
      const recomputed = this.buildExtractedText();
      if (recomputed && this.file === file) {
        if (preserveExistingText && savedText.trim()) {
          this.setTextForSaving(savedText);
          this.textEdited.set(textWasEdited);
        } else {
          this.textEdited.set(false);
          this.setTextForSaving(recomputed);
        }
        this.notice.set('OCR completato: il testo estratto esclude le parti oscurate.');
      } else if (!recomputed) {
        this.notice.set('L’OCR non ha riconosciuto testo nelle pagine.');
      }
    } catch (err) {
      console.warn('[PdfRedaction] runOcr failed', err);
      this.ocrError.set('Il motore OCR non è riuscito a elaborare il documento. Puoi riprovare.');
    } finally {
      await worker?.terminate().catch(() => undefined);
      this.ocrProgress.set('');
      this.busy.set(false);
      this.processingChange.emit({ file, processing: false });
    }
  }
  private extractNativeLines(textContent: any, viewport: any): NativeLineItem[] {
    const lines: NativeLineItem[] = [];
    if (!textContent || !Array.isArray(textContent.items)) return lines;

    const measure = document.createElement('canvas').getContext('2d')!;
    let currentLine: NativeWordItem[] = [];
    let lastY: number | null = null;

    for (const item of textContent.items) {
      if (!('str' in item) || !item.str || !item.str.trim()) {
        if (item.hasEOL && currentLine.length) {
          lines.push({ words: currentLine });
          currentLine = [];
          lastY = null;
        }
        continue;
      }

      const [, , , h, tx, ty] = item.transform;
      const fontH = Math.max(Math.abs(h || item.height || 10) * 1.4, 8);
      const itemCanvasY = Math.round(viewport.height - ty * 1.4 - fontH);
      const itemCanvasX = Math.round(tx * 1.4);
      const itemCanvasWidth = Math.max(Math.round(item.width * 1.4), 1);

      if (lastY !== null && Math.abs(itemCanvasY - lastY) > 6) {
        if (currentLine.length) {
          lines.push({ words: currentLine });
          currentLine = [];
        }
      }
      lastY = itemCanvasY;

      const itemStr = item.str;
      const totalMeasured = measure.measureText(itemStr).width || 1;
      const wordRegex = /\S+/g;
      let match: RegExpExecArray | null;

      while ((match = wordRegex.exec(itemStr)) !== null) {
        const start = match.index;
        const end = start + match[0].length;
        const leftFrac = measure.measureText(itemStr.slice(0, start)).width / totalMeasured;
        const rightFrac = measure.measureText(itemStr.slice(0, end)).width / totalMeasured;
        const wordX = Math.round(itemCanvasX + leftFrac * itemCanvasWidth);
        const wordWidth = Math.max(Math.round((rightFrac - leftFrac) * itemCanvasWidth), 4);

        currentLine.push({
          text: match[0],
          box: {
            x: wordX,
            y: itemCanvasY,
            width: wordWidth,
            height: Math.round(fontH),
          },
        });
      }

      if (item.hasEOL && currentLine.length) {
        lines.push({ words: currentLine });
        currentLine = [];
        lastY = null;
      }
    }

    if (currentLine.length) {
      lines.push({ words: currentLine });
    }

    return lines;
  }
  private boxIntersects(item: Redaction, redaction: Redaction): boolean {
    const overlapX = Math.max(
      0,
      Math.min(item.x + item.width, redaction.x + redaction.width) - Math.max(item.x, redaction.x),
    );
    const overlapY = Math.max(
      0,
      Math.min(item.y + item.height, redaction.y + redaction.height) - Math.max(item.y, redaction.y),
    );
    const overlapArea = overlapX * overlapY;
    if (overlapArea <= 0) return false;
    const itemArea = Math.max(1, item.width * item.height);
    return overlapArea / itemArea >= 0.15 || overlapArea >= 25;
  }
  private isWordRedacted(wordBox: Redaction, pageIndex: number): boolean {
    const boxes = this.boxes[pageIndex] ?? [];
    return boxes.some((box) => this.boxIntersects(wordBox, box));
  }
  private buildExtractedText(): string {
    const textPages: string[] = [];
    for (let p = 0; p < this.pageCount(); p++) {
      const ocrData = this.ocrPages[p];
      const pageCanvas = this.pages[p];
      const pageNum = p + 1;

      if (ocrData && ocrData.lines?.length && pageCanvas) {
        const scaleX = pageCanvas.width / ocrData.canvasWidth;
        const scaleY = pageCanvas.height / ocrData.canvasHeight;
        const linesText: string[] = [];

        for (const line of ocrData.lines) {
          if (line.words?.length) {
            const keptWords: string[] = [];
            for (const w of line.words) {
              const wordBox: Redaction = {
                x: Math.round(w.bbox.x0 * scaleX),
                y: Math.round(w.bbox.y0 * scaleY),
                width: Math.max(Math.round((w.bbox.x1 - w.bbox.x0) * scaleX), 4),
                height: Math.max(Math.round((w.bbox.y1 - w.bbox.y0) * scaleY), 4),
              };
              if (!this.isWordRedacted(wordBox, p)) {
                keptWords.push(w.text);
              }
            }
            if (keptWords.length) {
              linesText.push(keptWords.join(' '));
            }
          } else if (line.text) {
            const lineBox: Redaction = {
              x: Math.round(line.bbox.x0 * scaleX),
              y: Math.round(line.bbox.y0 * scaleY),
              width: Math.max(Math.round((line.bbox.x1 - line.bbox.x0) * scaleX), 4),
              height: Math.max(Math.round((line.bbox.y1 - line.bbox.y0) * scaleY), 4),
            };
            if (!this.isWordRedacted(lineBox, p)) {
              linesText.push(line.text);
            }
          }
        }

        const pageStr = linesText.join('\n').trim();
        if (pageStr) {
          textPages.push(`Pagina ${pageNum}\n${pageStr}`);
        }
      } else if (this.nativePages[p]?.length) {
        const linesText: string[] = [];
        for (const line of this.nativePages[p]) {
          const keptWords = line.words
            .filter((w) => !this.isWordRedacted(w.box, p))
            .map((w) => w.text);
          if (keptWords.length) {
            linesText.push(keptWords.join(' '));
          }
        }
        const pageStr = linesText.join('\n').trim();
        if (pageStr) {
          textPages.push(`Pagina ${pageNum}\n${pageStr}`);
        }
      }
    }

    return textPages.join('\n\n').replace(/[ \t]+/g, ' ').trim();
  }
  private recomputeExtractedText(): void {
    if (this.textEdited()) return;
    const text = this.buildExtractedText();
    this.setTextForSaving(text);
  }
  private async createOcrWorker(): Promise<BrowserOcrWorker> {
    const imported = await import('tesseract.js');
    // Angular bundles this CommonJS dependency as a module with a default export.
    const tesseract = (imported as unknown as { default?: typeof imported }).default ?? imported;
    const assetUrl = (path: string) => new URL(path, document.baseURI).toString();
    const localWorkerUrl = assetUrl('assets/tesseract/worker.min.js');
    const localCoreUrl = assetUrl('assets/tesseract/core/');
    const localLangUrl = assetUrl('assets/tesseract/lang/');

    let useLocal = true;
    try {
      const probe = await fetch(localWorkerUrl, { method: 'HEAD', cache: 'no-cache' });
      useLocal = probe.ok;
    } catch {
      useLocal = false;
    }

    const logger = ({ status, progress }: OcrWorkerProgress) => {
      const percent = Math.round(progress * 100);
      const labels: Record<string, string> = {
        'loading tesseract core': 'Caricamento del motore OCR locale',
        'loading language traineddata': 'Caricamento dei modelli linguistici',
        'initializing tesseract': 'Preparazione del motore OCR',
        'initializing api': 'Preparazione del riconoscimento',
        'recognizing text': 'Lettura del testo della scansione',
      };
      this.ocrProgress.set(`${labels[status] ?? 'Elaborazione OCR'}… ${percent}%`);
    };

    if (useLocal) {
      return tesseract.createWorker('ita+eng', undefined, {
        workerPath: localWorkerUrl,
        corePath: localCoreUrl,
        langPath: localLangUrl,
        workerBlobURL: false,
        logger,
      }) as unknown as BrowserOcrWorker;
    }

    console.warn(
      '[PdfRedaction] Gli asset locali di Tesseract non sono raggiungibili (HTTP 404). ' +
      'Se il dev server (ng serve) è stato avviato prima di configurare angular.json, riavvialo con "npm start". ' +
      'Uso del worker standard per non bloccare l’elaborazione.',
    );

    return tesseract.createWorker('ita+eng', undefined, {
      workerBlobURL: true,
      logger,
    }) as unknown as BrowserOcrWorker;
  }
  private async recognizePage(
    page: any,
    worker: BrowserOcrWorker,
    pageIndex: number,
  ): Promise<OcrPageData | null> {
    const baseViewport = page.getViewport({ scale: 1.0 });
    const longest = Math.max(baseViewport.width, baseViewport.height);
    const targetLongest = 2400;
    let scale = targetLongest / (longest || 1);
    scale = Math.min(Math.max(scale, 0.5), 3.2);
    if (longest * scale > 2600) {
      scale = 2600 / longest;
    }
    const viewport = page.getViewport({ scale });
    const canvas = document.createElement('canvas');
    canvas.width = Math.ceil(viewport.width);
    canvas.height = Math.ceil(viewport.height);
    const ctx = canvas.getContext('2d')!;
    await page.render({ canvas, canvasContext: ctx, viewport }).promise;

    // Mask existing redaction boxes in solid black on the OCR canvas
    const pageBoxes = this.boxes[pageIndex] ?? [];
    if (pageBoxes.length > 0 && this.pages[pageIndex]) {
      const previewCanvas = this.pages[pageIndex];
      const scaleX = canvas.width / previewCanvas.width;
      const scaleY = canvas.height / previewCanvas.height;
      ctx.fillStyle = '#000';
      for (const box of pageBoxes) {
        ctx.fillRect(
          Math.round(box.x * scaleX),
          Math.round(box.y * scaleY),
          Math.round(box.width * scaleX),
          Math.round(box.height * scaleY),
        );
      }
    }
    let enhanced: HTMLCanvasElement | null = null;
    try {
      const res = await worker.recognize(canvas, {}, { text: true, blocks: true });
      const initialText = res.data?.text?.trim() ?? '';
      const initialBlocks = res.data?.blocks ?? [];
      const initialLines = this.extractLinesFromBlocks(initialBlocks);

      if (initialText.replace(/\s/g, '').length >= 24) {
        return {
          text: initialText,
          lines: initialLines,
          canvasWidth: canvas.width,
          canvasHeight: canvas.height,
        };
      }

      // Retry sparse results on a contrast-normalized black and white copy.
      enhanced = this.createHighContrastCopy(canvas);
      const enhancedRes = await worker.recognize(enhanced, {}, { text: true, blocks: true });
      const enhancedText = enhancedRes.data?.text?.trim() ?? '';
      const enhancedBlocks = enhancedRes.data?.blocks ?? [];
      const enhancedLines = this.extractLinesFromBlocks(enhancedBlocks);

      if (enhancedText.length > initialText.length) {
        return {
          text: enhancedText,
          lines: enhancedLines,
          canvasWidth: canvas.width,
          canvasHeight: canvas.height,
        };
      }

      return {
        text: initialText,
        lines: initialLines,
        canvasWidth: canvas.width,
        canvasHeight: canvas.height,
      };
    } finally {
      canvas.width = 0;
      canvas.height = 0;
      if (enhanced) {
        enhanced.width = 0;
        enhanced.height = 0;
      }
    }
  }
  private extractLinesFromBlocks(blocks: any[]): OcrLineItem[] {
    const lines: OcrLineItem[] = [];
    if (!Array.isArray(blocks)) return lines;
    for (const block of blocks) {
      if (!block) continue;
      const paragraphs = Array.isArray(block.paragraphs) ? block.paragraphs : [block];
      for (const p of paragraphs) {
        if (!p) continue;
        const pLines = Array.isArray(p.lines) ? p.lines : [];
        for (const line of pLines) {
          if (!line) continue;
          const words: OcrWordItem[] = [];
          if (Array.isArray(line.words)) {
            for (const w of line.words) {
              const text = String(w.text ?? '').trim();
              if (text && w.bbox) {
                words.push({ text, bbox: { ...w.bbox } });
              }
            }
          }
          const lineText = String(line.text ?? '').trim();
          const bbox = line.bbox ?? { x0: 0, y0: 0, x1: 0, y1: 0 };
          lines.push({ text: lineText, words, bbox });
        }
      }
    }
    return lines;
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
    threshold = Math.min(Math.max(threshold, 60), 210);
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
      this.recomputeExtractedText();
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
    this.recomputeExtractedText();
  }
  private cleanToken(s: string): string {
    return s
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^\p{L}\p{N}]+/gu, '');
  }
  private isBoxDuplicate(existing: Redaction[], candidate: Redaction): boolean {
    return existing.some(
      (b) =>
        Math.abs(b.x - candidate.x) < 8 &&
        Math.abs(b.y - candidate.y) < 8 &&
        Math.abs(b.width - candidate.width) < 12 &&
        Math.abs(b.height - candidate.height) < 12,
    );
  }
  private findOcrMatches(
    lines: OcrLineItem[],
    rawTerms: string[],
    scaleX: number,
    scaleY: number,
    pageWidth: number,
    pageHeight: number,
  ): Redaction[] {
    const matches: Redaction[] = [];
    const padX = 4;
    const padY = 2;

    const pushBox = (x0: number, y0: number, x1: number, y1: number) => {
      const x = Math.max(0, Math.round(x0 * scaleX - padX));
      const y = Math.max(0, Math.round(y0 * scaleY - padY));
      const width = Math.min(pageWidth - x, Math.round((x1 - x0) * scaleX + padX * 2));
      const height = Math.min(pageHeight - y, Math.round((y1 - y0) * scaleY + padY * 2));
      if (width > 4 && height > 4) {
        matches.push({ x, y, width, height });
      }
    };

    for (const term of rawTerms) {
      const termClean = this.cleanToken(term);
      if (termClean.length < 2) continue;
      const termWords = term
        .split(/\s+/)
        .map((w) => this.cleanToken(w))
        .filter((w) => w.length > 0);
      if (!termWords.length) continue;

      for (const line of lines) {
        if (!line.words || !line.words.length) {
          if (line.text && this.cleanToken(line.text).includes(termClean) && line.bbox) {
            pushBox(line.bbox.x0, line.bbox.y0, line.bbox.x1, line.bbox.y1);
          }
          continue;
        }

        const words = line.words;
        const k = termWords.length;

        if (k > 1) {
          for (let start = 0; start <= words.length - k; start++) {
            let matched = true;
            for (let j = 0; j < k; j++) {
              const wClean = this.cleanToken(words[start + j].text);
              if (wClean !== termWords[j] && !wClean.includes(termWords[j])) {
                matched = false;
                break;
              }
            }
            if (matched) {
              const slice = words.slice(start, start + k);
              const x0 = Math.min(...slice.map((w) => w.bbox.x0));
              const y0 = Math.min(...slice.map((w) => w.bbox.y0));
              const x1 = Math.max(...slice.map((w) => w.bbox.x1));
              const y1 = Math.max(...slice.map((w) => w.bbox.y1));
              pushBox(x0, y0, x1, y1);
            }
          }
          for (const w of words) {
            const wClean = this.cleanToken(w.text);
            if (wClean === termClean || (termClean.length >= 4 && wClean.includes(termClean))) {
              pushBox(w.bbox.x0, w.bbox.y0, w.bbox.x1, w.bbox.y1);
            }
          }
        } else {
          const target = termWords[0];
          for (const w of words) {
            const wClean = this.cleanToken(w.text);
            if (wClean === target || (target.length >= 3 && wClean.includes(target))) {
              pushBox(w.bbox.x0, w.bbox.y0, w.bbox.x1, w.bbox.y1);
            }
          }
        }
      }
    }

    return matches;
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
    const hadOcrResults = this.ocrPages.some(Boolean);
    this.busy.set(true);
    this.matches.set(0);
    let count = 0;
    try {
      for (let i = 1; i <= this.pdf.numPages; i++) {
        const page = await this.pdf.getPage(i);
        const viewport = page.getViewport({ scale: 1.4 });
        const content = await page.getTextContent();
        const pageBoxes = this.boxes[i - 1];
        const pageCanvas = this.pages[i - 1];

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
              const candidate: Redaction = {
                x: Math.round(x * 1.4 + left),
                y: Math.round(viewport.height - y * 1.4 - h * 1.4),
                width: Math.max(Math.round(right - left), 3),
                height: Math.max(Math.round(h * 1.4), 10),
              };
              if (!this.isBoxDuplicate(pageBoxes, candidate)) {
                pageBoxes.push(candidate);
                count++;
              }
            }
          }
        }

        const ocrData = this.ocrPages[i - 1];
        if (ocrData && ocrData.lines?.length && pageCanvas) {
          const scaleX = pageCanvas.width / ocrData.canvasWidth;
          const scaleY = pageCanvas.height / ocrData.canvasHeight;
          const ocrMatches = this.findOcrMatches(
            ocrData.lines,
            terms,
            scaleX,
            scaleY,
            pageCanvas.width,
            pageCanvas.height,
          );
          for (const box of ocrMatches) {
            if (!this.isBoxDuplicate(pageBoxes, box)) {
              pageBoxes.push(box);
              count++;
            }
          }
        }
      }
      this.matches.set(count);
      this.page.set(1);
      this.draw();
      if (count) {
        this.recomputeExtractedText();
        this.notice.set(
          `${count} aree individuate; verifica le aree su ogni pagina e premi "Oscura risultati" per confermare.`,
        );
      } else {
        if (!hadOcrResults && !this.ocrAttempted()) {
          this.notice.set('Nessuna corrispondenza nel testo selezionabile. Avvio OCR locale…');
          this.busy.set(false);
          await this.runOcr(true);
          if (this.ocrPages.some(Boolean)) {
            await this.findTerms();
            return;
          }
        }
        const hasText = this.extractedText().length > 0;
        this.notice.set(
          hasText
            ? 'Nessuna corrispondenza trovata per i termini cercati.'
            : 'Nessun testo trovato. Se il documento è una scansione, estrai prima il testo con il pulsante OCR facoltativo.',
        );
      }
    } catch (err) {
      console.warn('[PdfRedaction] findTerms failed', err);
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
    this.recomputeExtractedText();
  }
  async apply(): Promise<void> {
    const file = this.file;
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
      const baseName = this.file.name.replace(/(?:-oscurato)?\.pdf$/i, '');
      const redactedFile = new File([blob], `${baseName}-oscurato.pdf`, {
        type: 'application/pdf',
      });
      this.lastAppliedFile = redactedFile;
      this.lastAppliedText = this.extractedText();
      this.redacted.emit(redactedFile);
      this.notice.set('PDF oscurato pronto per il salvataggio.');
    } catch {
      this.notice.set('Creazione del PDF oscurato non riuscita.');
    } finally {
      if (this.file === file) this.busy.set(false);
    }
  }
}
