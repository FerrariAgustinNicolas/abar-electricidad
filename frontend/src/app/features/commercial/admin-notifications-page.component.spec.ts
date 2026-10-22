import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { CommercialApiService } from '../../core/commercial/commercial-api.service';
import { NotificationList, NotificationView } from '../../core/commercial/commercial.models';
import { AdminNotificationsPageComponent } from './admin-notifications-page.component';
const failed: NotificationView = { id: 'job-1', orderId: 'order-1', kind: 'ORDER_CREATED_BUYER', state: 'FAILED', version: 3, attemptCount: 5, nextAttemptAt: null, sentAt: null, lastError: 'SMTP_UNAVAILABLE', createdAt: '2026-10-22T10:00:00.000Z' };
const listing: NotificationList = { items: [failed, { ...failed, id: 'job-2', state: 'SENT', sentAt: '2026-10-22T11:00:00.000Z', version: 1 }], pageInfo: { page: 1, pageSize: 20, totalItems: 2, totalPages: 1 } };
describe('AdminNotificationsPageComponent', () => {
 const api = { listNotifications: vi.fn(() => of(listing)), retryNotification: vi.fn(() => of(failed)) };
 beforeEach(() => { vi.clearAllMocks(); TestBed.configureTestingModule({ providers: [provideRouter([]), { provide: CommercialApiService, useValue: api }] }); });
 it('renders safe status data and permits manual retry only for FAILED or RETRY_WAIT jobs', async () => {
   const fixture = TestBed.createComponent(AdminNotificationsPageComponent); await fixture.whenStable(); fixture.detectChanges();
   expect(fixture.nativeElement.textContent).toContain('SMTP_UNAVAILABLE');
   expect(fixture.nativeElement.textContent).toContain('Enviado');
   expect(fixture.nativeElement.textContent).toContain(fixture.componentInstance.formatDate('2026-10-22T11:00:00.000Z'));
   const buttons = Array.from(fixture.nativeElement.querySelectorAll('tbody button')) as HTMLButtonElement[];
   expect(buttons).toHaveLength(1); expect(buttons[0].textContent).toContain('Reintentar');
   await fixture.componentInstance.retry(failed);
   expect(api.retryNotification).toHaveBeenCalledWith('job-1', 3);
 });
});
