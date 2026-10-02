import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { HealthStatusComponent } from './health-status.component';

describe('HealthStatusComponent', () => {
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [HealthStatusComponent],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('shows loading then server health success for the same-origin /health request', () => {
    const fixture = TestBed.createComponent(HealthStatusComponent);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('[role="status"]')?.textContent).toContain('Consultando');

    const request = http.expectOne('/health');
    expect(request.request.method).toBe('GET');
    request.flush({ status: 'ok' });
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('[role="status"]')?.textContent).toContain('API y base de datos disponibles.');
  });

  it('shows a safe error and allows retry after the health endpoint fails', () => {
    const fixture = TestBed.createComponent(HealthStatusComponent);
    fixture.detectChanges();
    http.expectOne('/health').flush({}, { status: 503, statusText: 'Service Unavailable' });
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('[role="alert"]')?.textContent).toContain('No se pudo verificar');

    fixture.nativeElement.querySelector('button').click();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('[role="status"]')?.textContent).toContain('Consultando');
    http.expectOne('/health').flush({ status: 'ok' });
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('[role="status"]')?.textContent).toContain('disponibles');
  });

  it('rejects malformed success bodies as an unavailable health state', () => {
    const fixture = TestBed.createComponent(HealthStatusComponent);
    fixture.detectChanges();
    http.expectOne('/health').flush({ status: 'degraded' });
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('[role="alert"]')?.textContent).toContain('No se pudo verificar');
  });
});
