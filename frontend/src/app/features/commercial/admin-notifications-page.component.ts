import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { AuthSessionService } from '../../core/auth/auth-session.service';
import { CommercialApiService } from '../../core/commercial/commercial-api.service';
import {
  NotificationList,
  NotificationState,
  NotificationView,
} from '../../core/commercial/commercial.models';

@Component({
  selector: 'abar-admin-notifications-page',
  standalone: true,
  imports: [FormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="page">
      <p class="eyebrow">Administración · DEMO</p>
      <h1>Notificaciones</h1>
      <p>Estado de avisos registrados. Los destinatarios y contenidos privados no se muestran.</p>
      <form class="filters" (ngSubmit)="search()">
        <label>Estado
          <select name="state" [disabled]="loading() || !!retrying()" [(ngModel)]="state">
            <option value="">Todos</option>
            @for (value of states; track value) {
              <option [value]="value">{{ value }}</option>
            }
          </select>
        </label>
        <label>Pedido<input name="orderId" [disabled]="loading() || !!retrying()" [(ngModel)]="orderId" maxlength="64"></label>
        <label>Desde<input name="from" type="date" [disabled]="loading() || !!retrying()" [(ngModel)]="from"></label>
        <label>Hasta<input name="to" type="date" [disabled]="loading() || !!retrying()" [(ngModel)]="to"></label>
        <button type="submit" [disabled]="loading() || !!retrying()">Filtrar</button>
      </form>
      @if (error()) {
        <p role="alert" class="alert">{{ error() }}</p>
      }
      @if (loading()) {
        <p role="status">Cargando avisos…</p>
      }
      @if (result(); as data) {
        <p>{{ data.pageInfo.totalItems }} aviso(s) · Página {{ data.pageInfo.page }} de {{ data.pageInfo.totalPages || 1 }}</p>
        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Pedido</th><th>Tipo</th><th>Estado</th><th>Intentos</th>
                <th>Próximo envío</th><th>Enviado</th><th>Último error</th><th>Creado</th><th>Acción</th>
              </tr>
            </thead>
            <tbody>
              @for (row of data.items; track row.id) {
                <tr>
                  <td>{{ row.orderId }}</td>
                  <td>{{ kindLabel(row.kind) }}</td>
                  <td>{{ row.state }}</td>
                  <td>{{ row.attemptCount }}</td>
                  <td>{{ row.nextAttemptAt ? formatDate(row.nextAttemptAt) : '—' }}</td>
                  <td>{{ row.sentAt ? formatDate(row.sentAt) : '—' }}</td>
                  <td>{{ row.lastError || '—' }}</td>
                  <td>{{ formatDate(row.createdAt) }}</td>
                  <td>
                    @if (canRetry(row)) {
                      <button type="button" [disabled]="loading() || !!retrying()" (click)="retry(row)">
                        {{ retrying() === row.id ? 'Reintentando…' : 'Reintentar' }}
                      </button>
                    } @else {
                      —
                    }
                  </td>
                </tr>
              }
            </tbody>
          </table>
        </div>
        @if (!data.items.length) {
          <p>No hay avisos para estos filtros.</p>
        }
        <nav class="paging" aria-label="Paginación">
          <button type="button" [disabled]="data.pageInfo.page <= 1 || loading() || !!retrying()"
            (click)="load(data.pageInfo.page - 1)">Anterior</button>
          <button type="button" [disabled]="data.pageInfo.page >= data.pageInfo.totalPages || loading() || !!retrying()"
            (click)="load(data.pageInfo.page + 1)">Siguiente</button>
        </nav>
      }
    </section>
  `,
  styles: [`
    .page { max-width: 75rem; margin: auto; padding: 1rem; }
    .filters { display: grid; grid-template-columns: repeat(auto-fit, minmax(10rem, 1fr));
      gap: .8rem; align-items: end; margin: 1rem 0; }
    .filters label { display: grid; gap: .3rem; }
    .table-wrap { overflow-x: auto; }
    table { width: 100%; border-collapse: collapse; }
    th, td { text-align: left; padding: .55rem; border-bottom: 1px solid var(--color-border, #aab2bc); }
    .alert { padding: 1rem; color: #8a2d19; }
    .paging { display: flex; justify-content: space-between; margin-top: 1rem; }
    .eyebrow { font-weight: 700; }
  `],
})
export class AdminNotificationsPageComponent {
  private readonly api = inject(CommercialApiService);
  private readonly auth = inject(AuthSessionService);
  private readonly router = inject(Router);

  readonly states: NotificationState[] = ['PENDING', 'PROCESSING', 'RETRY_WAIT', 'SENT', 'FAILED'];
  readonly result = signal<NotificationList | null>(null);
  readonly loading = signal(false);
  readonly error = signal('');
  readonly retrying = signal('');

  state = '';
  orderId = '';
  from = '';
  to = '';

  constructor() {
    void this.load(1);
  }

  async search(): Promise<void> {
    await this.load(1);
  }

  async load(page: number): Promise<void> {
    if (this.loading() || this.retrying()) return;

    this.loading.set(true);
    this.error.set('');
    try {
      const result = await firstValueFrom(this.api.listNotifications({
        page,
        pageSize: 20,
        ...(this.state ? { state: this.state as NotificationState } : {}),
        ...(this.orderId.trim() ? { orderId: this.orderId.trim() } : {}),
        ...(this.from ? { from: new Date(`${this.from}T00:00:00.000Z`).toISOString() } : {}),
        ...(this.to ? { to: new Date(`${this.to}T23:59:59.999Z`).toISOString() } : {}),
      }));
      this.result.set(result);
    } catch (error: unknown) {
      await this.handle(error, 'No se pudieron cargar los avisos.');
    } finally {
      this.loading.set(false);
    }
  }

  canRetry(row: NotificationView): boolean {
    return row.state === 'FAILED' || row.state === 'RETRY_WAIT';
  }

  async retry(row: NotificationView): Promise<void> {
    if (!this.canRetry(row) || this.retrying() || this.loading()) return;

    this.retrying.set(row.id);
    this.error.set('');
    try {
      await firstValueFrom(this.api.retryNotification(row.id, row.version));
      this.retrying.set('');
      await this.load(this.result()?.pageInfo.page ?? 1);
    } catch (error: unknown) {
      const message = error instanceof HttpErrorResponse && error.status === 409
        ? 'No se pudo reintentar: el aviso ya cambió o no es elegible. Actualice la lista.'
        : 'No se pudo reintentar el aviso.';
      await this.handle(error, message);
    } finally {
      this.retrying.set('');
    }
  }

  formatDate(value: string): string {
    return new Intl.DateTimeFormat('es-AR', { dateStyle: 'short', timeStyle: 'short' })
      .format(new Date(value));
  }

  kindLabel(kind: string): string {
    const labels: Record<string, string> = {
      ORDER_CREATED_BUYER: 'Pedido creado · comprador',
      ORDER_CREATED_ADMIN: 'Pedido creado · administración',
      PAYMENT_CONFIRMED_BUYER: 'Pago confirmado · comprador',
      PAYMENT_CONFIRMED_ADMIN: 'Pago confirmado · administración',
      ORDER_READY_BUYER: 'Pedido listo · comprador',
      ORDER_CANCELLED_BUYER: 'Pedido cancelado · comprador',
      ORDER_CANCELLED_ADMIN: 'Pedido cancelado · administración',
    };
    return labels[kind] ?? 'Aviso DEMO';
  }

  private async handle(error: unknown, fallback: string): Promise<void> {
    if (error instanceof HttpErrorResponse && error.status === 401) {
      this.auth.expire();
      await this.router.navigate(['/admin/login'], {
        queryParams: { returnUrl: '/admin/notificaciones' },
      });
    } else {
      this.error.set(error instanceof HttpErrorResponse && error.status === 403
        ? 'La sesión no permite consultar o reintentar avisos.'
        : fallback);
    }
  }
}
