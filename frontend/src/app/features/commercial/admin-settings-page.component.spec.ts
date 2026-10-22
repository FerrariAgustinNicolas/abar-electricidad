import { HttpErrorResponse } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of, throwError } from 'rxjs';
import { CommercialApiService } from '../../core/commercial/commercial-api.service';
import { SettingsView } from '../../core/commercial/commercial.models';
import { AdminSettingsPageComponent } from './admin-settings-page.component';

const data: SettingsView = { version: 2, feeMinor: '9007199254740993', enabledDeliveryModes: ['PICKUP'], contact: { displayName: 'Demo', email: 'demo@example.test', phone: '', whatsapp: '', hours: '', address: '' }, paymentMethods: [] };
describe('AdminSettingsPageComponent', () => {
 const api = { getSettings: vi.fn(() => of(data)), updateSettings: vi.fn(() => of(data)) };
 beforeEach(() => { vi.clearAllMocks(); TestBed.configureTestingModule({ providers: [provideRouter([]), { provide: CommercialApiService, useValue: api }] }); });
 it('keeps the fee string exact and preserves the draft after a version conflict', async () => {
   api.updateSettings.mockReturnValueOnce(throwError(() => new HttpErrorResponse({ status: 409 })));
   const fixture = TestBed.createComponent(AdminSettingsPageComponent); const component = fixture.componentInstance; await fixture.whenStable();
   component.feeMinor = '9007199254740995'; await component.save();
   expect(component.feeMinor).toBe('9007199254740995'); expect(component.conflict()).toBe(true); expect(api.updateSettings).toHaveBeenCalledWith(expect.objectContaining({ feeMinor: '9007199254740995', expectedVersion: 2 }));
 });
});
