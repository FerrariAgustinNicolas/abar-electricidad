import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { map, Observable } from 'rxjs';
import { HealthOk } from './health-ok';

@Injectable({ providedIn: 'root' })
export class HealthApiService {
  private readonly http = inject(HttpClient);

  check(): Observable<HealthOk> {
    return this.http.get<unknown>('/health').pipe(
      map((response): HealthOk => {
        if (typeof response !== 'object' || response === null || !('status' in response) || response.status !== 'ok') {
          throw new Error('La respuesta de salud no cumple el contrato.');
        }
        return { status: 'ok' };
      }),
    );
  }
}
