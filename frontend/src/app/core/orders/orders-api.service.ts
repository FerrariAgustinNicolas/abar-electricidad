import { HttpClient, HttpHeaders, HttpResponse } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { PublicPaymentMethods } from '../cart/cart.models';
import {
  CreateAttemptRequest, CreateAttemptResponse, CreateOrderRequest, CreateOrderResponse,
  H4Terms, OrderLookupRequest, OrderLookupResponse, PublicOrderView,
} from './orders.models';

const API = '/api/v1/public';

@Injectable({ providedIn: 'root' })
export class OrdersApiService {
  private readonly http = inject(HttpClient);

  terms(): Observable<H4Terms> { return this.http.get<H4Terms>(`${API}/checkout/terms`); }

  createOrder(body: CreateOrderRequest, idempotencyKey: string): Observable<HttpResponse<CreateOrderResponse>> {
    return this.http.post<CreateOrderResponse>(`${API}/orders`, body, { headers: { 'Idempotency-Key': idempotencyKey }, observe: 'response' });
  }

  paymentMethods(deliveryMode: 'PICKUP' | 'COORDINATED'): Observable<PublicPaymentMethods> {
    return this.http.get<PublicPaymentMethods>(`${API}/payment-methods`, { params: { deliveryMode } });
  }

  getOrder(orderId: string, accessToken: string): Observable<PublicOrderView> {
    return this.http.get<PublicOrderView>(`${API}/orders/${encodeURIComponent(orderId)}`, {
      headers: new HttpHeaders({ 'X-Order-Access-Token': accessToken }),
    });
  }

  lookup(body: OrderLookupRequest): Observable<OrderLookupResponse> {
    return this.http.post<OrderLookupResponse>(`${API}/orders/lookup`, body);
  }

  createAttempt(orderId: string, accessToken: string, body: CreateAttemptRequest, idempotencyKey: string): Observable<CreateAttemptResponse> {
    return this.http.post<CreateAttemptResponse>(`${API}/orders/${encodeURIComponent(orderId)}/payment-attempts`, body, {
      headers: new HttpHeaders({ 'X-Order-Access-Token': accessToken, 'Idempotency-Key': idempotencyKey }),
    });
  }
}
