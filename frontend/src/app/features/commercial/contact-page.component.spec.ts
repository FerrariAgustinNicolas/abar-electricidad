import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { CommercialApiService } from '../../core/commercial/commercial-api.service';
import { ContactPageComponent } from './contact-page.component';
describe('ContactPageComponent', () => {
 const api = { getPublicContact: vi.fn(() => of({ demo: true, version: 1, contact: { displayName: 'Demo', email: 'contact@example.test', phone: '', whatsapp: '+5491112345678', hours: '', address: '' } })) };
 beforeEach(() => { vi.clearAllMocks(); TestBed.configureTestingModule({ providers: [{ provide: CommercialApiService, useValue: api }] }); });
 it('creates a manual WhatsApp link only for a valid configured international number', async () => {
   const fixture = TestBed.createComponent(ContactPageComponent); await fixture.whenStable(); fixture.detectChanges();
   expect(fixture.nativeElement.textContent).toContain('Datos ficticios de demostración');
   expect(fixture.nativeElement.querySelector('a[target="_blank"]').getAttribute('href')).toBe('https://wa.me/5491112345678');
   expect(fixture.componentInstance.whatsappUrl('not-a-phone')).toBeNull();
 });
});
