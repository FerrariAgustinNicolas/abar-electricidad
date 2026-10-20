import { ChangeDetectionStrategy, Component, DestroyRef, OnInit, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, ParamMap, Router, RouterLink } from '@angular/router';
import { catchError, combineLatest, map, of, startWith, Subject, switchMap, tap } from 'rxjs';
import { Availability, Page, PresentationUnit, ProductSummary, PublicCategory } from '../../core/catalog/catalog.models';
import { PublicCatalogApiService, PublicProductFilters } from '../../core/catalog/public-catalog-api.service';
import { formatMoney } from './format-money';

const FILTER_KEYS = ['q', 'categoryId', 'availability', 'unit', 'minPriceMinor', 'maxPriceMinor', 'sort', 'page', 'pageSize'];
type CatalogState = { loading: boolean; error: boolean; result: Page<ProductSummary> | null };

@Component({ selector: 'abar-catalog-page', standalone: true, imports: [RouterLink], template: `
<section class="catalog-page" aria-labelledby="catalog-title">
  <header class="page-heading">
      <p class="eyebrow">Catálogo</p>
      <h1 id="catalog-title">Productos</h1>
      <p>Explore productos, presentaciones y disponibilidad.</p>
      </header>
  <form class="filters" (submit)="$event.preventDefault(); applyFilters($event.currentTarget)">
    <label>Buscar<input name="q" type="search" maxlength="200" [value]="filters().q ?? ''" placeholder="Nombre, marca o característica">
      </label>
    <label>Categoría<select name="categoryId" [value]="filters().categoryId ?? ''">
      <option value="">Todas</option>@for (category of categories(); track category.id) { <option [value]="category.id" [selected]="filters().categoryId === category.id">{{ category.name }}</option> }</select>
      </label>
    <label>Disponibilidad<select name="availability" [value]="filters().availability ?? ''">
      <option value="">Todas</option>
      <option value="AVAILABLE">Disponible</option>
      <option value="LOW_STOCK">Pocas unidades</option>
      <option value="OUT_OF_STOCK">Sin stock</option>
      </select>
      </label>
    <label>Presentación<select name="unit" [value]="filters().unit ?? ''">
      <option value="">Todas</option>
      <option value="UNIT">Unidad</option>
      <option value="METER">Metro</option>
      <option value="ROLL">Rollo</option>
      </select>
      </label>
    <label>Precio mínimo (centavos)<input name="minPriceMinor" inputmode="numeric" pattern="[0-9]*" [value]="filters().minPriceMinor ?? ''">
      </label>
    <label>Precio máximo (centavos)<input name="maxPriceMinor" inputmode="numeric" pattern="[0-9]*" [value]="filters().maxPriceMinor ?? ''">
      </label>
    <label>Productos por página<select name="pageSize" [value]="filters().pageSize ?? 20">
      <option value="12">12</option>
      <option value="20">20</option>
      <option value="40">40</option>
      <option value="100">100</option>
      </select>
      </label>
    <label>Ordenar<select name="sort" [value]="filters().sort ?? 'name-asc'">
      <option value="name-asc">Nombre A–Z</option>
      <option value="name-desc">Nombre Z–A</option>
      <option value="price-asc">Precio menor</option>
      <option value="price-desc">Precio mayor</option>
      </select>
      </label>
    <button class="filter-submit" type="submit">Aplicar filtros</button>
  </form>
  @if (state().loading) { <p class="status" role="status" aria-live="polite">Cargando productos…</p> }
  @else if (state().error) { <section class="notice" role="alert">
      <p>No pudimos cargar el catálogo.</p>
      <button type="button" (click)="retry()">Reintentar</button>
      </section> }
  @else if (state().result; as result) {
    @if (!result.items.length) { <p class="status" role="status">No encontramos productos con esos filtros.</p> }
    @else { <section class="product-grid" aria-label="Resultados del catálogo">
      @for (product of result.items; track product.id) { <a class="product-card" [routerLink]="['/productos', product.slug]">
      <img [src]="product.primaryImage?.url ?? fallbackImage" [alt]="product.primaryImage?.alt ?? ('Imagen no disponible para ' + product.name)" (error)="useFallback($event)">
      <span class="category">{{ product.category.name }}</span>
      <h2>{{ product.name }}</h2>@if(product.brand){<p class="brand">{{ product.brand }}</p>}<p class="price">{{ priceFor(product) }}</p>
      <p class="availability">{{ availabilityFor(product) }}</p>
      <span class="detail-link">Ver producto</span>
      </a> }
    </section> }
    <nav class="pagination" aria-label="Paginación del catálogo">
      <button type="button" [disabled]="result.pageInfo.page <= 1" (click)="goToPage(result.pageInfo.page - 1)">Anterior</button>
      <span>Página {{ result.pageInfo.page }} de {{ result.pageInfo.totalPages || 1 }}</span>
      <button type="button" [disabled]="result.pageInfo.page >= result.pageInfo.totalPages" (click)="goToPage(result.pageInfo.page + 1)">Siguiente</button>
      </nav>
  }
</section>`, styles: [`
:host {

  display:block;
  color:var(--color-text)
}
.catalog-page {

  max-width:1200px;
  margin:0 auto;
  padding:clamp(1.25rem,4vw,3rem)
}
.page-heading {

  margin-bottom:1.5rem
}
.eyebrow,.category {

  color:var(--color-muted);
  font-size:.85rem;
  font-weight:700;
  letter-spacing:.04em
}
.page-heading h1 {

  font-size:clamp(2rem,5vw,3rem);
  margin:.25rem 0
}
.filters {

  display:grid;
  grid-template-columns:repeat(auto-fit,minmax(190px,1fr));
  gap:1rem;
  align-items:end;
  padding:1rem;
  margin-bottom:1.5rem;
  background:var(--color-surface-subtle);
  border-radius:1rem
}
.filters label {

  display:grid;
  gap:.4rem;
  font-size:.9rem;
  font-weight:600
}
.filters input,.filters select {

  min-height:2.75rem;
  width:100%;
  padding:.55rem .7rem;
  border:1px solid var(--color-border);
  border-radius:.45rem;
  background:var(--color-surface);
  color:inherit
}
.filters input:focus-visible,.filters select:focus-visible,button:focus-visible,a:focus-visible {

  outline:3px solid var(--color-orange);
  outline-offset:2px
}
.filter-submit,.pagination button,.notice button {

  min-height:2.75rem;
  padding:.6rem 1rem;
  border:0;
  border-radius:.5rem;
  background:var(--color-blue-dark);
  color:var(--color-surface);
  font:inherit;
  font-weight:700;
  cursor:pointer
}
.product-grid {

  display:grid;
  grid-template-columns:repeat(auto-fill,minmax(min(100%,230px),1fr));
  gap:1rem
}
.product-card {

  display:flex;
  flex-direction:column;
  padding:1rem;
  border:1px solid var(--color-border);
  border-radius:.9rem;
  color:inherit;
  text-decoration:none;
  transition:box-shadow .15s,transform .15s
}
.product-card:hover {

  box-shadow:0 8px 24px color-mix(in srgb,var(--color-blue-dark) 12%,transparent);
  transform:translateY(-2px)
}
.product-card img {

  width:100%;
  height:180px;
  object-fit:contain;
  background:var(--color-surface-subtle);
  border-radius:.55rem
}
.product-card h2 {

  margin:.35rem 0;
  font-size:1.1rem
}
.brand {

  margin:0;
  color:var(--color-muted)
}
.price {

  margin:.7rem 0 .2rem;
  font-size:1.2rem;
  font-weight:800
}
.availability {

  margin:.2rem 0;
  color:var(--color-blue-dark)
}
.detail-link {

  margin-top:auto;
  padding-top:.75rem;
  color:var(--color-blue-dark);
  font-weight:700
}
.status,.notice {

  margin:2rem 0;
  padding:1rem;
  border-radius:.65rem;
  background:var(--color-surface-subtle)
}
.notice {

  display:flex;
  align-items:center;
  justify-content:space-between;
  gap:1rem
}
.pagination {

  display:flex;
  justify-content:center;
  align-items:center;
  gap:1rem;
  padding:2rem 0
}
.pagination button:disabled {

  opacity:.45;
  cursor:not-allowed
}
@media(max-width:520px) {

  .filters {

    grid-template-columns:1fr
  }
  .pagination {

    gap:.5rem
  }
  .pagination span {

    font-size:.9rem
  }
}
  `], changeDetection: ChangeDetectionStrategy.OnPush })
