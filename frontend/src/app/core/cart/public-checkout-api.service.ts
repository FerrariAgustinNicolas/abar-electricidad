import { HttpClient, HttpParams } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { DeliveryMode, PublicPaymentMethods, PublicSettings, QuoteRequest, QuoteResponse } from './cart.models';

const API = '/api/v1/public';

@Injectable({ providedIn: 'root' })
export class PublicCheckoutApiService {
  private readonly http = inject(HttpClient);

  settings(): Observable<PublicSettings> { return this.http.get<PublicSettings>(`${API}/settings`); }

  paymentMethods(deliveryMode: DeliveryMode): Observable<PublicPaymentMethods> {
    const params = new HttpParams().set('deliveryMode', deliveryMode);
    return this.http.get<PublicPaymentMethods>(`${API}/payment-methods`, { params });
  }

  quote(request: QuoteRequest): Observable<QuoteResponse> {
    return this.http.post<QuoteResponse>(`${API}/checkout/quotes`, request);
  }
}
