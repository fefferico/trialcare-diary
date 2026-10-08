import { Injectable } from '@angular/core';
import { jsPDF } from 'jspdf';
import { DiaryRow, SectionDefinition } from '../models/diary.models';

@Injectable({ providedIn: 'root' })
export class PdfExportService {
  exportVisitSummary(rows: DiaryRow[], childName: string, from: string, to: string): void {
    const pdf = new jsPDF();
    const labels: Record<string, string> = {
      health_events: 'Eventi e sintomi', calendar_events: 'Appuntamenti',
      medications: 'Terapie farmacologiche', medication_doses: 'Registro somministrazioni',
      therapies: 'Percorsi terapeutici', orthoses: 'Ortesi e ausili',
      documents: 'Documenti', child_measurements: 'Misurazioni', expenses: 'Spese',
    };
    const fields: Record<string, string[]> = {
      health_events: ['category', 'time', 'severity', 'notes', 'location'],
      calendar_events: ['time', 'specialist', 'location', 'status', 'notes'],
      medications: ['dosage', 'formulation', 'schedule_times', 'start_date', 'end_date', 'notes'],
      medication_doses: ['scheduled_time', 'status', 'taken_at', 'skipped_reason'],
      therapies: ['therapist', 'facility', 'frequency', 'notes'],
      orthoses: ['category', 'size', 'laterality', 'notes'],
      documents: ['category', 'title', 'date'],
      child_measurements: ['weight_kg', 'height_cm', 'head_circumference_cm', 'notes'],
      expenses: ['category', 'amount', 'distance_km', 'notes'],
    };
    const fieldLabels: Record<string, string> = {
      category: 'Tipo', time: 'Ora', severity: 'Intensità', notes: 'Note', location: 'Luogo', specialist: 'Specialista',
      status: 'Stato', dosage: 'Dosaggio', formulation: 'Formulazione', schedule_times: 'Orari previsti',
      start_date: 'Dal', end_date: 'Al', scheduled_time: 'Ora prevista', taken_at: 'Somministrata alle', skipped_reason: 'Motivo dose saltata',
      therapist: 'Terapista', facility: 'Struttura', frequency: 'Frequenza', size: 'Misura',
      laterality: 'Lato', weight_kg: 'Peso (kg)', height_cm: 'Altezza (cm)',
      head_circumference_cm: 'Circonferenza testa (cm)', amount: 'Importo (€)', distance_km: 'Distanza (km)',
      title: 'Titolo', date: 'Data',
    };
    pdf.setFont('helvetica', 'bold'); pdf.setFontSize(19);
    pdf.text('Riepilogo per la visita', 18, 22);
    pdf.setFont('helvetica', 'normal'); pdf.setFontSize(11);
    pdf.text(`Profilo: ${childName || 'Bambino'}`, 18, 31);
    pdf.text(`Periodo: ${from || 'inizio diario'} – ${to || 'oggi'}`, 18, 38);
    pdf.setFontSize(9);
    pdf.text('Promemoria da discutere con il team clinico. Le informazioni sono state registrate dalla famiglia.', 18, 46, { maxWidth: 174 });
    let y = 58;
    const groups = [...new Set(rows.map((row) => String(row['record_type'] ?? '')))].filter((key) => labels[key]);
    for (const group of groups) {
      const groupRows = rows.filter((row) => row['record_type'] === group);
      if (y > 270) { pdf.addPage(); y = 20; }
      pdf.setFont('helvetica', 'bold'); pdf.setFontSize(12);
      pdf.text(`${labels[group]} (${groupRows.length})`, 18, y); y += 8;
      for (const row of groupRows) {
        const date = String(row['date'] ?? row['scheduled_date'] ?? row['start_date'] ?? '').slice(0, 10);
        const title = String(row['title'] ?? row['name'] ?? (group === 'medication_doses' ? 'Dose' : labels[group]));
        pdf.setFont('helvetica', 'bold'); pdf.setFontSize(10);
        const heading = pdf.splitTextToSize(`${date}  ${title}`, 174) as string[];
        if (y + heading.length * 5 > 276) { pdf.addPage(); y = 20; }
        pdf.text(heading, 20, y); y += heading.length * 5;
        const hasSchedulePeriods = group === 'medications' && Array.isArray(row['schedule_periods']) && row['schedule_periods'].length > 0;
        if (hasSchedulePeriods) y = this.drawSchedulePeriods(pdf, row['schedule_periods'] as Record<string, unknown>[], y);
        const legacyScheduleFields = new Set(['dosage', 'formulation', 'schedule_times', 'start_date', 'end_date', 'spray_count', 'administration_duration_seconds', 'planned_pause']);
        const detail = (fields[group] ?? []).filter((key) => {
          if (hasSchedulePeriods && key === 'schedule_periods') return false;
          if (hasSchedulePeriods && legacyScheduleFields.has(key)) return false;
          const value = row[key];
          if (value == null || value === '') return false;
          if (Array.isArray(value) && value.length === 0) return false;
          if (group === 'expenses' && ['amount', 'distance_km'].includes(key) && Number(value) === 0) return false;
          return true;
        }).map((key) => `${fieldLabels[key] ?? key}: ${this.formatVisitValue(key, row[key])}`).join(' · ');
        if (detail) {
          pdf.setFont('helvetica', 'normal'); pdf.setFontSize(9);
          const lines = pdf.splitTextToSize(detail, 168) as string[];
          if (y + lines.length * 4 > 278) { pdf.addPage(); y = 20; }
          pdf.text(lines, 24, y); y += lines.length * 4;
        }
        y += 4;
      }
      y += 3;
    }
    if (!rows.length) pdf.text('Nessuna voce registrata nel periodo selezionato.', 18, y);
    if (y > 250) { pdf.addPage(); y = 20; }
    y += 8;
    pdf.setFont('helvetica', 'bold'); pdf.setFontSize(12);
    pdf.text('Domande e punti da discutere', 18, y);
    pdf.setFont('helvetica', 'normal'); pdf.setFontSize(10);
    pdf.line(18, y + 12, 190, y + 12);
    pdf.line(18, y + 24, 190, y + 24);
    pdf.line(18, y + 36, 190, y + 36);
    pdf.save(`trialcare-riepilogo-visita-${new Date().toISOString().slice(0, 10)}.pdf`);
  }

