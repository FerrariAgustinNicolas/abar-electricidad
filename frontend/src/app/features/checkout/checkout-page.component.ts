import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, DestroyRef, effect, inject, signal } from '@angular/core';
import { AbstractControl, FormBuilder, ReactiveFormsModule, ValidationErrors, ValidatorFn, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { CartStateService } from '../../core/cart/cart-state.service';
import { CheckoutHandoffService } from '../../core/orders/checkout-handoff.service';
import { OrderCreateIntentGuardService } from '../../core/orders/order-create-intent-guard.service';
import { OrderAccessSessionService } from '../../core/orders/order-access-session.service';
import { OrdersApiService } from '../../core/orders/orders-api.service';
import { CreateOrderRequest, CreateOrderResponse, H4Terms } from '../../core/orders/orders.models';
import { QuoteResponse } from '../../core/cart/cart.models';
import { formatMoney } from '../catalog/format-money';

interface OrderIntent { body: CreateOrderRequest; key: string }

@Component({
  selector: 'abar-checkout-page', standalone: true, imports: [ReactiveFormsModule, RouterLink, DatePipe],
  template: `
    <main class="checkout-page" aria-labelledby="checkout-title">
      <p class="eyebrow">Compra de demostración</p><h1 id="checkout-title">Finalizar pedido</h1>
      @if (unresolvedIntent()) {
        <section class="notice" role="alert"><p>Hay una solicitud de pedido cuyo resultado quedó sin confirmar antes de salir de esta pantalla. Para evitar duplicados, no iniciaremos otra solicitud desde esta sesión.</p><p>La consulta mínima puede mostrar el estado, pero no restaura el acceso privado.</p><a routerLink="/consultar-pedido">Ir a consulta mínima del pedido</a></section>
      } @else if (!quote()) {
        <section class="notice" role="alert"><p>No hay un presupuesto vigente aceptado para este carrito.</p><p>Volvé al carrito, generá un presupuesto del servidor y aceptalo para continuar.</p><a routerLink="/carrito">Volver al carrito</a></section>
      } @else {
        <p class="notice warning">Registrar un pedido no reserva ni garantiza existencias futuras. Los importes y renglones siguientes provienen del presupuesto vigente del servidor.</p>
        <section class="summary" aria-labelledby="summary-title"><h2 id="summary-title">Resumen del presupuesto</h2>
          <p>Presupuesto vigente hasta <time [attr.datetime]="quote()!.expiresAt">{{ quote()!.expiresAt | date:'short' }}</time>.</p>
          <ul>@for (item of quote()!.items; track item.presentationId) {
            <li><span>{{ item.productName }} · {{ unitLabel(item) }} × {{ item.quantity }}</span><strong>{{ formatMoney(item.lineTotal.amountMinor) }}</strong></li>
          }</ul>
          <dl><div><dt>Subtotal</dt><dd>{{ formatMoney(quote()!.subtotal.amountMinor) }}</dd></div><div><dt>Entrega</dt><dd>{{ formatMoney(quote()!.deliveryFee.amountMinor) }}</dd></div><div class="total"><dt>Total solicitado</dt><dd>{{ formatMoney(quote()!.total.amountMinor) }}</dd></div></dl>
          <p>Modalidad: {{ quote()!.deliveryMode === 'PICKUP' ? 'Retiro' : 'Entrega coordinada' }} · Método demo: {{ quote()!.paymentMethod.label }}</p>
        </section>
        @if (termsLoading()) { <p role="status">Cargando las condiciones de demostración…</p> }
        @if (termsError()) { <p class="error" role="alert">No pudimos cargar las condiciones vigentes. Reintentá antes de confirmar.</p><button type="button" class="secondary" (click)="loadTerms()" [disabled]="submitting()">Reintentar condiciones</button> }
        @if (terms(); as currentTerms) {
          <form [formGroup]="form" (ngSubmit)="submit()" novalidate>
            <fieldset [disabled]="formLocked()"><legend>Datos del comprador</legend>
              <div class="fields">
                <label for="first-name">Nombre <span aria-hidden="true">*</span><input id="first-name" formControlName="firstName" maxlength="100" autocomplete="given-name" required [attr.aria-invalid]="fieldInvalid('firstName')" [attr.aria-describedby]="fieldInvalid('firstName') ? 'first-name-error' : null" />
                  @if (fieldInvalid('firstName')) { <span id="first-name-error" class="error">Ingresá tu nombre.</span> }</label>
                <label for="last-name">Apellido <span aria-hidden="true">*</span><input id="last-name" formControlName="lastName" maxlength="100" autocomplete="family-name" required [attr.aria-invalid]="fieldInvalid('lastName')" [attr.aria-describedby]="fieldInvalid('lastName') ? 'last-name-error' : null" />
                  @if (fieldInvalid('lastName')) { <span id="last-name-error" class="error">Ingresá tu apellido.</span> }</label>
                <label for="email">Correo electrónico <span aria-hidden="true">*</span><input id="email" type="email" formControlName="email" maxlength="254" autocomplete="email" required [attr.aria-invalid]="fieldInvalid('email')" [attr.aria-describedby]="fieldInvalid('email') ? 'email-error' : null" />
                  @if (fieldInvalid('email')) { <span id="email-error" class="error">Ingresá un correo válido.</span> }</label>
                <label for="phone">Teléfono <span aria-hidden="true">*</span><input id="phone" type="tel" formControlName="phone" maxlength="32" autocomplete="tel" required [attr.aria-invalid]="fieldInvalid('phone')" [attr.aria-describedby]="fieldInvalid('phone') ? 'phone-error' : null" />
                  @if (fieldInvalid('phone')) { <span id="phone-error" class="error">Ingresá un teléfono válido.</span> }</label>
              </div>
            </fieldset>
            @if (quote()!.deliveryMode === 'COORDINATED') {
              <fieldset [disabled]="formLocked()"><legend>Datos para la entrega coordinada</legend><div class="fields">
                <label for="address-line">Dirección <span aria-hidden="true">*</span><input id="address-line" formControlName="addressLine" maxlength="200" autocomplete="street-address" required [attr.aria-invalid]="fieldInvalid('addressLine')" [attr.aria-describedby]="fieldInvalid('addressLine') ? 'address-line-error' : null" />
                  @if (fieldInvalid('addressLine')) { <span id="address-line-error" class="error">Ingresá una dirección.</span> }</label>
                <label for="locality">Localidad <span aria-hidden="true">*</span><input id="locality" formControlName="locality" maxlength="100" autocomplete="address-level2" required [attr.aria-invalid]="fieldInvalid('locality')" [attr.aria-describedby]="fieldInvalid('locality') ? 'locality-error' : null" />
                  @if (fieldInvalid('locality')) { <span id="locality-error" class="error">Ingresá una localidad.</span> }</label>
                <label for="instructions">Instrucciones opcionales<textarea id="instructions" formControlName="instructions" maxlength="500"></textarea></label>
              </div></fieldset>
            }
            <fieldset [disabled]="formLocked()"><legend>Condiciones de demostración</legend><p class="terms">{{ currentTerms.text }}</p>
              <label class="check"><input type="checkbox" formControlName="accepted" required /> Leí y acepto las condiciones provisionales de demostración (versión {{ currentTerms.version }}). <span aria-hidden="true">*</span></label>
              @if (form.controls.accepted.touched && !form.controls.accepted.value) { <p class="error" role="alert">Tenés que aceptar la versión vigente para crear el pedido.</p> }
            </fieldset>
            @if (submitError()) { <p class="error" role="alert">{{ submitError() }}</p> }
            @if (unknownOutcome()) { <p class="notice" role="alert">No pudimos confirmar la respuesta. El carrito se conserva. Reintentá la misma solicitud para reconciliarla; no cambies los datos ni se generará otra clave mientras el resultado sea desconocido.</p> }
            @if (unknownOutcome() && quoteExpired()) { <p class="notice">El presupuesto venció después del primer envío. Este reintento conserva la solicitud y clave originales solo para reconciliar ese resultado; no representa un pedido nuevo.</p> }
            <div class="actions"><a routerLink="/carrito">Volver al carrito</a><button class="primary" type="submit" [disabled]="!canSubmit()">{{ submitting() ? 'Registrando pedido…' : unknownOutcome() ? 'Reintentar la misma solicitud' : 'Crear pedido' }}</button></div>
          </form>
        }
      }
    </main>
  `,
  styles: [`
    :host{display:block;color:var(--color-text)}.checkout-page{max-width:820px;margin:0 auto;padding:clamp(1.25rem,4vw,3rem)}h1{font-size:clamp(1.8rem,4vw,2.5rem)}.summary,fieldset{margin:1.25rem 0;padding:1.25rem;border:1px solid var(--color-border);border-radius:.7rem}.summary h2{margin-top:0}.summary ul{padding:0;list-style:none}.summary li,.summary dl div{display:flex;justify-content:space-between;gap:1rem;padding:.65rem 0;border-bottom:1px solid var(--color-border)}.summary dl{max-width:34rem;margin-left:auto}.summary dd{margin:0}.total{font-size:1.2rem;font-weight:800}.fields{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:1rem}.fields label,fieldset>label{display:grid;gap:.4rem;font-weight:600}input,textarea{box-sizing:border-box;width:100%;min-height:2.75rem;padding:.55rem .7rem;border:1px solid var(--color-border);border-radius:.4rem;font:inherit;color:var(--color-text);background:var(--color-surface)}textarea{min-height:6rem}.terms,.notice{line-height:1.55}.notice{padding:.9rem 1rem;background:var(--color-surface-subtle);border-left:4px solid var(--color-muted);border-radius:.4rem}.warning{border-left-color:var(--color-orange)}.check{display:flex!important;align-items:flex-start;gap:.6rem!important}.check input{width:1.25rem;min-height:1.25rem;flex:none}.error{color:#8a2d19}.actions{display:flex;justify-content:space-between;align-items:center;gap:1rem;margin-top:1.5rem}.actions a{color:var(--color-blue-dark)}button{min-height:2.75rem;padding:.6rem 1rem;border:1px solid var(--color-border);border-radius:.45rem;font:inherit;font-weight:700;cursor:pointer}.primary{background:var(--color-blue-dark);color:#fff}.secondary{background:var(--color-surface-subtle);color:var(--color-text)}button:focus-visible,a:focus-visible,input:focus-visible,textarea:focus-visible{outline:3px solid var(--color-orange);outline-offset:2px}button:disabled{opacity:.55;cursor:not-allowed}@media(max-width:600px){.fields{grid-template-columns:1fr}.actions{align-items:stretch;flex-direction:column}.actions button{width:100%}}
  `], changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CheckoutPageComponent {
  private readonly fb = inject(FormBuilder).nonNullable;
  private readonly api = inject(OrdersApiService);
  private readonly handoff = inject(CheckoutHandoffService);
  private readonly cart = inject(CartStateService);
  private readonly access = inject(OrderAccessSessionService);
  private readonly intentGuard = inject(OrderCreateIntentGuardService);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);
  readonly quote = signal<QuoteResponse | null>(null);
  readonly terms = signal<H4Terms | null>(null);
  readonly termsLoading = signal(false);
  readonly termsError = signal(false);
  readonly submitting = signal(false);
  readonly submitError = signal('');
  readonly unknownOutcome = signal(false);
  readonly unresolvedIntent = signal(Boolean(this.intentGuard.current()));
  readonly now = signal(Date.now());
  private intent: OrderIntent | null = null;
  readonly form = this.fb.group({
    firstName: ['', [Validators.required, nonBlank, Validators.maxLength(100)]],
    lastName: ['', [Validators.required, nonBlank, Validators.maxLength(100)]],
    email: ['', [Validators.required, Validators.email, Validators.maxLength(254)]],
    phone: ['', [Validators.required, Validators.minLength(7), Validators.maxLength(32), Validators.pattern(/^(?=.*[0-9])[+0-9 ()-]+$/)]],
    addressLine: ['', [Validators.maxLength(200)]],
    locality: ['', [Validators.maxLength(100)]],
    instructions: ['', [Validators.maxLength(500)]],
    accepted: [false],
  });

  constructor() {
    this.refreshQuote();
    if (this.quote()?.deliveryMode === 'COORDINATED') {
      this.form.controls.addressLine.addValidators([Validators.required, nonBlank]);
      this.form.controls.locality.addValidators([Validators.required, nonBlank]);
    }
    this.form.updateValueAndValidity();
    this.form.valueChanges.subscribe(() => { if (!this.unknownOutcome()) this.submitError.set(''); });
    effect(() => {
      const current = this.quote();
      const lines = this.cart.lines();
      if (!this.unknownOutcome() && current && this.handoff.current(lines)?.quoteId !== current.quoteId) this.invalidateQuote();
    });
    const expiryTimer = setInterval(() => {
      const current = this.quote();
      this.now.set(Date.now());
      if (!this.unknownOutcome() && current && !this.handoff.current(this.cart.lines())) this.invalidateQuote();
    }, 1000);
    this.destroyRef.onDestroy(() => { this.handoff.clear(); clearInterval(expiryTimer); });
    void this.loadTerms();
  }

  formatMoney = formatMoney;
  formLocked(): boolean { return this.submitting() || this.unknownOutcome(); }
  canSubmit(): boolean { return Boolean(!this.unresolvedIntent() && this.quote() && (this.unknownOutcome() || !this.quoteExpired()) && this.terms() && !this.termsLoading() && !this.termsError() && !this.submitting() && this.form.valid && this.form.controls.accepted.value && (!this.submitError() || this.unknownOutcome())); }
  quoteExpired(): boolean { const quote = this.quote(); this.now(); return Boolean(quote && Date.parse(quote.expiresAt) <= Date.now()); }
  fieldInvalid(name: 'firstName' | 'lastName' | 'email' | 'phone' | 'addressLine' | 'locality'): boolean {
    const control = this.form.controls[name];
    return control.invalid && (control.touched || control.dirty);
  }
  unitLabel(item: QuoteResponse['items'][number]): string { return item.unit === 'UNIT' ? 'unidad' : item.unit === 'METER' ? 'metro' : `rollo${item.rollLengthMeters ? ` de ${item.rollLengthMeters} m` : ''}`; }

  async loadTerms(): Promise<void> {
    this.termsLoading.set(true); this.termsError.set(false);
    try { this.terms.set(await firstValueFrom(this.api.terms())); }
    catch { this.termsError.set(true); }
    finally { this.termsLoading.set(false); }
  }

  async submit(): Promise<void> {
    if (this.unresolvedIntent()) return;
    if (!this.canSubmit()) { this.form.markAllAsTouched(); return; }
    const quote = this.quote(); const terms = this.terms();
    if (!quote || !terms) return;
    const value = this.form.getRawValue();
    const body: CreateOrderRequest = {
      quoteId: quote.quoteId,
      customer: { firstName: value.firstName.trim(), lastName: value.lastName.trim(), email: value.email.trim(), phone: value.phone.trim() },
      acceptedTermsVersion: terms.version,
      ...(quote.deliveryMode === 'COORDINATED' ? { deliveryDetails: { addressLine: value.addressLine.trim(), locality: value.locality.trim(), ...(value.instructions.trim() ? { instructions: value.instructions.trim() } : {}) } } : {}),
    };
    if (this.intent && JSON.stringify(this.intent.body) !== JSON.stringify(body)) {
      this.submitError.set('La solicitud anterior aún no está reconciliada. Reintentá con los mismos datos antes de iniciar otra intención.');
      this.unknownOutcome.set(true);
      return;
    }
    if (!this.intent) {
      try { this.intent = { body, key: crypto.randomUUID() }; }
      catch { this.submitError.set('Este navegador no puede generar una clave segura de intento.'); return; }
    }
    this.intentGuard.mark({ quoteId: this.intent.body.quoteId, idempotencyKey: this.intent.key });
    this.submitting.set(true); this.submitError.set('');
    try {
      const response = await firstValueFrom(this.api.createOrder(this.intent.body, this.intent.key));
      if (response.status !== 201 || !response.body) {
        this.unknownOutcome.set(true);
        this.submitError.set('No recibimos una confirmación válida. Reintentá la misma solicitud para reconciliarla.');
        return;
      }
      const created: CreateOrderResponse = response.body;
      this.access.save({ orderId: created.orderId, accessToken: created.accessToken, accessExpiresAt: created.accessExpiresAt });
      this.cart.clear();
      this.handoff.clear();
      this.intentGuard.clear();
      this.intent = null;
      await this.router.navigate(['/pedido', created.orderId, 'resultado']);
    } catch (error: unknown) {
      if (isUnknownOutcome(error)) {
        this.unknownOutcome.set(true);
        this.submitError.set('No pudimos confirmar la respuesta del servidor. Reintentá la misma solicitud para reconciliarla.');
      } else {
        this.intent = null;
        this.intentGuard.clear();
        this.unknownOutcome.set(false);
        this.submitError.set(errorMessage(error));
      }
    } finally { this.submitting.set(false); }
  }

  private refreshQuote(): void {
    const current = this.handoff.current(this.cart.lines());
    this.quote.set(current);
    if (!current) this.handoff.clear();
  }

  private invalidateQuote(): void {
    this.handoff.clear(); this.quote.set(null);
    if (this.unknownOutcome()) this.submitError.set('El carrito cambió mientras el resultado estaba pendiente. La clave y solicitud anteriores se conservan; no se puede iniciar otro pedido desde esta pantalla.');
  }
}

function isUnknownOutcome(error: unknown): boolean {
  return !(error instanceof HttpErrorResponse) || error.status === 0 || error.status >= 500;
}
function errorMessage(error: unknown): string {
  if (error instanceof HttpErrorResponse && error.status === 409) return 'El presupuesto cambió, venció o ya fue utilizado. Volvé al carrito, generá otro presupuesto y aceptalo antes de confirmar.';
  if (error instanceof HttpErrorResponse && error.status === 429) return 'Hay demasiados intentos en este momento. Esperá un poco antes de volver a intentar.';
  if (error instanceof HttpErrorResponse && error.status === 503) return 'El servicio de pedidos no está disponible. El carrito se conserva.';
  return 'No pudimos crear el pedido. Revisá los datos; el carrito se conserva.';
}

const nonBlank: ValidatorFn = (control: AbstractControl): ValidationErrors | null => typeof control.value === 'string' && control.value.trim().length > 0 ? null : { required: true };
