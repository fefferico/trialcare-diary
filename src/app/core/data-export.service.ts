import { Injectable } from '@angular/core';
import { DiaryDataService, DiaryExportData } from './diary-data.service';
import { DiaryRow, SECTIONS } from '../models/diary.models';

@Injectable({ providedIn: 'root' })
export class DataExportService {
  constructor(private readonly diary: DiaryDataService) {}

  async export(format: 'json' | 'markdown' | 'doc'): Promise<void> {
    const data = await this.diary.loadAllForExport();
    const date = new Date().toISOString().slice(0, 10);
    const content =
      format === 'json'
        ? JSON.stringify(
            { exported_at: new Date().toISOString(), app: 'TrialCare Diary', data },
            null,
            2,
          )
        : format === 'markdown'
          ? this.toMarkdown(data, date)
          : this.toWord(data, date);
    const mime =
      format === 'json'
        ? 'application/json;charset=utf-8'
        : format === 'markdown'
          ? 'text/markdown;charset=utf-8'
          : 'application/msword;charset=utf-8';
    this.download(
      content,
      mime,
      `trialcare-backup-${date}.${format === 'markdown' ? 'md' : format}`,
    );
  }

  private toMarkdown(data: DiaryExportData, date: string): string {
    const sections = Object.entries(data).map(([id, rows]) => {
      const definition = SECTIONS.find((item) => item.id === id);
      const label = definition?.label ?? 'Misurazioni di crescita';
      const content = rows.length
        ? rows.map((row) => this.rowMarkdown(row)).join('\n\n')
        : '_Nessuna voce._';
      return `## ${label} (${rows.length})\n\n${content}`;
    });
    return `# Backup TrialCare Diary\n\nEsportato il ${date}.\n\nGli allegati in Storage sono indicati tramite percorso; il backup non contiene i file binari.\n\n${sections.join('\n\n')}`;
  }

  private rowMarkdown(row: DiaryRow): string {
    const title = String(row['name'] ?? row['title'] ?? row['category'] ?? 'Voce del diario');
    const fields = Object.entries(row).filter(
      ([key, value]) => value !== null && value !== undefined && value !== '',
    );
    return `### ${this.md(title)}\n\n${fields.map(([key, value]) => `- **${this.md(key)}:** ${this.md(this.stringify(value))}`).join('\n')}`;
  }

  private toWord(data: DiaryExportData, date: string): string {
    const sections = Object.entries(data)
      .map(([id, rows]) => {
        const label = SECTIONS.find((item) => item.id === id)?.label ?? 'Misurazioni di crescita';
        const records = rows.length
          ? rows
              .map(
                (row) =>
                  `<article><h3>${this.html(String(row['name'] ?? row['title'] ?? row['category'] ?? 'Voce del diario'))}</h3><dl>${Object.entries(
                    row,
                  )
                    .filter(([, value]) => value !== null && value !== undefined && value !== '')
                    .map(
                      ([key, value]) =>
                        `<dt>${this.html(key)}</dt><dd>${this.html(this.stringify(value))}</dd>`,
                    )
                    .join('')}</dl></article>`,
              )
              .join('')
          : '<p>Nessuna voce.</p>';
        return `<section><h2>${this.html(label)} (${rows.length})</h2>${records}</section>`;
      })
      .join('');
    return `<!doctype html><html><head><meta charset="utf-8"><title>Backup TrialCare Diary</title><style>body{font:11pt Arial,sans-serif;color:#243234}h1{color:#087e78}h2{border-bottom:1px solid #9abbb5;padding-bottom:5px;margin-top:28px}article{page-break-inside:avoid;margin:16px 0}h3{margin-bottom:6px}dl{display:grid;grid-template-columns:180px 1fr;gap:4px 12px;margin:0}dt{font-weight:bold}dd{margin:0;white-space:pre-wrap}p.note{color:#555}</style></head><body><h1>Backup TrialCare Diary</h1><p>Esportato il ${date}.</p><p class="note">Gli allegati in Storage sono indicati tramite percorso; il backup non contiene i file binari.</p>${sections}</body></html>`;
  }

  private stringify(value: unknown): string {
    return typeof value === 'object' ? JSON.stringify(value) : String(value);
  }
  private md(value: string): string {
    return value
      .replace(/\\/g, '\\\\')
      .replace(/[\n\r]+/g, '<br>')
      .replace(/([`*_{}\[\]()#+.!|>])/g, '\\$1');
  }
  private html(value: string): string {
    return value
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }
  private download(content: string, mime: string, filename: string): void {
    const url = URL.createObjectURL(new Blob([content], { type: mime }));
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
}
