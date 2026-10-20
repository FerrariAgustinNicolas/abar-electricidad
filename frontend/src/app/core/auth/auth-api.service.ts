import { HttpClient, HttpHeaders, HttpParams, HttpResponse } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { map, Observable } from 'rxjs';
import { AdminSessionView, AdminUserList, AdminUserView, CsrfMetadata, SessionResponse } from './auth.models';

const API = '/api/v1';
const csrfHeaders = (token: string): HttpHeaders => new HttpHeaders({ 'X-CSRF-Token': token });

@Injectable({ providedIn: 'root' })
export class AuthApiService {
  private readonly http = inject(HttpClient);

  csrf(): Observable<CsrfMetadata> {
    return this.http.get<CsrfMetadata>(`${API}/auth/csrf`, { withCredentials: true });
  }

  login(email: string, password: string, csrfToken: string): Observable<SessionResponse> {
    return this.http.post<AdminSessionView>(`${API}/auth/login`, { email, password }, {
      headers: csrfHeaders(csrfToken), withCredentials: true, observe: 'response',
    }).pipe(map((response) => ({ session: requireBody(response), csrfToken: requireCsrf(response) })));
  }

  me(): Observable<SessionResponse> {
    return this.http.get<AdminSessionView>(`${API}/auth/me`, {
      withCredentials: true, observe: 'response',
    }).pipe(map((response) => ({ session: requireBody(response), csrfToken: requireCsrf(response) })));
  }

  logout(csrfToken: string): Observable<void> {
    return this.http.post<void>(`${API}/auth/logout`, null, {
      headers: csrfHeaders(csrfToken), withCredentials: true,
    });
  }

  changePassword(currentPassword: string, newPassword: string, csrfToken: string): Observable<void> {
    return this.http.post<void>(`${API}/auth/change-password`, { currentPassword, newPassword }, {
      headers: csrfHeaders(csrfToken), withCredentials: true, observe: 'response',
    }).pipe(map((response) => { requireCsrf(response); return undefined; }));
  }

  listUsers(page = 1, pageSize = 20, sort = '-createdAt'): Observable<AdminUserList> {
    const params = new HttpParams().set('page', page).set('pageSize', pageSize).set('sort', sort);
    return this.http.get<AdminUserList>(`${API}/admin/users`, { params, withCredentials: true });
  }

  createUser(input: { name: string; email: string; temporaryPassword: string }, csrfToken: string): Observable<AdminUserView> {
    return this.http.post<AdminUserView>(`${API}/admin/users`, input, {
      headers: csrfHeaders(csrfToken), withCredentials: true,
    });
  }

  updateUser(id: string, input: { name?: string; active?: boolean; expectedVersion: number }, csrfToken: string): Observable<AdminUserView> {
    return this.http.patch<AdminUserView>(`${API}/admin/users/${encodeURIComponent(id)}`, input, {
      headers: csrfHeaders(csrfToken), withCredentials: true,
    });
  }

  resetPassword(id: string, input: { temporaryPassword: string; reason: string }, csrfToken: string): Observable<void> {
    return this.http.post<void>(`${API}/admin/users/${encodeURIComponent(id)}/reset-password`, input, {
      headers: csrfHeaders(csrfToken), withCredentials: true,
    });
  }
}

function requireBody<T>(response: HttpResponse<T>): T {
  if (response.body === null) throw new Error('Respuesta inválida del servidor.');
  return response.body;
}

function requireCsrf(response: HttpResponse<unknown>): string {
  const token = response.headers.get('X-CSRF-Token');
  if (!token || !/^[A-Za-z0-9_-]{43}$/.test(token)) throw new Error('Respuesta inválida del servidor.');
  return token;
}
