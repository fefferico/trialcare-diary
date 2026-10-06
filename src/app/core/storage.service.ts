import { Injectable } from '@angular/core';
import { SupabaseClientService } from './supabase-client.service';
import { AuthService } from './auth.service';

@Injectable({ providedIn: 'root' })
export class StorageService {
  private readonly avatarBucket = 'profile-avatars';
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
  async signedUrl(path: string): Promise<string | null> {
    const client = this.supabase.client;
    if (!client || !this.auth.user()) return null;
    const { data, error } = await client.storage
      .from('clinical-documents')
      .createSignedUrl(path, 60);
    return error ? null : data.signedUrl;
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
