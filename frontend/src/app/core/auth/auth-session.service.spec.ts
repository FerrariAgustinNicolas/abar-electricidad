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
});
