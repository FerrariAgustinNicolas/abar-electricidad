import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { LoginPlaceholderPageComponent } from './login-placeholder-page.component';
import { appRoutes } from '../../app.routes';

describe('LoginPage', () => {
  let http: HttpTestingController;
  let router: Router;

  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [LoginPlaceholderPageComponent], providers: [provideRouter(appRoutes), provideHttpClient(), provideHttpClientTesting()] });
    http = TestBed.inject(HttpTestingController);
    router = TestBed.inject(Router);
  });

  afterEach(() => http.verify());

  it('allows an NFC-normalizable password without changing the submitted credential', async () => {
    await router.navigateByUrl('/admin/login');
    const fixture = TestBed.createComponent(LoginPlaceholderPageComponent);
    fixture.detectChanges();
    const email = fixture.nativeElement.querySelector('#email') as HTMLInputElement;
    const password = fixture.nativeElement.querySelector('#password') as HTMLInputElement;
    const credential = 'e\u0301'.repeat(70) + '-Safe-123!';
    email.value = 'admin@example.test'; email.dispatchEvent(new Event('input'));
    password.value = credential; password.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    const button = fixture.nativeElement.querySelector('button[type="submit"]') as HTMLButtonElement;
    expect(Array.from(credential).length).toBeGreaterThan(128);
    expect(Array.from(credential.normalize('NFC')).length).toBeLessThanOrEqual(128);
    expect(button.disabled).toBe(false);
    button.click();
    http.expectOne('/api/v1/auth/csrf').flush({ csrfToken: 'N'.repeat(43), headerName: 'X-CSRF-Token' });
    await Promise.resolve();
    const request = http.expectOne('/api/v1/auth/login');
    expect(request.request.body.password).toBe(credential);
    request.flush({ admin: { id: 'admin', mustChangePassword: true }, expiresAt: '2026-10-02T15:04:05Z' }, { headers: { 'X-CSRF-Token': 'O'.repeat(43) } });
    await fixture.whenStable();
    expect(router.url).toBe('/admin/change-password');
  });

  it('preserves the 128-code-point login limit for ordinary credentials', () => {
    const fixture = TestBed.createComponent(LoginPlaceholderPageComponent);
    fixture.detectChanges();
    const email = fixture.nativeElement.querySelector('#email') as HTMLInputElement;
    const password = fixture.nativeElement.querySelector('#password') as HTMLInputElement;
    email.value = 'admin@example.test'; email.dispatchEvent(new Event('input'));
    password.value = 'A'.repeat(128); password.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    const button = fixture.nativeElement.querySelector('button[type="submit"]') as HTMLButtonElement;
    expect(button.disabled).toBe(false);
    password.value = 'A'.repeat(129); password.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    expect(button.disabled).toBe(true);
    http.expectNone('/api/v1/auth/login');
  });

  it('shows a generic credential error and clears the password after a rejected login', async () => {
    await router.navigateByUrl('/admin/login?returnUrl=%2Fadmin%2Fusuarios');
    const fixture = TestBed.createComponent(LoginPlaceholderPageComponent);
    fixture.detectChanges();
    const email = fixture.nativeElement.querySelector('#email') as HTMLInputElement;
    const password = fixture.nativeElement.querySelector('#password') as HTMLInputElement;
    email.value = 'admin@example.test'; email.dispatchEvent(new Event('input'));
    password.value = 'not-a-real-password'; password.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    const form = fixture.nativeElement.querySelector('form') as HTMLFormElement;
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));

    http.expectOne('/api/v1/auth/csrf').flush({ csrfToken: 'T'.repeat(43), headerName: 'X-CSRF-Token' });
    await Promise.resolve();
    http.expectOne('/api/v1/auth/login').flush({ code: 'INVALID_CREDENTIALS', message: 'Credenciales inválidas', requestId: 'e7777777-e777-4777-8777-e77777777777' }, { status: 401, statusText: 'Unauthorized' });
    await fixture.whenStable();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('[role="alert"]')?.textContent).toContain('No pudimos validar');
    expect((fixture.nativeElement.querySelector('#password') as HTMLInputElement).value).toBe('');
    expect(fixture.nativeElement.textContent).not.toContain('not-a-real-password');
  });

  it('routes mandatory-change accounts to the dedicated password page after login', async () => {
    await router.navigateByUrl('/admin/login?returnUrl=%2F%2Fevil.example');
    const fixture = TestBed.createComponent(LoginPlaceholderPageComponent);
    fixture.detectChanges();
    const component = fixture.componentInstance;
    component.email = 'admin@example.test';
    component.password = 'temporary-password';
    const pending = component.submit();
    http.expectOne('/api/v1/auth/csrf').flush({ csrfToken: 'U'.repeat(43), headerName: 'X-CSRF-Token' });
    await Promise.resolve();
    http.expectOne('/api/v1/auth/login').flush({ admin: { id: 'e7777777-e777-4777-8777-e77777777777', name: 'Admin', email: 'admin@example.test', mustChangePassword: true }, expiresAt: '2026-10-02T15:04:05Z' }, { headers: { 'X-CSRF-Token': 'V'.repeat(43) } });
    await pending;
    expect(router.url).toBe('/admin/change-password');
  });
});
