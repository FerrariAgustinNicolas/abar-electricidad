import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of, Subject } from 'rxjs';
import { CommercialApiService } from '../../core/commercial/commercial-api.service';
import { PaymentMethodView } from '../../core/commercial/commercial.models';
import { AdminPaymentMethodsPageComponent } from './admin-payment-methods-page.component';
const method: PaymentMethodView = { code: 'DEMO_TRANSFER', version: 7, enabled: true, label: 'Transferencia DEMO', instructions: 'Instrucciones ficticias', demo: true, deliveryModes: ['PICKUP'] };
describe('AdminPaymentMethodsPageComponent', () => {
 const api = { getPaymentMethod: vi.fn(() => of(method)), updatePaymentMethod: vi.fn(() => of(method)) };
 beforeEach(() => { vi.clearAllMocks(); TestBed.configureTestingModule({ providers: [provideRouter([]), { provide: CommercialApiService, useValue: api }] }); });
 it('loads and updates the selected method by code with its server version', async () => {
   const component = TestBed.createComponent(AdminPaymentMethodsPageComponent).componentInstance; await Promise.resolve();
   await component.select('DEMO_TRANSFER'); component.instructions = 'Texto ficticio nuevo'; await component.save();
   expect(api.getPaymentMethod).toHaveBeenCalledWith('DEMO_TRANSFER');
   expect(api.updatePaymentMethod).toHaveBeenCalledWith('DEMO_TRANSFER', { expectedVersion: 7, enabled: true, instructions: 'Texto ficticio nuevo', deliveryModes: ['PICKUP'] });
 });
 it('keeps the latest selection and draft when older requests finish later', async () => {
   const fixture = TestBed.createComponent(AdminPaymentMethodsPageComponent); await fixture.whenStable();
   const component = fixture.componentInstance;
   const old = new Subject<PaymentMethodView>(), latest = new Subject<PaymentMethodView>();
   api.getPaymentMethod.mockReturnValueOnce(old).mockReturnValueOnce(latest);
   const first = component.select('DEMO_TRANSFER'), second = component.select('DEMO_SIMULATION');
   latest.next({ ...method, code: 'DEMO_SIMULATION' }); latest.complete(); await second;
   component.instructions = 'DEMO latest draft';
   old.next(method); old.complete(); await first;
   expect(component.method()?.code).toBe('DEMO_SIMULATION');expect(component.instructions).toBe('DEMO latest draft');
 });
 it('locks selection and editable controls while a save is pending', async () => {
   const fixture = TestBed.createComponent(AdminPaymentMethodsPageComponent); await fixture.whenStable();
   const component = fixture.componentInstance, pending = new Subject<PaymentMethodView>();
   api.updatePaymentMethod.mockReturnValueOnce(pending);
   const saving = component.save(); fixture.detectChanges();await fixture.whenStable();
   const controls = [...fixture.nativeElement.querySelectorAll('form input, form textarea')];
   expect(controls.length).toBeGreaterThan(0);expect(controls.every((control: HTMLElement) => control.matches(':disabled'))).toBe(true);
   const calls = api.getPaymentMethod.mock.calls.length;
   await component.select('DEMO_SIMULATION');expect(api.getPaymentMethod.mock.calls.length).toBe(calls);
   pending.next(method);pending.complete();await saving;
 });

});
