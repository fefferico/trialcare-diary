import { Injectable } from '@angular/core';
import { jsPDF } from 'jspdf';
import { DiaryRow, SectionDefinition } from '../models/diary.models';

export interface VisitSummaryDetail {
  label: string;
  value: string;
}

export interface VisitSummarySchedulePeriod {
  id: string;
  startDate: string | null;
  endDate: string | null;
  heading: string;
  regimen: string;
  pause: string;
}

export interface VisitSummaryEntry {
  id: string;
  date: string;
  title: string;
  schedulePeriods: VisitSummarySchedulePeriod[];
  details: VisitSummaryDetail[];
  doseStatus?: 'taken' | 'skipped' | 'unknown';
  scheduledTime?: string;
}

export interface VisitSummaryMedicationPeriod extends VisitSummarySchedulePeriod {
  entries: VisitSummaryEntry[];
  recentEntries: VisitSummaryEntry[];
  additionalEntries: VisitSummaryEntry[];
}

export interface VisitSummaryMedicationGroup {
  id: string;
  name: string;
  periods: VisitSummaryMedicationPeriod[];
  entries: VisitSummaryEntry[];
  unassignedEntries: VisitSummaryEntry[];
}

export interface VisitSummaryGroup {
  key: string;
  label: string;
  entries: VisitSummaryEntry[];
  medicationGroups: VisitSummaryMedicationGroup[];
}

export interface VisitSummaryDocument {
  profile: string;
  period: string;
  groups: VisitSummaryGroup[];
  entryCount: number;
}

@Injectable({ providedIn: 'root' })
export class PdfExportService {
  createVisitSummary(
    rows: DiaryRow[],
    childName: string,
    from: string,
    to: string,
    allMedicationRows: DiaryRow[] = rows.filter((row) => row['record_type'] === 'medications'),
  ): VisitSummaryDocument {
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
      medication_doses: ['scheduled_time', 'administered_dosage', 'status', 'taken_at', 'skipped_reason'],
      therapies: ['therapist', 'facility', 'frequency', 'notes'],
      orthoses: ['category', 'size', 'laterality', 'notes'],
      documents: ['category', 'title', 'date'],
      child_measurements: ['weight_kg', 'height_cm', 'head_circumference_cm', 'notes'],
      expenses: ['category', 'amount', 'distance_km', 'notes'],
    };
    const fieldLabels: Record<string, string> = {
      category: 'Tipo', time: 'Ora', severity: 'Intensità', notes: 'Note', location: 'Luogo', specialist: 'Specialista',
      status: 'Stato', dosage: 'Dosaggio', formulation: 'Formulazione', schedule_times: 'Orari previsti',
      start_date: 'Dal', end_date: 'Al', scheduled_time: 'Ora prevista', administered_dosage: 'Dosaggio somministrato', taken_at: 'Somministrata alle', skipped_reason: 'Motivo dose saltata',
      therapist: 'Terapista', facility: 'Struttura', frequency: 'Frequenza', size: 'Misura',
      laterality: 'Lato', weight_kg: 'Peso (kg)', height_cm: 'Altezza (cm)',
      head_circumference_cm: 'Circonferenza testa (cm)', amount: 'Importo (€)', distance_km: 'Distanza (km)',
      title: 'Titolo', date: 'Data',
    };

