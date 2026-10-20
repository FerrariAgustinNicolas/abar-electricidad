import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { OrderAccessSessionService } from '../../core/orders/order-access-session.service';
import { OrdersApiService } from '../../core/orders/orders-api.service';
import { PublicOrderView } from '../../core/orders/orders.models';
import { OrderResultPageComponent } from './order-result-page.component';

describe('OrderResultPageComponent', () => {
  it('separates an approved demo attempt from the still-pending commercial payment', async () => {
    const view: PublicOrderView = {
      orderId: 'order-1', orderNumber: 'AB-100', createdAt: '2026-10-20T12:00:00Z', items: [],
      subtotal: { amountMinor: '1000', currency: 'ARS' }, deliveryFee: { amountMinor: '0', currency: 'ARS' },
      total: { amountMinor: '1000', currency: 'ARS' }, deliveryMode: 'PICKUP', orderStatus: 'RECEIVED', paymentStatus: 'PENDING',
      currentAttempt: { id: 'attempt-1', methodCode: 'DEMO_SIMULATION', status: 'APPROVED', sequence: 1, createdAt: '2026-10-20T12:00:00Z', demoMode: true },
      nextActions: ['VIEW_ORDER'], demoMode: true,
    };
    TestBed.configureTestingModule({ imports: [OrderResultPageComponent], providers: [
      provideRouter([]),
      { provide: ActivatedRoute, useValue: { snapshot: { paramMap: { get: () => 'order-1' } } } },
      { provide: OrdersApiService, useValue: { getOrder: () => of(view) } },
      { provide: OrderAccessSessionService, useValue: { get: () => ({ orderId: 'order-1', accessToken: 'opaque', accessExpiresAt: new Date(Date.now() + 60_000).toISOString() }) } },
    ] });
    const fixture = TestBed.createComponent(OrderResultPageComponent);
    await fixture.whenStable(); fixture.detectChanges();
    const copy = fixture.nativeElement.textContent as string;
    expect(copy).toContain('Aprobado en la simulación');
    expect(copy).toContain('Pendiente de confirmación');
    expect(copy).toContain('no confirma un cobro');
    expect(copy).not.toContain('Pagado');
    expect(copy).not.toContain('Total abonado');
    TestBed.resetTestingModule();
  });
});
