import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { AuthApiService } from './auth-api.service';

describe('AuthApiService contract', () => {
  let api: AuthApiService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    api = TestBed.inject(AuthApiService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('obtains pre-auth CSRF and sends login with same-origin credentials and the contract header', () => {
    let received: unknown;
    api.csrf().subscribe((value) => {
      api.login('admin@example.test', 'not-a-real-password', value.csrfToken).subscribe((session) => received = session);
    });
    const csrf = http.expectOne('/api/v1/auth/csrf');
    expect(csrf.request.method).toBe('GET');
    expect(csrf.request.withCredentials).toBe(true);
    csrf.flush({ csrfToken: 'A'.repeat(43), headerName: 'X-CSRF-Token' });

    const login = http.expectOne('/api/v1/auth/login');
    expect(login.request.method).toBe('POST');
    expect(login.request.withCredentials).toBe(true);
    expect(login.request.headers.get('X-CSRF-Token')).toBe('A'.repeat(43));
    expect(login.request.headers.get('Origin')).toBeNull();
    expect(login.request.body.email).toBe('admin@example.test');
    expect(typeof login.request.body.password).toBe('string');
    const session = { admin: { id: 'e7777777-e777-4777-8777-e77777777777', name: 'Admin', email: 'admin@example.test', mustChangePassword: false }, expiresAt: '2026-10-02T15:04:05Z' };
    login.flush(session, { headers: { 'X-CSRF-Token': 'B'.repeat(43) } });
    expect(received).toEqual({ session, csrfToken: 'B'.repeat(43) });
  });

  it('restores session from me and reads the nonce response header without requesting csrf', () => {
    let token: string | null = null;
    api.me().subscribe((response) => token = response.csrfToken);
    const request = http.expectOne('/api/v1/auth/me');
    expect(request.request.method).toBe('GET');
    expect(request.request.withCredentials).toBe(true);
    request.flush({ admin: { id: 'e7777777-e777-4777-8777-e77777777777', name: 'Admin', email: 'admin@example.test', mustChangePassword: true }, expiresAt: '2026-10-02T15:04:05Z' }, { headers: { 'X-CSRF-Token': 'C'.repeat(43), 'Cache-Control': 'no-store' } });
    expect(token).toBe('C'.repeat(43));
  });

  it('sends password change, logout, creation, and reset payloads exactly once with the CSRF header', () => {
    api.changePassword('current-password', 'a-long-enough-new-password', 'E'.repeat(43)).subscribe();
    const change = http.expectOne('/api/v1/auth/change-password');
    expect(change.request.method).toBe('POST');
    expect(change.request.withCredentials).toBe(true);
    expect(change.request.headers.get('X-CSRF-Token')).toBe('E'.repeat(43));
    expect(Object.keys(change.request.body).sort()).toEqual(['currentPassword', 'newPassword']);
    expect(typeof change.request.body.currentPassword).toBe('string');
    expect([...change.request.body.newPassword].length).toBe(26);
    change.flush(null, { headers: { 'X-CSRF-Token': 'F'.repeat(43) } });

    api.logout('F'.repeat(43)).subscribe();
    const logout = http.expectOne('/api/v1/auth/logout');
    expect(logout.request.method).toBe('POST');
    expect(logout.request.withCredentials).toBe(true);
    expect(logout.request.headers.get('X-CSRF-Token')).toBe('F'.repeat(43));
    logout.flush(null);

    api.createUser({ name: 'Nueva cuenta', email: 'new@example.test', temporaryPassword: 'a-long-enough-password' }, 'G'.repeat(43)).subscribe();
    const create = http.expectOne('/api/v1/admin/users');
    expect(create.request.method).toBe('POST');
    expect(create.request.headers.get('X-CSRF-Token')).toBe('G'.repeat(43));
    expect(Object.keys(create.request.body).sort()).toEqual(['email', 'name', 'temporaryPassword']);
    expect([...create.request.body.temporaryPassword].length).toBe(22);
    create.flush({ id: 'e7777777-e777-4777-8777-e77777777777', name: 'Nueva cuenta', email: 'new@example.test', active: true, mustChangePassword: true, version: 1, createdAt: '2026-10-02T15:04:05Z', updatedAt: '2026-10-02T15:04:05Z' });

    api.resetPassword('e7777777-e777-4777-8777-e77777777777', { temporaryPassword: 'a-long-enough-password', reason: 'Solicitud aprobada' }, 'H'.repeat(43)).subscribe();
    const reset = http.expectOne('/api/v1/admin/users/e7777777-e777-4777-8777-e77777777777/reset-password');
    expect(reset.request.method).toBe('POST');
    expect(reset.request.headers.get('X-CSRF-Token')).toBe('H'.repeat(43));
    expect(Object.keys(reset.request.body).sort()).toEqual(['reason', 'temporaryPassword']);
    expect(reset.request.body.reason).toBe('Solicitud aprobada');
    expect([...reset.request.body.temporaryPassword].length).toBe(22);
    reset.flush(null);
  });

  it('uses exact user-list query contract and never replays a write after stale CSRF', () => {
    let failed = false;
    api.listUsers(2, 40, '-email').subscribe();
    const list = http.expectOne('/api/v1/admin/users?page=2&pageSize=40&sort=-email');
    expect(list.request.method).toBe('GET');
    expect(list.request.withCredentials).toBe(true);
    list.flush({ items: [], pageInfo: { page: 2, pageSize: 40, totalItems: 0, totalPages: 0 } });

    api.updateUser('e7777777-e777-4777-8777-e77777777777', { active: false, expectedVersion: 3 }, 'D'.repeat(43)).subscribe({ error: () => failed = true });
    const update = http.expectOne('/api/v1/admin/users/e7777777-e777-4777-8777-e77777777777');
    expect(update.request.method).toBe('PATCH');
    expect(update.request.withCredentials).toBe(true);
    expect(update.request.headers.get('X-CSRF-Token')).toBe('D'.repeat(43));
    update.flush({ code: 'CSRF_INVALID', message: 'CSRF inválido', requestId: 'e7777777-e777-4777-8777-e77777777777' }, { status: 403, statusText: 'Forbidden' });
    expect(failed).toBe(true);
    http.expectNone('/api/v1/auth/me');
    http.expectNone('/api/v1/admin/users/e7777777-e777-4777-8777-e77777777777');
  });
});
