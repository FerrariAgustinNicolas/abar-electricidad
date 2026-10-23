import { HttpErrorResponse } from '@angular/common/http';
import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { Subject } from 'rxjs';
import { AuthSessionService } from '../../core/auth/auth-session.service';
import { H7ReportsApiService } from './h7-reports-api.service';
import { isPasswordChangeRequired } from './h7-admin-error';
import { H7SalesReport } from './h7-reports.models';
import { AdminReportsPageComponent } from './admin-reports-page.component';

@Component({ selector: 'test-login-stub', standalone: true, template: '' })
class LoginStubComponent {}
@Component({ selector: 'test-change-password-stub', standalone: true, template: '' })
class ChangePasswordStubComponent {}

class DeferredBlob extends Blob {
  private resolveText!: (text: string) => void;
  private readonly textResult = new Promise<string>((resolve) => { this.resolveText = resolve; });

  override text(): Promise<string> { return this.textResult; }

  finish(text: string): void { this.resolveText(text); }
}

const report = (total: string): H7SalesReport => ({
  demoMode: true,
  period: { from: '2026-10-01', to: '2026-11-01', timeZone: 'America/Argentina/Buenos_Aires', semantics: '[from,to)' },
  filters: { methodCode: null, orderStatus: null, paymentStatus: null },
  totals: { confirmedOrderCount: 1, productsSubtotal: { amountMinor: total, currency: 'ARS' }, deliveryFees: { amountMinor: '0', currency: 'ARS' }, confirmedTotal: { amountMinor: total, currency: 'ARS' }, averageTicket: { amountMinor: total, currency: 'ARS' }, empty: false },
  orders: { createdCount: 1, activeUnpaidCount: 0, cancelledUnpaidCount: 0, rejectedPaymentCount: 0, rejectedCurrentAttemptCount: 0, byStatus: [] },
  series: [], byMethod: [], byDelivery: [], presentations: [],
});

