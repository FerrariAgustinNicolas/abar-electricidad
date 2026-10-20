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
    expect(fixture.nativeElement.querySelector('abar-health-status [role="status"]')?.textContent).toContain('Consultando');
    const home = http.expectOne('/api/v1/public/home');
    expect(home.request.method).toBe('GET');
    home.flush({ categories: [], featuredProducts: [], lowStockProducts: [] });
    const request = http.expectOne('/health');
    expect(request.request.method).toBe('GET');
    request.flush({ status: 'ok' });
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('API y base de datos disponibles.');
  });

  it('keeps catalog URL filters and cancels obsolete requests without authentication', async () => {
    const fixture = TestBed.createComponent(AppComponent);
    await router.navigateByUrl('/productos?q=cable&unit=METER&page=2');
    fixture.detectChanges();
    http.expectOne('/api/v1/public/categories').flush({ items: [] });
    const first = http.expectOne((request) => request.url === '/api/v1/public/products');
    expect(first.request.params.get('q')).toBe('cable');
    expect(first.request.params.get('unit')).toBe('METER');
    expect(first.request.params.get('page')).toBe('2');
    expect(first.request.withCredentials).toBe(false);
    await router.navigateByUrl('/productos?q=lampara&unit=UNIT&page=1');
    fixture.detectChanges();
    expect(first.cancelled).toBe(true);
    const current = http.expectOne((request) => request.url === '/api/v1/public/products');
    expect(current.request.params.get('q')).toBe('lampara');
    expect(current.request.params.get('unit')).toBe('UNIT');
    current.flush({ items: [], pageInfo: { page: 1, pageSize: 20, totalItems: 0, totalPages: 0 } });
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('No encontramos productos');
    expect(router.url).toContain('q=lampara');
    http.expectNone('/api/v1/auth/me');
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
