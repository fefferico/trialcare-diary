import { Component, OnDestroy, effect, inject, signal, untracked } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { AuthService } from './core/auth.service';
import { BiometricAuthService } from './core/biometric-auth.service';
import { SupabaseClientService } from './core/supabase-client.service';
import { UiStateService } from './core/ui-state.service';
import { StorageService } from './core/storage.service';
import { LoginComponent } from './auth/login.component';
import { SECTIONS } from './models/diary.models';

@Component({
  selector: 'tc-root',
  standalone: true,
  imports: [CommonModule, RouterOutlet, RouterLink, RouterLinkActive, LoginComponent],
  template: ` @if (!auth.user()) {
      <tc-login />
    } @else if (biometricLocked()) {
      <div class="modal-backdrop">
        <section
          role="dialog"
          aria-modal="true"
          aria-labelledby="biometric-title"
          class="modal-panel max-w-md p-6 text-center"
        >
          <p class="eyebrow">ACCESSO PERSONALE</p>
          <h2 id="biometric-title" class="mt-1 text-2xl font-semibold">Sblocca TrialCare</h2>
          <p class="mt-2 text-sm text-slate-500">
            Conferma la tua identità con il dispositivo per aprire il diario.
          </p>
          @if (biometrics.error()) {
            <p role="alert" class="notice-error mt-4">{{ biometrics.error() }}</p>
          }
          <button
            type="button"
            class="button-primary mt-5 w-full justify-center"
            [disabled]="biometrics.busy()"
            (click)="unlockWithBiometrics()"
          >
            {{ biometrics.busy() ? 'Verifica in corso…' : 'Sblocca con biometria' }}</button
          ><button
            type="button"
            class="mt-3 w-full py-2 text-sm text-slate-500 hover:underline"
            (click)="signOut()"
          >
            Usa email e password
          </button>
        </section>
      </div>
    } @else {
      <div
        class="app-frame min-h-dvh bg-[#f6f8f5] text-slate-800 dark:bg-[#0e1719] dark:text-slate-100"
        [class.sidebar-collapsed]="sidebarCollapsed()"
      >
        <aside class="sidebar hidden lg:flex">
          <a routerLink="/dashboard" class="brand-lockup" aria-label="TrialCare Diary"
            ><span class="brand-mark"
              ><svg viewBox="0 0 40 40" aria-hidden="true">
                <path
                  d="M20 32s-12-7.2-12-15.1a7.1 7.1 0 0 1 12-5.1 7.1 7.1 0 0 1 12 5.1C32 24.8 20 32 20 32Z"
                />
                <path d="M20 14.5v8M16 18.5h8" /></svg></span
            ><span class="sidebar-label"><strong>trialcare</strong><small>DIARY</small></span></a
          >
          <p class="eyebrow sidebar-label mt-10 px-3">IL TUO SPAZIO</p>
          <nav class="mt-3 space-y-1">
            <a
              routerLink="/dashboard"
              routerLinkActive="nav-active"
              class="nav-link"
              aria-label="Panoramica"
              title="Panoramica"
              ><span class="nav-glyph"
                ><svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="1.8"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  aria-hidden="true"
                >
                  <path
                    d="m3.5 10 8.5-7 8.5 7v10a.5.5 0 0 1-.5.5h-5.5v-7h-5v7H4a.5.5 0 0 1-.5-.5z"
                  /></svg></span
              ><span class="sidebar-label">Panoramica</span></a
            ><a
              routerLink="/calendar"
              routerLinkActive="nav-active"
              class="nav-link"
              aria-label="Calendario"
              title="Calendario"
              ><span class="nav-glyph"
                ><svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="1.8"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  aria-hidden="true"
                >
                  <rect x="3.5" y="5" width="17" height="16" rx="2.5" />
                  <path
                    d="M7.5 3v4M16.5 3v4M4 9.5h16M8 13h.01M12 13h.01M16 13h.01M8 17h.01M12 17h.01"
                  /></svg></span
              ><span class="sidebar-label">Calendario</span></a
            >
            @for (section of navigation; track section.id) {
              <a
                [routerLink]="'/' + section.id"
                routerLinkActive="nav-active"
                class="nav-link"
                [attr.aria-label]="section.label"
                [attr.title]="section.label"
                ><span class="nav-glyph"
                  ><svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="1.8"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    aria-hidden="true"
                  >
                    <path [attr.d]="iconPath(section.id)" /></svg></span
                ><span class="sidebar-label">{{ section.label }}</span></a
              >
            }
          </nav>
          <div class="sidebar-footer">
            @if (auth.user(); as user) {
              <div class="account-menu-anchor">
                <button
                  type="button"
                  class="avatar"
                  [attr.aria-label]="'Account di ' + user.email"
                  [attr.aria-expanded]="accountMenuOpen()"
                  title="Account"
                  (click)="accountMenuOpen.update((open) => !open)"
                >
                  @if (avatarUrl()) {
                    <img class="avatar-image" [src]="avatarUrl()!" alt="" />
                  } @else {
                    {{ user.email?.slice(0, 1)?.toUpperCase() || 'U' }}
                  }
                </button>
                @if (accountMenuOpen()) {
                  <div class="account-menu" role="menu">
                    <input
                      #avatarInput
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      class="sr-only"
                      (change)="changeAvatar($event)"
                    />
                    <p class="truncate text-sm font-semibold">{{ user.email }}</p>
                    <p class="mt-1 text-xs text-slate-500">
                      {{ auth.user() ? 'Sincronizzato' : 'Modalità privata' }}
                    </p>
                    <button
                      type="button"
                      role="menuitem"
                      [disabled]="avatarBusy()"
                      (click)="avatarInput.click()"
                    >
                      {{ avatarBusy() ? 'Aggiornamento…' : 'Cambia immagine profilo' }}
                    </button>
                    @if (avatarUrl()) {
                      <button type="button" role="menuitem" (click)="removeAvatar()">
                        Rimuovi immagine
                      </button>
                    }
                    @if (avatarError()) {
                      <p class="mt-2 text-xs text-rose-700" role="alert">{{ avatarError() }}</p>
                    }
                    @if (biometrics.available() && !biometrics.enrolled()) {
                      <button
                        type="button"
                        role="menuitem"
                        (click)="biometrics.enroll(); accountMenuOpen.set(false)"
                      >
                        Attiva accesso biometrico
                      </button>
                    }
                    @if (biometrics.enrolled()) {
                      <button
                        type="button"
                        role="menuitem"
                        (click)="biometrics.revoke(); accountMenuOpen.set(false)"
                      >
                        Disattiva accesso biometrico
                      </button>
                    }
                    <button
                      type="button"
                      role="menuitem"
                      (click)="signOut(); accountMenuOpen.set(false)"
                    >
                      Esci
                    </button>
                  </div>
                }
              </div>
            } @else {
              <div class="avatar" aria-hidden="true">G</div>
              <div class="sidebar-label min-w-0 flex-1">
                <strong class="block truncate text-sm">Diario personale</strong>
                <span class="text-xs text-slate-400">Modalità privata</span>
              </div>
            }
            <button
              type="button"
              class="sidebar-toggle icon-button"
              [attr.aria-label]="sidebarCollapsed() ? 'Espandi menu' : 'Riduci menu'"
              [attr.title]="sidebarCollapsed() ? 'Espandi menu' : 'Riduci menu'"
              (click)="toggleSidebar()"
            >
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="1.8"
                stroke-linecap="round"
                stroke-linejoin="round"
                aria-hidden="true"
              >
                <path d="m14 6-6 6 6 6" />
                <path d="M20 4v16" />
              </svg>
            </button>
          </div>
        </aside>
        <div class="main-column">
          <header class="topbar">
            <a routerLink="/dashboard" class="brand-lockup lg:hidden"
              ><span class="brand-mark"
                ><svg viewBox="0 0 40 40" aria-hidden="true">
                  <path
                    d="M20 32s-12-7.2-12-15.1a7.1 7.1 0 0 1 12-5.1 7.1 7.1 0 0 1 12 5.1C32 24.8 20 32 20 32Z"
                  />
                  <path d="M20 14.5v8M16 18.5h8" /></svg></span
              ><span><strong>trialcare</strong><small>DIARY</small></span></a
            >
            <div class="hidden text-sm text-slate-500 lg:block">
              Un posto gentile per tenere il filo.
            </div>
            <div class="ml-auto flex items-center gap-2">
              <span
                class="connection-pill"
                [class.connection-live]="supabase.configured && auth.user()"
                ><i></i
                >{{ auth.user() ? 'Dati sincronizzati' : 'Solo su questo dispositivo' }}</span
              >
              @if (auth.user() && biometrics.available() && !biometrics.enrolled()) {
                <button
                  type="button"
                  class="icon-button"
                  aria-label="Attiva accesso biometrico"
                  (click)="biometrics.enroll()"
                >
                  ⌘
                </button>
              }
              @if (auth.user() && biometrics.enrolled()) {
                <button
                  type="button"
                  class="icon-button"
                  aria-label="Disattiva accesso biometrico"
                  (click)="biometrics.revoke()"
                >
                  ⌘
                </button>
              }
              <button
                type="button"
                class="icon-button"
                [attr.aria-label]="ui.darkMode() ? 'Attiva tema chiaro' : 'Attiva tema scuro'"
                (click)="ui.toggleTheme()"
              >
                {{ ui.darkMode() ? '☼' : '◐' }}</button
              ><button
                type="button"
                class="icon-button lg:hidden"
                aria-label="Esci"
                (click)="signOut()"
              >
                ↗
              </button>
            </div>
          </header>
          @if (biometrics.error()) {
            <p role="alert" class="notice-error mx-4 mt-3">{{ biometrics.error() }}</p>
          }
          @if (biometrics.busy()) {
            <p role="status" class="px-4 pt-2 text-sm text-slate-500">
              Verifica biometrica in corso…
            </p>
          }
          <main class="page-content">
            <div class="mx-auto max-w-6xl"><router-outlet /></div>
          </main>
          @if (!supabase.configured && setupNoteVisible()) {
            <div class="setup-note">
              <span class="text-teal-700 dark:text-teal-300">●</span
              ><span
                >Modalità dimostrativa: le voci restano nel browser e non sono cifrate. Configura
                Supabase prima di inserire dati clinici reali.</span
              ><button type="button" aria-label="Chiudi" (click)="setupNoteVisible.set(false)">
                ×
              </button>
            </div>
          }
        </div>
        <nav class="bottom-nav lg:hidden">
          <a
            routerLink="/dashboard"
            routerLinkActive="bottom-active"
            [routerLinkActiveOptions]="{ exact: true }"
            ><span
              ><svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="1.8"
                stroke-linecap="round"
                stroke-linejoin="round"
                aria-hidden="true"
              >
                <path
                  d="m3.5 10 8.5-7 8.5 7v10a.5.5 0 0 1-.5.5h-5.5v-7h-5v7H4a.5.5 0 0 1-.5-.5z"
                /></svg></span
            >Home</a
          ><a routerLink="/calendar" routerLinkActive="bottom-active"
            ><span
              ><svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="1.8"
                stroke-linecap="round"
                stroke-linejoin="round"
                aria-hidden="true"
              >
                <rect x="3.5" y="5" width="17" height="16" rx="2.5" />
                <path
                  d="M7.5 3v4M16.5 3v4M4 9.5h16M8 13h.01M12 13h.01M16 13h.01M8 17h.01M12 17h.01"
                /></svg></span
            >Calendario</a
          >
          @for (section of bottomSections; track section.id) {
            <a
              [routerLink]="'/' + section.id"
              routerLinkActive="bottom-active"
              (click)="moreOpen.set(false)"
              ><span
                ><svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="1.8"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  aria-hidden="true"
                >
                  <path [attr.d]="iconPath(section.id)" /></svg></span
              >{{ section.shortLabel }}</a
            >
          }
          <button
            type="button"
            class="more-nav-button"
            [attr.aria-expanded]="moreOpen()"
            aria-label="Altre sezioni"
            (click)="toggleMore()"
          >
            <span
              ><svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="1.8"
                stroke-linecap="round"
                stroke-linejoin="round"
                aria-hidden="true"
              >
                <circle cx="5" cy="12" r="1" />
                <circle cx="12" cy="12" r="1" />
                <circle cx="19" cy="12" r="1" /></svg></span
            >Altro
          </button>
          @if (moreOpen()) {
            <div class="more-nav-menu">
              @for (section of moreSections; track section.id) {
                <a
                  [routerLink]="'/' + section.id"
                  routerLinkActive="bottom-active"
                  (click)="moreOpen.set(false)"
                  ><svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="1.8"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    aria-hidden="true"
                  >
                    <path [attr.d]="iconPath(section.id)" /></svg
                  >{{ section.label }}</a
                >
              }
              <button type="button" (click)="signOut(); moreOpen.set(false)">Esci</button>
            </div>
          }
        </nav>
      </div>
    }
    @if (!authReady()) {
      <div
        class="fixed inset-0 z-[100] grid place-items-center bg-[#f6f8f5] dark:bg-[#0e1719]"
        role="status"
      >
        Verifica accesso…
      </div>
    }`,
})
export class AppComponent implements OnDestroy {
  readonly auth = inject(AuthService);
  readonly biometrics = inject(BiometricAuthService);
  readonly supabase = inject(SupabaseClientService);
  readonly ui = inject(UiStateService);
  readonly router = inject(Router);
  readonly setupNoteVisible = signal(true);
  readonly sidebarCollapsed = signal(false);
  readonly moreOpen = signal(false);
  readonly accountMenuOpen = signal(false);
  readonly avatarUrl = signal<string | null>(null);
  readonly avatarBusy = signal(false);
  readonly avatarError = signal('');
  private readonly storage = inject(StorageService);
  private readonly localAvatarKey = 'trialcare-profile-avatar-v1';
  private avatarLoadUserId: string | null = null;
  readonly navigation = SECTIONS;
  readonly bottomSections = SECTIONS.filter((s) =>
    ['children', 'medications', 'health_events'].includes(s.id),
  );
  readonly moreSections = SECTIONS.filter(
    (s) => !['children', 'medications', 'health_events'].includes(s.id),
  );
  readonly authReady = signal(false);
  readonly biometricLocked = signal(false);
  constructor() {
    void this.auth.ready.finally(() => this.authReady.set(true));
    effect(() => {
      const user = this.auth.user();
      const ready = this.authReady();
      const enrolled = this.biometrics.enrolled();
      if (user && ready) {
        untracked(() => void this.loadAvatar());
        if (enrolled && sessionStorage.getItem('trialcare-biometric-unlocked') !== 'true')
          this.biometricLocked.set(true);
        const path = window.location.hash.slice(1);
        if (path && path !== '/' && !path.startsWith('/login'))
          void this.router.navigateByUrl(path);
      }
    });
  }
  private async loadAvatar(): Promise<void> {
    const user = this.auth.user();
    if (!user || this.avatarLoadUserId === user.id) return;
    this.avatarLoadUserId = user.id;
    const previous = this.avatarUrl();
    this.avatarUrl.set(null);
    if (previous?.startsWith('blob:')) URL.revokeObjectURL(previous);
    try {
      const url = this.supabase.configured
        ? await this.storage.loadAvatar()
        : localStorage.getItem(this.localAvatarKey);
      if (this.auth.user()?.id === user.id) this.avatarUrl.set(url);
      else if (url?.startsWith('blob:')) URL.revokeObjectURL(url);
    } catch {
      this.avatarUrl.set(null);
    }
  }
  async changeAvatar(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    this.avatarError.set('');
    if (
      !['image/jpeg', 'image/png', 'image/webp'].includes(file.type) ||
      file.size > 2 * 1024 * 1024
    ) {
      this.avatarError.set('Scegli un’immagine JPEG, PNG o WebP fino a 2 MB.');
      return;
    }
    this.avatarBusy.set(true);
    try {
      let url: string | null;
      if (this.supabase.configured) {
        url = await this.storage.saveAvatar(file);
        if (!url) throw new Error();
      } else {
        url = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () =>
            typeof reader.result === 'string' ? resolve(reader.result) : reject();
          reader.onerror = () => reject();
          reader.readAsDataURL(file);
        });
        localStorage.setItem(this.localAvatarKey, url);
      }
      const previous = this.avatarUrl();
      this.avatarUrl.set(url);
      if (previous?.startsWith('blob:')) URL.revokeObjectURL(previous);
      this.accountMenuOpen.set(false);
    } catch {
      this.avatarError.set('Impossibile aggiornare l’immagine. Riprova.');
    } finally {
      this.avatarBusy.set(false);
    }
  }
  async removeAvatar(): Promise<void> {
    this.avatarError.set('');
    const previous = this.avatarUrl();
    this.avatarUrl.set(null);
    if (previous?.startsWith('blob:')) URL.revokeObjectURL(previous);
    if (this.supabase.configured) await this.storage.removeAvatar();
    else localStorage.removeItem(this.localAvatarKey);
    this.accountMenuOpen.set(false);
  }
  toggleSidebar(): void {
    this.sidebarCollapsed.update((value) => !value);
  }
  toggleMore(): void {
    this.moreOpen.update((value) => !value);
  }
  async unlockWithBiometrics(): Promise<void> {
    await this.biometrics.signIn();
    if (!this.biometrics.error()) {
      sessionStorage.setItem('trialcare-biometric-unlocked', 'true');
      this.biometricLocked.set(false);
    }
  }
  async signOut(): Promise<void> {
    this.biometrics.revoke();
    sessionStorage.removeItem('trialcare-biometric-unlocked');
    await this.auth.signOut();
  }
  iconPath(id: string): string {
    return (
      (
        {
          children:
            'M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8l1.1 1.1L12 21l7.8-7.5 1.1-1.1a5.5 5.5 0 0 0-.1-7.8z',
          medications: 'M8 5h8a3.5 3.5 0 0 1 0 7H8a3.5 3.5 0 0 1 0-7z M12 5v7',
          medicine_cabinet: 'M9 3.5h6v3H9z M7 6.5h10v14H7z M7 10h10 M12 12v5 M9.5 14.5h5',
          health_events: 'M3 12h4l3-8 4 16 3-8h4',
          therapies:
            'M12 21s-8.5-4.8-8.5-11a4.5 4.5 0 0 1 8.5-2.1A4.5 4.5 0 0 1 20.5 10c0 6.2-8.5 11-8.5 11z M12 8v7 M8.5 11.5h7',
          documents:
            'M13 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V10z M13 3v7h7 M8 14h8 M8 17h6',
          expenses:
            'M12 2v20 M17 6.5c-.8-1-2.2-1.5-4.5-1.5-2.5 0-4 1.1-4 3s1.5 3 4.5 4 4.5 2 4.5 4-1.5 3-4 3c-2 0-3.8-.7-5-2',
          contacts: 'M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2 M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8',
          reports: 'M4 19.5V4.5 M4 19.5h16 M7 16v-5 M12 16V7 M17 16v-8',
        } as Record<string, string>
      )[id] ?? 'M12 5v14 M5 12h14'
    );
  }
  ngOnDestroy(): void {
    const avatar = this.avatarUrl();
    if (avatar?.startsWith('blob:')) URL.revokeObjectURL(avatar);
    this.ui.resetBodyScroll();
  }
}
