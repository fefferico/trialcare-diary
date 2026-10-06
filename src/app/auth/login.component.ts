import { Component, inject, output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../core/auth.service';

@Component({selector:'tc-login',standalone:true,imports:[FormsModule],template:`
  <div class="modal-backdrop" (click)="dismiss.emit()"><section role="dialog" aria-modal="true" aria-labelledby="login-title" class="modal-panel max-w-md" (click)="$event.stopPropagation()">
    <header class="flex items-start justify-between px-6 pt-6"><div><p class="eyebrow">ACCESSO PERSONALE</p><h2 id="login-title" class="mt-1 text-2xl font-semibold">Bentornato</h2><p class="mt-2 text-sm text-slate-500">Il diario resta sincronizzato sui tuoi dispositivi.</p></div><button type="button" class="icon-button" (click)="dismiss.emit()" aria-label="Chiudi">×</button></header>
    <form class="space-y-4 p-6" (ngSubmit)="submit()"><label class="form-field"><span>Email</span><input class="field-control" name="email" type="email" autocomplete="email" [(ngModel)]="email" required></label><label class="form-field"><span>Password</span><input class="field-control" name="password" type="password" autocomplete="current-password" [(ngModel)]="password" minlength="8" required></label>
      @if(auth.error()){<p role="alert" class="notice-error">{{auth.error()}}</p>}<button class="button-primary w-full justify-center" [disabled]="auth.busy()">{{auth.busy()?'Attendi…':(createAccount?'Crea account':'Accedi')}}</button><button type="button" class="w-full py-2 text-sm font-medium text-teal-700 hover:underline dark:text-teal-300" (click)="createAccount=!createAccount">{{createAccount?'Ho già un account':'Crea un nuovo account'}}</button>
    </form>
  </section></div>`})
export class LoginComponent {
  readonly auth=inject(AuthService); readonly dismiss=output<void>(); email=''; password=''; createAccount=false;
  async submit():Promise<void>{if(this.createAccount)await this.auth.signUp(this.email,this.password);else await this.auth.signIn(this.email,this.password); if(this.auth.user())this.dismiss.emit();}
}
