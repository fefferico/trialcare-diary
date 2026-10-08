import { Injectable } from '@angular/core';
import { SupabaseClientService } from './supabase-client.service';
import { AuthService } from './auth.service';

@Injectable({ providedIn: 'root' })
export class StorageService {
  private readonly avatarBucket = 'profile-avatars';
  private readonly localFileDatabase = 'trialcare-local-files-v1';
  constructor(
    private readonly supabase: SupabaseClientService,
    private readonly auth: AuthService,
  ) {}
  async upload(file: File, childId: string): Promise<string | null> {
    const client = this.supabase.client;
    const user = this.auth.user();
    if (!client || !user) return null;
    const safeName = file.name
      .normalize('NFKD')
      .replace(/[^a-zA-Z0-9._-]/g, '-')
      .slice(-100);
    const path = `${user.id}/${childId}/${crypto.randomUUID()}-${safeName}`;
    const { error } = await client.storage
      .from('clinical-documents')
      .upload(path, file, { upsert: false, contentType: file.type || undefined });
    return error ? null : path;
  }
  async saveLocalFile(file: File): Promise<string> {
    const id = crypto.randomUUID();
    const database = await this.openLocalFileDatabase();
    try {
      await new Promise<void>((resolve, reject) => {
        const transaction = database.transaction('files', 'readwrite');
        transaction.objectStore('files').put({ id, name: file.name, type: file.type, blob: file });
        transaction.oncomplete = () => resolve();
        transaction.onerror = () => reject(transaction.error);
        transaction.onabort = () => reject(transaction.error);
      });
    } finally {
      database.close();
    }
    return id;
  }
  async openLocalFile(id: string): Promise<boolean> {
    const tab = window.open('', '_blank');
    if (!tab) return false;
    tab.opener = null;
    let entry: { blob: Blob } | undefined;
    let database: IDBDatabase | undefined;
    try {
      database = await this.openLocalFileDatabase();
      entry = await new Promise<{ blob: Blob } | undefined>((resolve, reject) => {
        const request = database!.transaction('files', 'readonly').objectStore('files').get(id);
        request.onsuccess = () => resolve(request.result as { blob: Blob } | undefined);
        request.onerror = () => reject(request.error);
      });
    } catch {
      tab.close();
      return false;
    } finally {
      database?.close();
    }
    if (!entry?.blob) {
      tab.close();
      return false;
    }
    const url = URL.createObjectURL(entry.blob);
    tab.location.href = url;
    window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
    return true;
  }
  async getLocalFile(id: string): Promise<File | null> {
    const database = await this.openLocalFileDatabase();
    try {
      const entry = await new Promise<{ name: string; type: string; blob: Blob } | undefined>((resolve, reject) => {
        const request = database.transaction('files', 'readonly').objectStore('files').get(id);
        request.onsuccess = () => resolve(request.result as { name: string; type: string; blob: Blob } | undefined);
        request.onerror = () => reject(request.error);
      });
      return entry?.blob ? new File([entry.blob], entry.name, { type: entry.type || entry.blob.type }) : null;
    } finally {
      database.close();
    }
  }
  async removeLocalFile(id: string): Promise<void> {
    const database = await this.openLocalFileDatabase();
    try {
      await new Promise<void>((resolve, reject) => {
        const transaction = database.transaction('files', 'readwrite');
        transaction.objectStore('files').delete(id);
        transaction.oncomplete = () => resolve();
        transaction.onerror = () => reject(transaction.error);
        transaction.onabort = () => reject(transaction.error);
      });
    } finally {
      database.close();
    }
  }
  private openLocalFileDatabase(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.localFileDatabase, 1);
      request.onupgradeneeded = () => {
        if (!request.result.objectStoreNames.contains('files'))
          request.result.createObjectStore('files', { keyPath: 'id' });
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }
  async signedUrl(path: string): Promise<string | null> {
    const client = this.supabase.client;
    if (!client || !this.auth.user()) return null;
    const { data, error } = await client.storage
      .from('clinical-documents')
      .createSignedUrl(path, 60);
    return error ? null : data.signedUrl;
  }
  async downloadDocument(path: string): Promise<Blob | null> {
    const client = this.supabase.client;
    if (!client || !this.auth.user()) return null;
    const { data, error } = await client.storage.from('clinical-documents').download(path);
    return error ? null : data;
  }
  async removeDocument(path: string): Promise<boolean> {
    const client = this.supabase.client;
    if (!client || !this.auth.user()) return false;
    const { error } = await client.storage.from('clinical-documents').remove([path]);
    return !error;
  }
  async uploadVoice(file: File, childId: string): Promise<string | null> {
    const client = this.supabase.client;
    const user = this.auth.user();
    if (!client || !user) return null;
    const path = `${user.id}/${childId}/${crypto.randomUUID()}.webm`;
    const { error } = await client.storage
      .from('clinical-documents')
      .upload(path, file, { upsert: false, contentType: file.type || 'audio/webm' });
    return error ? null : path;
  }

  async saveAvatar(file: File): Promise<string | null> {
    const client = this.supabase.client;
    const user = this.auth.user();
    if (!client || !user) return null;
    const path = `${user.id}/avatar`;
    const { error } = await client.storage.from(this.avatarBucket).upload(path, file, {
      upsert: true,
      contentType: file.type,
      cacheControl: '3600',
    });
    if (error) return null;
    const { data } = await client.storage.from(this.avatarBucket).download(path);
    return data ? URL.createObjectURL(data) : null;
  }

  async removeAvatar(): Promise<void> {
    const client = this.supabase.client;
    const user = this.auth.user();
    if (client && user) await client.storage.from(this.avatarBucket).remove([`${user.id}/avatar`]);
  }

  async loadAvatar(): Promise<string | null> {
    const client = this.supabase.client;
    const user = this.auth.user();
    if (!client || !user) return null;
    const bucket = client.storage.from(this.avatarBucket);
    const { data: files, error } = await bucket.list(user.id, {
      limit: 1,
      search: 'avatar',
    });
    if (error || !files?.some((file) => file.name === 'avatar')) return null;
    const { data } = await bucket.download(`${user.id}/avatar`);
    return data ? URL.createObjectURL(data) : null;
  }
}
