import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { AuthSessionService } from '../../core/auth/auth-session.service';
import { StockList, StockOperationList, StockOperationView, StockRow } from '../../core/catalog/catalog.models';
import { AdminCatalogApiService } from '../../core/catalog/admin-catalog-api.service';
import { adminCatalogError, handleAdminCatalogSessionFailure, isAdminCatalogCsrfInvalid } from './admin-catalog.shared';

interface RollOpeningPair { roll: StockRow; meter: StockRow; }

@Component({
  selector: 'abar-admin-stock-page', standalone: true,
  template: `
    <section aria-labelledby="stock-title">
      <header class="page-heading"><div><p class="eyebrow">Inventario</p><h1 id="stock-title">Existencias</h1><p>Los saldos corresponden al e-commerce y se modifican solo mediante movimientos auditados.</p></div>
        <button class="button-secondary" type="button" (click)="refresh()" [disabled]="loading()">Actualizar existencias</button></header>
      @if (error()) { <p class="form-error" role="alert">{{ error() }}</p> }
      @if (notice()) { <p class="form-success" role="status">{{ notice() }}</p> }
      @if (staleCsrf()) { <p class="field-hint" role="status">La sesión se actualizó en otra pestaña; la acción no se repitió.</p><button class="button-secondary" type="button" (click)="refreshSession()" [disabled]="refreshing()">{{ refreshing() ? 'Actualizando sesión…' : 'Actualizar sesión para un nuevo intento' }}</button> }
      <form class="panel form-grid" (submit)="$event.preventDefault(); search()" aria-label="Filtros de existencias">
        <label for="stock-search">Producto, marca o SKU<input id="stock-search" maxlength="200" [value]="filters().q" (input)="setFilter('q', inputValue($event))" /></label>
        <label for="stock-unit">Presentación<select id="stock-unit" [value]="filters().unit" (change)="setFilter('unit', inputValue($event))"><option value="">Todas</option><option value="UNIT">Unidad</option><option value="METER">Metro</option><option value="ROLL">Rollo</option></select></label>
        <label for="stock-availability">Disponibilidad<select id="stock-availability" [value]="filters().availability" (change)="setFilter('availability', inputValue($event))"><option value="">Todas</option><option value="AVAILABLE">Disponible</option><option value="LOW_STOCK">Pocas unidades</option><option value="OUT_OF_STOCK">Sin stock</option></select></label>
        <button type="submit" [disabled]="loading()">Buscar</button>
      </form>
      @if (loading() && !stock()) { <p role="status">Cargando existencias…</p> }
      @if (stock()?.items?.length === 0) { <p class="empty-state">No hay existencias para estos filtros.</p> }
      @if (stock()?.items?.length) {
        <div class="table-wrap"><table><caption>Saldo y demanda impaga por presentación</caption><thead><tr><th scope="col">Producto</th><th scope="col">Presentación</th><th scope="col">Saldo disponible</th><th scope="col">Demanda impaga solicitada (informativa)</th><th scope="col">Pagado pendiente de entrega (ya descontado)</th><th scope="col">Mínimo</th><th scope="col">Estado</th><th scope="col">Versión</th></tr></thead>
          <tbody>@for (row of stock()!.items; track row.presentationId) { <tr><td>{{ row.productName }}</td><td>{{ presentationLabel(row) }}</td><td>{{ row.availableQuantity }}</td><td>{{ row.requestedUnpaidQuantity ?? '—' }}</td><td>{{ row.paidPendingDeliveryQuantity ?? '—' }}</td><td>{{ row.lowStockThreshold }}</td><td>{{ availabilityLabel(row.availability) }}</td><td>{{ row.version }}</td></tr> }</tbody>
        </table></div>
        <nav class="pagination" aria-label="Paginación de existencias"><button class="button-secondary" type="button" (click)="loadStock(page() - 1)" [disabled]="loading() || page() <= 1">Anterior</button>
          <span>Página {{ page() }} de {{ stock()!.pageInfo.totalPages || 1 }} · {{ stock()!.pageInfo.totalItems }} presentaciones</span>
          <button class="button-secondary" type="button" (click)="loadStock(page() + 1)" [disabled]="loading() || page() >= stock()!.pageInfo.totalPages">Siguiente</button></nav>
      }

      <div class="stock-tools">
        <article class="panel"><h2>Ajustar existencias</h2><p>Ingrese un delta entero distinto de cero y el motivo del movimiento.</p>
          <form (submit)="$event.preventDefault(); adjust()">
            <label for="adjust-presentation">Presentación<select id="adjust-presentation" [value]="adjustment().presentationId" (change)="setAdjustment('presentationId', inputValue($event))" required><option value="">Seleccione una presentación</option>@for (row of stock()?.items ?? []; track row.presentationId) { <option [value]="row.presentationId">{{ row.productName }} · {{ presentationLabel(row) }} ({{ row.availableQuantity }})</option> }</select></label>
            <label for="adjust-delta">Delta entero<input id="adjust-delta" type="number" min="-2147483647" max="2147483647" step="1" [value]="adjustment().delta" (input)="setAdjustment('delta', inputValue($event))" required /></label>
            <label for="adjust-reason">Motivo<textarea id="adjust-reason" maxlength="500" required [value]="adjustment().reason" (input)="setAdjustment('reason', inputValue($event))"></textarea></label>
            <button type="submit" [disabled]="busy() || !adjustmentValid()">{{ busy() ? 'Registrando…' : 'Registrar ajuste' }}</button>
          </form>
        </article>
        <article class="panel"><h2>Abrir rollos cerrados</h2><p>La longitud se toma de la presentación ROLL configurada; no se estima a partir de un valor fijo.</p>
          <form (submit)="$event.preventDefault(); openSelectedRolls()">
            <label for="roll-product">Producto<select id="roll-product" [value]="opening().productId" (change)="setOpening('productId', inputValue($event))" required><option value="">Seleccione un producto</option>@for (product of rollProducts(); track product.productId) { <option [value]="product.productId">{{ product.productName }} · {{ product.rollLengthMeters }} m por rollo</option> }</select></label>
            <label for="roll-count">Cantidad de rollos<input id="roll-count" type="number" min="1" step="1" [value]="opening().rollQuantity" (input)="setOpening('rollQuantity', inputValue($event))" required /></label>
            <label for="roll-reason">Motivo<textarea id="roll-reason" maxlength="500" required [value]="opening().reason" (input)="setOpening('reason', inputValue($event))"></textarea></label>
            @if (selectedRollPair()) { <p class="field-hint">Disponible antes: {{ selectedRollPair()!.roll.availableQuantity }} rollos cerrados y {{ selectedRollPair()!.meter.availableQuantity }} metros. Al abrir {{ opening().rollQuantity || 0 }}: {{ projected().roll }} rollos y {{ projected().meter }} metros.</p> }
            <button type="submit" [disabled]="busy() || !openingValid()">{{ busy() ? 'Registrando…' : 'Confirmar apertura' }}</button>
          </form>
        </article>
      </div>

      @if (lastOperation()) { <section class="panel" aria-labelledby="operation-title"><h2 id="operation-title">Movimiento confirmado · {{ operationLabel(lastOperation()!.type) }}</h2>
        <p>{{ lastOperation()!.reason }} · {{ lastOperation()!.createdAt }}</p><div class="table-wrap"><table><caption>Saldos antes y después del movimiento</caption><thead><tr><th scope="col">Presentación</th><th scope="col">Delta</th><th scope="col">Antes</th><th scope="col">Después</th></tr></thead><tbody>
          @for (entry of lastOperation()!.entries; track entry.presentationId) { <tr><td>{{ stockRow(entry.presentationId) ? presentationLabel(stockRow(entry.presentationId)!) : entry.presentationId }}</td><td>{{ entry.delta > 0 ? '+' : '' }}{{ entry.delta }}</td><td>{{ entry.resultingQuantity - entry.delta }}</td><td>{{ entry.resultingQuantity }}</td></tr> }
        </tbody></table></div></section> }

      <section aria-labelledby="movements-title"><header class="page-heading"><div><h2 id="movements-title">Historial de movimientos</h2><p>Operaciones administrativas recientes.</p></div></header>
        <form class="form-grid" (submit)="$event.preventDefault(); loadMovements(1)" aria-label="Filtros del historial"><label for="movement-type">Tipo<select id="movement-type" [value]="movementFilters().type" (change)="setMovementFilter('type', inputValue($event))"><option value="">Todos</option><option value="ADJUSTMENT">Ajustes</option><option value="ROLL_OPENING">Aperturas</option><option value="PAYMENT_CONFIRMATION">Confirmaciones de pago</option></select></label>
          <label for="movement-presentation">Presentación<select id="movement-presentation" [value]="movementFilters().presentationId" (change)="setMovementFilter('presentationId', inputValue($event))"><option value="">Todas</option>@for (row of stock()?.items ?? []; track row.presentationId) { <option [value]="row.presentationId">{{ row.productName }} · {{ presentationLabel(row) }}</option> }</select></label>
          <button class="button-secondary" type="submit" [disabled]="movementLoading()">Filtrar historial</button></form>
        @if (movementError()) { <p class="form-error" role="alert">{{ movementError() }}</p> }
        @if (movementLoading() && !movements()) { <p role="status">Cargando movimientos…</p> }
        @if (movements()?.items?.length === 0) { <p class="empty-state">No hay movimientos para estos filtros.</p> }
        @if (movements()?.items?.length) { <div class="table-wrap"><table><caption>Movimientos auditables</caption><thead><tr><th scope="col">Fecha</th><th scope="col">Tipo</th><th scope="col">Motivo</th><th scope="col">Cambios</th></tr></thead><tbody>
          @for (operation of movements()!.items; track operation.id) { <tr><td>{{ operation.createdAt }}</td><td>{{ operationLabel(operation.type) }}</td><td>{{ operation.reason }}</td><td>@for (entry of operation.entries; track entry.presentationId) { <span class="status-badge">{{ stockRow(entry.presentationId) ? presentationLabel(stockRow(entry.presentationId)!) : entry.presentationId }}: {{ entry.delta > 0 ? '+' : '' }}{{ entry.delta }} → {{ entry.resultingQuantity }}</span> }</td></tr> }
        </tbody></table></div><nav class="pagination" aria-label="Paginación del historial"><button class="button-secondary" type="button" (click)="loadMovements(movementPage() - 1)" [disabled]="movementLoading() || movementPage() <= 1">Anterior</button><span>Página {{ movementPage() }} de {{ movements()!.pageInfo.totalPages || 1 }}</span><button class="button-secondary" type="button" (click)="loadMovements(movementPage() + 1)" [disabled]="movementLoading() || movementPage() >= movements()!.pageInfo.totalPages">Siguiente</button></nav> }
      </section>
    </section>
  `,
  styles: [`.stock-tools { display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,20rem),1fr));gap:1rem } .stock-tools form { display:grid;gap:.5rem } select { width:100%;min-height:2.75rem;padding:.5rem;border:1px solid var(--color-border);border-radius:.25rem;background:#fff;font:inherit } .panel h2 { margin-top:.25rem }`],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminStockPageComponent {
  private readonly api = inject(AdminCatalogApiService);
  private readonly auth = inject(AuthSessionService);
  private readonly router = inject(Router);
  readonly stock = signal<StockList | null>(null);
  readonly openingPairs = signal<RollOpeningPair[]>([]);
  readonly movements = signal<StockOperationList | null>(null);
  readonly filters = signal({ q: '', unit: '', availability: '' });
  readonly movementFilters = signal({ type: '', presentationId: '' });
  readonly adjustment = signal({ presentationId: '', delta: '', reason: '' });
  readonly opening = signal({ productId: '', rollQuantity: '', reason: '' });
  readonly loading = signal(false); readonly movementLoading = signal(false); readonly busy = signal(false);
  readonly error = signal(''); readonly movementError = signal(''); readonly notice = signal(''); readonly lastOperation = signal<StockOperationView | null>(null);
  readonly staleCsrf = signal(false); readonly refreshing = signal(false);
  readonly page = signal(1); readonly movementPage = signal(1);
  private adjustmentKey: { body: string; key: string } | null = null;
  private openingKey: { body: string; key: string } | null = null;

  constructor() { void this.loadStock(); void this.loadMovements(); void this.loadOpeningPairs(); }
  inputValue(event: Event): string { return (event.target as HTMLInputElement | HTMLTextAreaElement).value; }
  setFilter(key: keyof ReturnType<AdminStockPageComponent['filters']>, value: string): void { this.filters.update((filters) => ({ ...filters, [key]: value })); }
  setMovementFilter(key: keyof ReturnType<AdminStockPageComponent['movementFilters']>, value: string): void { this.movementFilters.update((filters) => ({ ...filters, [key]: value })); }
  setAdjustment(key: keyof ReturnType<AdminStockPageComponent['adjustment']>, value: string): void { this.adjustment.update((form) => ({ ...form, [key]: value })); }
  setOpening(key: keyof ReturnType<AdminStockPageComponent['opening']>, value: string): void { this.opening.update((form) => ({ ...form, [key]: value })); }
  search(): void { void this.loadStock(1); }
  refresh(): void { void this.loadStock(this.page()); void this.loadMovements(this.movementPage()); void this.loadOpeningPairs(); }
  presentationLabel(row: StockRow): string { return row.unit === 'UNIT' ? 'Unidad' : row.unit === 'METER' ? 'Metro' : `Rollo · ${row.rollLengthMeters ?? '—'} m`; }
  operationLabel(type: StockOperationView['type']): string { return ({ ADJUSTMENT: 'Ajuste', ROLL_OPENING: 'Apertura de rollo', PAYMENT_CONFIRMATION: 'Confirmación de pago' })[type]; }
  availabilityLabel(status: string): string { return status === 'AVAILABLE' ? 'Disponible' : status === 'LOW_STOCK' ? 'Pocas unidades' : 'Sin stock'; }
  stockRow(id: string): StockRow | undefined { return this.stock()?.items.find((row) => row.presentationId === id); }
  rollProducts(): StockRow[] { return this.openingPairs().map((pair) => pair.roll); }
  selectedRollPair(): { roll: StockRow; meter: StockRow } | null {
    return this.openingPairs().find((pair) => pair.roll.productId === this.opening().productId) ?? null;
  }
  projected(): { roll: number; meter: number } {
    const pair = this.selectedRollPair(); const quantity = Number(this.opening().rollQuantity);
    if (!pair || !Number.isSafeInteger(quantity) || quantity < 1) return { roll: 0, meter: 0 };
    return { roll: pair.roll.availableQuantity - quantity, meter: pair.meter.availableQuantity + quantity * (pair.roll.rollLengthMeters ?? 0) };
  }
  adjustmentValid(): boolean {
    const draft = this.adjustment(); const delta = Number(draft.delta);
    return Boolean(draft.presentationId) && Number.isSafeInteger(delta) && delta !== 0 && Math.abs(delta) <= 2147483647 && draft.reason.trim().length > 0 && draft.reason.length <= 500;
  }
  openingValid(): boolean {
    const draft = this.opening(); const pair = this.selectedRollPair(); const quantity = Number(draft.rollQuantity); const projected = this.projected();
    return Boolean(pair) && Number.isSafeInteger(quantity) && quantity > 0 && quantity <= 2147483647 && Boolean(draft.reason.trim()) && draft.reason.length <= 500 &&
      projected.roll >= 0 && Number.isSafeInteger(projected.meter) && projected.meter <= 2147483647 && this.projected().meter > (pair?.meter.availableQuantity ?? 0);
  }

  async loadStock(page = this.page()): Promise<void> {
    if (this.loading()) return;
    this.loading.set(true); this.error.set('');
    const filter = this.filters();
    try {
      const result = await firstValueFrom(this.api.listStock({ page, pageSize: 20, q: filter.q.trim() || undefined, unit: filter.unit || undefined, availability: filter.availability || undefined }));
      this.stock.set(result); this.page.set(result.pageInfo.page);
    } catch (error: unknown) { await this.reportError(error); }
    finally { this.loading.set(false); }
  }

  async loadMovements(page = this.movementPage()): Promise<void> {
    if (this.movementLoading()) return;
    this.movementLoading.set(true); this.movementError.set('');
    const filter = this.movementFilters();
    try {
      const result = await firstValueFrom(this.api.listMovements({ page, pageSize: 20, type: filter.type || undefined, presentationId: filter.presentationId || undefined }));
      this.movements.set(result); this.movementPage.set(result.pageInfo.page);
    } catch (error: unknown) { await this.reportError(error, true); }
    finally { this.movementLoading.set(false); }
  }

  async adjust(): Promise<void> {
    const draft = this.adjustment(); const row = this.stock()?.items.find((item) => item.presentationId === draft.presentationId);
    if (this.busy() || !row || !this.adjustmentValid()) return;
    const input = { presentationId: row.presentationId, delta: Number(draft.delta), reason: draft.reason.trim(), expectedVersion: row.version };
    const key = this.idempotencyKey('adjustment', input);
    if (!key) { this.error.set('Este navegador no puede generar una clave segura para el movimiento.'); return; }
    this.busy.set(true); this.error.set(''); this.notice.set('');
    try {
      this.lastOperation.set(await firstValueFrom(this.api.adjustStock(input, key)));
      this.adjustment.set({ presentationId: '', delta: '', reason: '' }); this.adjustmentKey = null;
      this.notice.set('El ajuste quedó registrado.'); await this.refresh();
    } catch (error: unknown) { await this.reportError(error); }
    finally { this.busy.set(false); }
  }

  async openSelectedRolls(): Promise<void> {
    const draft = this.opening(); const pair = this.selectedRollPair();
    if (this.busy() || !pair || !this.openingValid()) return;
    const rollQuantity = Number(draft.rollQuantity); const projected = this.projected();
    const confirmation = `Se abrirán ${rollQuantity} rollo(s) de ${pair.roll.rollLengthMeters} m.\nAntes: ${pair.roll.availableQuantity} rollos cerrados y ${pair.meter.availableQuantity} metros.\nDespués: ${projected.roll} rollos cerrados y ${projected.meter} metros.\n\n¿Confirma la conversión?`;
    if (!window.confirm(confirmation)) return;
    const input = { productId: pair.roll.productId, rollQuantity, reason: draft.reason.trim(), expectedVersions: { roll: pair.roll.version, meter: pair.meter.version } };
    const key = this.idempotencyKey('opening', input);
    if (!key) { this.error.set('Este navegador no puede generar una clave segura para el movimiento.'); return; }
    this.busy.set(true); this.error.set(''); this.notice.set('');
    try {
      this.lastOperation.set(await firstValueFrom(this.api.openRolls(input, key)));
      this.opening.set({ productId: '', rollQuantity: '', reason: '' }); this.openingKey = null;
      this.notice.set('La apertura quedó registrada con sus dos movimientos auditados.'); await this.refresh();
    } catch (error: unknown) { await this.reportError(error); }
    finally { this.busy.set(false); }
  }

  private idempotencyKey(kind: 'adjustment' | 'opening', body: object): string | null {
    const serialized = JSON.stringify(body);
    const cache = kind === 'adjustment' ? this.adjustmentKey : this.openingKey;
    if (cache?.body === serialized) return cache.key;
    let key: string;
    try { key = window.crypto.randomUUID(); } catch { return null; }
    if (kind === 'adjustment') this.adjustmentKey = { body: serialized, key };
    else this.openingKey = { body: serialized, key };
    return key;
  }

  async refreshSession(): Promise<void> {
    this.refreshing.set(true); this.error.set(''); this.staleCsrf.set(false);
    try {
      const session = await this.auth.refreshSession();
      if (!session) { await this.router.navigate(['/admin/login'], { queryParams: { returnUrl: '/admin/stock' } }); return; }
      if (session.admin.mustChangePassword) { await this.router.navigate(['/admin/change-password']); return; }
      this.notice.set('Sesión actualizada. Revise los datos y elija nuevamente la acción.');
    } catch { this.error.set('No se pudo actualizar la sesión. Inicie sesión nuevamente.'); }
    finally { this.refreshing.set(false); }
  }

  private async reportError(error: unknown, movement = false): Promise<void> {
    if (movement) this.movementError.set(adminCatalogError(error));
    else this.error.set(adminCatalogError(error));
    this.staleCsrf.set(isAdminCatalogCsrfInvalid(error));
    await handleAdminCatalogSessionFailure(error, this.auth, this.router, '/admin/stock');
  }

  private async loadOpeningPairs(): Promise<void> {
    try {
      const rolls = (await this.listAllStock({ unit: 'ROLL' })).filter((row) => row.unit === 'ROLL');
      const productIds = [...new Set(rolls.map((row) => row.productId))];
      const pairs = await Promise.all(productIds.map(async (productId) => {
        const rows = await this.listAllStock({ productId });
        const roll = rows.find((row) => row.unit === 'ROLL');
        const meter = rows.find((row) => row.unit === 'METER');
        return roll && meter ? { roll, meter } : null;
      }));
      this.openingPairs.set(pairs.filter((pair): pair is RollOpeningPair => pair !== null));
    } catch (error: unknown) { await this.reportError(error); }
  }

  private async listAllStock(filters: { unit?: string; productId?: string }): Promise<StockRow[]> {
    const rows: StockRow[] = [];
    for (let page = 1; ; page++) {
      const result = await firstValueFrom(this.api.listStock({ ...filters, page, pageSize: 100 }));
      rows.push(...result.items);
      if (page >= result.pageInfo.totalPages) return rows;
    }
  }
}
