import { HttpClient, HttpParams } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { H7Filters, H7SalesReport } from './h7-reports.models';

const API = '/api/v1/admin';

@Injectable({ providedIn: 'root' })
export class H7ReportsApiService {
  private readonly http = inject(HttpClient);

  dashboard(filters: H7Filters): Observable<H7SalesReport> {
    return this.http.get<H7SalesReport>(`${API}/dashboard`, { params: filtersToParams(filters), withCredentials: true });
  }

  report(filters: H7Filters): Observable<H7SalesReport> {
    return this.http.get<H7SalesReport>(`${API}/reports/sales`, { params: filtersToParams(filters), withCredentials: true });
  }

  export(filters: H7Filters): Observable<Blob> {
    return this.http.get(`${API}/reports/sales/export`, {
      params: filtersToParams(filters), withCredentials: true, responseType: 'blob',
    });
  }
}

function filtersToParams(filters: H7Filters): HttpParams {
  let params = new HttpParams().set('from', filters.from).set('to', filters.to);
  if (filters.methodCode) params = params.set('methodCode', filters.methodCode);
  if (filters.orderStatus) params = params.set('orderStatus', filters.orderStatus);
  if (filters.paymentStatus) params = params.set('paymentStatus', filters.paymentStatus);
  return params;
}
