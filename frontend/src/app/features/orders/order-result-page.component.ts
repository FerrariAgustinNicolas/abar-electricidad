import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { DemoPaymentMethod } from '../../core/cart/cart.models';
import { OrderAccessSessionService } from '../../core/orders/order-access-session.service';
import { OrdersApiService } from '../../core/orders/orders-api.service';
import { CreateAttemptRequest, H4Terms, PaymentAttemptStatus, PublicOrderView } from '../../core/orders/orders.models';
import { formatMoney } from '../catalog/format-money';

interface AttemptIntent { body: CreateAttemptRequest; key: string }

@Component({
  selector: 'abar-order-result-page', standalone: true, imports: [DatePipe, RouterLink, FormsModule],
  template: `
    <main class="order-page" aria-labelledby="result-title"><p class="eyebrow">Pedido de demostración</p><h1 id="result-title">Resultado del pedido</h1>
      @if (loading()) { <p role="status">Consultando el estado del pedido…</p> }
      @if (error()) { <p class="notice" role="alert">{{ error() }}</p> }
      @if (needsLookup()) { <section class="notice"><p>No contamos con una credencial vigente para consultar este pedido. La consulta mínima no restaura el acceso privado.</p><a routerLink="/consultar-pedido">Consultar por número y contacto</a></section> }
      @if (order(); as current) {
        <section class="summary" aria-labelledby="order-summary-title" aria-live="polite"><h2 id="order-summary-title">Pedido {{ current.orderNumber }}</h2>
          <p>Estado del pedido: <strong>{{ orderLabel(current.orderStatus) }}</strong></p>
          <p>Estado comercial del pago: <strong>{{ paymentLabel(current.paymentStatus) }}</strong></p>
          <p>Resultado del intento demo: <strong>{{ attemptLabel(current.currentAttempt.status) }}</strong></p>
          @if (current.currentAttempt.status === 'APPROVED') { <p class="notice">El intento fue aprobado en la simulación. Esto no confirma un cobro ni cambia el pedido de Recibido.</p> }
          @if (current.currentAttempt.status === 'REJECTED') { <p class="notice">El intento demo fue rechazado. El pedido se conserva y el pago sigue sin confirmación comercial.</p> }
          <p>Creado: <time [attr.datetime]="current.createdAt">{{ current.createdAt | date:'short' }}</time> · {{ current.deliveryMode === 'PICKUP' ? 'Retiro' : 'Entrega coordinada' }}</p>
          <ul>@for (item of current.items; track item.presentationId) { <li>{{ item.productName }} · {{ unitLabel(item) }} × {{ item.quantity }} <strong>{{ formatMoney(item.lineTotal.amountMinor) }}</strong></li> }</ul>
          <dl><div><dt>Subtotal</dt><dd>{{ formatMoney(current.subtotal.amountMinor) }}</dd></div><div><dt>Entrega</dt><dd>{{ formatMoney(current.deliveryFee.amountMinor) }}</dd></div><div class="total"><dt>Total solicitado</dt><dd>{{ formatMoney(current.total.amountMinor) }}</dd></div></dl>
          <p class="notice">Los importes corresponden al pedido recibido. H4 no confirma cobros ni garantiza existencias futuras.</p>
        </section>
        @if (canRetryPayment() && !needsLookup()) {
          <section class="attempt-panel" aria-labelledby="attempt-title"><h2 id="attempt-title">Nuevo intento demo</h2><p>Elegí solo un método disponible para este pedido. No ingreses datos de tarjeta ni bancarios.</p>
            @if (methodsLoading()) { <p role="status">Cargando métodos disponibles…</p> }
            @if (methodsError()) { <p class="error" role="alert">No pudimos cargar los métodos demo.</p><button type="button" (click)="loadMethods()" [disabled]="attemptBusy()">Reintentar métodos</button> }
            <fieldset [disabled]="attemptBusy() || attemptUnknown() || methodsLoading() || methodsError()"><legend>Medio demo</legend>
              <label for="retry-method">Método<select id="retry-method" [ngModel]="selectedMethod()" (ngModelChange)="selectMethod($event)">@for (method of methods(); track method.code) { <option [value]="method.code">{{ method.label }}</option> }</select></label>
              @if (selectedMethod() === 'DEMO_SIMULATION' && terms()?.simulationEnabled) { <label for="retry-scenario">Escenario de simulación<select id="retry-scenario" [ngModel]="scenario()" (ngModelChange)="setScenario($event)"><option value="PENDING">Pendiente</option><option value="APPROVED">Aprobado (solo intento)</option><option value="REJECTED">Rechazado</option></select></label> }
            </fieldset>
            @if (attemptUnknown()) { <p class="notice" role="alert">El resultado es desconocido. Reintentá exactamente este mismo intento; no cambies método ni escenario hasta reconciliarlo.</p> }
            @if (attemptError()) { <p class="error" role="alert">{{ attemptError() }}</p> }
            <button class="primary" type="button" [disabled]="attemptBusy() || methodsLoading() || methodsError() || !methods().length || !selectedMethod()" (click)="retryAttempt()">{{ attemptBusy() ? 'Registrando intento…' : attemptUnknown() ? 'Reintentar el mismo intento' : 'Registrar intento demo' }}</button>
          </section>
        }
      }
      <p><a routerLink="/consultar-pedido">Consultar un pedido</a> · <a routerLink="/productos">Volver al catálogo</a></p>
    </main>
  `,
  styles: [`
    :host{display:block;color:var(--color-text)}.order-page{max-width:820px;margin:0 auto;padding:clamp(1.25rem,4vw,3rem)}h1{font-size:clamp(1.8rem,4vw,2.5rem)}.summary,.attempt-panel{margin:1.25rem 0;padding:1.25rem;border:1px solid var(--color-border);border-radius:.7rem}.summary h2{margin-top:0}.summary ul{padding-left:1.4rem}.summary li{padding:.45rem 0}.summary li strong{float:right}.summary dl{max-width:34rem;margin-left:auto}.summary dl div{display:flex;justify-content:space-between;gap:1rem;padding:.6rem 0;border-bottom:1px solid var(--color-border)}.summary dd{margin:0}.total{font-weight:800;font-size:1.2rem}.notice{padding:.9rem 1rem;background:var(--color-surface-subtle);border-left:4px solid var(--color-orange);border-radius:.4rem;line-height:1.5}.attempt-panel fieldset{display:grid;gap:.8rem;border:0;padding:0;margin:1rem 0}.attempt-panel label{display:grid;gap:.35rem}.attempt-panel select,button{min-height:2.75rem;padding:.55rem .7rem;font:inherit;border:1px solid var(--color-border);border-radius:.4rem;background:var(--color-surface)}button{cursor:pointer}.primary{background:var(--color-blue-dark);color:white;font-weight:700}button:disabled{opacity:.55;cursor:not-allowed}.error{color:#8a2d19}a{color:var(--color-blue-dark)}button:focus-visible,a:focus-visible,select:focus-visible{outline:3px solid var(--color-orange);outline-offset:2px}@media(max-width:600px){.summary li strong{float:none;display:block}}
  `], changeDetection: ChangeDetectionStrategy.OnPush,
})
export class OrderResultPageComponent {
  private readonly route = inject(ActivatedRoute);
  private readonly api = inject(OrdersApiService);
  private readonly access = inject(OrderAccessSessionService);
  readonly order = signal<PublicOrderView | null>(null);
  readonly terms = signal<H4Terms | null>(null);
  readonly methods = signal<DemoPaymentMethod[]>([]);
  readonly selectedMethod = signal<DemoPaymentMethod['code'] | ''>('');
  readonly scenario = signal<PaymentAttemptStatus>('PENDING');
  readonly loading = signal(false);
  readonly methodsLoading = signal(false);
  readonly methodsError = signal(false);
  readonly needsLookup = signal(false);
  readonly error = signal('');
  readonly attemptBusy = signal(false);
  readonly attemptUnknown = signal(false);
  readonly attemptError = signal('');
  private intent: AttemptIntent | null = null;
  private methodsRevision = 0;

