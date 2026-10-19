import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
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

  const listUrl = (page: number) => `/api/v1/admin/users?page=${page}&pageSize=20&sort=-createdAt`;
  const pageResult = (page: number) => ({
    items: Array.from({ length: page === 1 ? 20 : 1 }, (_, index) => ({
      ...admin, id: `e7777777-e777-4777-8777-${String(page * 100 + index).padStart(12, '0')}`,
      name: `Page ${page} user ${index}`, email: `page${page}-${index}@example.test`,
    })),
    pageInfo: { page, pageSize: 20, totalItems: 21, totalPages: 2 },
  });

  async function loadedPage() {
    const fixture = TestBed.createComponent(AdminPlaceholderPageComponent);
    http.expectOne(listUrl(1)).flush(pageResult(1));
    await Promise.resolve();
    fixture.detectChanges();
    return fixture;
  }

  function expectPage(fixture: ComponentFixture<AdminPlaceholderPageComponent>, page: number) {
    fixture.detectChanges();
    const component = fixture.componentInstance;
    expect(component.page()).toBe(page);
    expect(component.users()).toEqual(pageResult(page));
    expect(fixture.nativeElement.querySelector('.user-email').textContent).toContain(`page${page}-0@example.test`);
    expect(fixture.nativeElement.querySelector('.pagination span').textContent).toContain(`Página ${page} de 2`);
    const buttons = fixture.nativeElement.querySelectorAll('.pagination button');
    expect(buttons[0].disabled).toBe(component.loading() || page === 1);
    expect(buttons[1].disabled).toBe(component.loading() || page === 2);
  }

  it('commits pagination rows and indicator only after the requested page succeeds', async () => {
    const fixture = await loadedPage();
    const pending = fixture.componentInstance.changePage(2);
    const request = http.expectOne(listUrl(2));
    expect(request.request.method).toBe('GET');
    expectPage(fixture, 1);
    request.flush(pageResult(2));
    await pending;
    expectPage(fixture, 2);
    expect(fixture.componentInstance.loadFailed()).toBe(false);
  });

  it('preserves the confirmed pagination on failure and explicitly retries the requested page', async () => {
    const fixture = await loadedPage();
    const component = fixture.componentInstance;
    const pending = component.changePage(2);
    http.expectOne(listUrl(2)).flush({}, { status: 503, statusText: 'Unavailable' });
    await pending;
    expectPage(fixture, 1);
    expect(component.loadFailed()).toBe(true);
    expect(component.error()).toContain('No se pudo cargar el listado');
    const retry = component.load();
    http.expectOne(listUrl(2)).flush(pageResult(2));
    await retry;
    expectPage(fixture, 2);
    expect(component.loadFailed()).toBe(false);
    expect(component.error()).toBe('');
  });

  it('ignores invalid and overlapping pagination requests without changing the confirmed page', async () => {
    const fixture = await loadedPage();
    const component = fixture.componentInstance;
    for (const page of [0, 1, 3]) await component.changePage(page);
    http.expectNone((request) => request.url === '/api/v1/admin/users');
    expectPage(fixture, 1);
    const pending = component.changePage(2);
    const request = http.expectOne(listUrl(2));
    await component.changePage(2);
    await component.changePage(1);
    await component.load();
    http.expectNone((request) => request.url === '/api/v1/admin/users');
    expectPage(fixture, 1);
    request.flush(pageResult(2));
    await pending;
    expectPage(fixture, 2);
  });

  it('preserves pagination after a committed create with failed reload and retries only the read', async () => {
    await login();
    const fixture = await loadedPage();
    const component = fixture.componentInstance;
    const next = component.changePage(2);
    http.expectOne(listUrl(2)).flush(pageResult(2));
    await next;
    component.newName = 'New account'; component.newEmail = 'new@example.test';
    component.newPassword = 'a-long-enough-password';
    const created = component.createUser();
    const write = http.expectOne('/api/v1/admin/users');
    expect(write.request.method).toBe('POST');
    expect(write.request.body.email).toBe('new@example.test');
    write.flush({ ...admin, email: 'new@example.test' });
    await Promise.resolve();
    http.expectOne(listUrl(1)).flush({}, { status: 503, statusText: 'Unavailable' });
    await created;
    expectPage(fixture, 2);
    expect(component.newPassword).toBe('');
    expect(component.busy()).toBe(false);
    expect(component.loadFailed()).toBe(true);
    const retry = component.load();
    const read = http.expectOne(listUrl(1));
    expect(read.request.method).toBe('GET');
    read.flush(pageResult(1));
    await retry;
    expectPage(fixture, 1);
    http.expectNone((request) => request.method !== 'GET');
  });
});
