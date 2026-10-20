import { ChangeDetectionStrategy, Component, DestroyRef, OnInit, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { catchError, combineLatest, map, of, startWith, Subject, switchMap, tap } from 'rxjs';
import { ProductDetail, ProductImageView, PublicPresentation } from '../../core/catalog/catalog.models';
import { PublicCatalogApiService } from '../../core/catalog/public-catalog-api.service';
import { formatMoney } from './format-money';

@Component({ selector: 'abar-product-detail-page', standalone: true, imports: [RouterLink], template: `
<div class="detail-page">
      <a class="back-link" routerLink="/productos">← Volver al catálogo</a>
  @if (loading()) { <p role="status" aria-live="polite">Cargando producto…</p> }
  @else if (error()) { <section class="notice" role="alert">
      <p>No pudimos cargar este producto.</p>
      <button type="button" (click)="retry()">Reintentar</button>
      </section> }
  @else if (product(); as item) {
    <nav class="breadcrumbs" aria-label="Migas de pan">
      <a routerLink="/">Inicio</a>
      <span aria-hidden="true">/</span>
      <a routerLink="/productos">Productos</a>
      <span aria-hidden="true">/</span>
      <span aria-current="page">{{ item.name }}</span>
      </nav>
    <section class="product-layout">
      <div class="gallery" aria-label="Galería de imágenes">
      <div class="hero-image">
      <img [src]="activeImage()?.url ?? fallbackImage" [alt]="activeImage()?.alt ?? ('Imagen no disponible para ' + item.name)" (error)="useFallback($event)">
      </div>
      @if(item.images.length>1){<div class="thumbnails" role="group" aria-label="Elegir imagen">@for(image of item.images;track image.id){<button type="button" [attr.aria-label]="'Ver imagen: '+image.alt" [attr.aria-pressed]="activeImage()?.id===image.id" (click)="selectImage(image)">
      <img [src]="image.url" [alt]="image.alt" (error)="useFallback($event)">
      </button>}</div>}
    </div>
      <article class="product-info">
      <p class="eyebrow">{{item.category.name}} @if(item.brand){· {{item.brand}}}</p>
      <h1>{{item.name}}</h1>@if(item.shortDescription){<p class="summary">{{item.shortDescription}}</p>}
      <label class="presentation-label" for="presentation">Presentación</label>
      <select id="presentation" [value]="selectedPresentation()?.id??''" (change)="selectPresentation($event)">@for(presentation of item.presentations;track presentation.id){<option [value]="presentation.id">{{unitLabel(presentation)}} — {{availabilityLabel(presentation)}}</option>}</select>
      @if(selectedPresentation();as presentation){<p class="price">{{formatPrice(presentation)}} <span>/ {{unitLabel(presentation)}}</span>
      </p>
      <p class="availability" [class.out-of-stock]="!presentation.sellable" role="status">{{availabilityLabel(presentation)}}</p>
        <div class="quantity-control">
      <label for="quantity">Cantidad</label>
      <div class="stepper">
      <button type="button" aria-label="Disminuir cantidad" [disabled]="quantity()<=1||!presentation.sellable" (click)="adjustQuantity(-1)">−</button>
      <input id="quantity" type="number" min="1" step="1" [value]="quantity()" [disabled]="!presentation.sellable" (change)="setQuantity($event)">
      <button type="button" aria-label="Aumentar cantidad" [disabled]="!presentation.sellable" (click)="adjustQuantity(1)">+</button>
      </div>
      <small>Solo cantidades enteras.</small>
      </div>
      <button class="coming-soon" type="button" disabled aria-disabled="true">Próximamente</button>
      <p class="purchase-note">La compra en línea todavía no está disponible.</p>
      }
      @if(item.description){<section class="description">
      <h2>Descripción</h2>
      <p>{{item.description}}</p>
      </section>}
      @if(item.attributes.length){<section class="attributes">
      <h2>Características</h2>
      <dl>@for(attribute of item.attributes;track attribute.key){<div>
      <dt>{{attribute.key}}</dt>
      <dd>{{attribute.value}}</dd>
      </div>}</dl>
      </section>}
    </article>
      </section>
  }
</div>`, styles: [`
:host {

  display:block;
  color:var(--color-text)
}
.detail-page {

  max-width:1200px;
  margin:0 auto;
  padding:clamp(1.25rem,4vw,3rem)
}
.back-link,.breadcrumbs a {

  color:var(--color-blue-dark);
  font-weight:700;
  text-decoration:none
}
.breadcrumbs {

  display:flex;
  flex-wrap:wrap;
  gap:.5rem;
  margin:1.25rem 0 2rem;
  color:var(--color-muted)
}
.product-layout {

  display:grid;
  grid-template-columns:minmax(0,1.1fr) minmax(280px,.9fr);
  gap:clamp(1.5rem,5vw,4rem)
}
.hero-image {

  display:grid;
  place-items:center;
  min-height:340px;
  padding:1rem;
  background:var(--color-surface-subtle);
  border-radius:1rem
}
.hero-image img {

  max-width:100%;
  max-height:420px;
  object-fit:contain
}
.thumbnails {

  display:flex;
  gap:.75rem;
  margin-top:.75rem;
  overflow-x:auto
}
.thumbnails button {

  width:76px;
  height:76px;
  flex:none;
  padding:.25rem;
  background:var(--color-surface);
  border:1px solid var(--color-border);
  border-radius:.6rem;
  cursor:pointer
}
.thumbnails button[aria-pressed=true] {

  border:3px solid var(--color-blue-dark)
}
.thumbnails img {

  width:100%;
  height:100%;
  object-fit:contain
}
.eyebrow {

  color:var(--color-muted);
  font-weight:700
}
.product-info h1 {

  margin:.4rem 0;
  font-size:clamp(2rem,4vw,3rem)
}
.summary {

  font-size:1.1rem;
  line-height:1.6
}
.presentation-label,.quantity-control>label {

  display:block;
  margin-top:1.5rem;
  font-weight:700
}
.product-info select {

  display:block;
  width:100%;
  min-height:2.9rem;
  margin-top:.45rem;
  padding:.6rem;
  border:1px solid var(--color-border);
  border-radius:.5rem;
  background:var(--color-surface);
  font:inherit
}
.price {

  margin:1.2rem 0 .4rem;
  font-size:1.8rem;
  font-weight:800
}
.price span {

  font-size:1rem;
  font-weight:500
}
.availability {

  color:var(--color-blue-dark);
  font-weight:700
}
.out-of-stock {

  color:var(--color-muted)
}
.stepper {

  display:flex;
  max-width:230px;
  margin:.4rem 0;
  align-items:center
}
.stepper button {

  width:2.75rem;
  height:2.75rem;
  border:1px solid var(--color-border);
  background:var(--color-surface-subtle);
  font-size:1.2rem;
  cursor:pointer
}
.stepper input {

  width:4.5rem;
  height:2.75rem;
  border:1px solid var(--color-border);
  text-align:center;
  font:inherit
}
.stepper button:disabled,.stepper input:disabled {

  opacity:.5;
  cursor:not-allowed
}
.quantity-control small {

  color:var(--color-muted)
}
.coming-soon {

  width:100%;
  min-height:3rem;
  margin-top:1.1rem;
  border:0;
  border-radius:.55rem;
  background:var(--color-muted);
  color:var(--color-surface);
  font:inherit;
  font-weight:800;
  cursor:not-allowed
}
.purchase-note {

  color:var(--color-muted);
  font-size:.9rem
}
.description,.attributes {

  margin-top:2rem;
  line-height:1.65
}
.description p {

  white-space:pre-line
}
.attributes dl {

  margin:0
}
.attributes dl div {

  display:grid;
  grid-template-columns:1fr 1.5fr;
  gap:1rem;
  padding:.65rem 0;
  border-bottom:1px solid var(--color-border)
}
.attributes dt {

  font-weight:700
}
.attributes dd {

  margin:0
}
.notice {

  padding:1rem;
  background:var(--color-surface-subtle);
  border-radius:.65rem
}
.notice button {

  min-height:2.6rem;
  padding:.5rem 1rem;
  border:0;
  border-radius:.5rem;
  background:var(--color-blue-dark);
  color:var(--color-surface);
  font:inherit;
  cursor:pointer
}
a:focus-visible,button:focus-visible,select:focus-visible,input:focus-visible {

  outline:3px solid var(--color-orange);
  outline-offset:2px
}
@media(max-width:760px) {

  .product-layout {

    grid-template-columns:1fr
  }
  .hero-image {

    min-height:260px
  }
  .product-info h1 {

    font-size:2rem
  }
}
  `], changeDetection: ChangeDetectionStrategy.OnPush })
export class ProductDetailPageComponent implements OnInit {
  private readonly api = inject(PublicCatalogApiService);
  private readonly route = inject(ActivatedRoute);
  private readonly destroyRef = inject(DestroyRef);
  private readonly refresh$ = new Subject<void>();

  readonly fallbackImage = '/assets/product-fallback.svg';
  readonly product = signal<ProductDetail | null>(null);
  readonly loading = signal(true);
  readonly error = signal(false);
  readonly selectedPresentation = signal<PublicPresentation | null>(null);
  readonly activeImage = signal<ProductImageView | null>(null);
  readonly quantity = signal(1);

  ngOnInit(): void {
    combineLatest([this.route.paramMap, this.refresh$.pipe(startWith(undefined))]).pipe(
      map(([params]) => params.get('slug') ?? ''),
      tap(() => {
        this.loading.set(true);
        this.error.set(false);
      }),
      switchMap((slug) => this.api.product(slug).pipe(
        map((product) => ({ product, error: false })),
        catchError(() => of({ product: null, error: true })),
      )),
      takeUntilDestroyed(this.destroyRef),
    ).subscribe(({ product, error }) => {
      if (!product) {
        this.error.set(error);
        this.loading.set(false);
        return;
      }
      this.showProduct(product);
    });
  }

  retry(): void {
    this.refresh$.next();
  }

  private showProduct(product: ProductDetail): void {
    this.product.set(product);
    this.selectedPresentation.set(
      product.presentations.find((item) => item.id === product.displayPresentationId)
        ?? product.presentations.find((item) => item.id === product.defaultPresentationId)
        ?? product.presentations[0]
        ?? null,
    );
    this.activeImage.set(
      product.primaryImage
        ?? product.images.find((image) => image.isPrimary)
        ?? product.images[0]
        ?? null,
    );
    this.quantity.set(1);
    this.loading.set(false);
  }

  selectImage(image: ProductImageView): void {
    this.activeImage.set(image);
  }

  selectPresentation(event: Event): void {
    const id = (event.target as HTMLSelectElement).value;
    this.selectedPresentation.set(this.product()?.presentations.find((item) => item.id === id) ?? null);
    this.quantity.set(1);
  }

  setQuantity(event: Event): void {
    const input = event.target as HTMLInputElement;
    const value = Number(input.value);
    if (Number.isSafeInteger(value) && value > 0) {
      this.quantity.set(value);
      return;
    }
    input.value = String(this.quantity());
  }

  adjustQuantity(delta: number): void {
    this.quantity.update((value) => Math.max(1, value + delta));
  }

  formatPrice(presentation: PublicPresentation): string {
    return formatMoney(presentation.price.amountMinor);
  }

  unitLabel(presentation: PublicPresentation): string {
    if (presentation.unit === 'UNIT') return 'unidad';
    if (presentation.unit === 'METER') return 'metro';
    return `rollo${presentation.rollLengthMeters ? ` de ${presentation.rollLengthMeters} m` : ''}`;
  }

  availabilityLabel(presentation: PublicPresentation): string {
    if (presentation.availability === 'AVAILABLE') return 'Disponible';
    if (presentation.availability === 'LOW_STOCK') return 'Pocas unidades';
    return 'Sin stock';
  }

  useFallback(event: Event): void {
    (event.target as HTMLImageElement).src = this.fallbackImage;
  }
}
