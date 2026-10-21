import { HttpClient, HttpHeaders, HttpParams } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { AuthSessionService } from '../../core/auth/auth-session.service';
import {
  AdminOrderDetail, AdminOrderFilters, AdminOrderList, CancelOrderRequest, OrderMutationResponse,
  OrderNote, OrderNoteRequest, OrderStatusRequest, PaymentConfirmationRequest, PaymentConfirmationResponse,
} from './admin-orders.models';

const API = '/api/v1/admin/orders';

@Injectable({ providedIn: 'root' })
export class AdminOrdersApiService {
  private readonly http = inject(HttpClient);
  private readonly auth = inject(AuthSessionService);

  list(filters: AdminOrderFilters): Observable<AdminOrderList> {
    let params = new HttpParams();
    for (const [key, value] of Object.entries(filters)) {
      if (value !== undefined && value !== '') params = params.set(key, String(value));
    }
    return this.http.get<AdminOrderList>(API, { params, withCredentials: true });
  }

  get(id: string): Observable<AdminOrderDetail> {
    return this.http.get<AdminOrderDetail>(`${API}/${encodeURIComponent(id)}`, { withCredentials: true });
  }

  confirmPayment(id: string, input: PaymentConfirmationRequest, idempotencyKey: string): Observable<PaymentConfirmationResponse> {
    return this.http.post<PaymentConfirmationResponse>(`${API}/${encodeURIComponent(id)}/payment-confirmation`, input, this.writeOptions(idempotencyKey));
  }

  updateStatus(id: string, input: OrderStatusRequest, idempotencyKey: string): Observable<OrderMutationResponse> {
    return this.http.patch<OrderMutationResponse>(`${API}/${encodeURIComponent(id)}/status`, input, this.writeOptions(idempotencyKey));
  }

  cancel(id: string, input: CancelOrderRequest, idempotencyKey: string): Observable<OrderMutationResponse> {
    return this.http.post<OrderMutationResponse>(`${API}/${encodeURIComponent(id)}/cancel`, input, this.writeOptions(idempotencyKey));
  }

  addNote(id: string, input: OrderNoteRequest, idempotencyKey: string): Observable<OrderNote> {
    return this.http.post<OrderNote>(`${API}/${encodeURIComponent(id)}/notes`, input, this.writeOptions(idempotencyKey));
  }

  private writeOptions(idempotencyKey: string): { headers: HttpHeaders; withCredentials: true } {
    const token = this.auth.tokenForWrite();
    if (!token) throw new Error('La sesión venció. Inicie sesión nuevamente.');
    const headers = new HttpHeaders().set('X-CSRF-Token', token).set('Idempotency-Key', idempotencyKey);
    return { headers, withCredentials: true };
  }
}
