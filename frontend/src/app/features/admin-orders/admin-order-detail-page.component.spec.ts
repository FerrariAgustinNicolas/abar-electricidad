import { HttpErrorResponse } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, provideRouter } from '@angular/router';
import { of, throwError } from 'rxjs';
import { AuthSessionService } from '../../core/auth/auth-session.service';
import { AdminOrdersApiService } from './admin-orders-api.service';
import { AdminOrderDetail, PaymentConfirmationRequest } from './admin-orders.models';
import { AdminOrderDetailPageComponent } from './admin-order-detail-page.component';

describe('AdminOrderDetailPageComponent', () => {
  const order: AdminOrderDetail = {
    orderId: 'order-1', orderNumber: 'AB-1001', createdAt: '2026-10-21T12:00:00Z', version: 3,
    orderStatus: 'RECEIVED', paymentStatus: 'PENDING', deliveryMode: 'PICKUP',
    customer: { firstName: 'Ana', lastName: 'Pérez', email: 'ana@example.test', phone: '123456789' },
    total: { amountMinor: '9007199254740993', currency: 'ARS' },
    allowedActions: { confirmPayment: true, cancel: true, markReady: false, markDelivered: false, addNote: true },
    paymentId: 'payment-1', paymentAmount: { amountMinor: '9007199254740993', currency: 'ARS' },
    currentAttempt: { id: 'attempt-1', methodCode: 'DEMO_SIMULATION', status: 'APPROVED', sequence: 1, createdAt: '2026-10-21T12:01:00Z', demoMode: true },
    items: [{ presentationId: 'presentation-1', productId: 'product-1', productSlug: 'cable', productName: 'Cable', unit: 'UNIT', rollLengthMeters: null, quantity: 2, unitPrice: { amountMinor: '100', currency: 'ARS' }, lineTotal: { amountMinor: '200', currency: 'ARS' } }],
    subtotal: { amountMinor: '9007199254740993', currency: 'ARS' }, deliveryFee: { amountMinor: '0', currency: 'ARS' },
    stock: [{ presentationId: 'presentation-1', unit: 'UNIT', quantity: 2, availableQuantity: 4, version: 7 }], history: [], notes: [],
  };
  const api = {
    get: vi.fn(() => of(order)),
    confirmPayment: vi.fn((...args: [string, PaymentConfirmationRequest, string]) => { void args; return throwError(() => new HttpErrorResponse({ status: 0 })); }),
    updateStatus: vi.fn(() => of({})), cancel: vi.fn(() => of({})), addNote: vi.fn(() => of({})),
  };

  beforeEach(() => {
    sessionStorage.clear(); vi.clearAllMocks(); api.get.mockReturnValue(of(order));
    TestBed.configureTestingModule({ providers: [provideRouter([]),
      { provide: ActivatedRoute, useValue: { snapshot: { paramMap: { get: () => 'order-1' } } } },
      { provide: AdminOrdersApiService, useValue: api },
      { provide: AuthSessionService, useValue: { expire: vi.fn() } },
    ] });
  });

  it('keeps simulation approval separate from commercial payment and shows the frozen full-amount review', async () => {
    const fixture = TestBed.createComponent(AdminOrderDetailPageComponent);
    await fixture.whenStable(); fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Aprobado en la simulación');
    expect(fixture.nativeElement.textContent).toContain('Pago comercial: Pendiente');
    expect(fixture.nativeElement.textContent).toContain('Confirmación manual del pago');
    expect(fixture.nativeElement.textContent).not.toContain('Pago comercial: Pagado');
    expect(fixture.nativeElement.textContent).toContain('Saldo suficiente');
    expect(fixture.componentInstance.formatMoney(order.paymentAmount.amountMinor)).not.toContain('9007199254740992');
  });

  it('reuses the exact pending payment body and key after an unknown response', async () => {
    const component = TestBed.createComponent(AdminOrderDetailPageComponent).componentInstance;
    await Promise.resolve();
    component.reviewPayment(); component.paymentAcknowledged.set(true);
    await component.confirmPayment();
    const firstCall = api.confirmPayment.mock.calls[0];
    expect(firstCall?.[1]).toEqual({ expectedVersion: 3, attemptId: 'attempt-1', confirmedAmount: order.paymentAmount });
    expect(firstCall?.[2]).toMatch(/^[A-Za-z0-9_-]{16,200}$/);
    expect(component.pendingIntent()).not.toBeNull();

    await component.retrySameIntent();
    expect(api.confirmPayment).toHaveBeenCalledTimes(2);
    expect(api.confirmPayment.mock.calls[1]).toEqual(firstCall);
  });

  it('never offers cancellation for a paid order, even if an inconsistent action flag says otherwise', async () => {
    api.get.mockReturnValue(of({ ...order, paymentStatus: 'PAID', allowedActions: { ...order.allowedActions, cancel: true } }));
    const fixture = TestBed.createComponent(AdminOrderDetailPageComponent);
    await fixture.whenStable(); fixture.detectChanges();
    expect(fixture.nativeElement.textContent).not.toContain('Cancelar pedido impago');
  });

  it('refreshes after a version conflict without retrying the mutation', async () => {
    const conflict = new HttpErrorResponse({ status: 409, error: { code: 'VERSION_CONFLICT' } });
    api.confirmPayment.mockReturnValueOnce(throwError(() => conflict));
    api.get.mockReturnValueOnce(of(order)).mockReturnValueOnce(of({ ...order, version: 4 }));
    const component = TestBed.createComponent(AdminOrderDetailPageComponent).componentInstance;
    await Promise.resolve();
    component.reviewPayment(); component.paymentAcknowledged.set(true);
    await component.confirmPayment();
    expect(api.confirmPayment).toHaveBeenCalledTimes(1);
    expect(api.get).toHaveBeenCalledTimes(2);
    expect(component.order()?.version).toBe(4);
    expect(component.pendingIntent()).toBeNull();
    expect(component.error()).toContain('Revise el estado actualizado');
  });
});
