import { CommonModule } from '@angular/common';
import {
  Component,
  ElementRef,
  EventEmitter,
  Input,
  OnChanges,
  Output,
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
      <div class="mt-3 overflow-auto">
        <canvas
          #preview
          class="max-w-full border border-slate-200"
          style="touch-action: none"
          (pointerdown)="start($event)"
          (pointermove)="move($event)"
          (pointerup)="end($event)"
          (pointercancel)="cancelDrag($event)"
          aria-label="Anteprima PDF: trascina per aggiungere un’area di oscuramento"
        ></canvas>
      </div>
      <p class="mt-2 text-xs text-amber-700 dark:text-amber-300">
        Trascina sull’anteprima per aggiungere aree nere. Controlla tutte le pagine prima di
        procedere. L’oscuramento automatico non trova testo nelle scansioni né informazioni non
        incluse nella ricerca.
      </p>
    }
  </div>`,
})
export class PdfRedactionComponent implements OnChanges {
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
  private pdf: any;
  private pages: HTMLCanvasElement[] = [];
  private boxes: Redaction[][] = [];
  private dragStart?: { x: number; y: number };
  ngOnChanges(): void {
    this.terms.set(this.initialTerms);
    void this.load();
  }
  get redactionCount(): number {
    return this.boxes.reduce((sum, boxes) => sum + boxes.length, 0);
  }
  async load(): Promise<void> {
    this.busy.set(true);
    this.notice.set('');
    try {
      GlobalWorkerOptions.workerSrc = new URL(
        'assets/pdfjs/pdf.worker.min.mjs',
        document.baseURI,
      ).toString();
      this.pdf = await getDocument({ data: new Uint8Array(await this.file.arrayBuffer()) }).promise;
      this.pageCount.set(this.pdf.numPages);
      this.pages = [];
      this.boxes = Array.from({ length: this.pdf.numPages }, () => []);
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
    } catch {
      this.notice.set('Impossibile leggere il PDF in questo browser.');
    } finally {
      this.busy.set(false);
    }
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
