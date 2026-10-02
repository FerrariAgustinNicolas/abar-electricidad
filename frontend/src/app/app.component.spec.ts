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

  it('renders login and admin as inert placeholders without private data or health requests', async () => {
    const fixture = TestBed.createComponent(AppComponent);
    await router.navigateByUrl('/admin/login');
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('no autenticación implementada');
    expect(fixture.nativeElement.textContent).not.toContain('Contraseña');

    await router.navigateByUrl('/admin');
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('No hay operaciones administrativas');
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