  private drawSchedulePeriods(pdf: jsPDF, periods: Record<string, unknown>[], startY: number): number {
    let y = startY;
    periods.forEach((period, index) => {
      const start = this.formatVisitDate(period['start_date']);
      const end = period['end_date'] ? this.formatVisitDate(period['end_date']) : 'in corso';
      const heading = `• Periodo ${index + 1} · ${start || 'inizio non specificato'} – ${end}`;
      pdf.setFont('helvetica', 'bold'); pdf.setFontSize(9);
      const headingLines = pdf.splitTextToSize(heading, 160) as string[];
      if (y + headingLines.length * 4.5 > 276) { pdf.addPage(); y = 20; }
      pdf.text(headingLines, 26, y); y += headingLines.length * 4.5;

      const regimen = [
        period['dosage'] ? `Dosaggio: ${period['dosage']}` : '',
        period['formulation'] ? `Formulazione: ${period['formulation']}` : '',
        period['schedule_times'] ? `Orari: ${period['schedule_times']}` : '',
        period['spray_count'] != null ? `Puff o spruzzi: ${period['spray_count']}` : '',
        period['administration_duration_seconds'] != null ? `Durata: ${period['administration_duration_seconds']} s` : '',
      ].filter(Boolean).join(' · ');
      const pause = period['planned_pause'] ? `Pause previste: ${period['planned_pause']}` : '';
      for (const paragraph of [regimen, pause].filter(Boolean)) {
        pdf.setFont('helvetica', 'normal'); pdf.setFontSize(9);
        const lines = pdf.splitTextToSize(paragraph, 154) as string[];
        if (y + lines.length * 4.2 > 278) { pdf.addPage(); y = 20; }
        pdf.text(lines, 32, y); y += lines.length * 4.2;
      }
      y += 3;
    });
    return y;
  }

  private formatVisitDate(value: unknown): string {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return '';
    const [year, month, day] = value.split('-').map(Number);
    return new Date(year, month - 1, day).toLocaleDateString('it-IT', {
      day: '2-digit', month: 'short', year: 'numeric',
    });
  }

  private formatVisitValue(key: string, value: unknown): string {
    if (key === 'scheduled_time' && typeof value === 'string') return value.slice(0, 5);
    if (key === 'taken_at' && typeof value === 'string') {
      const date = new Date(value);
      if (!Number.isNaN(date.getTime())) {
        return `${date.toLocaleDateString('it-IT')} alle ${date.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })}`;
      }
    }
    return String(value);
  }

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
