import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { AuthSessionService } from '../../core/auth/auth-session.service';
import { formatMoney } from '../catalog/format-money';
import { AdminOrdersApiService } from './admin-orders-api.service';
import { AdminOrderDetail, CancelOrderRequest, OrderNoteRequest, OrderStatus, OrderStatusRequest, PaymentConfirmationRequest } from './admin-orders.models';

type IntentAction = 'payment' | 'status' | 'cancel' | 'note';
interface PendingIntent { key: string; action: IntentAction; body: PaymentConfirmationRequest | OrderStatusRequest | CancelOrderRequest | OrderNoteRequest }

@Component({
  selector: 'abar-admin-order-detail-page', standalone: true, imports: [DatePipe, ReactiveFormsModule, RouterLink],
  template: `
    <section aria-labelledby="order-title">
      <p><a routerLink="/admin/pedidos">Volver a pedidos</a></p>
      @if (loading() && !order()) { <p role="status">Cargando detalle del pedido…</p> }
      @if (error()) { <p class="error" role="alert">{{ error() }}</p> }
      @if (intentStorageBlocked()) { <p class="pending" role="alert">{{ pendingMessage() }}</p> }
      @if (order(); as current) {
        <header class="page-heading"><div><p class="eyebrow">Administración · {{ current.orderNumber }}</p><h1 id="order-title">Pedido {{ current.orderNumber }}</h1><p>Creado {{ current.createdAt | date:'medium' }}</p></div><button class="button-secondary" type="button" (click)="loadDetail()" [disabled]="loading()">Actualizar datos</button></header>
        <div class="status-row"><span class="status-badge">Pedido: {{ orderLabel(current.orderStatus) }}</span><span class="status-badge">Pago: {{ paymentLabel(current.paymentStatus) }}</span><span class="status-badge">Modalidad: {{ current.deliveryMode === 'PICKUP' ? 'Retiro' : 'Entrega coordinada' }}</span></div>
        @if (current.currentAttempt.status === 'APPROVED' && current.paymentStatus !== 'PAID') { <p class="notice" role="status">El intento fue aprobado en la simulación, pero el pago comercial sigue pendiente. No se descuenta inventario hasta una confirmación manual válida.</p> }
        <div class="columns">
          <section class="panel" aria-labelledby="buyer-heading"><h2 id="buyer-heading">Comprador y entrega</h2><p><strong>{{ current.customer.firstName }} {{ current.customer.lastName }}</strong></p><p>{{ current.customer.email }} · {{ current.customer.phone }}</p>
            @if (current.deliveryDetails) { <p>{{ current.deliveryDetails.addressLine }}, {{ current.deliveryDetails.locality }}</p>@if (current.deliveryDetails.instructions) { <p>Instrucciones: {{ current.deliveryDetails.instructions }}</p> } }
            @if (current.customerNote) { <p>Nota del comprador: {{ current.customerNote }}</p> }
          </section>
          <section class="panel" aria-labelledby="attempt-heading"><h2 id="attempt-heading">Intento vigente</h2><p>{{ current.currentAttempt.methodCode }} · intento {{ current.currentAttempt.sequence }}</p><p>{{ attemptLabel(current.currentAttempt.status) }} · {{ current.currentAttempt.createdAt | date:'short' }}</p><p>Pago comercial: <strong>{{ paymentLabel(current.paymentStatus) }}</strong></p></section>
        </div>
        <section class="panel items-panel"><h2>Ítems y precios congelados</h2><div class="table-wrap"><table><thead><tr><th scope="col">Producto</th><th scope="col">Presentación</th><th scope="col">Cantidad</th><th scope="col">Precio congelado</th><th scope="col">Importe</th></tr></thead><tbody>
          @for (item of current.items; track item.presentationId) { <tr><td>{{ item.productName }}</td><td>{{ unitLabel(item.unit, item.rollLengthMeters) }}</td><td>{{ item.quantity }}</td><td>{{ formatMoney(item.unitPrice.amountMinor) }}</td><td>{{ formatMoney(item.lineTotal.amountMinor) }}</td></tr> }
        </tbody></table></div><dl class="totals"><div><dt>Subtotal</dt><dd>{{ formatMoney(current.subtotal.amountMinor) }}</dd></div><div><dt>Entrega</dt><dd>{{ formatMoney(current.deliveryFee.amountMinor) }}</dd></div><div class="total"><dt>Total del pedido</dt><dd>{{ formatMoney(current.total.amountMinor) }}</dd></div></dl></section>
        <section class="panel" aria-labelledby="stock-heading"><h2 id="stock-heading">Resumen de saldo para confirmar</h2><p>Valores administrativos actuales; el servidor los vuelve a validar al confirmar.</p><div class="table-wrap"><table><thead><tr><th scope="col">Presentación</th><th scope="col">A debitar</th><th scope="col">Disponible ahora</th><th scope="col">Resultado</th></tr></thead><tbody>
          @for (entry of current.stock; track entry.presentationId) { <tr><td>{{ entry.unit }}</td><td>{{ entry.quantity }}</td><td>{{ entry.availableQuantity }}</td><td>{{ entry.availableQuantity >= entry.quantity ? 'Saldo suficiente' : 'Saldo insuficiente' }}</td></tr> }
        </tbody></table></div></section>

        @if (!intentStorageBlocked() && current.allowedActions.confirmPayment && current.orderStatus === 'RECEIVED' && current.paymentStatus !== 'PAID' && !pendingIntent()) {
          <section class="panel action-panel" aria-labelledby="confirm-heading"><h2 id="confirm-heading">Confirmación manual del pago</h2>
            @if (!paymentReview()) { <p>Se enviará el importe completo del snapshot y el intento vigente. La confirmación cambia el pago a Pagado y el pedido a En preparación; no es un cobro real.</p><button type="button" (click)="reviewPayment()">Revisar importe, intento y saldos</button> }
            @if (paymentReview()) { <p>Confirme que revisó el importe <strong>{{ formatMoney(current.paymentAmount.amountMinor) }}</strong>, el intento <strong>{{ current.currentAttempt.id }}</strong> ({{ attemptLabel(current.currentAttempt.status) }}) y todas las cantidades de saldo de arriba.</p>
              <label class="confirm-check"><input type="checkbox" [checked]="paymentAcknowledged()" (change)="paymentAcknowledged.set($any($event.target).checked)"> Verifiqué importe, intento y débitos por presentación.</label>
              @if (!hasSufficientStock()) { <p class="error" role="alert">El saldo actual no cubre todas las líneas. Actualice y revise antes de intentar confirmar.</p> }
              <button type="button" [disabled]="busy() || !paymentAcknowledged() || !hasSufficientStock()" (click)="confirmPayment()">{{ busy() ? 'Confirmando…' : 'Confirmar pago y descontar existencias' }}</button>
              <button type="button" class="button-secondary" (click)="cancelReview()" [disabled]="busy()">Volver sin confirmar</button>
            }
          </section>
        }

        @if (!intentStorageBlocked() && current.allowedActions.markReady && current.orderStatus === 'PREPARING' && current.paymentStatus === 'PAID' && !pendingIntent()) { <section class="panel action-panel"><h2>Preparación</h2><p>Marcar como listo no vuelve a descontar stock.</p><button type="button" [disabled]="busy()" (click)="updateStatus('READY')">Marcar listo para {{ current.deliveryMode === 'PICKUP' ? 'retirar' : 'entrega coordinada' }}</button></section> }
        @if (!intentStorageBlocked() && current.allowedActions.markDelivered && current.orderStatus === 'READY' && current.paymentStatus === 'PAID' && !pendingIntent()) { <section class="panel action-panel"><h2>Entrega</h2><p>La entrega no vuelve a descontar stock.</p><button type="button" [disabled]="busy()" (click)="updateStatus('DELIVERED')">Marcar entregado</button></section> }

        @if (!intentStorageBlocked() && current.allowedActions.cancel && current.orderStatus === 'RECEIVED' && current.paymentStatus !== 'PAID' && !pendingIntent()) {
          <section class="panel action-panel" aria-labelledby="cancel-heading"><h2 id="cancel-heading">Cancelar pedido impago</h2><p>La cancelación requiere motivo, no modifica stock y no está disponible para pedidos pagados.</p>
            <label for="cancel-reason">Motivo obligatorio<textarea id="cancel-reason" [formControl]="cancelReason" maxlength="500" rows="3"></textarea></label>
            @if (!cancelReview()) { <button type="button" [disabled]="cancelReason.invalid" (click)="cancelReview.set(true)">Revisar cancelación</button> }
            @if (cancelReview()) { <p>Se cancelará el pedido sin cambiar ningún saldo. Motivo: {{ cancelReason.value }}</p><button type="button" [disabled]="busy() || cancelReason.invalid" (click)="cancelOrder()">Confirmar cancelación</button><button class="button-secondary" type="button" (click)="cancelReview.set(false)" [disabled]="busy()">Volver</button> }
          </section>
        }

        @if (pendingIntent(); as intent) {
          <section class="pending panel" aria-labelledby="pending-heading"><h2 id="pending-heading">Acción pendiente de reconciliación</h2><p>{{ pendingMessage() }}</p><p>No se generará una clave nueva ni se cambiará el contenido de este envío automáticamente.</p>
            @if (canRetrySame()) { <button type="button" [disabled]="busy()" (click)="retrySameIntent()">Reintentar exactamente el mismo envío</button> }
            <button class="button-secondary" type="button" [disabled]="loading() || busy()" (click)="loadDetail()">Consultar estado actual</button>
            <small>Operación: {{ intent.action }} · versión solicitada: {{ expectedVersion(intent) }}</small>
          </section>
        }

        @if (!intentStorageBlocked() && !pendingIntent() && current.allowedActions.addNote) { <section class="panel action-panel" aria-labelledby="notes-heading"><h2 id="notes-heading">Notas internas</h2><p>Solo visibles para administración; se agregan al historial y no se editan.</p>
          <form [formGroup]="noteForm" (ngSubmit)="addNote()"><label for="internal-note">Nueva nota<textarea id="internal-note" formControlName="text" maxlength="2000" rows="3"></textarea></label><button type="submit" [disabled]="busy() || noteForm.invalid">Agregar nota</button></form>
        </section> }
        <section class="panel" aria-labelledby="history-heading"><h2 id="history-heading">Historial</h2>@if (!current.history.length) { <p>Sin eventos registrados.</p> }<ol class="history">@for (entry of current.history; track entry.id) { <li><strong>{{ eventLabel(entry.eventType) }}</strong><span>{{ entry.createdAt | date:'medium' }}</span>@if (entry.fromStatus || entry.toStatus) { <span>{{ entry.fromStatus || '—' }} → {{ entry.toStatus || '—' }}</span> }@if (entry.reason) { <p>{{ entry.reason }}</p> }</li> }</ol></section>
        <section class="panel" aria-labelledby="internal-notes-heading"><h2 id="internal-notes-heading">Notas internas registradas</h2>@if (!current.notes.length) { <p>Sin notas internas.</p> }<ol class="history">@for (note of current.notes; track note.id) { <li><p class="note-text">{{ note.text }}</p><span>{{ note.createdAt | date:'medium' }} · operador {{ note.actorAdminUserId }}</span></li> }</ol></section>
      }
    </section>
  `,
  styles: [`.status-row{display:flex;flex-wrap:wrap;gap:.45rem;margin:1rem 0}.columns{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,20rem),1fr));gap:1rem;margin:1rem 0}.panel{margin:1rem 0;padding:1rem;border:1px solid var(--color-border);border-radius:.55rem}.panel h2{margin-top:0}.action-panel{display:grid;gap:.75rem}.action-panel label{display:grid;gap:.35rem}.action-panel textarea{width:100%;box-sizing:border-box;padding:.65rem;font:inherit;border:1px solid var(--color-border);border-radius:.35rem}.action-panel button,.pending button{min-height:2.75rem;padding:.55rem .8rem}.confirm-check{display:flex!important;align-items:flex-start;gap:.5rem}.confirm-check input{width:1.2rem;height:1.2rem}.notice,.pending{padding:.9rem 1rem;background:var(--color-surface-subtle,#f5f6f7);border-left:4px solid var(--color-orange,#d99000);line-height:1.5}.totals{max-width:24rem;margin-left:auto}.totals div{display:flex;justify-content:space-between;gap:1rem;padding:.4rem;border-bottom:1px solid var(--color-border)}.totals dd{margin:0}.total{font-weight:800}.history{padding-left:1.4rem}.history li{padding:.6rem 0;border-bottom:1px solid var(--color-border)}.history li span{display:block;color:var(--color-text-muted,#59636e);font-size:.9rem}.note-text{white-space:pre-wrap;overflow-wrap:anywhere}.error{color:#8a2d19}small{overflow-wrap:anywhere}`],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminOrderDetailPageComponent {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly auth = inject(AuthSessionService);
  private readonly api = inject(AdminOrdersApiService);
  private readonly fb = inject(FormBuilder).nonNullable;
  readonly order = signal<AdminOrderDetail | null>(null);
  readonly loading = signal(false);
  readonly busy = signal(false);
  readonly error = signal('');
  readonly paymentReview = signal(false);
  readonly paymentAcknowledged = signal(false);
  readonly cancelReview = signal(false);
  readonly pendingIntent = signal<PendingIntent | null>(null);
  readonly intentStorageBlocked = signal(false);
  readonly canRetrySame = signal(false);
  readonly pendingMessage = signal('');
  readonly cancelReason = this.fb.control('', Validators.required);
  readonly noteForm = this.fb.group({ text: ['', [Validators.required, Validators.maxLength(2000)]] });
  readonly formatMoney = formatMoney;
  private readonly orderId = this.route.snapshot.paramMap.get('id') ?? '';

  constructor() { this.restoreIntent(); void this.loadDetail(); }

  async loadDetail(): Promise<void> {
    if (!this.orderId || this.loading()) return;
    this.loading.set(true); this.error.set('');
    try {
      const result = await firstValueFrom(this.api.get(this.orderId));
      const intent = this.pendingIntent();
      if (intent && result.version !== this.expectedVersion(intent)) {
        this.clearIntent();
        this.pendingMessage.set('La versión cambió. Revise el estado actualizado antes de preparar otra acción.');
      }
      this.order.set(result);
    } catch (error: unknown) {
      if (error instanceof HttpErrorResponse && error.status === 401) {
        this.auth.expire(); await this.router.navigate(['/admin/login'], { queryParams: { returnUrl: `/admin/pedidos/${encodeURIComponent(this.orderId)}` } });
      } else if (error instanceof HttpErrorResponse && error.status === 403) this.error.set('La sesión no permite consultar este pedido. Verifique el acceso administrativo.');
      else this.error.set('No se pudo cargar el detalle del pedido. Revise la conexión e intente nuevamente.');
    } finally { this.loading.set(false); }
  }

  reviewPayment(): void { this.paymentReview.set(true); this.paymentAcknowledged.set(false); }
  hasSufficientStock(): boolean { const stock = this.order()?.stock ?? []; return stock.length > 0 && stock.every((entry) => entry.availableQuantity >= entry.quantity); }

  async confirmPayment(): Promise<void> {
    const order = this.order();
    if (!order || this.intentStorageBlocked() || !this.hasSufficientStock() || !this.paymentReview() || !this.paymentAcknowledged() || !order.allowedActions.confirmPayment || order.orderStatus !== 'RECEIVED' || order.paymentStatus === 'PAID') return;
    const body: PaymentConfirmationRequest = { expectedVersion: order.version, attemptId: order.currentAttempt.id, confirmedAmount: order.paymentAmount };
    await this.startIntent('payment', body);
  }

  async updateStatus(status: 'READY' | 'DELIVERED'): Promise<void> {
    const order = this.order();
    if (!order || this.intentStorageBlocked() || (status === 'READY' ? !order.allowedActions.markReady || order.orderStatus !== 'PREPARING' : !order.allowedActions.markDelivered || order.orderStatus !== 'READY') || order.paymentStatus !== 'PAID') return;
    await this.startIntent('status', { expectedVersion: order.version, status });
  }

  async cancelOrder(): Promise<void> {
    const order = this.order(); const reason = this.cancelReason.value.trim();
    if (!order || this.intentStorageBlocked() || !reason || !order.allowedActions.cancel || order.orderStatus !== 'RECEIVED' || order.paymentStatus === 'PAID') return;
    await this.startIntent('cancel', { expectedVersion: order.version, reason });
  }

  async addNote(): Promise<void> {
    const order = this.order(); const text = this.noteForm.controls.text.value.trim();
    if (!order || this.intentStorageBlocked() || !text || !order.allowedActions.addNote) return;
    await this.startIntent('note', { expectedVersion: order.version, text });
  }

  async retrySameIntent(): Promise<void> { if (this.pendingIntent() && this.canRetrySame()) await this.sendPendingIntent(); }

  orderLabel(status: OrderStatus): string { return ({ RECEIVED: 'Recibido', PREPARING: 'En preparación', READY: 'Listo', DELIVERED: 'Entregado', CANCELLED: 'Cancelado' })[status]; }
  paymentLabel(status: AdminOrderDetail['paymentStatus']): string { return ({ PENDING: 'Pendiente', REJECTED: 'Rechazado', PAID: 'Pagado' })[status]; }
  attemptLabel(status: AdminOrderDetail['currentAttempt']['status']): string { return status === 'APPROVED' ? 'Aprobado en la simulación' : status === 'REJECTED' ? 'Rechazado en la simulación' : 'Pendiente en la simulación'; }
  unitLabel(unit: string, rollLengthMeters: number | null): string { return unit === 'UNIT' ? 'Unidad' : unit === 'METER' ? 'Metro' : `Rollo cerrado${rollLengthMeters ? ` de ${rollLengthMeters} m` : ''}`; }
  eventLabel(event: string): string { return event.replaceAll('_', ' ').toLocaleLowerCase('es-AR'); }
  expectedVersion(intent: PendingIntent): number { return intent.body.expectedVersion; }

  private async startIntent(action: IntentAction, body: PendingIntent['body']): Promise<void> {
    if (this.pendingIntent() || this.busy() || this.intentStorageBlocked()) return;
    try {
      const intent: PendingIntent = { action, body, key: crypto.randomUUID() };
      this.persistIntent(intent);
      this.pendingIntent.set(intent); this.canRetrySame.set(true); this.pendingMessage.set('La acción está preparada y se enviará con una clave estable.');
      await this.sendPendingIntent();
    } catch (error: unknown) {
      if (error instanceof Error && !this.pendingIntent()) this.error.set(error.message || 'No se pudo preparar una clave segura para la operación.');
    }
  }

  private async sendPendingIntent(): Promise<void> {
    const intent = this.pendingIntent();
    if (!intent || this.busy()) return;
    this.busy.set(true); this.error.set(''); this.canRetrySame.set(false);
    try {
      if (intent.action === 'payment') await firstValueFrom(this.api.confirmPayment(this.orderId, intent.body as PaymentConfirmationRequest, intent.key));
      else if (intent.action === 'status') await firstValueFrom(this.api.updateStatus(this.orderId, intent.body as OrderStatusRequest, intent.key));
      else if (intent.action === 'cancel') await firstValueFrom(this.api.cancel(this.orderId, intent.body as CancelOrderRequest, intent.key));
      else await firstValueFrom(this.api.addNote(this.orderId, intent.body as OrderNoteRequest, intent.key));
      this.clearIntent(); this.paymentReview.set(false); this.paymentAcknowledged.set(false); this.cancelReview.set(false);
      this.noteForm.reset({ text: '' });
      await this.loadDetail();
    } catch (error: unknown) {
      if (error instanceof HttpErrorResponse && error.status === 401) {
        this.pendingMessage.set('La sesión venció. El envío no se repetirá; vuelva a iniciar sesión y revise el pedido.');
        this.auth.expire(); await this.router.navigate(['/admin/login'], { queryParams: { returnUrl: `/admin/pedidos/${encodeURIComponent(this.orderId)}` } });
      } else if (error instanceof HttpErrorResponse && error.status === 403) this.pendingMessage.set('La sesión o el origen no permite esta operación. No se generó otra clave; revise el estado antes de continuar.');
      else if (error instanceof HttpErrorResponse && error.status === 409) {
        const body = error.error as { code?: unknown } | null;
        const code = typeof body?.code === 'string' ? body.code : '';
        this.pendingMessage.set('El servidor informó un conflicto. Se consultará el pedido; no se volverá a enviar con una clave distinta.');
        await this.loadDetail();
        if (this.pendingIntent() && code !== 'IDEMPOTENCY_CONFLICT') {
          this.clearIntent();
          this.pendingMessage.set('El servidor rechazó la acción. Revise el estado actualizado antes de preparar otra operación.');
        }
        this.canRetrySame.set(false);
        this.error.set(this.pendingMessage());
      } else this.pendingMessage.set('No se confirmó la respuesta. La operación queda pendiente; solo se puede reintentar exactamente con la misma clave y el mismo contenido.');
      if (!(error instanceof HttpErrorResponse && error.status === 409)) this.canRetrySame.set(true);
    } finally { this.busy.set(false); }
  }

  private restoreIntent(): void {
    try {
      const raw = sessionStorage.getItem(this.storageKey());
      if (!raw) return;
      const intent = JSON.parse(raw) as PendingIntent;
      if (intent && /^[A-Za-z0-9_-]{16,200}$/.test(intent.key) && ['payment', 'status', 'cancel', 'note'].includes(intent.action) && typeof intent.body?.expectedVersion === 'number') {
        this.pendingIntent.set(intent); this.pendingMessage.set('Se encontró una acción previa no reconciliada. Revise el estado o reintente exactamente el mismo envío.'); this.canRetrySame.set(true);
      }
    } catch { this.intentStorageBlocked.set(true); this.pendingMessage.set('No se pudo recuperar una operación pendiente del almacenamiento local. No inicie otra operación hasta revisar el pedido.'); }
  }

  private persistIntent(intent: PendingIntent): void {
    try { sessionStorage.setItem(this.storageKey(), JSON.stringify(intent)); }
    catch { throw new Error('El navegador no pudo guardar la clave idempotente de forma segura. La acción no se envió.'); }
  }
  private clearIntent(): void {
    try { sessionStorage.removeItem(this.storageKey()); } catch { /* Retain the in-memory guard if storage is unavailable. */ }
    this.pendingIntent.set(null); this.canRetrySame.set(false);
  }
  private storageKey(): string { return `abar-admin-order-intent:${this.orderId}`; }
}
