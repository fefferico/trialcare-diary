import { Injectable } from '@angular/core';
import { jsPDF } from 'jspdf';
import { DiaryRow, SectionDefinition } from '../models/diary.models';

@Injectable({ providedIn: 'root' })
export class PdfExportService {
  export(section: SectionDefinition, rows: DiaryRow[], childName: string): void {
    const pdf = new jsPDF();
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(20);
    pdf.text('TrialCare Diary', 18, 22);
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(11);
    pdf.text(`Report clinico · ${childName || 'Profilo bambino'}`, 18, 31);
    pdf.text(`${section.label} · ${rows.length} voci`, 18, 39);
    let y = 52;
    for (const row of rows.slice(0, 24)) {
      const title = String(row['title'] ?? row['name'] ?? row['category'] ?? section.label);
      const date = String(row['date'] ?? row['start_date'] ?? '').slice(0, 10);
      const detail = Object.entries(row)
        .filter(
          ([key, value]) =>
            !['id', 'created_at', 'user_id', 'child_id', 'title', 'name'].includes(key) &&
            typeof value !== 'object' &&
            value !== '',
        )
        .map(([key, value]) => `${key}: ${String(value)}`)
        .join(' · ');
      pdf.setFont('helvetica', 'bold');
      pdf.text(`${date}  ${title}`.slice(0, 100), 18, y);
      y += 6;
      pdf.setFont('helvetica', 'normal');
      const lines = pdf.splitTextToSize(detail || 'Nessun dettaglio aggiuntivo.', 172) as string[];
      pdf.text(lines.slice(0, 2), 18, y);
      y += Math.max(8, Math.min(lines.length, 2) * 5 + 4);
      if (y > 270) {
        pdf.addPage();
        y = 20;
      }
    }
    pdf.setFontSize(8);
    pdf.text(
      `Generato il ${new Date().toLocaleDateString('it-IT')} · Documento informativo per il team clinico`,
      18,
      285,
    );
    pdf.save(`trialcare-${section.id}-${new Date().toISOString().slice(0, 10)}.pdf`);
  }
}
