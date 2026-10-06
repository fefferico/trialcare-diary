import { Injectable, signal } from '@angular/core';
import { SupabaseClientService } from './supabase-client.service';
import { AuthService } from './auth.service';

interface BiometricVault {
  userId: string;
  email: string;
  credentialId: string;
  publicKey: string;
  refreshToken: string;
}

@Injectable({ providedIn: 'root' })
export class BiometricAuthService {
  readonly available = signal(false);
  readonly enrolled = signal(false);
  readonly busy = signal(false);
  readonly error = signal('');
  private readonly storageKey = 'trialcare-biometric-v1';

  constructor(
    private readonly supabase: SupabaseClientService,
    private readonly auth: AuthService,
  ) {
    this.enrolled.set(this.readVault() !== null);
    void this.checkAvailability();
  }

  async checkAvailability(): Promise<void> {
    if (typeof window === 'undefined' || !window.isSecureContext || !window.PublicKeyCredential)
      return;
    try {
      this.available.set(await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable());
    } catch {
      this.available.set(false);
    }
  }

  async enroll(): Promise<void> {
    const user = this.auth.user();
    const client = this.supabase.client;
    if (!user || !client || !this.available()) return;
    this.busy.set(true);
    this.error.set('');
    try {
      const challenge = crypto.getRandomValues(new Uint8Array(32));
      const credential = (await navigator.credentials.create({
        publicKey: {
          challenge,
          rp: { name: 'TrialCare Diary' },
          user: {
            id: new TextEncoder().encode(user.id),
            name: user.email ?? user.id,
            displayName: user.email ?? 'TrialCare',
          },
          pubKeyCredParams: [
            { type: 'public-key', alg: -7 },
            { type: 'public-key', alg: -257 },
          ],
          authenticatorSelection: {
            authenticatorAttachment: 'platform',
            userVerification: 'required',
          },
          timeout: 60000,
        },
      })) as PublicKeyCredential | null;
      if (!credential) throw new Error('Registrazione annullata.');
      const response = credential.response as AuthenticatorAttestationResponse;
      const publicKey = response.getPublicKey?.();
      if (!publicKey) throw new Error('Questo dispositivo non consente di registrare la passkey.');
      const { data, error } = await client.auth.getSession();
      if (error || !data.session?.refresh_token)
        throw new Error('Sessione non disponibile. Accedi di nuovo e riprova.');
      this.writeVault({
        userId: user.id,
        email: user.email ?? '',
        credentialId: credential.id,
        publicKey: this.toBase64(publicKey),
        refreshToken: data.session.refresh_token,
      });
      this.enrolled.set(true);
      sessionStorage.setItem('trialcare-biometric-unlocked', 'true');
    } catch (error) {
      this.error.set(this.message(error));
    } finally {
      this.busy.set(false);
    }
  }

  async signIn(): Promise<void> {
    const vault = this.readVault();
    const client = this.supabase.client;
    if (!vault || !client) return;
    this.busy.set(true);
    this.error.set('');
    try {
      const challenge = crypto.getRandomValues(new Uint8Array(32));
      const credential = (await navigator.credentials.get({
        publicKey: {
          challenge,
          rpId: location.hostname,
          allowCredentials: [{ type: 'public-key', id: this.fromBase64(vault.credentialId) }],
          userVerification: 'required',
          timeout: 60000,
        },
      })) as PublicKeyCredential | null;
      if (!credential) throw new Error('Verifica annullata.');
      await this.verifyAssertion(credential, challenge, vault);
      if (this.auth.user()?.id !== vault.userId) {
        const { error } = await client.auth.refreshSession({ refresh_token: vault.refreshToken });
        if (error)
          throw new Error(
            'Sessione scaduta. Accedi con la password e attiva di nuovo la biometria.',
          );
        const { data } = await client.auth.getSession();
        if (data.session?.user.id !== vault.userId)
          throw new Error('La sessione non corrisponde all’account registrato.');
        this.writeVault({ ...vault, refreshToken: data.session.refresh_token });
      }
    } catch (error) {
      this.error.set(this.message(error));
    } finally {
      this.busy.set(false);
    }
  }

  revoke(): void {
    localStorage.removeItem(this.storageKey);
    sessionStorage.removeItem('trialcare-biometric-unlocked');
    this.enrolled.set(false);
    this.error.set('');
  }