  constructor() { void this.loadOrder(); }

  formatMoney = formatMoney;
  attemptLabel(status: PaymentAttemptStatus): string { return status === 'APPROVED' ? 'Aprobado en la simulación' : status === 'REJECTED' ? 'Rechazado en la simulación' : 'Pendiente en la simulación'; }
  orderLabel(status: PublicOrderView['orderStatus']): string { return ({ RECEIVED: 'Recibido', PREPARING: 'En preparación', READY: 'Listo para retirar o coordinar', DELIVERED: 'Entregado', CANCELLED: 'Cancelado' })[status]; }
  paymentLabel(status: PublicOrderView['paymentStatus']): string { return status === 'PAID' ? 'Pagado (confirmación manual)' : status === 'REJECTED' ? 'Rechazado' : 'Pendiente de confirmación'; }
  canRetryPayment(): boolean { const current = this.order(); return !!current && current.orderStatus === 'RECEIVED' && current.paymentStatus !== 'PAID' && current.nextActions.includes('RETRY_PAYMENT'); }
  unitLabel(item: PublicOrderView['items'][number]): string { return item.unit === 'UNIT' ? 'unidad' : item.unit === 'METER' ? 'metro' : `rollo${item.rollLengthMeters ? ` de ${item.rollLengthMeters} m` : ''}`; }

