import { HttpClient, HttpHeaders, HttpParams } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { AuthSessionService } from '../auth/auth-session.service';
import {
  NotificationFilters,
  NotificationList,
  NotificationView,
  PaymentMethodCode,
  PaymentMethodView,
  PaymentMethodWrite,
  PublicContact,
  SettingsView,
  SettingsWrite,
} from './commercial.models';

const API = '/api/v1';

@Injectable({ providedIn: 'root' })
export class CommercialApiService {
  private readonly http = inject(HttpClient);
  private readonly auth = inject(AuthSessionService);

  getSettings(): Observable<SettingsView> {
    return this.http.get<SettingsView>(`${API}/admin/settings`, { withCredentials: true });
  }

  updateSettings(input: SettingsWrite): Observable<SettingsView> {
    return this.http.patch<SettingsView>(`${API}/admin/settings`, input, this.writeOptions());
  }

  getPaymentMethod(code: PaymentMethodCode): Observable<PaymentMethodView> {
    return this.http.get<PaymentMethodView>(
      `${API}/admin/payment-methods/${encodeURIComponent(code)}`,
      { withCredentials: true },
    );
  }

  updatePaymentMethod(code: PaymentMethodCode, input: PaymentMethodWrite): Observable<PaymentMethodView> {
    return this.http.patch<PaymentMethodView>(
      `${API}/admin/payment-methods/${encodeURIComponent(code)}`,
      input,
      this.writeOptions(),
    );
  }

  listNotifications(filters: NotificationFilters): Observable<NotificationList> {
    let params = new HttpParams()
      .set('page', filters.page)
      .set('pageSize', filters.pageSize);

    if (filters.state) params = params.set('state', filters.state);
    if (filters.orderId) params = params.set('orderId', filters.orderId);
    if (filters.from) params = params.set('from', filters.from);
    if (filters.to) params = params.set('to', filters.to);

    return this.http.get<NotificationList>(`${API}/admin/notifications`, {
      params,
      withCredentials: true,
    });
  }

  retryNotification(id: string, expectedVersion: number): Observable<NotificationView> {
    return this.http.post<NotificationView>(
      `${API}/admin/notifications/${encodeURIComponent(id)}/retry`,
      { expectedVersion },
      this.writeOptions(),
    );
  }

  getPublicContact(): Observable<PublicContact> {
    return this.http.get<PublicContact>(`${API}/public/contact`);
  }

  private writeOptions(): { headers: HttpHeaders; withCredentials: true } {
    return {
      headers: new HttpHeaders({ 'X-CSRF-Token': this.auth.getTokenOrThrow() }),
      withCredentials: true,
    };
  }
}
