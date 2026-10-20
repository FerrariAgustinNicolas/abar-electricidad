import { ChangeDetectionStrategy, Component, DestroyRef, Input, OnInit, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { CatalogHome, ProductSummary } from '../../core/catalog/catalog.models';
import { PublicCatalogApiService } from '../../core/catalog/public-catalog-api.service';
import { HealthStatusComponent } from '../../shared/ui/health-status.component';
import { formatMoney } from '../catalog/format-money';

@Component({
  selector: 'app-product-section',
  standalone: true,
  imports: [RouterLink],
  template: `
    <section class="section" [attr.aria-label]="title">
      <div class="section-heading">
      <h2>{{ title }}</h2>
      <a routerLink="/productos">Ver catálogo</a>
      </div>
      @if (!products.length) { <p class="empty">{{ emptyText }}</p> }
      @else { <div class="product-grid">@for (product of products; track product.id) { <a class="product-card" [routerLink]="['/productos', product.slug]">
      <img [src]="product.primaryImage?.url ?? fallbackImage" [alt]="product.primaryImage?.alt ?? ('Imagen no disponible para ' + product.name)" (error)="useFallback($event)">
      <span>{{ product.category.name }}</span>
      <h3>{{ product.name }}</h3>
      <p>{{ priceFor(product) }}</p>
      </a> }</div> }
    </section>
  `,
  styles: [`
:host {

  display:block
}
.section {

  margin:2.5rem 0
}
.section-heading {

  display:flex;
  align-items:center;
  justify-content:space-between;
  gap:1rem
}
.section-heading h2 {

  font-size:1.6rem
}
.section-heading a {

  color:var(--color-blue-dark);
  font-weight:700
}
.empty {

  padding:1rem;
  background:var(--color-surface-subtle);
  border-radius:.6rem;
  color:var(--color-muted)
}
.product-grid {

  display:grid;
  grid-template-columns:repeat(auto-fill,minmax(min(100%,210px),1fr));
  gap:1rem
}
.product-card {

  display:flex;
  flex-direction:column;
  padding:.9rem;
  border:1px solid var(--color-border);
  border-radius:.8rem;
  color:var(--color-text);
  text-decoration:none
}
.product-card img {

  width:100%;
  height:160px;
  object-fit:contain;
  background:var(--color-surface-subtle);
  border-radius:.5rem
}
.product-card span {

  margin-top:.7rem;
  color:var(--color-muted);
  font-size:.85rem
}
.product-card h3 {

  margin:.3rem 0;
  font-size:1.05rem
}
.product-card p {

  margin-top:auto;
  font-weight:800
}
  `],
})
export class ProductSectionComponent {
  @Input() title = '';
  @Input() products: ProductSummary[] = [];
  @Input() emptyText = '';
  readonly fallbackImage = '/assets/product-fallback.svg';
  priceFor(product: ProductSummary): string {
    const presentation = product.presentations.find((item) => item.id === product.displayPresentationId);
    if (!presentation) return 'Precio no disponible';

    const unit = presentation.unit === 'UNIT'
      ? 'unidad'
      : presentation.unit === 'METER' ? 'metro' : 'rollo';
    return `${formatMoney(presentation.price.amountMinor)} / ${unit}`;
  }

  useFallback(event: Event): void {
    (event.target as HTMLImageElement).src = this.fallbackImage;
  }
}

@Component({
  selector: 'abar-home-page',
  standalone: true,
  imports: [HealthStatusComponent, ProductSectionComponent, RouterLink],
  template: `
    <div class="home-page">
      <section class="hero" aria-labelledby="home-heading">
      <div>
      <p class="eyebrow">Catálogo eléctrico</p>
      <h1 id="home-heading">ABAR Electricidad</h1>
      <p class="hero-title">Todo para tus instalaciones eléctricas</p>
      <p>Encuentre productos, compare presentaciones y consulte disponibilidad.</p>
      <a class="hero-link" routerLink="/productos">Ver productos</a>
      </div>
      </section>
      @if (loading()) { <p class="status" role="status" aria-live="polite">Cargando catálogo…</p> }
      @else if (error()) { <section class="notice" role="alert">
      <p>No pudimos cargar el catálogo.</p>
      <button type="button" (click)="retry()">Reintentar</button>
      </section> }
      @else if (home(); as data) {
        @if (data.categories.length) { <section class="category-section" aria-labelledby="categories-title">
      <div class="section-heading">
      <div>
      <p class="eyebrow">Explore por categoría</p>
      <h2 id="categories-title">Categorías</h2>
      </div>
      <a routerLink="/productos">Ver catálogo</a>
      </div>
      <div class="category-grid">@for (category of data.categories; track category.id) { <a [routerLink]="['/productos']" [queryParams]="{categoryId: category.id}">{{ category.name }}<span aria-hidden="true">→</span>
      </a> }</div>
      </section> }
        <app-product-section title="Productos destacados" [products]="data.featuredProducts" emptyText="Todavía no hay productos destacados." />
        <app-product-section title="Pocas unidades" [products]="data.lowStockProducts" emptyText="No hay productos con pocas unidades para mostrar." />
        @if (!data.categories.length && !data.featuredProducts.length && !data.lowStockProducts.length) { <p class="status" role="status">El catálogo todavía no tiene productos para mostrar.</p> }
      }
      <abar-health-status />
    </div>
  `,
  styles: [`
:host {

  display:block;
  color:var(--color-text)
}
.home-page {

  max-width:1200px;
  margin:0 auto;
  padding:clamp(1rem,3vw,2rem)
}
.hero {

  display:flex;
  align-items:center;
  min-height:320px;
  padding:clamp(1.5rem,5vw,4rem);
  border-radius:1.25rem;
  background:var(--color-blue-dark);
  color:var(--color-surface)
}
.hero>div {

  max-width:680px
}
.eyebrow {

  margin:0 0 .4rem;
  color:var(--color-surface);
  font-size:.88rem;
  font-weight:700;
  letter-spacing:.05em
}
.hero h1 {

  margin:.3rem 0;
  font-size:clamp(2rem,5vw,3.5rem);
  line-height:1.05
}
.hero p {

  max-width:570px;
  font-size:1.1rem;
  line-height:1.6
}
.hero .hero-title {

  font-size:clamp(1.2rem,2.5vw,1.6rem);
  font-weight:700
}
.hero-link {

  display:inline-flex;
  margin-top:.7rem;
  padding:.75rem 1rem;
  border-radius:.5rem;
  background:var(--color-orange);
  color:var(--color-text);
  font-weight:800;
  text-decoration:none
}
.category-section,.product-section {

  margin:2.5rem 0
}
.section-heading {

  display:flex;
  align-items:end;
  justify-content:space-between;
  gap:1rem;
  margin-bottom:1rem
}
.section-heading h2 {

  margin:.2rem 0;
  font-size:1.7rem
}
.section-heading a {

  color:var(--color-blue-dark);
  font-weight:700
}
.category-grid {

  display:grid;
  grid-template-columns:repeat(auto-fit,minmax(160px,1fr));
  gap:.75rem
}
.category-grid a {

  display:flex;
  justify-content:space-between;
  padding:1rem;
  border:1px solid var(--color-border);
  border-radius:.7rem;
  color:var(--color-text);
  font-weight:700;
  text-decoration:none
}
.category-grid a:hover {

  border-color:var(--color-blue-dark)
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
.notice button {

  min-height:2.75rem;
  padding:.6rem 1rem;
  border:0;
  border-radius:.5rem;
  background:var(--color-blue-dark);
  color:var(--color-surface);
  font:inherit;
  cursor:pointer
}
a:focus-visible,button:focus-visible {

  outline:3px solid var(--color-orange);
  outline-offset:2px
}
@media(max-width:500px) {

  .hero {

    min-height:280px
  }
  .section-heading {

    align-items:start
  }
}
  `],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HomePageComponent implements OnInit {
  private readonly api = inject(PublicCatalogApiService);
  private readonly destroyRef = inject(DestroyRef);
  readonly home = signal<CatalogHome | null>(null);
  readonly loading = signal(true);
  readonly error = signal(false);
  ngOnInit(): void {
    this.retry();
  }

  retry(): void {
    this.loading.set(true);
    this.error.set(false);
    this.api.home().pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (home) => {
        this.home.set(home);
        this.loading.set(false);
      },
      error: () => {
        this.error.set(true);
        this.loading.set(false);
      },
    });
  }
}
