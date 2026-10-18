import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { vi } from 'vitest';
import { AdminUserView } from '../../core/auth/auth.models';
import { AuthSessionService } from '../../core/auth/auth-session.service';
import { appRoutes } from '../../app.routes';
import { AdminPlaceholderPageComponent } from './admin-placeholder-page.component';

const admin: AdminUserView = {
  id: 'e7777777-e777-4777-8777-e77777777777', name: 'Admin', email: 'admin@example.test', active: true,
  mustChangePassword: false, version: 2, createdAt: '2026-10-02T15:04:05Z', updatedAt: '2026-10-02T15:04:05Z',
};

describe('AdminUsersPage', () => {
  let http: HttpTestingController;
  let auth: AuthSessionService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [AdminPlaceholderPageComponent],
      providers: [provideRouter(appRoutes), provideHttpClient(), provideHttpClientTesting()],
    });
    http = TestBed.inject(HttpTestingController);
    auth = TestBed.inject(AuthSessionService);
  });

  afterEach(() => http.verify());

  it('returns an expired recovery session to login with the existing users route', async () => {
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    const fixture = TestBed.createComponent(AdminPlaceholderPageComponent);
    http.expectOne('/api/v1/admin/users?page=1&pageSize=20&sort=-createdAt').flush({ items: [], pageInfo: { page: 1, pageSize: 20, totalItems: 0, totalPages: 0 } });
    const pending = fixture.componentInstance.refreshSession();
    http.expectOne('/api/v1/auth/me').flush({ code: 'SESSION_EXPIRED' }, { status: 401, statusText: 'Unauthorized' });
    await pending;
    expect(navigate).toHaveBeenCalledWith(['/admin/login'], { queryParams: { returnUrl: '/admin/usuarios' } });
  });

  async function login(): Promise<void> {
    const pending = auth.login('admin@example.test', 'not-a-real-password');
    http.expectOne('/api/v1/auth/csrf').flush({ csrfToken: 'W'.repeat(43), headerName: 'X-CSRF-Token' });
    await Promise.resolve();
    http.expectOne('/api/v1/auth/login').flush({ admin: { id: admin.id, name: admin.name, email: admin.email, mustChangePassword: false }, expiresAt: admin.updatedAt }, { headers: { 'X-CSRF-Token': 'X'.repeat(43) } });
    await pending;
  }

  it('shows the last-active-admin conflict and never repeats the write', async () => {
    await login();
    const fixture = TestBed.createComponent(AdminPlaceholderPageComponent);
    fixture.detectChanges();
    http.expectOne('/api/v1/admin/users?page=1&pageSize=20&sort=-createdAt').flush({ items: [admin], pageInfo: { page: 1, pageSize: 20, totalItems: 1, totalPages: 1 } });
    fixture.detectChanges();

    const pending = fixture.componentInstance.toggleActive(admin);
    const patch = http.expectOne(`/api/v1/admin/users/${admin.id}`);
    expect(patch.request.method).toBe('PATCH');
    expect(patch.request.headers.get('X-CSRF-Token')).toBe('X'.repeat(43));
    expect(patch.request.body).toEqual({ active: false, expectedVersion: 2 });
    patch.flush({ code: 'LAST_ACTIVE_ADMIN', message: 'No se puede desactivar', requestId: admin.id }, { status: 409, statusText: 'Conflict' });
    await pending;
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('No se puede desactivar la última cuenta administradora activa.');
    http.expectNone(`/api/v1/admin/users/${admin.id}`);
  });

  it('refreshes a stale session only after explicit user action without repeating the write', async () => {
    await login();
    const fixture = TestBed.createComponent(AdminPlaceholderPageComponent);
    fixture.detectChanges();
    http.expectOne('/api/v1/admin/users?page=1&pageSize=20&sort=-createdAt').flush({ items: [admin], pageInfo: { page: 1, pageSize: 20, totalItems: 1, totalPages: 1 } });

    const pending = fixture.componentInstance.toggleActive(admin);
    http.expectOne(`/api/v1/admin/users/${admin.id}`).flush({ code: 'CSRF_INVALID', message: 'Token inválido', requestId: admin.id }, { status: 403, statusText: 'Forbidden' });
    await pending;
    expect(fixture.componentInstance.staleCsrf()).toBe(true);
    http.expectNone('/api/v1/auth/me');
    expect(fixture.componentInstance.error()).toContain('No se repitió la acción');
  });
});
