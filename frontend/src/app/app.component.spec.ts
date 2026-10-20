import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { AppComponent } from './app.component';
import { appRoutes } from './app.routes';

describe('ABAR frontend routing and render', () => {
  let http: HttpTestingController;
  let router: Router;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [AppComponent],
      providers: [provideRouter(appRoutes), provideHttpClient(), provideHttpClientTesting()],
    });
    http = TestBed.inject(HttpTestingController);
    router = TestBed.inject(Router);
  });

  afterEach(() => http.verify());

  it('renders the public home and requests the health contract from /health', async () => {
    const fixture = TestBed.createComponent(AppComponent);
    await router.navigateByUrl('/');
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('h1')?.textContent).toContain('ABAR Electricidad');
    expect(fixture.nativeElement.querySelector('[role="status"]')?.textContent).toContain('Consultando');
    const request = http.expectOne('/health');
    expect(request.request.method).toBe('GET');
    request.flush({ status: 'ok' });
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('API y base de datos disponibles.');
  });

  it('renders the Spanish login and restores a protected destination through the session guard', async () => {
    const fixture = TestBed.createComponent(AppComponent);
    await router.navigateByUrl('/admin/login');
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('h1')?.textContent).toContain('Iniciar sesión');
    expect(fixture.nativeElement.querySelector('#password')).not.toBeNull();

    const navigation = router.navigateByUrl('/admin/usuarios');
    await new Promise((resolve) => setTimeout(resolve, 0));
    const request = http.expectOne('/api/v1/auth/me');
    expect(request.request.withCredentials).toBe(true);
    request.flush({ code: 'SESSION_EXPIRED', message: 'Sesión vencida', requestId: 'e7777777-e777-4777-8777-e77777777777' }, { status: 401, statusText: 'Unauthorized' });
    await navigation;
    fixture.detectChanges();
    expect(router.url).toContain('/admin/login');
    expect(router.url).toContain('returnUrl');
    http.expectNone('/health');
  });

  it('renders an accessible not-found route', async () => {
    const fixture = TestBed.createComponent(AppComponent);
    await router.navigateByUrl('/ruta-inexistente');
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('h1')?.textContent).toContain('Página no encontrada');
    expect(fixture.nativeElement.querySelector('a[href="/"]')?.textContent).toContain('Volver al inicio');
    http.expectNone('/health');
  });
});
