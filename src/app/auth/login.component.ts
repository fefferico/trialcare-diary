import { Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../core/auth.service';
import { BiometricAuthService } from '../core/biometric-auth.service';

@Component({
  selector: 'tc-login',
  standalone: true,
  imports: [FormsModule],
  template: ` <div class="modal-backdrop">
    <section
      role="dialog"
      aria-modal="true"
      aria-labelledby="login-title"
      class="modal-panel max-w-md"
    >
      <header class="px-6 pt-6">
        <p class="eyebrow">ACCESSO PERSONALE</p>
        <h2 id="login-title" class="mt-1 text-2xl font-semibold">Bentornato</h2>
        <p class="mt-2 text-sm text-slate-500">Accedi per continuare nel tuo diario.</p>
      </header>
      <form class="space-y-4 p-6" (ngSubmit)="submit()">
        <label class="form-field"
          ><span>Email</span
          ><input
            class="field-control"
            name="email"
            type="email"
            autocomplete="email"
            [(ngModel)]="email"
            required /></label
        ><label class="form-field"
          ><span>Password</span
          ><input
            class="field-control"
            name="password"
            type="password"
            autocomplete="current-password"
            [(ngModel)]="password"
            minlength="8"
            required
        /></label>
        @if (auth.error()) {
          <p role="alert" class="notice-error">{{ auth.error() }}</p>
        }
        @if (biometrics.error()) {
          <p role="alert" class="notice-error">{{ biometrics.error() }}</p>
        }
        <button class="button-primary w-full justify-center" [disabled]="auth.busy()">
          {{ auth.busy() ? 'Attendi…' : createAccount ? 'Crea account' : 'Accedi' }}
        </button>
        @if (!createAccount && biometrics.enrolled()) {
          <button
            type="button"
            class="w-full rounded-xl border border-teal-200 px-4 py-3 text-sm font-semibold text-teal-800 dark:border-teal-900 dark:text-teal-200"
            [disabled]="biometrics.busy()"
            (click)="biometrics.signIn()"
          >
            {{ biometrics.busy() ? 'Verifica in corso…' : 'Accedi con impronta o passkey' }}
          </button>
        }
        @if (!createAccount && biometrics.available() && !biometrics.enrolled()) {
          <p class="text-center text-xs leading-5 text-slate-500">
            Per attivare l’accesso biometrico, accedi prima con email e password, poi scegli
            “Attiva accesso biometrico” dal menu del tuo account.
          </p>
        }
        <button
          type="button"
          class="w-full py-2 text-sm font-medium text-teal-700 hover:underline dark:text-teal-300"
          (click)="createAccount = !createAccount"
        >
          {{ createAccount ? 'Ho già un account' : 'Crea un nuovo account' }}
        </button>
      </form>
    </section>
  </div>`,
})
export class LoginComponent {
  readonly auth = inject(AuthService);
  readonly biometrics = inject(BiometricAuthService);
  email = '';
  password = '';
  createAccount = false;
  async submit(): Promise<void> {
    if (this.createAccount) await this.auth.signUp(this.email, this.password);
    else await this.auth.signIn(this.email, this.password);
  }
}
