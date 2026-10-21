import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { OrdersApiService } from '../../core/orders/orders-api.service';
import { OrderLookupResponse } from '../../core/orders/orders.models';

@Component({
  selector: 'abar-order-lookup-page', standalone: true, imports: [ReactiveFormsModule, RouterLink],
  template: `
    <main class="lookup-page" aria-labelledby="lookup-title"><p class="eyebrow">Consulta mínima</p><h1 id="lookup-title">Consultar pedido</h1>
      <p>Ingresá el número de pedido y el correo o teléfono asociado. Esta consulta muestra solo el estado y no recupera credenciales de acceso.</p>
      <form [formGroup]="form" (ngSubmit)="lookup()" novalidate>
        <label for="order-number">Número de pedido<input id="order-number" formControlName="orderNumber" maxlength="64" autocomplete="off" required /></label>
        <label for="contact">Correo electrónico o teléfono<input id="contact" formControlName="contact" maxlength="254" autocomplete="email" required /></label>
        @if (error()) { <p class="error" role="alert">{{ error() }}</p> }
        <button class="primary" type="submit" [disabled]="loading() || form.invalid">{{ loading() ? 'Buscando…' : 'Consultar estado' }}</button>
      </form>
      @if (result(); as current) { <section class="result" aria-live="polite" aria-labelledby="lookup-result-title"><h2 id="lookup-result-title">Pedido {{ current.orderNumber }}</h2>
        <p>Estado del pedido: <strong>{{ orderLabel(current.orderStatus) }}</strong></p><p>Estado comercial del pago: <strong>{{ paymentLabel(current.paymentStatus) }}</strong></p>
        <p>Resultado del intento demo: <strong>{{ attemptLabel(current.currentAttemptStatus) }}</strong></p><p>Fecha: <time [attr.datetime]="current.createdAt">{{ current.createdAt }}</time></p>
        <p>La consulta no entrega una credencial ni permite cambios. Si perdiste el acceso, contactá al comercio por los canales informados en tu pedido.</p>
      </section> }
      <p><a routerLink="/productos">Volver al catálogo</a></p>
    </main>
  `,
  styles: [`
    :host{display:block;color:var(--color-text)}.lookup-page{max-width:680px;margin:0 auto;padding:clamp(1.25rem,4vw,3rem)}h1{font-size:clamp(1.8rem,4vw,2.5rem)}form{display:grid;gap:1rem;margin:1.5rem 0;padding:1.25rem;border:1px solid var(--color-border);border-radius:.7rem}label{display:grid;gap:.4rem}input,button{box-sizing:border-box;min-height:2.75rem;padding:.55rem .7rem;font:inherit;border:1px solid var(--color-border);border-radius:.4rem;background:var(--color-surface)}button{cursor:pointer}.primary{background:var(--color-blue-dark);color:white;font-weight:700}.result{padding:1.25rem;border:1px solid var(--color-border);border-radius:.7rem}.error{color:#8a2d19}a{color:var(--color-blue-dark)}button:focus-visible,a:focus-visible,input:focus-visible{outline:3px solid var(--color-orange);outline-offset:2px}button:disabled{opacity:.55;cursor:not-allowed}
  `], changeDetection: ChangeDetectionStrategy.OnPush,
})
export class OrderLookupPageComponent {
  private readonly fb = inject(FormBuilder).nonNullable;
  private readonly api = inject(OrdersApiService);
  readonly form = this.fb.group({
    orderNumber: ['', [Validators.required, Validators.maxLength(64)]],
    contact: ['', [Validators.required, Validators.minLength(3), Validators.maxLength(254)]],
  });
  readonly loading = signal(false);
  readonly error = signal('');
  readonly result = signal<OrderLookupResponse | null>(null);

  attemptLabel(status: OrderLookupResponse['currentAttemptStatus']): string { return status === 'APPROVED' ? 'Aprobado en la simulación' : status === 'REJECTED' ? 'Rechazado en la simulación' : 'Pendiente en la simulación'; }
  orderLabel(status: OrderLookupResponse['orderStatus']): string { return ({ RECEIVED: 'Recibido', PREPARING: 'En preparación', READY: 'Listo para retirar o coordinar', DELIVERED: 'Entregado', CANCELLED: 'Cancelado' })[status]; }
  paymentLabel(status: OrderLookupResponse['paymentStatus']): string { return status === 'PAID' ? 'Pagado (confirmación manual)' : status === 'REJECTED' ? 'Rechazado' : 'Pendiente de confirmación'; }

  async lookup(): Promise<void> {
    if (this.loading() || this.form.invalid) { this.form.markAllAsTouched(); return; }
    this.loading.set(true); this.error.set(''); this.result.set(null);
    try { this.result.set(await firstValueFrom(this.api.lookup({ orderNumber: this.form.controls.orderNumber.value.trim(), contact: this.form.controls.contact.value.trim() }))); }
    catch { this.error.set('No se encontró un pedido con esos datos o no fue posible realizar la consulta. Revisá la información e intentá nuevamente.'); }
    finally { this.loading.set(false); }
  }
}