    const medicationRowsById = new Map(allMedicationRows.map((row) => [row.id, row]));
    const groups = new Map<string, VisitSummaryGroup>();
    const medicationDoseGroups = new Map<string, VisitSummaryMedicationGroup>();
    for (const row of rows) {
      const key = String(row['record_type'] ?? '');
      if (!labels[key]) continue;
      let group = groups.get(key);
      if (!group) {
        group = { key, label: labels[key], entries: [], medicationGroups: [] };
        groups.set(key, group);
      }

      const schedulePeriods = key === 'medications' ? this.createSchedulePeriods(row) : [];
      const hasSchedulePeriods = schedulePeriods.length > 0;
      const legacyScheduleFields = new Set([
        'dosage', 'formulation', 'schedule_times', 'start_date', 'end_date',
        'spray_count', 'administration_duration_seconds', 'planned_pause',
      ]);
      const details = (fields[key] ?? [])
        .filter((field) => {
          if (hasSchedulePeriods && field === 'schedule_periods') return false;
          if (hasSchedulePeriods && legacyScheduleFields.has(field)) return false;
          const value = row[field];
          if (value == null || value === '') return false;
          if (Array.isArray(value) && value.length === 0) return false;
          if (key === 'expenses' && ['amount', 'distance_km'].includes(field) && Number(value) === 0) return false;
          return true;
        })
        .map((field) => ({
          label: field === 'scheduled_time' && row['is_spot'] === true
            ? 'Ora della somministrazione'
            : fieldLabels[field] ?? field,
          value: this.formatVisitValue(field, row[field]),
        }));
      if (key === 'medication_doses' && row['is_spot'] === true)
        details.unshift({ label: 'Tipo', value: 'Somministrazione fuori programma' });

      const entry: VisitSummaryEntry = {
        id: row.id,
        date: String(row['date'] ?? row['scheduled_date'] ?? row['start_date'] ?? '').slice(0, 10),
        title: key === 'medication_doses'
          ? row['is_spot'] === true ? 'Somministrazione spot' : 'Somministrazione'
          : String(row['title'] ?? row['name'] ?? labels[key]),
        schedulePeriods,
        details,
        ...(key === 'medication_doses'
          ? {
              doseStatus: this.getMedicationDoseStatus(row),
              scheduledTime: String(row['scheduled_time'] ?? '').slice(0, 5),
            }
          : {}),
      };

      if (key === 'medication_doses') {
        const medicationId = String(row['medication_id'] ?? '');
        const medication = medicationRowsById.get(medicationId);
        const medicationName = String(medication?.['name'] ?? row['name'] ?? 'Farmaco');
        const groupId = medicationId || `name:${medicationName}`;
        let medicationGroup = medicationDoseGroups.get(groupId);
        if (!medicationGroup) {
          medicationGroup = {
            id: groupId,
            name: medicationName,
            periods: medication
              ? this.createSchedulePeriods(medication).map((period) => ({
                  ...period,
                  entries: [],
                  recentEntries: [],
                  additionalEntries: [],
                }))
              : [],
            entries: [],
            unassignedEntries: [],
          };
          medicationDoseGroups.set(groupId, medicationGroup);
        }
        medicationGroup.entries.push(entry);
        const matchingPeriod = this.findMedicationPeriod(medicationGroup.periods, entry.date);
        if (matchingPeriod) matchingPeriod.entries.push(entry);
        else medicationGroup.unassignedEntries.push(entry);
        group.entries.push(entry);
      } else {
        group.entries.push(entry);
      }
    }

