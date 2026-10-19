import { inject, Injectable, signal } from '@angular/core';
import { Router, UrlTree } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { AdminSessionView } from './auth.models';
import { AuthApiService } from './auth-api.service';

export type AuthStatus = 'unknown' | 'loading' | 'anonymous' | 'authenticated';

@Injectable({ providedIn: 'root' })
export class AuthSessionService {
  readonly session = signal<AdminSessionView | null>(null);
  readonly status = signal<AuthStatus>('unknown');
  private csrfToken: string | null = null;
  private restoration: Promise<AdminSessionView | null> | null = null;
  private restorationVersion = 0;
  private readonly api = inject(AuthApiService);
  private readonly router = inject(Router);

  async restore(): Promise<AdminSessionView | null> {
    if (this.status() === 'authenticated') return this.session();
    if (!this.restoration) {
      const version = this.restorationVersion;
      this.status.set('loading');
      const pending = firstValueFrom(this.api.me()).then(({ session, csrfToken }) => {
        if (version !== this.restorationVersion) return this.session();
        this.setSession(session, csrfToken);
        return session;
      }).catch(() => {
        if (version !== this.restorationVersion) return this.session();
        this.clearSession();
        return null;
      }).finally(() => {
        if (this.restoration === pending) this.restoration = null;
      });
      this.restoration = pending;
    }
    return this.restoration;
  }

  async login(email: string, password: string): Promise<AdminSessionView> {
    const csrf = await firstValueFrom(this.api.csrf());
    if (csrf.headerName !== 'X-CSRF-Token' || !validCsrfToken(csrf.csrfToken)) throw new Error('Respuesta inválida del servidor.');
    const result = await firstValueFrom(this.api.login(email, password, csrf.csrfToken));
    this.setSession(result.session, result.csrfToken);
    return result.session;
  }

  tokenForWrite(): string | null { return this.csrfToken; }

  async refreshSession(): Promise<AdminSessionView | null> {
    this.clearSession();
    return this.restore();
  }

  async logout(): Promise<void> {
    const token = this.csrfToken;
    try {
      if (token) await firstValueFrom(this.api.logout(token));
    } finally {
      this.clearSession();
      await this.router.navigateByUrl('/admin/login');
    }
  }

  async changePassword(currentPassword: string, newPassword: string): Promise<void> {
    const token = this.csrfToken;
    if (!token) throw new Error('La sesión venció. Iniciá sesión nuevamente.');
    await firstValueFrom(this.api.changePassword(currentPassword, newPassword, token));
    const restored = await firstValueFrom(this.api.me());
    this.setSession(restored.session, restored.csrfToken);
  }

  expire(): void { this.clearSession(); }

  getTokenOrThrow(): string {
    if (!this.csrfToken || !validCsrfToken(this.csrfToken)) throw new Error('La sesión venció. Actualizá la sesión e intentá nuevamente.');
    return this.csrfToken;
  }

  protectedRoute(url: string): UrlTree | true {
    const current = this.session();
    if (!current) return this.router.createUrlTree(['/admin/login'], { queryParams: { returnUrl: safeReturnUrl(url) } });
    if (current.admin.mustChangePassword && !url.startsWith('/admin/change-password')) {
      return this.router.createUrlTree(['/admin/change-password']);
    }
    return true;
  }

  private setSession(session: AdminSessionView, token: string): void {
    this.invalidateRestoration();
    this.session.set(session);
    this.csrfToken = token;
    this.status.set('authenticated');
  }

  private clearSession(): void {
    this.invalidateRestoration();
    this.session.set(null);
    this.csrfToken = null;
    this.status.set('anonymous');
  }

  private invalidateRestoration(): void {
    this.restorationVersion++;
    this.restoration = null;
  }
}

function validCsrfToken(value: string): boolean { return /^[A-Za-z0-9_-]{43}$/.test(value); }

export function safeReturnUrl(value: string | null | undefined): string {
  if (!value || !value.startsWith('/') || value.startsWith('//') || value.startsWith('/\\') || value.includes('\\')) return '/admin/usuarios';
  if (value.startsWith('/admin/login') || value.startsWith('/admin/change-password')) return '/admin/usuarios';
  return value;
}
