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
    if (!this.supabase.client) {
      this.error.set('Configura la chiave publishable Supabase per attivare l’accesso.');
      return;
    }
    this.busy.set(true);
    this.error.set('');
    try {
      const { error } = await this.supabase.client.auth.signInWithPassword({ email, password });
      if (error) this.error.set(this.translateAuthError(error.message, 'accesso'));
    } catch {
      this.error.set('Non è stato possibile accedere. Controlla la connessione e riprova.');
    } finally {
      this.busy.set(false);
    }
  }

  async signUp(email: string, password: string): Promise<void> {
    if (!this.supabase.client) {
      this.error.set('Configura la chiave publishable Supabase per creare un account.');
      return;
    }
    this.busy.set(true);
    this.error.set('');
    try {
      const { error } = await this.supabase.client.auth.signUp({ email, password });
      if (error) this.error.set(this.translateAuthError(error.message, 'registrazione'));
      else this.error.set('Controlla la tua email per confermare la registrazione.');
    } catch {
      this.error.set('Non è stato possibile creare l’account. Controlla la connessione e riprova.');
    } finally {
      this.busy.set(false);
    }
  }

  async signOut(): Promise<void> {
    await this.supabase.client?.auth.signOut();
    this.setSession(null);
  }
  private setSession(session: Session | null): void {
    this.session.set(session);
    this.user.set(session?.user ?? null);
  }

  private translateAuthError(message: string, action: 'accesso' | 'registrazione'): string {
    const normalized = message.toLowerCase();
    if (normalized.includes('invalid login credentials')) return 'Email o password non corretti.';
    if (normalized.includes('email not confirmed'))
      return 'Conferma il tuo indirizzo email prima di accedere.';
    if (normalized.includes('user already registered'))
      return 'Esiste già un account con questo indirizzo email. Accedi oppure usa un altro indirizzo.';
    if (
      normalized.includes('password should be at least') ||
      normalized.includes('password is too weak')
    )
      return 'La password non è abbastanza sicura. Scegline una più lunga e complessa.';
    if (normalized.includes('invalid email')) return 'Inserisci un indirizzo email valido.';
    if (normalized.includes('too many requests') || normalized.includes('rate limit'))
      return 'Hai effettuato troppi tentativi. Attendi qualche minuto e riprova.';
    return action === 'accesso'
      ? 'Accesso non riuscito. Verifica i dati inseriti e riprova.'
      : 'Registrazione non riuscita. Verifica i dati inseriti e riprova.';
  }
}
