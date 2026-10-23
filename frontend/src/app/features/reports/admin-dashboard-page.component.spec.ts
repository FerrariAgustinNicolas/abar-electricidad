import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { Subject } from 'rxjs';
import { AuthSessionService } from '../../core/auth/auth-session.service';
import { H7_CLOCK } from './h7-period';
import { H7ReportsApiService } from './h7-reports-api.service';
import { H7Filters, H7SalesReport } from './h7-reports.models';
import { AdminDashboardPageComponent } from './admin-dashboard-page.component';

const report: H7SalesReport = {
  demoMode: true,
  period: { from: '2026-10-01', to: '2026-11-01', timeZone: 'America/Argentina/Buenos_Aires', semantics: '[from,to)' },
  filters: { methodCode: null, orderStatus: null, paymentStatus: null },
  totals: { confirmedOrderCount: 1, productsSubtotal: { amountMinor: '9007199254740993', currency: 'ARS' }, deliveryFees: { amountMinor: '1', currency: 'ARS' }, confirmedTotal: { amountMinor: '9007199254740994', currency: 'ARS' }, averageTicket: { amountMinor: '9007199254740994', currency: 'ARS' }, empty: false },
  orders: { createdCount: 2, activeUnpaidCount: 1, cancelledUnpaidCount: 0, rejectedPaymentCount: 0, rejectedCurrentAttemptCount: 0, byStatus: [{ orderStatus: 'PREPARING', count: 2 }] },
  series: [{ date: '2026-10-31', confirmedOrderCount: 1, confirmedTotal: { amountMinor: '9007199254740994', currency: 'ARS' } }], byMethod: [], byDelivery: [], presentations: [],
};

describe('AdminDashboardPageComponent', () => {
  let requested: H7Filters | undefined;
  const response = new Subject<H7SalesReport>();
  const api = { dashboard: vi.fn((filters: H7Filters) => { requested = filters; return response; }) };

  beforeEach(() => {
    vi.clearAllMocks(); requested = undefined;
    TestBed.configureTestingModule({ providers: [provideRouter([]), { provide: H7_CLOCK, useValue: () => new Date('2026-11-01T02:30:00.000Z') },
      { provide: H7ReportsApiService, useValue: api }, { provide: AuthSessionService, useValue: { expire: vi.fn() } }] });
  });

  it('loads the Buenos Aires calendar month and keeps money as exact minor-unit strings', async () => {
    const fixture = TestBed.createComponent(AdminDashboardPageComponent);
    expect(requested).toEqual({ from: '2026-10-01', to: '2026-11-01', methodCode: null, orderStatus: null, paymentStatus: null });
    response.next(report); fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('90.071.992.547.409,94');
    expect(fixture.nativeElement.textContent).toContain('Estado actual de pedidos creados');
    fixture.destroy();
  });
});
