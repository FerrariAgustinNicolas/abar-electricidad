import { HttpErrorResponse } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { throwError } from 'rxjs';
import { vi } from 'vitest';
import { OrdersApiService } from '../../core/orders/orders-api.service';
import { OrderLookupPageComponent } from './order-lookup-page.component';

describe('OrderLookupPageComponent', () => {
  it('uses a generic not-found message and does not try to restore access credentials', async () => {
    const lookup = vi.fn(() => throwError(() => new HttpErrorResponse({ status: 404 })));
    TestBed.configureTestingModule({ imports: [OrderLookupPageComponent], providers: [
      provideRouter([]), { provide: OrdersApiService, useValue: { lookup } },
    ] });
    const fixture = TestBed.createComponent(OrderLookupPageComponent);
    const component = fixture.componentInstance;
    component.form.setValue({ orderNumber: 'AB-100', contact: 'ada@example.test' });
    await component.lookup(); fixture.detectChanges();
    expect(lookup).toHaveBeenCalledWith({ orderNumber: 'AB-100', contact: 'ada@example.test' });
    expect(component.error()).toBe('No se encontró un pedido con esos datos o no fue posible realizar la consulta. Revisá la información e intentá nuevamente.');
    expect(fixture.nativeElement.textContent).not.toContain('token');
    TestBed.resetTestingModule();
  });
});
