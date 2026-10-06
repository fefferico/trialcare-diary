import { Injectable, signal } from '@angular/core';
import { AuthService } from './auth.service';
import { SupabaseClientService } from './supabase-client.service';
import { DiaryRow, SectionId } from '../models/diary.models';

const STORAGE_KEY = 'trialcare-diary-v1';
type LocalStore = Partial<Record<SectionId, DiaryRow[]>>;
export interface SearchableDiaryItem { section: Exclude<SectionId, 'reports'>; row: DiaryRow; }
const SEARCHABLE_SECTIONS: Exclude<SectionId, 'reports'>[] = ['children','contacts','medications','health_events','therapies','documents','expenses'];
export type DiaryExportData = Record<Exclude<SectionId, 'reports'>, DiaryRow[]>;

@Injectable({ providedIn: 'root' })
export class DiaryDataService {
  readonly rows = signal<DiaryRow[]>([]);
  readonly syncing = signal(false);
  readonly error = signal('');
  private readonly local: LocalStore;

  constructor(private readonly supabase: SupabaseClientService, private readonly auth: AuthService) {
    try { this.local = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}') as LocalStore; } catch { this.local = {}; }
  }

  async load(section: SectionId): Promise<void> {
    this.syncing.set(true); this.error.set('');
    const client = this.supabase.client;
    if(section === 'reports') { await this.loadReport(); return; }
    if (client && this.auth.user()) {
      const { data, error } = await client.from(section).select('*').order('created_at', { ascending: false });
      if (!error) { this.rows.set((data ?? []) as DiaryRow[]); this.syncing.set(false); return; }
      this.error.set(error.message);
    }
    this.rows.set([...(this.local[section] ?? [])]);
    this.syncing.set(false);
  }

  async loadAllForSearch(): Promise<SearchableDiaryItem[]> {
    const client = this.supabase.client;
    if (client && this.auth.user()) {
      const results = await Promise.all(SEARCHABLE_SECTIONS.map(section => client.from(section).select('*').order('created_at', { ascending: false })));
      const failed = results.find(result => result.error);
      if (failed?.error) this.error.set(failed.error.message);
      else this.error.set('');
      return results.flatMap((result, index) => (result.data ?? []).map(row => ({ section: SEARCHABLE_SECTIONS[index], row: row as DiaryRow })));
    }
    return SEARCHABLE_SECTIONS.flatMap(section => (this.local[section] ?? []).map(row => ({ section, row })));
  }

  async loadAllForExport(): Promise<DiaryExportData> {
    const client = this.supabase.client;
    const output = Object.fromEntries(SEARCHABLE_SECTIONS.map(section => [section, []])) as unknown as DiaryExportData;
    if (!client || !this.auth.user()) {
      for (const section of SEARCHABLE_SECTIONS) output[section] = [...(this.local[section] ?? [])];
      return output;
    }
    // Supabase caps each response page; walk every page so backups do not silently omit older rows.
    const pageSize = 1000;
    for (const section of SEARCHABLE_SECTIONS) {
      let from = 0;
      while (true) {
        const { data, error } = await client.from(section).select('*').order('created_at', { ascending: true }).range(from, from + pageSize - 1);
        if (error) throw new Error(`Esportazione ${section}: ${error.message}`);
        const page = (data ?? []) as DiaryRow[];
        output[section].push(...page);
        if (page.length < pageSize) break;
        from += pageSize;
      }
    }
    return output;
  }

  async loadReport(childId?: string): Promise<void> {
    this.syncing.set(true); this.error.set('');
    const tables=['medications','health_events','therapies','documents','expenses'] as const;
    const client=this.supabase.client;
    if(client && this.auth.user()) {
      const results=await Promise.all(tables.map(table=>{let query=client.from(table).select('*').order('created_at',{ascending:false});if(childId)query=query.eq('child_id',childId);return query;}));
      const failed=results.find(result=>result.error); if(failed?.error)this.error.set(failed.error.message);
      this.rows.set(results.flatMap((result,index)=>(result.data??[]).map(row=>({...row,record_type:tables[index]}))) as DiaryRow[]);
    } else this.rows.set(tables.flatMap(table=>(this.local[table]??[]).filter(row=>!childId||row['child_id']===childId).map(row=>({...row,record_type:table}))));
    this.syncing.set(false);
  }

  async save(section: SectionId, value: Record<string, unknown>, childId?: string): Promise<boolean> {
    const client = this.supabase.client;
    if (client && this.auth.user()) {
      const payload = { ...value, ...(childId ? { child_id: childId } : {}) };
      const { error } = await client.from(section).insert(payload);
      if (error) { this.error.set(error.message); return false; }
    } else {
      const item = { id: crypto.randomUUID(), created_at: new Date().toISOString(), ...value, ...(childId ? { child_id: childId } : {}) } as DiaryRow;
      this.local[section] = [item, ...(this.local[section] ?? [])];
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.local));
    }
    await this.load(section);
    return true;
  }

  async remove(section: SectionId, row: DiaryRow): Promise<void> {
    const client = this.supabase.client;
    if (client && this.auth.user()) {
      const { error } = await client.from(section).delete().eq('id', row.id);
      if (error) { this.error.set(error.message); return; }
    } else {
      this.local[section] = (this.local[section] ?? []).filter(item => item.id !== row.id);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.local));
    }
    await this.load(section);
  }

  async update(section: SectionId, id: string, value: Record<string, unknown>): Promise<boolean> {
    const client=this.supabase.client;
    if(client && this.auth.user()){
      const {error}=await client.from(section).update(value).eq('id',id);
      if(error){this.error.set(error.message);return false;}
    } else {
      this.local[section]=(this.local[section]??[]).map(row=>row.id===id?{...row,...value}:row);
      localStorage.setItem(STORAGE_KEY,JSON.stringify(this.local));
    }
    await this.load(section); return true;
  }
}
