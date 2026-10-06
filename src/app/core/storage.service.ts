import { Injectable } from '@angular/core';
import { SupabaseClientService } from './supabase-client.service';
import { AuthService } from './auth.service';

@Injectable({ providedIn:'root' })
export class StorageService {
  constructor(private readonly supabase: SupabaseClientService, private readonly auth: AuthService) {}
  async upload(file: File, childId: string): Promise<string | null> {
    const client=this.supabase.client; const user=this.auth.user();
    if(!client || !user) return null;
    const safeName=file.name.normalize('NFKD').replace(/[^a-zA-Z0-9._-]/g,'-').slice(-100);
    const path=`${user.id}/${childId}/${crypto.randomUUID()}-${safeName}`;
    const {error}=await client.storage.from('clinical-documents').upload(path,file,{upsert:false,contentType:file.type || undefined});
    return error ? null : path;
  }
  async signedUrl(path: string): Promise<string | null> {
    const client=this.supabase.client;
    if(!client || !this.auth.user()) return null;
    const {data,error}=await client.storage.from('clinical-documents').createSignedUrl(path,60);
    return error ? null : data.signedUrl;
  }
  async uploadVoice(file: File, childId: string): Promise<string | null> {
    const client=this.supabase.client; const user=this.auth.user();
    if(!client || !user) return null;
    const path=`${user.id}/${childId}/${crypto.randomUUID()}.webm`;
    const {error}=await client.storage.from('clinical-documents').upload(path,file,{upsert:false,contentType:file.type || 'audio/webm'});
    return error ? null : path;
  }
}
