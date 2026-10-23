import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, inject, OnDestroy, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { Subscription } from 'rxjs';
import { AuthSessionService } from '../../core/auth/auth-session.service';
import { formatMoney } from '../catalog/format-money';
import { currentBuenosAiresMonth, H7_CLOCK } from './h7-period';
import { H7ReportsApiService } from './h7-reports-api.service';
import { H7Filters, H7MethodCode, H7OrderStatus, H7SalesReport } from './h7-reports.models';
import { isPasswordChangeRequired } from './h7-admin-error';

@Component({
  selector: 'abar-admin-reports-page', standalone: true, imports: [FormsModule, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section aria-labelledby="reports-title">
      <header class="page-heading"><div><p class="eyebrow">Administración · DEMO académica</p><h1 id="reports-title">Reportes de ventas</h1>
        <p>Las ventas se atribuyen a su confirmación. Los pedidos creados usan una fecha independiente.</p></div>
        <a routerLink="/admin/dashboard">Volver al resumen</a></header>
      <form class="panel filters" (ngSubmit)="load()" aria-label="Filtros de reportes">
        <label for="report-from">Desde (incluido)<input id="report-from" name="from" type="date" required [(ngModel)]="filters.from" (ngModelChange)="filtersChanged()"></label>
        <label for="report-to">Hasta (exclusivo)<input id="report-to" name="to" type="date" required [(ngModel)]="filters.to" (ngModelChange)="filtersChanged()"></label>
        <label for="report-method">Método de pago<select id="report-method" name="methodCode" [(ngModel)]="filters.methodCode" (ngModelChange)="filtersChanged()">
          <option [ngValue]="null">Todos</option><option value="DEMO_SIMULATION">Simulación DEMO</option>
          <option value="DEMO_PAY_ON_PICKUP">Pago al retirar DEMO</option><option value="DEMO_TRANSFER">Transferencia DEMO</option>
        </select></label>
        <label for="report-order-status">Estado actual del pedido<select id="report-order-status" name="orderStatus" [(ngModel)]="filters.orderStatus" (ngModelChange)="filtersChanged()">
          <option [ngValue]="null">Todos</option><option value="RECEIVED">Recibido</option><option value="PREPARING">En preparación</option>
          <option value="READY">Listo</option><option value="DELIVERED">Entregado</option><option value="CANCELLED">Cancelado</option>
        </select></label>
        <label for="report-payment-status">Estado actual del pago<select id="report-payment-status" name="paymentStatus" [(ngModel)]="filters.paymentStatus" (ngModelChange)="filtersChanged()">
          <option [ngValue]="null">Todos</option><option value="PENDING">Pendiente</option><option value="REJECTED">Rechazado</option><option value="PAID">Pagado</option>
        </select></label>
        <button type="submit" [disabled]="loading() || !validPeriod()">{{ loading() ? 'Consultando…' : 'Consultar' }}</button>
      </form>
      <p class="period-note">Período {{ filters.from }} a {{ filters.to }} en America/Argentina/Buenos_Aires; [desde, hasta).</p>
      @if (error()) { <p class="error" role="alert">{{ error() }}</p><button class="button-secondary" type="button" (click)="load()" [disabled]="loading()">Reintentar consulta</button> }
      @if (loading()) { <p role="status" aria-live="polite">Cargando reporte…</p> }
      @if (result(); as data) {
        <p class="demo-note">Datos de DEMO académica; no representan facturación ni pagos bancarios reales. Los estados son actuales, no reconstrucciones históricas.</p>
        @if (data.totals.empty) { <p class="empty-state">No hay ventas confirmadas para este período y filtros.</p> }
        <section class="panel totals" aria-label="Totales del período">
          <h2>Ventas confirmadas</h2><p>{{ data.totals.confirmedOrderCount }} pedidos · {{ formatMoney(data.totals.confirmedTotal.amountMinor) }}</p>
          <p>Productos: {{ formatMoney(data.totals.productsSubtotal.amountMinor) }} · Entrega: {{ formatMoney(data.totals.deliveryFees.amountMinor) }}</p>
          <p>Ticket promedio: {{ formatMoney(data.totals.averageTicket.amountMinor) }}</p>
          <h2>Pedidos creados (fecha de creación)</h2><p>{{ data.orders.createdCount }} · Impagos activos: {{ data.orders.activeUnpaidCount }} · Cancelados impagos: {{ data.orders.cancelledUnpaidCount }}</p>
          <p>Pagos rechazados: {{ data.orders.rejectedPaymentCount }} · Intentos vigentes rechazados: {{ data.orders.rejectedCurrentAttemptCount }}</p>
        </section>
        <div class="export-row"><button class="button-secondary" type="button" (click)="downloadCsv()" [disabled]="exporting() || loading()">
          {{ exporting() ? 'Preparando CSV…' : 'Descargar CSV del servidor' }}</button><span role="status" aria-live="polite">{{ exportStatus() }}</span></div>
        <section class="panel" aria-labelledby="orders-status-title"><h2 id="orders-status-title">Estado actual de pedidos creados</h2>
          <div class="table-scroll" role="region" aria-label="Tabla de estados actuales de pedidos" tabindex="0"><table>
            <thead><tr><th scope="col">Estado actual</th><th scope="col">Pedidos</th></tr></thead><tbody>
              @for (row of data.orders.byStatus; track row.orderStatus) { <tr><th scope="row">{{ orderLabel(row.orderStatus) }}</th><td>{{ row.count }}</td></tr> }
            </tbody></table></div>
        </section>
        <section class="panel" aria-labelledby="methods-title"><h2 id="methods-title">Ventas por método confirmado</h2>
          <div class="table-scroll" role="region" aria-label="Tabla de ventas por método de pago" tabindex="0"><table>
            <thead><tr><th scope="col">Método actual confirmado</th><th scope="col">Pedidos</th><th scope="col">Total</th></tr></thead><tbody>
              @for (row of data.byMethod; track row.methodCode) { <tr><th scope="row">{{ methodLabel(row.methodCode) }}</th><td>{{ row.confirmedOrderCount }}</td><td>{{ formatMoney(row.confirmedTotal.amountMinor) }}</td></tr> }
            </tbody></table></div>
        </section>
        <section class="panel" aria-labelledby="delivery-title"><h2 id="delivery-title">Ventas por modalidad</h2>
          <div class="table-scroll" role="region" aria-label="Tabla de ventas por modalidad de entrega" tabindex="0"><table>
            <thead><tr><th scope="col">Modalidad</th><th scope="col">Pedidos</th><th scope="col">Entrega</th><th scope="col">Total</th></tr></thead><tbody>
              @for (row of data.byDelivery; track row.deliveryMode) { <tr><th scope="row">{{ row.deliveryMode === 'PICKUP' ? 'Retiro' : 'Entrega coordinada' }}</th><td>{{ row.confirmedOrderCount }}</td><td>{{ formatMoney(row.deliveryFees.amountMinor) }}</td><td>{{ formatMoney(row.confirmedTotal.amountMinor) }}</td></tr> }
            </tbody></table></div>
        </section>
        <section class="panel" aria-labelledby="presentation-title"><h2 id="presentation-title">Ventas por presentación</h2>
          <div class="table-scroll" role="region" aria-label="Tabla de cantidades separadas por presentación" tabindex="0"><table>
            <thead><tr><th scope="col">Producto</th><th scope="col">Presentación</th><th scope="col">Cantidad de esta unidad</th><th scope="col">Subtotal</th></tr></thead><tbody>
              @for (row of data.presentations; track row.productId + ':' + row.presentationId + ':' + row.unit + ':' + row.rollLengthMeters) { <tr><th scope="row">{{ row.productName }}</th>
                <td>{{ row.unit }}@if (row.rollLengthMeters !== null) { · {{ row.rollLengthMeters }} m por rollo }</td>
                <td>{{ row.quantity }} {{ row.unit }}</td><td>{{ formatMoney(row.productsSubtotal.amountMinor) }}</td></tr> }
            </tbody></table></div>
        </section>
      }
    </section>
  `,
  styles: [`
    .filters{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,12rem),1fr));gap:1rem;margin:1.25rem 0;padding:1rem}
    .filters label{display:grid;gap:.35rem}.filters input,.filters select{min-height:2.7rem;max-width:100%;padding:.45rem;border:1px solid var(--color-border);border-radius:.35rem;font:inherit}
    .filters button{align-self:end;min-height:2.7rem}.period-note,.demo-note{font-weight:600}.totals{padding:1rem;margin-block:1rem}.totals h2{font-size:1.1rem}
    .export-row{display:flex;align-items:center;gap:.75rem;flex-wrap:wrap;margin:1rem 0}.panel{min-width:0;margin-block:1rem;padding:1rem}
    .table-scroll{max-width:100%;overflow-x:auto;overscroll-behavior-inline:contain}.table-scroll table{width:100%;min-width:34rem;border-collapse:collapse}
    th,td{text-align:left;padding:.65rem;border-bottom:1px solid var(--color-border,#ccd2d8)}.error{color:#8a2d19}
  `],
})
export class AdminReportsPageComponent implements OnDestroy {
  private readonly api = inject(H7ReportsApiService);
  private readonly auth = inject(AuthSessionService);
  private readonly router = inject(Router);
  private readonly clock = inject(H7_CLOCK);
  private request?: Subscription;
  private exportRequest?: Subscription;
  private viewGeneration = 0;
  filters: H7Filters = { from: '', to: '', methodCode: null, orderStatus: null, paymentStatus: null };
  readonly result = signal<H7SalesReport | null>(null);
  readonly loading = signal(false);
  readonly exporting = signal(false);
  readonly error = signal('');
  readonly exportStatus = signal('');
  readonly formatMoney = formatMoney;

  constructor() {
    this.filters = { ...currentBuenosAiresMonth(this.clock()), methodCode: null, orderStatus: null, paymentStatus: null };
    this.load();
  }

  validPeriod(): boolean { return /^20\d{2}-\d{2}-\d{2}$/.test(this.filters.from) && /^20\d{2}-\d{2}-\d{2}$/.test(this.filters.to) && this.filters.from < this.filters.to; }

  filtersChanged(): void {
    this.viewGeneration++;
    this.request?.unsubscribe(); this.exportRequest?.unsubscribe();
    this.loading.set(false); this.exporting.set(false); this.result.set(null); this.error.set(''); this.exportStatus.set('');
  }

  load(): void {
    const generation = ++this.viewGeneration;
    if (!this.validPeriod()) { this.result.set(null); this.error.set('Elija un período válido con fecha final exclusiva posterior a la inicial.'); return; }
    this.request?.unsubscribe(); this.exportRequest?.unsubscribe();
    this.exporting.set(false); this.exportStatus.set(''); this.result.set(null); this.loading.set(true); this.error.set('');
    const snapshot = { ...this.filters };
    this.request = this.api.report(snapshot).subscribe({
      next: (result) => { this.result.set(result); this.loading.set(false); },
      error: (error: unknown) => {
        if (generation !== this.viewGeneration) return;
        this.loading.set(false); void this.handle(error, 'reportes', generation);
      },
    });
  }

  downloadCsv(): void {
    const generation = ++this.viewGeneration;
    if (!this.validPeriod()) return;
    this.exportRequest?.unsubscribe(); this.exporting.set(true); this.exportStatus.set('');
    const snapshot = { ...this.filters };
    this.exportRequest = this.api.export(snapshot).subscribe({
      next: (blob) => { this.exporting.set(false); this.saveCsv(blob, snapshot); this.exportStatus.set('CSV descargado.'); },
      error: (error: unknown) => {
        if (generation !== this.viewGeneration) return;
        this.exporting.set(false); void this.handle(error, 'reportes', generation);
      },
    });
  }

  orderLabel(status: H7OrderStatus): string {
    return ({ RECEIVED: 'Recibido', PREPARING: 'En preparación', READY: 'Listo', DELIVERED: 'Entregado', CANCELLED: 'Cancelado' })[status];
  }
  methodLabel(method: H7MethodCode): string {
    return ({ DEMO_SIMULATION: 'Simulación DEMO', DEMO_PAY_ON_PICKUP: 'Pago al retirar DEMO', DEMO_TRANSFER: 'Transferencia DEMO' })[method];
  }

  ngOnDestroy(): void { this.viewGeneration++; this.request?.unsubscribe(); this.exportRequest?.unsubscribe(); }

  private saveCsv(blob: Blob, filters: H7Filters): void {
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url; anchor.download = `ventas-${filters.from}-${filters.to}-demo.csv`; anchor.click();
    URL.revokeObjectURL(url);
  }

  private async handle(error: unknown, path: string, generation: number): Promise<void> {
    if (await isPasswordChangeRequired(error)) {
      if (generation !== this.viewGeneration) return;
      await this.router.navigate(['/admin/change-password']);
    } else if (error instanceof HttpErrorResponse && error.status === 401) {
      if (generation !== this.viewGeneration) return;
      this.auth.expire(); await this.router.navigate(['/admin/login'], { queryParams: { returnUrl: `/admin/${path}` } });
    } else if (error instanceof HttpErrorResponse && error.status === 403) {
      if (generation !== this.viewGeneration) return;
      this.error.set('La sesión no permite consultar los reportes. Verifique el acceso administrativo.');
    } else if (generation === this.viewGeneration) this.error.set('No se pudo cargar el reporte. Revise la conexión e intente nuevamente.');
  }
}
