import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { AuthSessionService, safeReturnUrl } from './auth-session.service';

const session = (mustChangePassword = false) => ({
  admin: { id: 'e7777777-e777-4777-8777-e77777777777', name: 'Admin', email: 'admin@example.test', mustChangePassword },
  expiresAt: '2026-10-02T15:04:05Z',
});

describe('AuthSessionService', () => {
  let auth: AuthSessionService;
  let http: HttpTestingController;
  let router: Router;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()] });
    auth = TestBed.inject(AuthSessionService);
    http = TestBed.inject(HttpTestingController);
    router = TestBed.inject(Router);
  });

  afterEach(() => http.verify());

  it('restores a restricted session and its in-memory nonce through me', async () => {
    const restored = auth.restore();
    const request = http.expectOne('/api/v1/auth/me');
    request.flush(session(true), { headers: { 'X-CSRF-Token': 'R'.repeat(43) } });
    expect(await restored).toEqual(session(true));
    expect(auth.session()?.admin.mustChangePassword).toBe(true);
    expect(auth.tokenForWrite()).toBe('R'.repeat(43));
    expect(auth.status()).toBe('authenticated');
    http.expectNone('/api/v1/auth/csrf');
  });

  it('does not send credentials when the pre-auth CSRF metadata is malformed', async () => {
    const pending = auth.login('admin@example.test', 'not-a-real-password').catch(() => undefined);
    http.expectOne('/api/v1/auth/csrf').flush({ csrfToken: 'invalid', headerName: 'X-CSRF-Token' });
    await pending;
    http.expectNone('/api/v1/auth/login');
    expect(auth.session()).toBeNull();
    expect(auth.tokenForWrite()).toBeNull();
  });

  it('redirects a restricted account to password change and blocks external return URLs', async () => {
    const restored = auth.restore();
    http.expectOne('/api/v1/auth/me').flush(session(true), { headers: { 'X-CSRF-Token': 'S'.repeat(43) } });
    await restored;
    const destination = auth.protectedRoute('/admin/users');
    expect(router.serializeUrl(destination as ReturnType<Router['createUrlTree']>)).toBe('/admin/change-password');
  });

  it('uses only safe same-origin return paths', () => {
    expect(safeReturnUrl('/admin/users?page=2')).toBe('/admin/users?page=2');
    expect(safeReturnUrl('//evil.example')).toBe('/admin/usuarios');
    expect(safeReturnUrl('/\\\\evil.example')).toBe('/admin/usuarios');
    expect(safeReturnUrl('/admin/login?returnUrl=%2F')).toBe('/admin/usuarios');
    expect(safeReturnUrl('/admin/usuarios?page=2')).toBe('/admin/usuarios?page=2');
  });

  for (const outcome of ['success', 'failure'] as const) {
    it(`ignores an old restore ${outcome} after a newer login`, async () => {
      const old = auth.restore();
      const stale = http.expectOne('/api/v1/auth/me');
      const loggedIn = auth.login('new@example.test', 'not-a-real-password');
      http.expectOne('/api/v1/auth/csrf').flush({ csrfToken: 'A'.repeat(43), headerName: 'X-CSRF-Token' });
      await Promise.resolve();
      const current = { ...session(), admin: { ...session().admin, email: 'new@example.test' } };
      http.expectOne('/api/v1/auth/login').flush(current, { headers: { 'X-CSRF-Token': 'N'.repeat(43) } });
      expect(await loggedIn).toEqual(current);
      if (outcome === 'success') stale.flush(session(true), { headers: { 'X-CSRF-Token': 'O'.repeat(43) } });
      else stale.flush({}, { status: 401, statusText: 'Unauthorized' });
      expect(await old).toEqual(current);
      expect(auth.session()).toEqual(current);
      expect(auth.status()).toBe('authenticated');
      expect(auth.tokenForWrite()).toBe('N'.repeat(43));
    });
  }

  for (const action of ['expire', 'logout'] as const) {
    it(`does not resurrect a pending session after ${action}`, async () => {
      const old = auth.restore();
      const stale = http.expectOne('/api/v1/auth/me');
      const navigate = vi.spyOn(router, 'navigateByUrl').mockResolvedValue(true);
      if (action === 'expire') auth.expire();
      else await auth.logout();
      stale.flush(session(), { headers: { 'X-CSRF-Token': 'O'.repeat(43) } });
      expect(await old).toBeNull();
      expect(auth.session()).toBeNull();
      expect(auth.status()).toBe('anonymous');
      expect(auth.tokenForWrite()).toBeNull();
      if (action === 'logout') expect(navigate).toHaveBeenCalledWith('/admin/login');
      else expect(navigate).not.toHaveBeenCalled();
      http.expectNone('/api/v1/auth/logout');
    });
  }

  for (const outcome of ['success', 'failure'] as const) {
    it(`keeps a new refresh pending when an old restore finishes with ${outcome}`, async () => {
      const old = auth.restore();
      const stale = http.expectOne('/api/v1/auth/me');
      const refreshed = auth.refreshSession();
      const current = http.expectOne('/api/v1/auth/me');
      if (outcome === 'success') stale.flush(session(true), { headers: { 'X-CSRF-Token': 'O'.repeat(43) } });
      else stale.flush({}, { status: 401, statusText: 'Unauthorized' });
      expect(await old).toBeNull();
      expect(auth.status()).toBe('loading');
      expect(auth.session()).toBeNull();
      expect(auth.tokenForWrite()).toBeNull();
      const joined = auth.restore();
      http.expectNone('/api/v1/auth/me');
      current.flush(session(), { headers: { 'X-CSRF-Token': 'N'.repeat(43) } });
      expect(await refreshed).toEqual(session());
      expect(await joined).toEqual(session());
      expect(auth.status()).toBe('authenticated');
      expect(auth.tokenForWrite()).toBe('N'.repeat(43));
    });
  }

  it('deduplicates concurrent restores within the current session generation', async () => {
    const first = auth.restore();
    const second = auth.restore();
    const request = http.expectOne('/api/v1/auth/me');
    request.flush(session(), { headers: { 'X-CSRF-Token': 'N'.repeat(43) } });
    expect(await first).toEqual(session());
    expect(await second).toEqual(session());
    expect(auth.session()).toEqual(session());
    expect(auth.status()).toBe('authenticated');
    expect(auth.tokenForWrite()).toBe('N'.repeat(43));
  });

  it('preserves authenticated logout and clears its nonce', async () => {
    const initial = auth.restore();
    http.expectOne('/api/v1/auth/me').flush(session(), { headers: { 'X-CSRF-Token': 'N'.repeat(43) } });
    await initial;
    const navigate = vi.spyOn(router, 'navigateByUrl').mockResolvedValue(true);
    const loggedOut = auth.logout();
    const request = http.expectOne('/api/v1/auth/logout');
    expect(request.request.headers.get('X-CSRF-Token')).toBe('N'.repeat(43));
    request.flush(null);
    await loggedOut;
    expect(auth.session()).toBeNull();
    expect(auth.status()).toBe('anonymous');
    expect(auth.tokenForWrite()).toBeNull();
    expect(navigate).toHaveBeenCalledWith('/admin/login');
  });
});
