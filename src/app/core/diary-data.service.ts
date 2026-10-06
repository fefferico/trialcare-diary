import { Injectable, signal } from '@angular/core';
import { AuthService } from './auth.service';
import { SupabaseClientService } from './supabase-client.service';
import { DiaryRow, SectionId } from '../models/diary.models';

const STORAGE_KEY = 'trialcare-diary-v1';
type LocalStore = Partial<Record<SectionId, DiaryRow[]>>;
export interface SearchableDiaryItem {
  section: Exclude<SectionId, 'reports'>;
  row: DiaryRow;
}
const SEARCHABLE_SECTIONS: Exclude<SectionId, 'reports'>[] = [
  'children',
  'contacts',
  'medications',
  'medicine_cabinet',
  'health_events',
  'therapies',
  'documents',
  'expenses',
];
export type DiaryExportData = Record<Exclude<SectionId, 'reports'>, DiaryRow[]> & { child_measurements: DiaryRow[] };

const DOCUMENT_DATE_FIELD: Partial<Record<SectionId, string>> = {
  medications: 'start_date',
  medicine_cabinet: 'expiry_date',
  health_events: 'date',
  therapies: 'start_date',
  documents: 'date',
  expenses: 'date',
};

function newestFirst(rows: DiaryRow[], section: SectionId): DiaryRow[] {
  const field = DOCUMENT_DATE_FIELD[section];
  if (!field) return rows;
  return [...rows].sort((a, b) => String(b[field] ?? '').localeCompare(String(a[field] ?? '')));
}

@Injectable({ providedIn: 'root' })
export class DiaryDataService {
  readonly rows = signal<DiaryRow[]>([]);
  readonly syncing = signal(false);
  readonly error = signal('');
  private readonly local: LocalStore;

