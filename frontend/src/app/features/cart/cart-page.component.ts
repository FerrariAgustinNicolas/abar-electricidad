import { ChangeDetectionStrategy, Component, DestroyRef, computed, effect, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { DOCUMENT } from '@angular/common';
import { RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { CartLine, CartStateService, CART_MAX_QUANTITY } from '../../core/cart/cart-state.service';
import { DeliveryMode, DemoPaymentMethod, PublicSettings, QuoteResponse } from '../../core/cart/cart.models';
import { PublicCheckoutApiService } from '../../core/cart/public-checkout-api.service';
import { ProductSummary, PublicPresentation } from '../../core/catalog/catalog.models';
import { PublicCatalogApiService } from '../../core/catalog/public-catalog-api.service';
import { formatMoney } from '../catalog/format-money';

interface CartProductLine extends CartLine { presentation: PublicPresentation | null; product: ProductSummary | null }
type QuoteError = 'conflict' | 'rate-limit' | 'unavailable' | 'generic' | '';

@Component({
  selector: 'abar-cart-page', standalone: true, imports: [DatePipe, RouterLink],
  template: `
    <section class="cart-page" aria-labelledby="cart-title">
      <h1 id="cart-title">Carrito y presupuesto</h1>
      <p class="warning" role="note"><strong>Importante:</strong> presupuestar no garantiza disponibilidad futura ni constituye pedido o pago.</p>
      @if (cart.localIssue()) { <p class="notice" role="alert">{{ cart.localIssue() }}</p> }
      @if (catalogLoading()) { <p role="status" aria-live="polite">Actualizando los productos del carrito…</p> }
      @if (catalogError()) { <div class="notice" role="alert"><p>No pudimos actualizar los productos del carrito.</p><button type="button" (click)="reloadCatalog()">Reintentar</button></div> }
      @if (lines().length === 0 && !catalogLoading()) {
        <div class="empty"><p>Tu carrito está vacío.</p><a routerLink="/productos">Ver productos</a></div>
      } @else {
        <ul class="cart-lines" aria-label="Productos del carrito">
          @for (entry of lines(); track entry.presentationId) {
            <li class="cart-line">
              @if (entry.product; as product) {
                @if (entry.presentation; as presentation) {
                <div class="line-copy"><h2>{{ product.name }}</h2>
                  <p>{{ unitLabel(presentation) }} · {{ formatMoney(presentation.price.amountMinor) }} por {{ unitLabel(presentation) }}</p>
                  @if (!presentation.sellable) { <p class="notice" role="status">Esta presentación ya no está disponible para la venta. Podés quitarla del carrito.</p> }
                  @else if (presentation.availability === 'OUT_OF_STOCK') { <p class="notice" role="status">Sin disponibilidad actual para presupuestar. Podés quitarla del carrito.</p> }
                </div>
                <div class="line-actions">
                  <label [for]="'quantity-' + entry.presentationId">Cantidad ({{ unitLabel(entry.presentation) }})</label>
                  <div class="stepper">
                    <button type="button" [attr.aria-label]="'Disminuir ' + product.name" [disabled]="entry.quantity <= 1" (click)="decrement(entry.presentationId)">−</button>
                    <output [id]="'quantity-' + entry.presentationId" aria-live="polite">{{ entry.quantity }}</output>
                    <button type="button" [attr.aria-label]="'Aumentar ' + product.name" [disabled]="entry.quantity >= maxQuantity" (click)="increment(entry.presentationId)">+</button>
                  </div>
                  <button type="button" class="text-button" [attr.aria-label]="'Quitar ' + product.name" (click)="remove(entry.presentationId)">Quitar</button>
                </div>
                }
              } @else {
                <div class="line-copy"><h2>Presentación no disponible</h2><p>No pudimos encontrar este producto en el catálogo actual.</p><p class="notice" role="status">Revisá el catálogo o quitá esta línea para continuar.</p></div>
                <button type="button" class="text-button" (click)="remove(entry.presentationId)">Quitar</button>
              }
            </li>
          }
        </ul>
        @if (cart.lines().length > 0) { <button class="secondary-button" type="button" (click)="clearCart()">Vaciar carrito</button> }
        <section class="quote-section" aria-labelledby="quote-title">
          <h2 id="quote-title">Opciones de presupuesto</h2>
          <p class="notice">El presupuesto no se guarda al recargar esta página. Después de volver, solicitá uno nuevo y aceptalo explícitamente antes de continuar.</p>
          @if (settingsLoading()) { <p role="status" aria-live="polite">Cargando opciones…</p> }
          @if (settingsError()) { <div class="notice" role="alert"><p>No pudimos cargar las opciones del presupuesto.</p><button type="button" (click)="loadSettings()">Reintentar</button></div> }
          @if (settings(); as policy) {
            <div class="field"><label for="delivery-mode">Modalidad de entrega</label>
              <select id="delivery-mode" [value]="deliveryMode()" (change)="changeMode($event)">
                @for (mode of policy.deliveryModes; track mode) { <option [value]="mode">{{ modeLabel(mode) }}</option> }
              </select>
            </div>
            @if (methodsLoading()) { <p role="status" aria-live="polite">Cargando métodos demo…</p> }
            @if (methodsError()) { <div class="notice" role="alert"><p>No pudimos cargar los métodos demo.</p><button type="button" (click)="loadMethods()">Reintentar</button></div> }
            @if (methods().length > 0) {
              <div class="field"><label for="payment-method">Método demo</label>
                <select id="payment-method" [value]="paymentMethodCode()" (change)="changeMethod($event)">
                  @for (method of methods(); track method.code) { <option [value]="method.code">{{ method.label }}</option> }
                </select>
                @if (selectedMethod(); as method) { <p>{{ method.instructions }}</p> }
              </div>
            }
            @if (deliveryMode() === 'COORDINATED') { <p>Tarifa coordinada informada por el servidor: {{ formatMoney(policy.deliveryFee.amountMinor) }}.</p> }
            <button type="button" class="primary-button" [disabled]="quoteBusy() || cart.lines().length === 0 || !quoteReady()" (click)="requestQuote()">
              {{ quoteBusy() ? 'Actualizando presupuesto…' : quote() ? 'Actualizar presupuesto' : 'Solicitar presupuesto' }}
            </button>
          }
          @if (quoteError()) { <p class="notice" role="alert">{{ quoteErrorMessage() }}</p> }
          @if (quoteChanges()) { <p class="notice change-notice" role="alert">{{ quoteChanges() }}</p> }
          @if (quote(); as current) {
            <section class="quote-card" aria-labelledby="quote-summary-title" aria-live="polite">
              <h3 id="quote-summary-title">Resumen vigente del servidor</h3>
              <p>Presupuesto {{ current.quoteId }}</p>
              <p>Vence: <time [attr.datetime]="current.expiresAt">{{ current.expiresAt | date:'short' }}</time>
                @if (expired()) { <strong class="expired"> · Vencido</strong> }
              </p>
              <ul>@for (item of current.items; track item.presentationId) {
                <li>{{ item.productName }} — {{ unitLabel(item) }} × {{ item.quantity }}: {{ formatMoney(item.lineTotal.amountMinor) }}</li>
              }</ul>
              <dl><div><dt>Subtotal</dt><dd>{{ formatMoney(current.subtotal.amountMinor) }}</dd></div>
                <div><dt>Entrega</dt><dd>{{ formatMoney(current.deliveryFee.amountMinor) }}</dd></div>
                @if (!expired()) { <div class="total"><dt>Total</dt><dd>{{ formatMoney(current.total.amountMinor) }}</dd></div> }
              </dl>
              <p class="warning">Este presupuesto es temporal y no reserva existencias ni crea un pedido o pago.</p>
              @if (expired()) { <p class="notice" role="alert">El presupuesto venció. Solicitá uno nuevo para ver cifras actuales.</p>
                <button class="primary-button" type="button" disabled>Aceptar este presupuesto</button>
              }
              @else if (acceptanceRequired()) {
                <button class="primary-button" type="button" [disabled]="expired()" (click)="acceptQuote()">Aceptar este presupuesto</button>
              } @else { <p class="accepted" role="status">Presupuesto aceptado explícitamente para esta sesión.</p> }
            </section>
          }
        </section>
      }
    </section>
  `,
  styles: [`
    :host{display:block;color:var(--color-text)}.cart-page{max-width:1000px;margin:0 auto;padding:clamp(1.25rem,4vw,3rem)}
    .cart-page h1{font-size:clamp(1.8rem,4vw,2.5rem)}.warning,.notice{padding:.85rem 1rem;border-radius:.5rem;background:var(--color-surface-subtle);line-height:1.5}
    .warning{border-left:4px solid var(--color-orange)}.notice{border-left:4px solid var(--color-muted)}.cart-lines{list-style:none;padding:0;margin:1.5rem 0}
    .cart-line{display:flex;justify-content:space-between;gap:1.5rem;padding:1.25rem 0;border-bottom:1px solid var(--color-border)}.line-copy{min-width:0}.line-copy h2{font-size:1.15rem;margin:.1rem 0}
    .line-copy p{margin:.4rem 0}.line-actions{display:grid;gap:.45rem;align-content:start;min-width:180px}.stepper{display:flex;align-items:center;gap:.5rem}
    .stepper button,.primary-button,.secondary-button,.text-button,.notice button{min-height:2.75rem;font:inherit;cursor:pointer}.stepper button{width:2.75rem;border:1px solid var(--color-border);background:var(--color-surface-subtle);font-size:1.2rem}
    .stepper output{min-width:2.5rem;text-align:center}.primary-button,.secondary-button,.notice button{padding:.6rem 1rem;border:0;border-radius:.45rem;font-weight:700}
    .primary-button{background:var(--color-blue-dark);color:#fff}.secondary-button,.notice button{background:var(--color-surface-subtle);color:var(--color-text);border:1px solid var(--color-border)}
    .text-button{padding:.25rem .5rem;border:0;background:transparent;color:var(--color-blue-dark);text-decoration:underline}.field{display:grid;gap:.4rem;max-width:450px;margin:1rem 0}
    select{min-height:2.8rem;padding:.5rem;border:1px solid var(--color-border);border-radius:.4rem;background:var(--color-surface);font:inherit}.quote-section{margin-top:2rem;padding-top:1rem;border-top:2px solid var(--color-border)}
    .quote-card{margin-top:1.5rem;padding:1.25rem;border:1px solid var(--color-border);border-radius:.75rem}.quote-card h3{margin-top:0}.quote-card dl{max-width:400px}.quote-card dl div{display:flex;justify-content:space-between;gap:1rem}.quote-card dd{margin:0}.quote-card .total{font-size:1.25rem;font-weight:800;border-top:1px solid var(--color-border);padding-top:.75rem}
    .expired{color:#8a2d19}.accepted{font-weight:700;color:var(--color-blue-dark)}.empty{padding:2rem 0}.empty a{color:var(--color-blue-dark);font-weight:700}
    button:focus-visible,a:focus-visible,select:focus-visible{outline:3px solid var(--color-orange);outline-offset:2px}button:disabled{opacity:.55;cursor:not-allowed}
    @media(max-width:600px){.cart-line{display:grid}.line-actions{min-width:0}.cart-line .text-button{justify-self:start}}
  `], changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CartPageComponent {
  readonly cart = inject(CartStateService);
  private readonly catalogApi = inject(PublicCatalogApiService);
  private readonly checkoutApi = inject(PublicCheckoutApiService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly document = inject(DOCUMENT);
  readonly maxQuantity = CART_MAX_QUANTITY;
  readonly catalogLoading = signal(false);
  readonly catalogError = signal(false);
  readonly settingsLoading = signal(false);
  readonly settingsError = signal(false);
  readonly methodsLoading = signal(false);
  readonly methodsError = signal(false);
  readonly quoteBusy = signal(false);
  readonly quoteError = signal<QuoteError>('');
  readonly quoteChanges = signal('');
  readonly settings = signal<PublicSettings | null>(null);
  readonly methods = signal<DemoPaymentMethod[]>([]);
  readonly quote = signal<QuoteResponse | null>(null);
  private readonly comparisonQuote = signal<QuoteResponse | null>(null);
  readonly now = signal(Date.now());
  readonly acceptedQuoteId = signal('');
  readonly acceptanceRequired = computed(() => {
    const current = this.quote();
    return Boolean(current && this.acceptedQuoteId() !== current.quoteId);
  });
  readonly expired = computed(() => {
    const current = this.quote();
    this.now(); // Recompute on timer ticks; a newly arrived response uses the current clock.
    return !current || Date.parse(current.expiresAt) <= Date.now();
  });
  readonly deliveryMode = signal<DeliveryMode>('PICKUP');
  readonly paymentMethodCode = signal<DemoPaymentMethod['code']>('DEMO_PAY_ON_PICKUP');
  readonly selectedMethod = computed(() => this.methods().find((method) => method.code === this.paymentMethodCode()) ?? null);
  readonly quoteReady = computed(() => {
    const method = this.selectedMethod();
    return Boolean(this.settings() && !this.methodsLoading() && !this.methodsError() && method &&
      method.deliveryModes.includes(this.deliveryMode()) && this.cart.lines().length > 0 &&
      this.lines().length === this.cart.lines().length && this.lines().every((line) => line.product && line.presentation?.sellable));
  });
  readonly lines = signal<CartProductLine[]>([]);
  private catalogRevision = 0;
  private quoteRevision = 0;
  private methodsRevision = 0;
  private cartSignature = '';

  constructor() {
    effect(() => {
      const signature = JSON.stringify(this.cart.lines());
      if (this.cartSignature && signature !== this.cartSignature) this.invalidateQuote('El carrito cambió. Solicitá un presupuesto actualizado y aceptalo explícitamente.');
      this.cartSignature = signature;
      void this.resolveLines();
    });
    void this.loadSettings();
    const expiryTimer = setInterval(() => {
      this.now.set(Date.now());
      const current = this.quote();
      if (current && Date.parse(current.expiresAt) <= Date.now()) this.acceptedQuoteId.set('');
    }, 1000);
    const onVisibilityChange = () => {
      if (this.document.visibilityState === 'hidden' && this.quote()) {
        this.acceptedQuoteId.set('');
        this.quoteChanges.set('Al volver a esta pestaña, revisá el presupuesto vigente y aceptalo explícitamente.');
      }
    };
    this.document.addEventListener('visibilitychange', onVisibilityChange);
    this.destroyRef.onDestroy(() => { clearInterval(expiryTimer); this.document.removeEventListener('visibilitychange', onVisibilityChange); this.catalogRevision++; this.quoteRevision++; this.methodsRevision++; });
  }

  formatMoney = formatMoney;
  unitLabel(item: Pick<PublicPresentation, 'unit' | 'rollLengthMeters'>): string {
    return item.unit === 'UNIT' ? 'unidad' : item.unit === 'METER' ? 'metro' : `rollo${item.rollLengthMeters ? ` de ${item.rollLengthMeters} m` : ''}`;
  }
  modeLabel(mode: DeliveryMode): string { return mode === 'PICKUP' ? 'Retiro' : 'Entrega coordinada'; }
  quoteErrorMessage(): string {
    switch (this.quoteError()) {
      case 'conflict': return 'La disponibilidad o una opción cambió. Revisá el carrito y volvé a solicitar el presupuesto.';
      case 'rate-limit': return 'Se alcanzó el límite temporal de solicitudes. Esperá un momento y reintentá.';
      case 'unavailable': return 'El servicio de presupuesto no está disponible ahora. El carrito se conserva; podés reintentar.';
      case 'generic': return 'No pudimos generar el presupuesto. El carrito se conserva; revisá la conexión e intentá nuevamente.';
      default: return '';
    }
  }

  async reloadCatalog(): Promise<void> {
    const revision = ++this.catalogRevision;
    this.catalogLoading.set(true); this.catalogError.set(false);
    try {
      const found = new Map<string, { product: ProductSummary; presentation: PublicPresentation }>();
      const first = await firstValueFrom(this.catalogApi.products({ page: 1, pageSize: 100 }));
      const pages = [first];
      for (let page = 2; page <= first.pageInfo.totalPages; page++) pages.push(await firstValueFrom(this.catalogApi.products({ page, pageSize: 100 })));
      for (const result of pages) for (const product of result.items) for (const presentation of product.presentations) found.set(presentation.id, { product, presentation });
      if (revision !== this.catalogRevision) return;
      this.lines.set(this.cart.lines().map((line) => ({ ...line, ...(found.get(line.presentationId) ?? { product: null, presentation: null }) } as CartProductLine)));
    } catch {
      if (revision === this.catalogRevision) this.catalogError.set(true);
    } finally { if (revision === this.catalogRevision) this.catalogLoading.set(false); }
  }

  async loadSettings(): Promise<void> {
    this.settingsLoading.set(true); this.settingsError.set(false);
    try {
      const settings = await firstValueFrom(this.checkoutApi.settings());
      this.settings.set(settings);
      if (!settings.deliveryModes.includes(this.deliveryMode())) this.deliveryMode.set(settings.deliveryModes[0] ?? 'PICKUP');
      await this.loadMethods();
    } catch { this.settingsError.set(true); }
    finally { this.settingsLoading.set(false); }
  }

  async loadMethods(): Promise<void> {
    const revision = ++this.methodsRevision;
    this.methodsLoading.set(true); this.methodsError.set(false);
    try {
      const response = await firstValueFrom(this.checkoutApi.paymentMethods(this.deliveryMode()));
      if (revision !== this.methodsRevision) return;
      const methods = response.items.filter((item) => item.demo && item.deliveryModes.includes(this.deliveryMode()));
      this.methods.set(methods);
      if (!methods.some((method) => method.code === this.paymentMethodCode())) this.paymentMethodCode.set(methods[0]?.code ?? 'DEMO_PAY_ON_PICKUP');
    } catch { if (revision === this.methodsRevision) this.methodsError.set(true); }
    finally { if (revision === this.methodsRevision) this.methodsLoading.set(false); }
  }

  changeMode(event: Event): void {
    const value = (event.target as HTMLSelectElement).value as DeliveryMode;
    if (!this.settings()?.deliveryModes.includes(value)) return;
    this.deliveryMode.set(value); this.invalidateQuote('La modalidad cambió. Generá y aceptá un presupuesto nuevo.'); void this.loadMethods();
  }
  changeMethod(event: Event): void {
    const value = (event.target as HTMLSelectElement).value as DemoPaymentMethod['code'];
    if (!this.methods().some((method) => method.code === value)) return;
    this.paymentMethodCode.set(value); this.invalidateQuote('El método cambió. Generá y aceptá un presupuesto nuevo.');
  }
  increment(id: string): void { if (this.cart.increment(id)) this.invalidateQuote('La cantidad cambió. Generá y aceptá un presupuesto nuevo.'); }
  decrement(id: string): void { if (this.cart.decrement(id)) this.invalidateQuote('La cantidad cambió. Generá y aceptá un presupuesto nuevo.'); }
  remove(id: string): void { if (this.cart.remove(id)) { this.invalidateQuote('El carrito cambió. Generá y aceptá un presupuesto nuevo.'); void this.resolveLines(); } }
  clearCart(): void {
    if (window.confirm('¿Querés vaciar el carrito?')) { this.cart.clear(); this.invalidateQuote('El carrito está vacío.'); this.lines.set([]); }
  }

  async requestQuote(): Promise<void> {
    const items = this.cart.lines().map(({ presentationId, quantity }) => ({ presentationId, quantity }));
    const method = this.selectedMethod();
    if (!items.length || !method) return;
    const revision = ++this.quoteRevision;
      const previous = this.quote() ?? this.comparisonQuote();
    this.comparisonQuote.set(previous);
    this.quote.set(null);
    this.quoteBusy.set(true); this.quoteError.set('');
    this.acceptedQuoteId.set('');
    try {
      const result = await firstValueFrom(this.checkoutApi.quote({ items, deliveryMode: this.deliveryMode(), paymentMethodCode: method.code }));
      if (revision !== this.quoteRevision) return;
      if (Date.parse(result.expiresAt) <= Date.now()) { this.quote.set(null); this.quoteError.set('generic'); return; }
      this.quoteChanges.set(previous ? quoteDifference(previous, result) : 'Este presupuesto se obtuvo nuevamente desde el servidor. Aceptalo explícitamente antes de continuar.')
        ;
      this.quote.set(result);
      this.comparisonQuote.set(null);
    } catch (error: unknown) {
      if (revision === this.quoteRevision) this.quoteError.set(classifyQuoteError(error));
    } finally { if (revision === this.quoteRevision) this.quoteBusy.set(false); }
  }

  acceptQuote(): void {
    const current = this.quote();
    if (!current || Date.parse(current.expiresAt) <= Date.now()) return;
    this.acceptedQuoteId.set(current.quoteId);
    this.quoteChanges.set('');
  }

  private async resolveLines(): Promise<void> {
    const revision = ++this.catalogRevision;
    if (this.cart.lines().length === 0) { this.lines.set([]); this.catalogLoading.set(false); this.catalogError.set(false); return; }
    await this.reloadCatalogForRevision(revision);
  }
  private async reloadCatalogForRevision(revision: number): Promise<void> {
    this.catalogLoading.set(true); this.catalogError.set(false);
    try {
      const found = new Map<string, { product: ProductSummary; presentation: PublicPresentation }>();
      const first = await firstValueFrom(this.catalogApi.products({ page: 1, pageSize: 100 }));
      const results = [first];
      for (let page = 2; page <= first.pageInfo.totalPages; page++) results.push(await firstValueFrom(this.catalogApi.products({ page, pageSize: 100 })));
      for (const result of results) for (const product of result.items) for (const presentation of product.presentations) found.set(presentation.id, { product, presentation });
      if (revision !== this.catalogRevision) return;
      this.lines.set(this.cart.lines().map((line) => ({ ...line, ...(found.get(line.presentationId) ?? { product: null, presentation: null }) } as CartProductLine)));
    } catch { if (revision === this.catalogRevision) this.catalogError.set(true); }
    finally { if (revision === this.catalogRevision) this.catalogLoading.set(false); }
  }
  private invalidateQuote(message: string): void {
    this.quoteRevision++;
    if (this.quote()) this.comparisonQuote.set(this.quote());
    this.quote.set(null);
    this.acceptedQuoteId.set('');
    this.quoteBusy.set(false);
    this.quoteError.set('');
    this.quoteChanges.set(message);
  }
}

function quoteDifference(previous: QuoteResponse, next: QuoteResponse): string {
  const differences: string[] = [];
  const priorItems = new Map(previous.items.map((item) => [item.presentationId, item]));
  const nextItems = new Map(next.items.map((item) => [item.presentationId, item]));
  for (const [id, item] of nextItems) {
    const prior = priorItems.get(id);
    if (!prior) differences.push(`Se agregó ${item.productName}.`);
    else {
      if (prior.unitPrice.amountMinor !== item.unitPrice.amountMinor) differences.push(`Cambió el precio de ${item.productName}.`);
      if (prior.quantity !== item.quantity) differences.push(`Cambió la cantidad de ${item.productName}.`);
    }
  }
  for (const item of previous.items) if (!nextItems.has(item.presentationId)) differences.push(`Ya no figura ${item.productName} en el presupuesto.`);
  if (previous.deliveryFee.amountMinor !== next.deliveryFee.amountMinor) differences.push('Cambió la tarifa de entrega.');
  if (previous.subtotal.amountMinor !== next.subtotal.amountMinor && !differences.some((item) => item.includes('precio') || item.includes('cantidad'))) differences.push('Cambió el subtotal.');
  if (previous.deliveryMode !== next.deliveryMode || previous.paymentMethod.code !== next.paymentMethod.code) differences.push('Cambió la modalidad o el método demo.');
  return differences.length ? `El servidor informó cambios: ${differences.join(' ')} Aceptá el nuevo resumen para confirmar que lo revisaste.` : 'Se generó un nuevo presupuesto autoritativo. Aceptalo explícitamente antes de continuar.';
}

function classifyQuoteError(error: unknown): QuoteError {
  const status = typeof error === 'object' && error !== null && 'status' in error ? Number((error as { status: unknown }).status) : 0;
  if (status === 409) return 'conflict';
  if (status === 429) return 'rate-limit';
  if (status === 503) return 'unavailable';
  return 'generic';
}
