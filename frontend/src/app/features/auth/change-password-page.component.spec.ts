import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { vi } from 'vitest';
import { AuthSessionService } from '../../core/auth/auth-session.service';
import { ChangePasswordPageComponent } from './change-password-page.component';

describe('ChangePasswordPage', () => {
  let http: HttpTestingController;
  let auth: AuthSessionService;

  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [ChangePasswordPageComponent], providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()] });
    http = TestBed.inject(HttpTestingController);
    auth = TestBed.inject(AuthSessionService);
  });

  afterEach(() => http.verify());

  it('changes a mandatory password, adopts the renewed nonce, and clears form credentials', async () => {
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);
    const login = auth.login('admin@example.test', 'temporary-password');
    http.expectOne('/api/v1/auth/csrf').flush({ csrfToken: 'Y'.repeat(43), headerName: 'X-CSRF-Token' });
    await Promise.resolve();
    http.expectOne('/api/v1/auth/login').flush({ admin: { id: 'e7777777-e777-4777-8777-e77777777777', name: 'Admin', email: 'admin@example.test', mustChangePassword: true }, expiresAt: '2026-10-02T15:04:05Z' }, { headers: { 'X-CSRF-Token': 'Z'.repeat(43) } });
    await login;

    const fixture = TestBed.createComponent(ChangePasswordPageComponent);
    fixture.detectChanges();
    const component = fixture.componentInstance;
    expect(component.mandatory()).toBe(true);
    component.currentPassword = 'temporary-password';
    component.newPassword = 'a-long-enough-new-password';
    component.confirmation = 'a-long-enough-new-password';
    const pending = component.submit();
    const request = http.expectOne('/api/v1/auth/change-password');
    expect(request.request.method).toBe('POST');
    expect(request.request.headers.get('X-CSRF-Token')).toBe('Z'.repeat(43));
    request.flush(null, { status: 204, statusText: 'No Content', headers: { 'X-CSRF-Token': 'a'.repeat(43) } });
    await Promise.resolve();
    http.expectOne('/api/v1/auth/me').flush({ admin: { id: 'e7777777-e777-4777-8777-e77777777777', name: 'Admin', email: 'admin@example.test', mustChangePassword: false }, expiresAt: '2026-10-02T15:04:05Z' }, { headers: { 'X-CSRF-Token': 'b'.repeat(43) } });
    await pending;
    fixture.detectChanges();
    expect(auth.tokenForWrite()).toBe('b'.repeat(43));
    expect(component.currentPassword).toBe('');
    expect(component.newPassword).toBe('');
    expect(component.confirmation).toBe('');
    expect(component.mandatory()).toBe(false);
    expect(navigate).toHaveBeenCalledWith('/admin/usuarios');
  });

  it.each([503, 401, 0])('keeps a committed password change distinct from a failed session read (%s)', async (status) => {
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);
    const restored = auth.restore();
    http.expectOne('/api/v1/auth/me').flush({ admin: { id: 'admin', mustChangePassword: true } }, { headers: { 'X-CSRF-Token': 'R'.repeat(43) } });
    await restored;
    const fixture = TestBed.createComponent(ChangePasswordPageComponent);
    const component = fixture.componentInstance;
    component.currentPassword = 'temporary-password';
    component.newPassword = component.confirmation = 'a-long-enough-new-password';
    const pending = component.submit();
    http.expectOne('/api/v1/auth/change-password').flush(null, { status: 204, statusText: 'No Content', headers: { 'X-CSRF-Token': 'S'.repeat(43) } });
    await Promise.resolve();
    const read = http.expectOne('/api/v1/auth/me');
    if (status === 0) read.error(new ProgressEvent('error'));
    else read.flush(null, { status, statusText: 'Session read failed' });
    await pending;
    fixture.detectChanges();
    const view = fixture.nativeElement as HTMLElement;
    expect(view.querySelector('[role="status"]')?.textContent).toContain('La contraseña se actualizó.');
    expect(view.querySelector('[role="status"]')?.textContent).toContain('nueva contraseña');
    expect(view.querySelector('form')).toBeNull();
    expect(view.querySelector('a')?.getAttribute('href')).toBe('/admin/login');
    expect(component.error()).toBe('');
    expect(component.currentPassword + component.newPassword + component.confirmation).toBe('');
    expect(component.mandatory()).toBe(false);
    expect(component.busy()).toBe(false);
    expect(auth.tokenForWrite()).toBeNull();
    expect(auth.session()).toBeNull();
    expect(auth.status()).toBe('anonymous');
    await component.submit();
    http.expectNone('/api/v1/auth/change-password');
    expect(navigate).not.toHaveBeenCalled();
  });

  it('keeps rejected password writes on the explicit retry path without reading the session', async () => {
    const restored = auth.restore();
    http.expectOne('/api/v1/auth/me').flush({ admin: { id: 'admin', mustChangePassword: true } }, { headers: { 'X-CSRF-Token': 'R'.repeat(43) } });
    await restored;
    const fixture = TestBed.createComponent(ChangePasswordPageComponent);
    const component = fixture.componentInstance;
    component.currentPassword = 'temporary-password';
    component.newPassword = component.confirmation = 'a-long-enough-new-password';
    const pending = component.submit();
    http.expectOne('/api/v1/auth/change-password').flush({ code: 'CSRF_INVALID' }, { status: 403, statusText: 'Forbidden' });
    await pending;
    fixture.detectChanges();
    expect(component.staleCsrf()).toBe(true);
    expect(component.error()).toContain('Actualizá la sesión');
    expect(component.notice()).toBe('');
    expect(component.currentPassword + component.newPassword + component.confirmation).toBe('');
    expect(auth.tokenForWrite()).toBe('R'.repeat(43));
    expect((fixture.nativeElement as HTMLElement).querySelector('form')).not.toBeNull();
    http.expectNone('/api/v1/auth/me');
    http.expectNone('/api/v1/auth/change-password');
  });

});
