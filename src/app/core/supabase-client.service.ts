import { Injectable } from '@angular/core';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { environment } from '../../environments/environment';

@Injectable({ providedIn: 'root' })
export class SupabaseClientService {
  readonly client: SupabaseClient | null;
  readonly configured: boolean;

  constructor() {
    this.configured = Boolean(
      environment.supabaseUrl &&
      environment.supabasePublishableKey &&
      !environment.supabasePublishableKey.startsWith('YOUR_'),
    );
    this.client = this.configured
      ? createClient(environment.supabaseUrl, environment.supabasePublishableKey, {
          auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
        })
      : null;
  }
}
