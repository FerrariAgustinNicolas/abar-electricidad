import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of } from 'rxjs';
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
});
