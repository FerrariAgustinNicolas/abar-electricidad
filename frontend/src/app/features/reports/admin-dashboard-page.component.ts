import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, inject, OnDestroy, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { Subscription } from 'rxjs';
import { AuthSessionService } from '../../core/auth/auth-session.service';
import { formatMoney } from '../catalog/format-money';
import { currentBuenosAiresMonth, H7_CLOCK, H7_TIME_ZONE } from './h7-period';
import { isPasswordChangeRequired } from './h7-admin-error';
import { H7ReportsApiService } from './h7-reports-api.service';
import { H7SalesReport } from './h7-reports.models';

@Component({
  selector: 'abar-admin-dashboard-page', standalone: true, imports: [RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section aria-labelledby="dashboard-title">
      <header class="page-heading"><div><p class="eyebrow">Administración · DEMO académica</p><h1 id="dashboard-title">Resumen</h1>
        <p>Período {{ filters.from }} a {{ filters.to }} (hasta exclusivo), zona {{ timeZone }}.</p></div>
        <a routerLink="/admin/reportes">Ver reportes</a></header>
      @if (loading()) { <p role="status">Cargando métricas…</p> }
      @if (error()) { <p class="error" role="alert">{{ error() }}</p><button type="button" (click)="load()">Reintentar consulta</button> }
      @if (result(); as data) {
        <p class="demo-note">Datos de DEMO; no representan facturación ni pagos bancarios reales.</p>
        @if (data.totals.empty) { <p class="empty-state">No hay ventas confirmadas en este período.</p> }
        <div class="metrics" aria-label="Indicadores de ventas confirmadas">
          <article class="panel"><h2>Ventas confirmadas</h2><p>{{ data.totals.confirmedOrderCount }}</p></article>
          <article class="panel"><h2>Total confirmado</h2><p>{{ formatMoney(data.totals.confirmedTotal.amountMinor) }}</p></article>
          <article class="panel"><h2>Productos</h2><p>{{ formatMoney(data.totals.productsSubtotal.amountMinor) }}</p></article>
          <article class="panel"><h2>Entrega</h2><p>{{ formatMoney(data.totals.deliveryFees.amountMinor) }}</p></article>
          <article class="panel"><h2>Ticket promedio</h2><p>{{ formatMoney(data.totals.averageTicket.amountMinor) }}</p></article>
          <article class="panel"><h2>Pedidos creados</h2><p>{{ data.orders.createdCount }}</p></article>
          <article class="panel"><h2>Impagos activos</h2><p>{{ data.orders.activeUnpaidCount }}</p></article>
          <article class="panel"><h2>Cancelados impagos</h2><p>{{ data.orders.cancelledUnpaidCount }}</p></article>
        </div>
        <section class="panel chart" aria-labelledby="series-title"><h2 id="series-title">Ventas confirmadas por día</h2>
          @if (data.series.length) { <ul>@for (point of data.series; track point.date) {
            <li><time [attr.datetime]="point.date">{{ point.date }}</time> · {{ point.confirmedOrderCount }} ventas · {{ formatMoney(point.confirmedTotal.amountMinor) }}</li>
          }</ul> } @else { <p class="empty-state">No hay datos diarios para mostrar.</p> }
        </section>
        <section class="panel chart" aria-labelledby="status-title"><h2 id="status-title">Estado actual de pedidos creados</h2>
          <ul>@for (row of data.orders.byStatus; track row.orderStatus) { <li>{{ row.orderStatus }}: {{ row.count }}</li> }</ul>
        </section>
      }
    </section>
  `,
  styles: [`
    .metrics{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,12rem),1fr));gap:1rem;margin:1.25rem 0}
    .metrics article{padding:1rem;min-width:0}.metrics h2{font-size:1rem;margin-top:0}.metrics p{font-size:1.5rem;font-weight:700;margin-bottom:0;overflow-wrap:anywhere}
    .chart{padding:1rem;overflow-wrap:anywhere}.chart ul{padding-inline-start:1.25rem}.demo-note{font-weight:700}.error{color:#8a2d19}
  `],
})
export class AdminDashboardPageComponent implements OnDestroy {
  private readonly api = inject(H7ReportsApiService);
  private readonly auth = inject(AuthSessionService);
  private readonly router = inject(Router);
  private readonly clock = inject(H7_CLOCK);
  private request?: Subscription;
  readonly filters = { ...currentBuenosAiresMonth(this.clock()) };
  readonly timeZone = H7_TIME_ZONE;
  readonly result = signal<H7SalesReport | null>(null);
  readonly loading = signal(false);
  readonly error = signal('');
  readonly formatMoney = formatMoney;

  constructor() { this.load(); }

  load(): void {
    this.request?.unsubscribe();
    this.result.set(null); this.loading.set(true); this.error.set('');
    this.request = this.api.dashboard({ ...this.filters, methodCode: null, orderStatus: null, paymentStatus: null }).subscribe({
      next: (result) => { this.result.set(result); this.loading.set(false); },
      error: (error: unknown) => { this.loading.set(false); void this.handle(error); },
    });
  }

  ngOnDestroy(): void { this.request?.unsubscribe(); }

  private async handle(error: unknown): Promise<void> {
    if (await isPasswordChangeRequired(error)) {
      await this.router.navigate(['/admin/change-password']);
    } else if (error instanceof HttpErrorResponse && error.status === 401) {
      this.auth.expire(); await this.router.navigate(['/admin/login'], { queryParams: { returnUrl: '/admin/dashboard' } });
    } else if (error instanceof HttpErrorResponse && error.status === 403) {
      this.error.set('La sesión no permite consultar el resumen. Verifique el acceso administrativo.');
    } else this.error.set('No se pudo cargar el resumen. Revise la conexión e intente nuevamente.');
  }
}