describe('AdminReportsPageComponent', () => {
  const requests: Subject<H7SalesReport>[] = [];
  const exports: Subject<Blob>[] = [];
  const exportedFilters: unknown[] = [];
  const api = {
    report: vi.fn(() => { const request = new Subject<H7SalesReport>(); requests.push(request); return request; }),
    export: vi.fn((filters) => { exportedFilters.push(filters); const request = new Subject<Blob>(); exports.push(request); return request; }),
  };
  const auth = { expire: vi.fn() };

  beforeEach(() => {
    requests.length = 0;
    exports.length = 0; exportedFilters.length = 0;
    vi.clearAllMocks();
    TestBed.configureTestingModule({ providers: [provideRouter([
      { path: 'admin/login', component: LoginStubComponent },
      { path: 'admin/change-password', component: ChangePasswordStubComponent },
    ]), { provide: H7ReportsApiService, useValue: api }, { provide: AuthSessionService, useValue: auth }] });
  });

  it('cancels the prior request when filters change and never shows an old result beside the new filters', async () => {
    const fixture = TestBed.createComponent(AdminReportsPageComponent);
    const component = fixture.componentInstance;
    const initialRequest = requests[0];
    component.load();
    expect(requests).toHaveLength(2);
    const firstSearch = requests[1];
    component.filters.methodCode = 'DEMO_TRANSFER';
    component.filtersChanged();
    expect(firstSearch.observed).toBe(false);
    component.load();
    expect(requests).toHaveLength(3);
    expect(component.result()).toBeNull();
    const latestSearch = requests[2];
    latestSearch.next(report('9007199254740993'));
    expect(component.result()?.totals.confirmedTotal.amountMinor).toBe('9007199254740993');
    firstSearch.next(report('1'));
    expect(component.result()?.totals.confirmedTotal.amountMinor).toBe('9007199254740993');
    expect(initialRequest.observed).toBe(false);
    fixture.destroy();
  });

  it('does not display old metrics after a failed response and uses H1 expiration handling', async () => {
    const fixture = TestBed.createComponent(AdminReportsPageComponent);
    const component = fixture.componentInstance;
    component.load();
    requests[1].error(new HttpErrorResponse({ status: 503 }));
    await Promise.resolve();
    expect(component.result()).toBeNull();
    expect(component.error()).toContain('No se pudo cargar');
    component.load();
    requests[2].error(new HttpErrorResponse({ status: 401 }));
    await fixture.whenStable();
    expect(auth.expire).toHaveBeenCalledOnce();
    expect(TestBed.inject(Router).url).toContain('/admin/login');
    fixture.destroy();
  });

  it('keeps forbidden access on-page with a sanitized message', async () => {
    const fixture = TestBed.createComponent(AdminReportsPageComponent);
    const component = fixture.componentInstance;
    requests[0].error(new HttpErrorResponse({ status: 403 }));
    await Promise.resolve();
    expect(auth.expire).not.toHaveBeenCalled();
    expect(component.error()).toContain('La sesión no permite consultar');
    fixture.destroy();
  });

  it('routes H1 password-change-required responses to the existing change-password page', async () => {
    const fixture = TestBed.createComponent(AdminReportsPageComponent);
    requests[0].error(new HttpErrorResponse({ status: 403, error: { code: 'PASSWORD_CHANGE_REQUIRED' } }));
    await fixture.whenStable();
    expect(auth.expire).not.toHaveBeenCalled();
    expect(TestBed.inject(Router).url).toBe('/admin/change-password');
    fixture.destroy();
  });

  it('parses a Blob CSV error and routes PASSWORD_CHANGE_REQUIRED to the H1 password page', async () => {
    const fixture = TestBed.createComponent(AdminReportsPageComponent);
    const component = fixture.componentInstance;
    component.downloadCsv();
    const response = new HttpErrorResponse({ status: 403, error: new Blob([JSON.stringify({ code: 'PASSWORD_CHANGE_REQUIRED' })], { type: 'application/json' }) });
    expect(response.error).toBeInstanceOf(Blob);
    expect(await isPasswordChangeRequired(response)).toBe(true);
    exports[0].error(response);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(auth.expire).not.toHaveBeenCalled();
    expect(TestBed.inject(Router).url).toBe('/admin/change-password');
    fixture.destroy();
  });

  it('ignores a delayed CSV error after filters change and a newer report succeeds', async () => {
    const fixture = TestBed.createComponent(AdminReportsPageComponent);
    const component = fixture.componentInstance;
    const delayedBlob = new DeferredBlob([]);
    component.downloadCsv();
    exports[0].error(new HttpErrorResponse({ status: 403, error: delayedBlob }));

    component.filters.methodCode = 'DEMO_TRANSFER';
    component.filtersChanged();
    component.load();
    requests[1].next(report('9007199254740993'));
    delayedBlob.finish(JSON.stringify({ code: 'PASSWORD_CHANGE_REQUIRED' }));
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(component.result()?.totals.confirmedTotal.amountMinor).toBe('9007199254740993');
    expect(component.error()).toBe('');
    expect(TestBed.inject(Router).url).toBe('/');
    expect(auth.expire).not.toHaveBeenCalled();
    fixture.destroy();
  });

  it('ignores a delayed CSV error after the report page is destroyed', async () => {
    const fixture = TestBed.createComponent(AdminReportsPageComponent);
    const delayedBlob = new DeferredBlob([]);
    fixture.componentInstance.downloadCsv();
    exports[0].error(new HttpErrorResponse({ status: 403, error: delayedBlob }));
    fixture.destroy();
    delayedBlob.finish(JSON.stringify({ code: 'PASSWORD_CHANGE_REQUIRED' }));
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(TestBed.inject(Router).url).toBe('/');
    expect(auth.expire).not.toHaveBeenCalled();
  });

  it('expires a 401 CSV response and cancels export on filter edits while preserving applied filters', async () => {
    const fixture = TestBed.createComponent(AdminReportsPageComponent);
    const component = fixture.componentInstance;
    component.filters = { from: '2026-10-01', to: '2026-11-01', methodCode: 'DEMO_TRANSFER', orderStatus: 'DELIVERED', paymentStatus: 'PAID' };
    component.downloadCsv();
    expect(exportedFilters[0]).toEqual({ from: '2026-10-01', to: '2026-11-01', methodCode: 'DEMO_TRANSFER', orderStatus: 'DELIVERED', paymentStatus: 'PAID' });
    component.filters.methodCode = null;
    component.filtersChanged();
    expect(exports[0].observed).toBe(false);
    expect(component.exporting()).toBe(false);

    component.downloadCsv();
    exports[1].error(new HttpErrorResponse({ status: 401, error: new Blob([JSON.stringify({ code: 'SESSION_EXPIRED' })], { type: 'application/json' }) }));
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(auth.expire).toHaveBeenCalledOnce();
    fixture.destroy();
  });

  it('renders separate historical presentation groups sharing product and presentation IDs', async () => {
    const fixture = TestBed.createComponent(AdminReportsPageComponent);
    const distinctGroups: H7SalesReport = {
      ...report('500'),
      presentations: [
        { productId: 'product-1', presentationId: 'presentation-1', productName: 'Cable', unit: 'METER', rollLengthMeters: null, quantity: '2', productsSubtotal: { amountMinor: '200', currency: 'ARS' } },
        { productId: 'product-1', presentationId: 'presentation-1', productName: 'Cable', unit: 'ROLL', rollLengthMeters: 25, quantity: '1', productsSubtotal: { amountMinor: '300', currency: 'ARS' } },
      ],
    };
    requests[0].next(distinctGroups);
    fixture.detectChanges();
    const rows = Array.from(fixture.nativeElement.querySelectorAll('section[aria-labelledby="presentation-title"] tbody tr')) as HTMLTableRowElement[];
    expect(rows).toHaveLength(2);
    expect(rows.map((row) => row.textContent)).toEqual(expect.arrayContaining([expect.stringContaining('2 METER'), expect.stringContaining('1 ROLL')]));
    fixture.destroy();
  });
});