  constructor(
    private readonly supabase: SupabaseClientService,
    private readonly auth: AuthService,
  ) {
    try {
      this.local = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}') as LocalStore;
    } catch {
      this.local = {};
    }
  }

  async load(section: SectionId): Promise<void> {
    this.syncing.set(true);
    this.error.set('');
    const client = this.supabase.client;
    if (section === 'reports') {
      await this.loadReport();
      return;
    }
    if (client && this.auth.user()) {
      const dateField = DOCUMENT_DATE_FIELD[section];
      let query = client.from(section).select('*');
      if (dateField) query = query.order(dateField, { ascending: false, nullsFirst: false });
      const { data, error } = await query;
      if (!error) {
        this.rows.set(newestFirst((data ?? []) as DiaryRow[], section));
        this.syncing.set(false);
        return;
      }
      this.error.set(error.message);
    }
    this.rows.set(newestFirst([...(this.local[section] ?? [])], section));
    this.syncing.set(false);
  }

  async loadAllForSearch(): Promise<SearchableDiaryItem[]> {
    const client = this.supabase.client;
    if (client && this.auth.user()) {
      const results = await Promise.all(
        SEARCHABLE_SECTIONS.map((section) => {
          const dateField = DOCUMENT_DATE_FIELD[section];
          let query = client.from(section).select('*');
          if (dateField) query = query.order(dateField, { ascending: false, nullsFirst: false });
          return query;
        }),
      );
      const failed = results.find((result) => result.error);
      if (failed?.error) this.error.set(failed.error.message);
      else this.error.set('');
      return results.flatMap((result, index) =>
        (result.data ?? []).map((row) => ({
          section: SEARCHABLE_SECTIONS[index],
          row: row as DiaryRow,
        })),
      );
    }
    return SEARCHABLE_SECTIONS.flatMap((section) =>
      newestFirst(this.local[section] ?? [], section).map((row) => ({ section, row })),
    );
  }

  async loadAllForExport(): Promise<DiaryExportData> {
    const client = this.supabase.client;
    const output = Object.fromEntries(
      SEARCHABLE_SECTIONS.map((section) => [section, []]),
    ) as unknown as DiaryExportData;
    output.child_measurements = [];
    if (!client || !this.auth.user()) {
      for (const section of SEARCHABLE_SECTIONS) output[section] = [...(this.local[section] ?? [])];
      output.child_measurements = this.localMeasurements();
      return output;
    }
    // Supabase caps each response page; walk every page so backups do not silently omit older rows.
    const pageSize = 1000;
    for (const section of SEARCHABLE_SECTIONS) {
      let from = 0;
      while (true) {
        const { data, error } = await client
          .from(section)
          .select('*')
          .order('created_at', { ascending: true })
          .range(from, from + pageSize - 1);
        if (error) throw new Error(`Esportazione ${section}: ${error.message}`);
        const page = (data ?? []) as DiaryRow[];
        output[section].push(...page);
        if (page.length < pageSize) break;
        from += pageSize;
      }
    }
    const { data: measurements, error: measurementError } = await client.from('child_measurements').select('*').order('date', { ascending: true });
    if (measurementError) throw new Error(`Esportazione misurazioni: ${measurementError.message}`);
    output.child_measurements = (measurements ?? []) as DiaryRow[];
    return output;
  }

  localMeasurements(childId?: string): DiaryRow[] {
    try {
      const rows = JSON.parse(localStorage.getItem('trialcare-child-measurements-v1') ?? '[]') as DiaryRow[];
      return rows.filter((row) => !childId || row['child_id'] === childId).sort((a, b) => String(a['date']).localeCompare(String(b['date'])));
    } catch { return []; }
  }

  async saveMeasurement(childId: string, value: Record<string, unknown>): Promise<boolean> {
    const client = this.supabase.client;
    if (client && this.auth.user()) {
      const { error } = await client.from('child_measurements').insert({ ...value, child_id: childId });
      if (error) { this.error.set(error.message); return false; }
    } else {
      const rows = this.localMeasurements();
      rows.push({ id: crypto.randomUUID(), child_id: childId, created_at: new Date().toISOString(), ...value } as DiaryRow);
      localStorage.setItem('trialcare-child-measurements-v1', JSON.stringify(rows));
    }
    return true;
  }

  async loadReport(childId?: string): Promise<void> {
    this.syncing.set(true);
    this.error.set('');
    const tables = ['medications', 'health_events', 'therapies', 'documents', 'expenses'] as const;
    const client = this.supabase.client;
    if (client && this.auth.user()) {
      const results = await Promise.all(
        tables.map((table) => {
          const dateField = DOCUMENT_DATE_FIELD[table];
          let query = client.from(table).select('*');
          if (dateField) query = query.order(dateField, { ascending: false, nullsFirst: false });
          if (childId) query = query.eq('child_id', childId);
          return query;
        }),
      );
      const failed = results.find((result) => result.error);
      if (failed?.error) this.error.set(failed.error.message);
      this.rows.set(
        results
          .flatMap((result, index) =>
            (result.data ?? []).map((row) => ({ ...row, record_type: tables[index] })),
          )
          .sort((a, b) => this.reportDate(b).localeCompare(this.reportDate(a))) as DiaryRow[],
      );
    } else
      this.rows.set(
        tables
          .flatMap((table) =>
            newestFirst(this.local[table] ?? [], table)
              .filter((row) => !childId || row['child_id'] === childId)
              .map((row) => ({ ...row, record_type: table })),
          )
          .sort((a, b) => this.reportDate(b).localeCompare(this.reportDate(a))),
      );
    this.syncing.set(false);
  }

  async save(
    section: SectionId,
    value: Record<string, unknown>,
    childId?: string,
  ): Promise<boolean> {
    const client = this.supabase.client;
    if (client && this.auth.user()) {
      const payload = { ...value, ...(childId ? { child_id: childId } : {}) };
      const { error } = await client.from(section).insert(payload);
      if (error) {
        this.error.set(error.message);
        return false;
      }
    } else {
      const item = {
        id: crypto.randomUUID(),
        created_at: new Date().toISOString(),
        ...value,
        ...(childId ? { child_id: childId } : {}),
      } as DiaryRow;
      this.local[section] = [item, ...(this.local[section] ?? [])];
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.local));
    }
    await this.load(section);
    return true;
  }

  async saveMany(
    section: SectionId,
    values: Record<string, unknown>[],
    childId?: string,
  ): Promise<boolean> {
    if (!values.length) return true;
    const client = this.supabase.client;
    if (client && this.auth.user()) {
      const payload = values.map((value) => ({
        ...value,
        ...(childId ? { child_id: childId } : {}),
      }));
      const { error } = await client.from(section).insert(payload);
      if (error) {
        this.error.set(error.message);
        return false;
      }
    } else {
      const items = values.map(
        (value) =>
          ({
            id: crypto.randomUUID(),
            created_at: new Date().toISOString(),
            ...value,
            ...(childId ? { child_id: childId } : {}),
          }) as DiaryRow,
      );
      this.local[section] = [...items, ...(this.local[section] ?? [])];
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.local));
    }
    await this.load(section);
    return true;
  }

  private reportDate(row: DiaryRow): string {
    const section = String(row['record_type'] ?? '') as SectionId;
    return String(row[DOCUMENT_DATE_FIELD[section] ?? ''] ?? '');
  }

  async remove(section: SectionId, row: DiaryRow): Promise<void> {
    const client = this.supabase.client;
    if (client && this.auth.user()) {
      const { error } = await client.from(section).delete().eq('id', row.id);
      if (error) {
        this.error.set(error.message);
        return;
      }
    } else {
      this.local[section] = (this.local[section] ?? []).filter((item) => item.id !== row.id);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.local));
    }
    await this.load(section);
  }

  async update(section: SectionId, id: string, value: Record<string, unknown>): Promise<boolean> {
    const client = this.supabase.client;
    if (client && this.auth.user()) {
      const { error } = await client.from(section).update(value).eq('id', id);
      if (error) {
        this.error.set(error.message);
        return false;
      }
    } else {
      this.local[section] = (this.local[section] ?? []).map((row) =>
        row.id === id ? { ...row, ...value } : row,
      );
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.local));
    }
    await this.load(section);
    return true;
  }
}