  async loadOrder(): Promise<void> {
    const orderId = this.route.snapshot.paramMap.get('id');
    const session = orderId ? this.access.get(orderId) : null;
    if (!orderId || !session) { this.needsLookup.set(true); return; }
    this.loading.set(true); this.error.set('');
    try {
      const result = await firstValueFrom(this.api.getOrder(orderId, session.accessToken));
      this.order.set(result);
      this.needsLookup.set(false);
      this.selectedMethod.set(result.currentAttempt.methodCode);
      if (this.canRetryPayment()) await this.loadMethods(result.deliveryMode);
    } catch { this.error.set('No pudimos consultar el pedido con la credencial disponible. Podés usar la consulta mínima.'); this.needsLookup.set(true); }
    finally { this.loading.set(false); }
  }

  async loadMethods(deliveryMode = this.order()?.deliveryMode): Promise<void> {
    if (!deliveryMode || !this.canRetryPayment() || this.attemptBusy() || this.attemptUnknown()) return;
    const revision = ++this.methodsRevision;
    this.methodsLoading.set(true); this.methodsError.set(false);
    try {
      const [response, terms] = await Promise.all([firstValueFrom(this.api.paymentMethods(deliveryMode)), firstValueFrom(this.api.terms())]);
      if (revision !== this.methodsRevision) return;
      this.terms.set(terms);
      this.methods.set(response.items.filter((method) => method.demo && method.deliveryModes.includes(deliveryMode) && (method.code !== 'DEMO_SIMULATION' || terms.simulationEnabled)));
      if (!this.methods().some((method) => method.code === this.selectedMethod())) this.selectedMethod.set(this.methods()[0]?.code ?? '');
    } catch { if (revision === this.methodsRevision) this.methodsError.set(true); }
    finally { if (revision === this.methodsRevision) this.methodsLoading.set(false); }
  }

  selectMethod(value: string): void {
    if (this.attemptBusy() || this.attemptUnknown() || this.methodsLoading()) return;
    this.selectedMethod.set(this.methods().find((method) => method.code === value)?.code ?? '');
  }
  setScenario(value: PaymentAttemptStatus): void {
    if (!this.attemptBusy() && !this.attemptUnknown() && !this.methodsLoading() &&
        this.selectedMethod() === 'DEMO_SIMULATION' && this.terms()?.simulationEnabled &&
        ['APPROVED', 'PENDING', 'REJECTED'].includes(value)) this.scenario.set(value);
  }

  async retryAttempt(): Promise<void> {
    const order = this.order(); const orderId = order?.orderId;
    const session = orderId ? this.access.get(orderId) : null;
    if (!order || !orderId || !session || this.attemptBusy() || !this.canRetryPayment()) return;
    const method = this.methods().find((item) => item.code === this.selectedMethod() && item.deliveryModes.includes(order.deliveryMode));
    if (!this.intent && (this.methodsLoading() || this.methodsError() || !method ||
        (method.code === 'DEMO_SIMULATION' && !this.terms()?.simulationEnabled))) {
      this.attemptError.set('El método seleccionado no está disponible. Es necesario actualizar los métodos antes de reintentar.');
      return;
    }
    const body: CreateAttemptRequest = this.intent?.body ?? (method!.code === 'DEMO_SIMULATION'
      ? { methodCode: method!.code, scenario: this.scenario() }
      : { methodCode: method!.code });
    if (!this.intent) {
      try { this.intent = { body, key: crypto.randomUUID() }; }
      catch { this.attemptError.set('Este navegador no puede generar una clave segura de intento.'); return; }
    }
    this.attemptBusy.set(true); this.attemptError.set('');
    try {
      const result = await firstValueFrom(this.api.createAttempt(orderId, session.accessToken, this.intent.body, this.intent.key));
      this.order.set({ ...order, paymentStatus: result.paymentStatus, orderStatus: result.orderStatus, currentAttempt: result.currentAttempt, nextActions: result.nextActions });
      this.intent = null; this.attemptUnknown.set(false);
    } catch (error: unknown) {
      if (isUnknownOutcome(error)) { this.attemptUnknown.set(true); this.attemptError.set('No pudimos confirmar la respuesta. Reintentá el mismo intento para reconciliarlo.'); }
      else { this.intent = null; this.attemptError.set('No se pudo registrar el intento. El pedido se conserva; revisá el método disponible.'); }
    } finally { this.attemptBusy.set(false); }
  }
}

function isUnknownOutcome(error: unknown): boolean { return !(error instanceof HttpErrorResponse) || error.status === 0 || error.status >= 500; }
