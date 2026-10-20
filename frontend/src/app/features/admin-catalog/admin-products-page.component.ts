import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { AuthSessionService } from '../../core/auth/auth-session.service';
import { AdminProduct, AdminProductList, CategoryList, ProductPatch, ProductWrite } from '../../core/catalog/catalog.models';
import { AdminCatalogApiService } from '../../core/catalog/admin-catalog-api.service';
import { adminCatalogError, handleAdminCatalogSessionFailure, isAdminCatalogCsrfInvalid } from './admin-catalog.shared';

@Component({
  selector: 'abar-admin-products-page',
  standalone: true,
  imports: [ReactiveFormsModule, RouterLink],
  template: `
    <section aria-labelledby="products-title">
      <header class="page-heading">
        <div><p class="eyebrow">Catálogo</p><h1 id="products-title">Productos</h1><p>Administre la información comercial y la visibilidad.</p></div>
        <a class="button-link" routerLink="/admin/productos/nuevo">Nuevo producto</a>
      </header>
      @if (error()) { <p class="form-error" role="alert">{{ error() }}</p> }
      @if (staleCsrf()) { <p class="field-hint" role="status">La sesión cambió en otra pestaña; la acción no se repitió y los filtros se conservaron.</p><button class="button-secondary" type="button" (click)="refreshSession()" [disabled]="refreshing()">{{ refreshing() ? 'Actualizando sesión…' : 'Actualizar sesión para un nuevo intento' }}</button> }
      <form class="panel form-grid" [formGroup]="filters" (ngSubmit)="search()" aria-label="Filtros de productos">
        <label for="product-query">Buscar por nombre, SKU, categoría o marca
          <input id="product-query" formControlName="q" maxlength="200" autocomplete="off" />
        </label>
        <label for="product-category">Categoría
          <select id="product-category" formControlName="categoryId"><option value="">Todas</option>
            @for (category of categories(); track category.id) { <option [value]="category.id">{{ category.name }}</option> }
          </select>
        </label>
        <label for="product-availability">Disponibilidad
          <select id="product-availability" formControlName="availability"><option value="">Todas</option>
            <option value="AVAILABLE">Disponible</option><option value="LOW_STOCK">Pocas unidades</option><option value="OUT_OF_STOCK">Sin stock</option>
          </select>
        </label>
        <label for="product-unit">Presentación
          <select id="product-unit" formControlName="unit"><option value="">Todas</option>
            <option value="UNIT">Unidad</option><option value="METER">Metro</option><option value="ROLL">Rollo</option>
          </select>
        </label>
        <button type="submit" [disabled]="loading()">Buscar</button>
      </form>
      @if (loading() && !products()) { <p role="status">Cargando productos…</p> }
      @if (!loading() && products()?.items?.length === 0) { <p class="empty-state">No hay productos para estos filtros.</p> }
      @if (products()?.items?.length) {
        <div class="table-wrap">
          <table>
            <caption>Productos del catálogo</caption>
            <thead><tr><th scope="col">Producto</th><th scope="col">Categoría</th><th scope="col">Presentaciones y stock</th><th scope="col">Estado</th><th scope="col">Acciones</th></tr></thead>
            <tbody>@for (product of products()!.items; track product.id) {
              <tr>
                <td><strong>{{ product.name }}</strong><span class="user-email">{{ product.sku || 'Sin SKU' }} · {{ product.brand || 'Sin marca' }}</span></td>
                <td>{{ categoryName(product.categoryId) }}</td>
                <td>@for (presentation of product.presentations; track presentation.id) {
                  <span class="status-badge">{{ unitName(presentation.unit) }}: {{ presentation.availableQuantity }} disponible(s)</span>
                  @if (presentation.lowStockThreshold > 0) { <small>Mínimo {{ presentation.lowStockThreshold }}</small> }
                }</td>
                <td>{{ product.active ? 'Activo' : 'Inactivo' }}{{ product.featured ? ' · Destacado' : '' }}</td>
                <td class="action-cell"><a [routerLink]="['/admin/productos', product.id, 'editar']">Editar</a>
                  <button type="button" class="button-secondary" (click)="toggleActive(product)" [disabled]="busyId() !== null">{{ product.active ? 'Desactivar' : 'Activar' }}</button>
                </td>
              </tr>
            }</tbody>
          </table>
        </div>
        <nav class="pagination" aria-label="Paginación de productos">
          <button class="button-secondary" type="button" (click)="load(page() - 1)" [disabled]="loading() || page() <= 1">Anterior</button>
          <span>Página {{ page() }} de {{ products()!.pageInfo.totalPages || 1 }} · {{ products()!.pageInfo.totalItems }} productos</span>
          <button class="button-secondary" type="button" (click)="load(page() + 1)" [disabled]="loading() || page() >= products()!.pageInfo.totalPages">Siguiente</button>
        </nav>
      }
    </section>
  `,
  styles: [`.button-link { display:inline-flex;align-items:center;min-height:2.75rem;padding:.5rem .875rem;border-radius:.25rem;background:var(--color-blue-dark);color:#fff;text-decoration:none;font-weight:700 } select { width:100%;min-height:2.75rem;padding:.5rem;border:1px solid var(--color-border);border-radius:.25rem;background:#fff;font:inherit }`],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminProductsPageComponent {
  private readonly api = inject(AdminCatalogApiService);
  private readonly auth = inject(AuthSessionService);
  private readonly router = inject(Router);
  private readonly fb = inject(FormBuilder).nonNullable;
  readonly filters = this.fb.group({ q: '', categoryId: '', availability: '', unit: '' });
  readonly products = signal<AdminProductList | null>(null);
  readonly categories = signal<CategoryList['items']>([]);
  readonly loading = signal(false);
  readonly busyId = signal<string | null>(null);
  readonly error = signal('');
  readonly staleCsrf = signal(false);
  readonly refreshing = signal(false);
  readonly page = signal(1);
  private requestVersion = 0;

  constructor() {
    void this.loadCategories();
    void this.load(1);
  }

  categoryName(id: string): string { return this.categories().find((category) => category.id === id)?.name ?? 'Categoría no disponible'; }
  unitName(unit: string): string { return unit === 'UNIT' ? 'Unidad' : unit === 'METER' ? 'Metro' : 'Rollo'; }
  search(): void { void this.load(1); }

  async load(page = this.page()): Promise<void> {
    if (this.loading()) return;
    const version = ++this.requestVersion;
    this.loading.set(true); this.error.set('');
    const filters = this.filters.getRawValue();
    try {
      const result = await firstValueFrom(this.api.listProducts({
        q: filters.q.trim() || undefined, categoryId: filters.categoryId || undefined,
        availability: filters.availability || undefined, unit: filters.unit || undefined,
        page, pageSize: 20,
      }));
      if (version !== this.requestVersion) return;
      this.products.set(result); this.page.set(result.pageInfo.page);
    } catch (error: unknown) { await this.reportError(error); }
    finally { if (version === this.requestVersion) this.loading.set(false); }
  }

  private async loadCategories(): Promise<void> {
    try { this.categories.set((await firstValueFrom(this.api.listCategories())).items); }
    catch (error: unknown) { await this.reportError(error); }
  }

  async toggleActive(product: AdminProduct): Promise<void> {
    if (this.busyId()) return;
    this.busyId.set(product.id); this.error.set('');
    const input: ProductPatch = { ...toProductWrite(product), active: !product.active, expectedVersion: product.version };
    try { await firstValueFrom(this.api.updateProduct(product.id, input)); await this.load(); }
    catch (error: unknown) { await this.reportError(error); }
    finally { this.busyId.set(null); }
  }

  async refreshSession(): Promise<void> {
    this.refreshing.set(true); this.error.set(''); this.staleCsrf.set(false);
    try {
      const session = await this.auth.refreshSession();
      if (!session) { await this.router.navigate(['/admin/login'], { queryParams: { returnUrl: '/admin/productos' } }); return; }
      if (session.admin.mustChangePassword) { await this.router.navigate(['/admin/change-password']); return; }
      this.error.set('Sesión actualizada. Revise los datos y elija nuevamente la acción.');
    } catch { this.error.set('No se pudo actualizar la sesión. Inicie sesión nuevamente.'); }
    finally { this.refreshing.set(false); }
  }
  private async reportError(error: unknown): Promise<void> {
    this.error.set(adminCatalogError(error)); this.staleCsrf.set(isAdminCatalogCsrfInvalid(error));
    await handleAdminCatalogSessionFailure(error, this.auth, this.router, '/admin/productos');
  }
}

function toProductWrite(product: AdminProduct): ProductWrite {
  return {
    name: product.name, slug: product.slug, categoryId: product.categoryId, brand: product.brand, sku: product.sku,
    shortDescription: product.shortDescription, description: product.description, attributes: product.attributes,
    active: product.active, featured: product.featured,
    presentations: product.presentations.map(({ id, unit, rollLengthMeters, price, lowStockThreshold, active, isDefault }) => ({
      id, unit, ...(rollLengthMeters === null ? {} : { rollLengthMeters }), price, lowStockThreshold, active, isDefault,
    })),
  };
}
