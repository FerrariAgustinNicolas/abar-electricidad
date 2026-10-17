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
