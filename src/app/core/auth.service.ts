import { Injectable, signal } from '@angular/core';
import { Session, User } from '@supabase/supabase-js';
import { SupabaseClientService } from './supabase-client.service';

@Injectable({ providedIn: 'root' })
export class AuthService {
  readonly session = signal<Session | null>(null);
  readonly user = signal<User | null>(null);
  readonly busy = signal(false);
  readonly error = signal('');
  readonly ready: Promise<void>;

  constructor(private readonly supabase: SupabaseClientService) {
    const client = this.supabase.client;
    if (client) {
      this.ready = client.auth.getSession().then(({ data }) => this.setSession(data.session));
      client.auth.onAuthStateChange((_event, session) => this.setSession(session));
    } else this.ready = Promise.resolve();
  }

  async signIn(email: string, password: string): Promise<void> {
    if (!this.supabase.client) { this.error.set('Configura la chiave publishable Supabase per attivare l’accesso.'); return; }
    this.busy.set(true); this.error.set('');
    const { error } = await this.supabase.client.auth.signInWithPassword({ email, password });
    if (error) this.error.set(error.message);
    this.busy.set(false);
  }

  async signUp(email: string, password: string): Promise<void> {
    if (!this.supabase.client) { this.error.set('Configura la chiave publishable Supabase per creare un account.'); return; }
    this.busy.set(true); this.error.set('');
    const { error } = await this.supabase.client.auth.signUp({ email, password });
    if (error) this.error.set(error.message); else this.error.set('Controlla la tua email per confermare la registrazione.');
    this.busy.set(false);
  }

  async signOut(): Promise<void> { await this.supabase.client?.auth.signOut(); this.setSession(null); }
  private setSession(session: Session | null): void { this.session.set(session); this.user.set(session?.user ?? null); }
}
