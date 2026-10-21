import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { AuthSessionService } from '../../core/auth/auth-session.service';
import { AdminOrdersApiService } from './admin-orders-api.service';
import { AdminOrderList } from './admin-orders.models';
import { AdminOrdersListPageComponent } from './admin-orders-list-page.component';

describe('AdminOrdersListPageComponent', () => {
  const page: AdminOrderList = { items: [], pageInfo: { page: 1, pageSize: 20, totalItems: 0, totalPages: 0 } };
  const api = { list: vi.fn(() => of(page)) };
  beforeEach(() => {
    vi.clearAllMocks();
    TestBed.configureTestingModule({ providers: [provideRouter([]), { provide: AdminOrdersApiService, useValue: api },
      { provide: AuthSessionService, useValue: { expire: vi.fn() } }] });
  });

  it('submits server filters and inclusive UTC date bounds without losing pagination state', async () => {
    const component = TestBed.createComponent(AdminOrdersListPageComponent).componentInstance;
    await Promise.resolve();
    component.filters.setValue({ search: 'AB-100', orderStatus: 'RECEIVED', paymentStatus: 'PENDING', deliveryMode: 'PICKUP', from: '2026-10-01', to: '2026-10-21' });
    await component.load(2);
    expect(api.list).toHaveBeenLastCalledWith({ page: 2, pageSize: 20, search: 'AB-100', orderStatus: 'RECEIVED', paymentStatus: 'PENDING', deliveryMode: 'PICKUP', from: '2026-10-01T00:00:00.000Z', to: '2026-10-21T23:59:59.999Z' });
    expect(component.page()).toBe(2);
  });

  it('renders the empty state when the filtered result has no orders', async () => {
    const fixture = TestBed.createComponent(AdminOrdersListPageComponent);
    await fixture.whenStable(); fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('No hay pedidos para estos filtros.');
  });
});