  private async verifyAssertion(
    credential: PublicKeyCredential,
    challenge: Uint8Array,
    vault: BiometricVault,
  ): Promise<void> {
    const response = credential.response as AuthenticatorAssertionResponse;
    const clientData = JSON.parse(new TextDecoder().decode(response.clientDataJSON)) as {
      type: string;
      challenge: string;
      origin: string;
    };
    if (
      clientData.type !== 'webauthn.get' ||
      clientData.origin !== location.origin ||
      clientData.challenge !== this.toBase64(challenge)
    )
      throw new Error('Risposta biometrica non valida.');
    const authData = new Uint8Array(response.authenticatorData);
    const rpHash = new Uint8Array(
      await crypto.subtle.digest('SHA-256', new TextEncoder().encode(location.hostname)),
    );
    if (
      !rpHash.every((byte, index) => byte === authData[index]) ||
      !(authData[32] & 0x01) ||
      !(authData[32] & 0x04)
    )
      throw new Error('Verifica biometrica non valida.');
    const key = await crypto.subtle
      .importKey(
        'spki',
        this.fromBase64(vault.publicKey),
        { name: 'ECDSA', namedCurve: 'P-256' },
        false,
        ['verify'],
      )
      .catch(async () =>
        crypto.subtle.importKey(
          'spki',
          this.fromBase64(vault.publicKey),
          { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
          false,
          ['verify'],
        ),
      );
    const signed = new Uint8Array(response.authenticatorData.byteLength + 32);
    signed.set(authData);
    signed.set(
      new Uint8Array(await crypto.subtle.digest('SHA-256', response.clientDataJSON)),
      authData.length,
    );
    const algorithm =
      key.algorithm.name === 'ECDSA'
        ? { name: 'ECDSA', hash: 'SHA-256' }
        : { name: 'RSASSA-PKCS1-v1_5' };
    const signature =
      key.algorithm.name === 'ECDSA' ? this.derToRaw(response.signature) : response.signature;
    if (!(await crypto.subtle.verify(algorithm, key, signature, signed)))
      throw new Error('Verifica biometrica non valida.');
  }

  private derToRaw(signature: ArrayBuffer): ArrayBuffer {
    const der = new Uint8Array(signature);
    if (der[0] !== 0x30) throw new Error('Firma biometrica non valida.');
    let offset = 2;
    if (der[offset++] !== 0x02) throw new Error('Firma biometrica non valida.');
    const rLength = der[offset++];
    const r = der.slice(offset, offset + rLength);
    offset += rLength;
    if (der[offset++] !== 0x02) throw new Error('Firma biometrica non valida.');
    const sLength = der[offset++];
    const s = der.slice(offset, offset + sLength);
    const raw = new Uint8Array(64);
    raw.set(r.slice(Math.max(0, r.length - 32)), 32 - Math.min(32, r.length));
    raw.set(s.slice(Math.max(0, s.length - 32)), 64 - Math.min(32, s.length));
    return raw.buffer;
  }

  private readVault(): BiometricVault | null {
    try {
      const value = localStorage.getItem(this.storageKey);
      return value ? (JSON.parse(value) as BiometricVault) : null;
    } catch {
      return null;
    }
  }
  private writeVault(value: BiometricVault): void {
    localStorage.setItem(this.storageKey, JSON.stringify(value));
  }
  private toBase64(value: ArrayBuffer | Uint8Array): string {
    const bytes = value instanceof Uint8Array ? value : new Uint8Array(value);
    return btoa(String.fromCharCode(...bytes))
      .replaceAll('+', '-')
      .replaceAll('/', '_')
      .replace(/=+$/, '');
  }
  private fromBase64(value: string): ArrayBuffer {
    const base = value.replaceAll('-', '+').replaceAll('_', '/');
    const decoded = atob(base + '='.repeat((4 - (base.length % 4)) % 4));
    const bytes = new Uint8Array(decoded.length);
    for (let index = 0; index < decoded.length; index++) bytes[index] = decoded.charCodeAt(index);
    return bytes.buffer;
  }
  private message(error: unknown): string {
    return error instanceof Error ? error.message : 'Operazione biometrica non riuscita.';
  }
}