export class CatalogPageComponent implements OnInit {
  private readonly api = inject(PublicCatalogApiService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);
  private readonly refresh$ = new Subject<void>();

  readonly fallbackImage = '/assets/product-fallback.svg';
  readonly filters = signal<PublicProductFilters>({ page: 1, pageSize: 20, sort: 'name-asc' });
  readonly categories = signal<PublicCategory[]>([]);
  readonly state = signal<CatalogState>({ loading: true, error: false, result: null });

  ngOnInit(): void {
    this.api.categories().pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (response) => this.categories.set(response.items),
      error: () => this.categories.set([]),
    });

    combineLatest([this.route.queryParamMap, this.refresh$.pipe(startWith(undefined))]).pipe(
      map(([params]) => parseFilters(params)),
      tap((filters) => {
        this.filters.set(filters);
        this.state.set({ loading: true, error: false, result: this.state().result });
      }),
      switchMap((filters) => this.api.products(filters).pipe(
        map((result) => ({ loading: false, error: false, result } as CatalogState)),
        catchError(() => of({ loading: false, error: true, result: null } as CatalogState)),
      )),
      takeUntilDestroyed(this.destroyRef),
    ).subscribe((state) => this.state.set(state));
  }

  applyFilters(target: EventTarget | null): void {
    if (!(target instanceof HTMLFormElement)) return;

    const data = new FormData(target);
    const value = (key: string) => String(data.get(key) ?? '').trim();
    const queryParams: Record<string, string | number | undefined> = Object.fromEntries(
      FILTER_KEYS.map((key) => [key, undefined]),
    );
    const q = value('q');
    const categoryId = value('categoryId');
    const availability = value('availability');
    const unit = value('unit');
    const minPriceMinor = value('minPriceMinor');
    const maxPriceMinor = value('maxPriceMinor');
    const sort = value('sort');
    const pageSize = Number(value('pageSize'));

    if (q) queryParams['q'] = q;
    if (categoryId) queryParams['categoryId'] = categoryId;
    if (['AVAILABLE', 'LOW_STOCK', 'OUT_OF_STOCK'].includes(availability)) {
      queryParams['availability'] = availability;
    }
    if (['UNIT', 'METER', 'ROLL'].includes(unit)) queryParams['unit'] = unit;
    if (/^(0|[1-9][0-9]*)$/.test(minPriceMinor)) queryParams['minPriceMinor'] = minPriceMinor;
    if (/^(0|[1-9][0-9]*)$/.test(maxPriceMinor)) queryParams['maxPriceMinor'] = maxPriceMinor;
    if (['name-asc', 'name-desc', 'price-asc', 'price-desc'].includes(sort)) queryParams['sort'] = sort;
    queryParams['page'] = 1;
    queryParams['pageSize'] = Number.isSafeInteger(pageSize) && pageSize > 0 && pageSize <= 100
      ? pageSize
      : this.filters().pageSize ?? 20;

    void this.router.navigate([], { relativeTo: this.route, queryParams });
  }

  goToPage(page: number): void {
    void this.router.navigate([], { relativeTo: this.route, queryParams: { ...this.filters(), page } });
  }

  retry(): void {
    this.refresh$.next();
  }

  priceFor(product: ProductSummary): string {
    const presentation = product.presentations.find((item) => item.id === product.displayPresentationId);
    return presentation
      ? `${formatMoney(presentation.price.amountMinor)} / ${unitLabel(presentation.unit)}`
      : 'Precio no disponible';
  }

  availabilityFor(product: ProductSummary): string {
    const presentation = product.presentations.find((item) => item.id === product.displayPresentationId);
    return presentation ? availabilityLabel(presentation.availability) : 'Disponibilidad no disponible';
  }

  useFallback(event: Event): void {
    (event.target as HTMLImageElement).src = this.fallbackImage;
  }
}