    const medicationDoseSummary = groups.get('medication_doses');
    const medicationGroups = [...medicationDoseGroups.values()];
    for (const medicationGroup of medicationGroups) {
      for (const period of medicationGroup.periods) {
        period.recentEntries = period.entries.slice(0, 3);
        period.additionalEntries = period.entries.slice(3);
      }
    }
    if (medicationDoseSummary) medicationDoseSummary.medicationGroups = medicationGroups;
    const summaryGroups = [...groups.values()];
    const medicationDoseIndex = summaryGroups.findIndex((group) => group.key === 'medication_doses');
    if (medicationDoseIndex > 0) summaryGroups.unshift(summaryGroups.splice(medicationDoseIndex, 1)[0]);
    return {
      profile: childName || 'Bambino',
      period: `${from || 'inizio diario'} – ${to || 'oggi'}`,
      groups: summaryGroups,
      entryCount: summaryGroups.reduce((count, group) => count + group.entries.length, 0),
    };
  }

  private createSchedulePeriods(row: DiaryRow): VisitSummarySchedulePeriod[] {
    const storedPeriods = Array.isArray(row['schedule_periods'])
      ? row['schedule_periods'].filter(
          (period): period is Record<string, unknown> => !!period && typeof period === 'object',
        )
      : [];
    const periods = storedPeriods.length ? storedPeriods : [row as Record<string, unknown>];
    const today = this.todayDateKey();
    const orderedPeriods = periods
      .map((period, index) => ({
        period,
        index,
        startDate: this.periodDate(period['start_date']),
        endDate: this.periodDate(period['end_date']),
      }))
      .sort((left, right) =>
        (right.startDate ?? right.endDate ?? '').localeCompare(left.startDate ?? left.endDate ?? ''),
      );

    return orderedPeriods.map(({ period, index, startDate, endDate }, orderIndex) => {
      const start = this.formatVisitDate(startDate);
      const end = endDate && endDate <= today ? this.formatVisitDate(endDate) : 'IN CORSO';
      const regimen = [
        period['dosage'] ? `Dosaggio: ${period['dosage']}` : 'Dosaggio non indicato',
        period['formulation'] ? `Formulazione: ${period['formulation']}` : '',
        period['schedule_times'] ? `Orari: ${period['schedule_times']}` : '',
        period['start_time'] ? `Nel primo giorno, da: ${period['start_time']}` : '',
        period['end_time'] ? `Nell’ultimo giorno, fino a: ${period['end_time']}` : '',
        period['spray_count'] != null ? `Puff o spruzzi: ${period['spray_count']}` : '',
        period['administration_duration_seconds'] != null
          ? `Durata della somministrazione: ${period['administration_duration_seconds']} secondi`
          : '',
      ].filter(Boolean).join(' · ');

      return {
        id: `${row.id}-period-${index}`,
        startDate,
        endDate,
        heading: `${orderedPeriods.length > 1 ? `Periodo ${orderIndex + 1}` : 'Regime'} · ${start || 'inizio non specificato'} – ${end}`,
        regimen,
        pause: period['planned_pause'] ? `Pause previste: ${period['planned_pause']}` : '',
      };
    });
  }

  private findMedicationPeriod(
    periods: VisitSummaryMedicationPeriod[],
    date: string,
  ): VisitSummaryMedicationPeriod | undefined {
    if (!date) return periods.length === 1 ? periods[0] : undefined;
    const matching = periods.filter(
      (period) =>
        (!period.startDate || period.startDate <= date) &&
        (!period.endDate || period.endDate >= date),
    );
    if (matching.length <= 1) return matching[0];
    return matching.find((period) => !!period.startDate) ??
      matching.find((period) => !!period.endDate);
  }

  private getMedicationDoseStatus(row: DiaryRow): VisitSummaryEntry['doseStatus'] {
    if (row['skipped_reason'] || row['status'] === 'Saltata') return 'skipped';
    if (row['taken_at'] || row['status'] === 'Somministrata') return 'taken';
    return 'unknown';
  }

  private periodDate(value: unknown): string | null {
    return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}/.test(value)
      ? value.slice(0, 10)
      : null;
  }

  private todayDateKey(): string {
    const today = new Date();
    return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  }

  exportVisitSummary(summary: VisitSummaryDocument): void {
    const pdf = new jsPDF();
    pdf.setFont('helvetica', 'bold'); pdf.setFontSize(19);
    pdf.text('Riepilogo per la visita', 18, 22);
    pdf.setFont('helvetica', 'normal'); pdf.setFontSize(11);
    pdf.text(`Profilo: ${summary.profile}`, 18, 31);
    pdf.text(`Periodo: ${summary.period}`, 18, 38);
    pdf.setFontSize(9);
    pdf.text('Promemoria da discutere con il team clinico. Le informazioni sono state registrate dalla famiglia.', 18, 46, { maxWidth: 174 });
    let y = 58;
    for (const group of summary.groups) {
      if (y > 270) { pdf.addPage(); y = 20; }
      pdf.setFont('helvetica', 'bold'); pdf.setFontSize(12);
      pdf.text(`${group.label} (${group.entries.length})`, 18, y); y += 8;
      if (group.key === 'medication_doses' && group.medicationGroups.length) {
        for (const medication of group.medicationGroups) {
          if (y > 270) { pdf.addPage(); y = 20; }
          pdf.setFont('helvetica', 'bold'); pdf.setFontSize(11);
          const medicationHeading = pdf.splitTextToSize(medication.name, 174) as string[];
          pdf.text(medicationHeading, 20, y);
          y += medicationHeading.length * 5 + 2;
          for (const period of medication.periods) {
            y = this.drawSchedulePeriod(pdf, period, y);
            y = this.drawMedicationDoseSummary(pdf, period.entries, y, 28, 160);
          }
          if (!medication.periods.length) {
            pdf.setFont('helvetica', 'normal'); pdf.setFontSize(9);
            pdf.text('Periodi di terapia non disponibili.', 24, y);
            y += 5;
            y = this.drawMedicationDoseSummary(pdf, medication.unassignedEntries, y, 24, 164);
          }
          if (medication.periods.length && medication.unassignedEntries.length) {
            if (y > 270) { pdf.addPage(); y = 20; }
            pdf.setFont('helvetica', 'bold'); pdf.setFontSize(9);
            const unassignedHeading = 'Registrazioni senza periodo associato';
            const unassignedLines = pdf.splitTextToSize(unassignedHeading, 160) as string[];
            pdf.text(unassignedLines, 24, y);
            y += unassignedLines.length * 4.5;
            y = this.drawMedicationDoseSummary(pdf, medication.unassignedEntries, y, 24, 164);
          }
          y += 3;
        }
      } else {
        for (const entry of group.entries) {
          y = this.drawVisitSummaryEntry(pdf, entry, y);
        }
      }
      y += 3;
    }
    if (!summary.entryCount) pdf.text('Nessuna voce registrata nel periodo selezionato.', 18, y);
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

  private drawVisitSummaryEntry(
    pdf: jsPDF,
    entry: VisitSummaryEntry,
    startY: number,
    title = entry.title,
  ): number {
    let y = startY;
    pdf.setFont('helvetica', 'bold'); pdf.setFontSize(10);
    const heading = pdf.splitTextToSize(`${entry.date}  ${title}`.trim(), 174) as string[];
    if (y + heading.length * 5 > 276) { pdf.addPage(); y = 20; }
    pdf.text(heading, 20, y); y += heading.length * 5;
    for (const period of entry.schedulePeriods) y = this.drawSchedulePeriod(pdf, period, y);
    const detail = entry.details.map(({ label, value }) => `${label}: ${value}`).join(' · ');
    if (detail) {
      pdf.setFont('helvetica', 'normal'); pdf.setFontSize(9);
      const lines = pdf.splitTextToSize(detail, 168) as string[];
      if (y + lines.length * 4 > 278) { pdf.addPage(); y = 20; }
      pdf.text(lines, 24, y); y += lines.length * 4;
    }
    return y + 4;
  }

  private drawSchedulePeriod(pdf: jsPDF, period: VisitSummarySchedulePeriod, startY: number): number {
    let y = startY;
    pdf.setFont('helvetica', 'bold'); pdf.setFontSize(9);
    const headingLines = pdf.splitTextToSize(`• ${period.heading}`, 160) as string[];
    if (y + headingLines.length * 4.5 > 276) { pdf.addPage(); y = 20; }
    pdf.text(headingLines, 26, y); y += headingLines.length * 4.5;

    for (const paragraph of [period.regimen, period.pause].filter(Boolean)) {
        pdf.setFont('helvetica', 'normal'); pdf.setFontSize(9);
        const lines = pdf.splitTextToSize(paragraph, 154) as string[];
        if (y + lines.length * 4.2 > 278) { pdf.addPage(); y = 20; }
        pdf.text(lines, 32, y); y += lines.length * 4.2;
    }
    y += 3;
    return y;
  }

  private drawMedicationDoseSummary(
    pdf: jsPDF,
    entries: VisitSummaryEntry[],
    startY: number,
    x: number,
    width: number,
  ): number {
    let y = startY;
    if (!entries.length) {
      pdf.setFont('helvetica', 'normal'); pdf.setFontSize(9);
      pdf.text('Nessuna somministrazione registrata nel periodo selezionato.', x + 4, y);
      return y + 5;
    }

    const taken = entries.filter((entry) => entry.doseStatus === 'taken').length;
    const skipped = entries.filter((entry) => entry.doseStatus === 'skipped');
    const unknown = entries.filter((entry) => entry.doseStatus === 'unknown').length;
    const counts = [`Fatte: ${taken}`, `Saltate: ${skipped.length}`];
    if (unknown) counts.push(`Stato non specificato: ${unknown}`);

    pdf.setFont('helvetica', 'bold'); pdf.setFontSize(9);
    const countLines = pdf.splitTextToSize(counts.join(' · '), width - 8) as string[];
    if (y + countLines.length * 4.5 > 276) { pdf.addPage(); y = 20; }
    pdf.text(countLines, x + 4, y);
    y += countLines.length * 4.5;

    if (skipped.length) {
      const byDate = new Map<string, Set<string>>();
      for (const entry of skipped) {
        const date = entry.date || '';
        const time = entry.scheduledTime ?? '';
        if (!byDate.has(date)) byDate.set(date, new Set());
        if (time) byDate.get(date)!.add(time);
      }
      const skippedDates = [...byDate.entries()]
        .sort(([left], [right]) => right.localeCompare(left))
        .map(([date, times]) => {
          const dateLabel = this.formatVisitDate(date) || 'Data non indicata';
          return times.size ? `${dateLabel} (${[...times].sort().join(', ')})` : dateLabel;
        });
      pdf.setFont('helvetica', 'normal'); pdf.setFontSize(9);
      const skippedLines = pdf.splitTextToSize(`Date delle dosi saltate: ${skippedDates.join('; ')}`, width - 8) as string[];
      for (let index = 0; index < skippedLines.length; index += 1) {
        if (y + 4.2 > 278) { pdf.addPage(); y = 20; }
        pdf.text(skippedLines[index], x + 4, y);
        y += 4.2;
      }
    }
    return y + 3;
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
