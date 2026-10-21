import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { Router, RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { AuthSessionService } from '../../core/auth/auth-session.service';
import { formatMoney } from '../catalog/format-money';
import { AdminOrdersApiService } from './admin-orders-api.service';
import { AdminOrderList, DeliveryMode, OrderStatus, PaymentStatus } from './admin-orders.models';

@Component({
  selector: 'abar-admin-orders-list-page', standalone: true, imports: [DatePipe, ReactiveFormsModule, RouterLink],
  template: `
    <section aria-labelledby="orders-title">
      <header class="page-heading"><div><p class="eyebrow">Administración</p><h1 id="orders-title">Pedidos</h1><p>Consulte pedidos e intentos; un intento aprobado no confirma el pago comercial.</p></div></header>
      <form class="panel filters" [formGroup]="filters" (ngSubmit)="search()" aria-label="Filtros de pedidos">
        <label for="order-search">Buscar por número o datos autorizados<input id="order-search" formControlName="search" maxlength="100" autocomplete="off"></label>
        <label for="order-status">Estado del pedido<select id="order-status" formControlName="orderStatus"><option value="">Todos</option><option value="RECEIVED">Recibido</option><option value="PREPARING">En preparación</option><option value="READY">Listo</option><option value="DELIVERED">Entregado</option><option value="CANCELLED">Cancelado</option></select></label>
        <label for="payment-status">Estado del pago<select id="payment-status" formControlName="paymentStatus"><option value="">Todos</option><option value="PENDING">Pendiente</option><option value="REJECTED">Rechazado</option><option value="PAID">Pagado</option></select></label>
        <label for="delivery-mode">Modalidad<select id="delivery-mode" formControlName="deliveryMode"><option value="">Todas</option><option value="PICKUP">Retiro</option><option value="COORDINATED">Entrega coordinada</option></select></label>
        <label for="orders-from">Desde<input id="orders-from" type="date" formControlName="from"></label>
        <label for="orders-to">Hasta<input id="orders-to" type="date" formControlName="to"></label>
        <button type="submit" [disabled]="loading()">Buscar</button>
      </form>
      @if (error()) { <p class="error" role="alert">{{ error() }}</p> }
      @if (error()) { <button class="button-secondary" type="button" (click)="load(page())" [disabled]="loading()">Reintentar consulta</button> }
      @if (loading() && !result()) { <p role="status">Cargando pedidos…</p> }
      @if (loading() && result()) { <p role="status">Actualizando pedidos…</p> }
      @if (!loading() && result()?.items?.length === 0) { <p class="empty-state">No hay pedidos para estos filtros.</p> }
      @if (result()?.items?.length) {
        <div class="table-wrap"><table><caption>Pedidos ({{ result()!.pageInfo.totalItems }})</caption>
          <thead><tr><th scope="col">Pedido</th><th scope="col">Comprador</th><th scope="col">Pedido / pago</th><th scope="col">Modalidad</th><th scope="col">Total congelado</th><th scope="col">Acción</th></tr></thead>
          <tbody>@for (order of result()!.items; track order.orderId) {
            <tr><td><strong>{{ order.orderNumber }}</strong><span class="subtle">{{ order.createdAt | date:'short' }}</span></td>
              <td>{{ order.customer.firstName }} {{ order.customer.lastName }}<span class="subtle">{{ order.customer.email }} · {{ order.customer.phone }}</span></td>
              <td><span class="status-badge">Pedido: {{ orderLabel(order.orderStatus) }}</span><span class="status-badge">Pago: {{ paymentLabel(order.paymentStatus) }}</span></td>
              <td>{{ order.deliveryMode === 'PICKUP' ? 'Retiro' : 'Entrega coordinada' }}</td>
              <td>{{ formatMoney(order.total.amountMinor) }}</td>
              <td><a [routerLink]="['/admin/pedidos', order.orderId]">Ver detalle</a></td></tr>
          }</tbody>
        </table></div>
        <nav class="pagination" aria-label="Paginación de pedidos">
          <button class="button-secondary" type="button" (click)="load(page() - 1)" [disabled]="loading() || page() <= 1">Anterior</button>
          <span>Página {{ page() }} de {{ result()!.pageInfo.totalPages || 1 }} · {{ result()!.pageInfo.totalItems }} pedidos</span>
          <button class="button-secondary" type="button" (click)="load(page() + 1)" [disabled]="loading() || page() >= result()!.pageInfo.totalPages">Siguiente</button>
        </nav>
      }
    </section>
  `,
  styles: [`.filters{display:grid;grid-template-columns:repeat(auto-fit,minmax(12rem,1fr));gap:1rem;margin:1.25rem 0;padding:1rem}.filters label{display:grid;gap:.35rem}.filters input,.filters select{min-height:2.7rem;padding:.45rem;border:1px solid var(--color-border);border-radius:.35rem;font:inherit}.filters button{align-self:end;min-height:2.7rem}.subtle{display:block;color:var(--color-text-muted,#59636e);font-size:.9rem;margin-top:.2rem}.status-badge{display:inline-block;margin:.1rem .2rem .1rem 0;padding:.2rem .45rem;border-radius:1rem;background:var(--color-surface-subtle,#f1f3f5)}.error{color:#8a2d19}`],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminOrdersListPageComponent {
  private readonly fb = inject(FormBuilder).nonNullable;
  private readonly api = inject(AdminOrdersApiService);
  private readonly auth = inject(AuthSessionService);
  private readonly router = inject(Router);
  readonly filters = this.fb.group({ search: '', orderStatus: '', paymentStatus: '', deliveryMode: '', from: '', to: '' });
  readonly result = signal<AdminOrderList | null>(null);
  readonly page = signal(1);
  readonly loading = signal(false);
  readonly error = signal('');
  readonly formatMoney = formatMoney;

  constructor() { void this.load(1); }

  search(): void { void this.load(1); }

  async load(page: number): Promise<void> {
    if (this.loading()) return;
    this.loading.set(true); this.error.set('');
    const value = this.filters.getRawValue();
    try {
      const result = await firstValueFrom(this.api.list({
        page, pageSize: 20,
        ...(value.search.trim() ? { search: value.search.trim() } : {}),
        ...(value.orderStatus ? { orderStatus: value.orderStatus as OrderStatus } : {}),
        ...(value.paymentStatus ? { paymentStatus: value.paymentStatus as PaymentStatus } : {}),
        ...(value.deliveryMode ? { deliveryMode: value.deliveryMode as DeliveryMode } : {}),
        ...(value.from ? { from: new Date(`${value.from}T00:00:00.000Z`).toISOString() } : {}),
        ...(value.to ? { to: new Date(`${value.to}T23:59:59.999Z`).toISOString() } : {}),
      }));
      this.result.set(result); this.page.set(page);
    } catch (error: unknown) {
      if (error instanceof HttpErrorResponse && error.status === 401) {
        this.auth.expire(); await this.router.navigate(['/admin/login'], { queryParams: { returnUrl: '/admin/pedidos' } });
      } else if (error instanceof HttpErrorResponse && error.status === 403) this.error.set('La sesión no permite consultar pedidos. Verifique el acceso administrativo.');
      else this.error.set('No se pudieron cargar los pedidos. Revise la conexión e intente nuevamente.');
    } finally { this.loading.set(false); }
  }

  orderLabel(status: OrderStatus): string {
    return ({ RECEIVED: 'Recibido', PREPARING: 'En preparación', READY: 'Listo', DELIVERED: 'Entregado', CANCELLED: 'Cancelado' })[status];
  }
  paymentLabel(status: PaymentStatus): string { return ({ PENDING: 'Pendiente', REJECTED: 'Rechazado', PAID: 'Pagado' })[status]; }
}