function parseFilters(params: ParamMap): PublicProductFilters {
  const availability = params.get('availability');
  const unit = params.get('unit');
  const sort = params.get('sort');
  const min = params.get('minPriceMinor');
  const max = params.get('maxPriceMinor');
  const page = Number(params.get('page') ?? 1);
  const pageSize = Number(params.get('pageSize') ?? 20);

  return {
    q: params.get('q') ?? undefined,
    categoryId: params.get('categoryId') ?? undefined,
    availability: (['AVAILABLE', 'LOW_STOCK', 'OUT_OF_STOCK'].includes(availability ?? '')
      ? availability
      : undefined) as Availability | undefined,
    unit: (['UNIT', 'METER', 'ROLL'].includes(unit ?? '') ? unit : undefined) as PresentationUnit | undefined,
    minPriceMinor: min && /^(0|[1-9][0-9]*)$/.test(min) ? min : undefined,
    maxPriceMinor: max && /^(0|[1-9][0-9]*)$/.test(max) ? max : undefined,
    sort: (['name-asc', 'name-desc', 'price-asc', 'price-desc'].includes(sort ?? '')
      ? sort
      : 'name-asc') as PublicProductFilters['sort'],
    page: Number.isSafeInteger(page) && page > 0 ? page : 1,
    pageSize: Number.isSafeInteger(pageSize) && pageSize > 0 && pageSize <= 100 ? pageSize : 20,
  };
}

function unitLabel(unit: PresentationUnit): string {
  return ({ UNIT: 'unidad', METER: 'metro', ROLL: 'rollo' })[unit];
}

function availabilityLabel(availability: Availability): string {
  return ({ AVAILABLE: 'Disponible', LOW_STOCK: 'Pocas unidades', OUT_OF_STOCK: 'Sin stock' })[availability];
}
