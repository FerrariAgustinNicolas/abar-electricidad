import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, DestroyRef, inject, signal } from '@angular/core';
import { FormArray, FormBuilder, FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, CanDeactivateFn, Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { AuthSessionService } from '../../core/auth/auth-session.service';
import { AdminProduct, CategoryList, PresentationUnit, ProductPatch, ProductWrite, TechnicalAttribute } from '../../core/catalog/catalog.models';
import { AdminCatalogApiService } from '../../core/catalog/admin-catalog-api.service';
import { adminCatalogError, handleAdminCatalogSessionFailure, isAdminCatalogCsrfInvalid } from './admin-catalog.shared';

type AttributeGroup = FormGroup<{ key: FormControl<string>; value: FormControl<string> }>;
type PresentationGroup = FormGroup<{
  id: FormControl<string>; unit: FormControl<PresentationUnit>; rollLengthMeters: FormControl<number | null>;
  priceAmountMinor: FormControl<string>; lowStockThreshold: FormControl<number>; active: FormControl<boolean>; isDefault: FormControl<boolean>;
}>;
type ProductForm = FormGroup<{
  name: FormControl<string>; slug: FormControl<string>; categoryId: FormControl<string>; brand: FormControl<string>;
  sku: FormControl<string>; shortDescription: FormControl<string>; description: FormControl<string>;
  active: FormControl<boolean>; featured: FormControl<boolean>; attributes: FormArray<AttributeGroup>;
  presentations: FormArray<PresentationGroup>;
}>;

@Component({
  selector: 'abar-admin-product-form-page',
  standalone: true,
  imports: [ReactiveFormsModule],
  template: `
    <section aria-labelledby="product-form-title">
      <p class="eyebrow">Catálogo</p><h1 id="product-form-title">{{ productId ? 'Editar producto' : 'Nuevo producto' }}</h1>
      <p>Los cambios de catálogo no modifican las existencias; el stock se administra por separado.</p>
      @if (error()) { <p class="form-error" role="alert">{{ error() }}</p> }
      @if (staleCsrf()) { <p class="field-hint" role="status">La sesión cambió en otra pestaña; la acción no se repitió y tus cambios siguen en el formulario.</p><button class="button-secondary" type="button" (click)="refreshSession()" [disabled]="refreshing()">{{ refreshing() ? 'Actualizando sesión…' : 'Actualizar sesión para un nuevo intento' }}</button> }
      @if (versionConflict()) { <button class="button-secondary" type="button" (click)="reloadAfterConflict()">Descartar mis cambios y recargar la versión del servidor</button> }
      @if (loading()) { <p role="status">Cargando producto…</p> }
      <form class="panel" [formGroup]="form" (ngSubmit)="save()">
        <fieldset [disabled]="busy() || loading()"><legend>Información del producto</legend>
          <div class="form-grid">
            <label for="product-name">Nombre<input id="product-name" formControlName="name" maxlength="200" required /></label>
            <label for="product-slug">Identificador de URL<input id="product-slug" formControlName="slug" maxlength="120" pattern="[a-z0-9]+(?:-[a-z0-9]+)*" required /></label>
            <label for="product-category">Categoría<select id="product-category" formControlName="categoryId" required>
              <option value="">Seleccione una categoría</option>@for (category of categories(); track category.id) { <option [value]="category.id">{{ category.name }}</option> }
            </select></label>
            <label for="product-brand">Marca<input id="product-brand" formControlName="brand" maxlength="100" /></label>
            <label for="product-sku">SKU<input id="product-sku" formControlName="sku" maxlength="100" /></label>
            <label for="product-short-description">Descripción breve<textarea id="product-short-description" formControlName="shortDescription" maxlength="500"></textarea></label>
          </div>
          <label for="product-description">Descripción detallada<textarea id="product-description" formControlName="description" maxlength="10000" rows="5"></textarea></label>
          <div class="form-grid"><label class="check-field"><input type="checkbox" formControlName="active" /> Producto activo</label>
            <label class="check-field"><input type="checkbox" formControlName="featured" /> Destacado</label></div>
        </fieldset>

        <fieldset [disabled]="busy() || loading()"><legend>Características técnicas</legend>
          <p class="field-hint">Agregue pares descriptivos de nombre y valor; no se generan variantes automáticamente.</p>
          <div formArrayName="attributes">@for (attribute of attributes.controls; track attribute; let index = $index) {
            <div class="form-grid" [formGroupName]="index"><label [for]="'attribute-key-' + index">Característica<input [id]="'attribute-key-' + index" formControlName="key" maxlength="80" /></label>
              <label [for]="'attribute-value-' + index">Valor<input [id]="'attribute-value-' + index" formControlName="value" maxlength="500" /></label>
              <button class="button-secondary" type="button" (click)="removeAttribute(index)">Quitar característica</button></div>
          }</div>
          <button class="button-secondary" type="button" (click)="addAttribute()" [disabled]="attributes.length >= 40">Agregar característica</button>
        </fieldset>

        <fieldset [disabled]="busy() || loading()"><legend>Presentaciones y precios</legend>
          <p class="field-hint">Cada unidad tiene precio independiente. Las cantidades de stock se gestionan en Existencias.</p>
          <div formArrayName="presentations">@for (presentation of presentations.controls; track presentation; let index = $index) {
            <fieldset class="presentation-card" [formGroupName]="index"><legend>Presentación {{ index + 1 }}</legend>
              <div class="form-grid">
                <label [for]="'presentation-unit-' + index">Unidad<select [id]="'presentation-unit-' + index" formControlName="unit">
                  <option value="UNIT">Unidad</option><option value="METER">Metro</option><option value="ROLL">Rollo</option></select></label>
                @if (presentation.controls.unit.value === 'ROLL') { <label [for]="'presentation-length-' + index">Longitud del rollo (metros)<input [id]="'presentation-length-' + index" type="number" min="1" step="1" formControlName="rollLengthMeters" required /></label> }
                <label [for]="'presentation-price-' + index">Precio en centavos de ARS<input [id]="'presentation-price-' + index" inputmode="numeric" pattern="0|[1-9][0-9]*" formControlName="priceAmountMinor" required />
                  <small>Ingrese un entero en centavos; no se usa aritmética decimal.</small></label>
                <label [for]="'presentation-minimum-' + index">Mínimo de stock<input [id]="'presentation-minimum-' + index" type="number" min="0" step="1" formControlName="lowStockThreshold" required /></label>
                <label class="check-field"><input type="checkbox" formControlName="active" /> Activa</label>
                <label class="check-field"><input type="checkbox" [checked]="presentation.controls.isDefault.value" (change)="setDefault(index)" /> Predeterminada</label>
                @if (presentations.length > 1) { <button class="button-secondary" type="button" (click)="removePresentation(index)" [disabled]="presentation.controls.id.value !== ''">Quitar presentación nueva</button> }
              </div>
              @if (presentation.controls.id.value) { <small>Los identificadores de presentaciones existentes se conservan; desactive una presentación en lugar de quitarla.</small> }
            </fieldset>
          }</div>
          <button class="button-secondary" type="button" (click)="addPresentation()" [disabled]="presentations.length >= 3">Agregar presentación</button>
        </fieldset>

        @if (productId && product()) {
          <fieldset [disabled]="busy()"><legend>Galería de imágenes PNG</legend>
            <p class="field-hint">Hasta ocho imágenes, 5 MiB por archivo y dimensiones máximas de 4096 × 4096. El servidor vuelve a validar el contenido.</p>
            @if (images().length) { <div class="image-grid">@for (image of images(); track image.id) {
              <article class="image-card"><div class="image-frame">@if (imageSources()[image.id]) { <img [src]="imageSources()[image.id]" [alt]="imageDraft(image).alt" /> } @else if (imageErrors()[image.id]) { <span>Vista previa no disponible</span> } @else { <span role="status">Cargando imagen…</span> }</div>
                <label [for]="'image-alt-' + image.id">Texto alternativo<input [id]="'image-alt-' + image.id" [value]="imageDraft(image).alt" (input)="updateImageDraft(image, 'alt', inputValue($event))" maxlength="200" required /></label>
                <label [for]="'image-order-' + image.id">Orden<input [id]="'image-order-' + image.id" type="number" min="0" max="7" step="1" [value]="imageDraft(image).order" (input)="updateImageDraft(image, 'order', inputNumber($event))" required /></label>
                <p>{{ image.isPrimary ? 'Principal' : 'Adicional' }}</p>
                <div class="action-cell"><button class="button-secondary" type="button" (click)="saveImageMetadata(image.id)" [disabled]="busy() || !imageDraftChanged(image)">Guardar datos de imagen</button>
                  <button class="button-secondary" type="button" (click)="makePrimary(image.id)" [disabled]="image.isPrimary">Hacer principal</button>
                  <button class="button-secondary" type="button" (click)="deleteImage(image.id)">Eliminar</button></div></article>
            }</div> } @else { <p class="empty-state">Todavía no hay imágenes.</p> }
            <div class="form-grid">
              <label for="image-file">Archivo PNG<input id="image-file" type="file" accept="image/png,.png" (change)="selectImage($event)" /></label>
              <label for="image-alt">Texto alternativo<input id="image-alt" [value]="imageAlt()" (input)="imageAlt.set(inputValue($event))" maxlength="200" required /></label>
            </div>
            @if (selectedImage()) { <p role="status">Archivo seleccionado: {{ selectedImage()!.name }} ({{ selectedImage()!.size }} bytes)</p> }
            <button type="button" (click)="uploadImage()" [disabled]="busy() || !selectedImage() || !imageAlt().trim() || images().length >= 8">Subir imagen</button>
          </fieldset>
        }
        <div class="form-actions"><button type="submit" [disabled]="busy() || loading() || form.invalid || !presentationsValid()">{{ busy() ? 'Guardando…' : productId ? 'Guardar cambios' : 'Crear producto' }}</button>
          @if (product()) { <span>Versión de catálogo {{ product()!.version }}</span> }</div>
      </form>
    </section>
  `,
  styles: [`.presentation-card { margin-block:1rem;padding:1rem;border:1px solid var(--color-border);border-radius:.35rem } .check-field { display:flex;align-items:center;gap:.5rem } .check-field input { width:auto;min-height:auto } .image-grid { display:grid;grid-template-columns:repeat(auto-fit,minmax(12rem,1fr));gap:1rem } .image-card { padding:.75rem;border:1px solid var(--color-border) } .image-frame { display:grid;place-items:center;min-height:9rem;background:var(--color-surface-subtle) } .image-frame img { max-width:100%;max-height:15rem;object-fit:contain } .form-actions { display:flex;align-items:center;gap:1rem;margin-top:1rem } fieldset { margin-block:1rem;padding:1rem;border:1px solid var(--color-border) } select { width:100%;min-height:2.75rem;padding:.5rem;border:1px solid var(--color-border);border-radius:.25rem;background:#fff;font:inherit }`],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminProductFormPageComponent {
  private readonly api = inject(AdminCatalogApiService);
  private readonly fb = inject(FormBuilder).nonNullable;
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly auth = inject(AuthSessionService);
  private readonly destroyRef = inject(DestroyRef);
  readonly productId = this.route.snapshot.paramMap.get('id');
  readonly form: ProductForm = this.fb.group({
    name: ['', [Validators.required, Validators.maxLength(200)]], slug: ['', [Validators.required, Validators.pattern(/^[a-z0-9]+(?:-[a-z0-9]+)*$/), Validators.maxLength(120)]],
    categoryId: ['', Validators.required], brand: [''], sku: [''], shortDescription: [''], description: [''], active: this.fb.control<boolean>(true), featured: this.fb.control<boolean>(false),
    attributes: this.fb.array<AttributeGroup>([]), presentations: this.fb.array<PresentationGroup>([]),
  });
  readonly categories = signal<CategoryList['items']>([]);
  readonly product = signal<AdminProduct | null>(null);
  readonly loading = signal(false);
  readonly busy = signal(false);
  readonly error = signal('');
  readonly staleCsrf = signal(false);
  readonly refreshing = signal(false);
  readonly versionConflict = signal(false);
  readonly selectedImage = signal<File | null>(null);
  readonly imageAlt = signal('');
  readonly images = signal<AdminProduct['images']>([]);
  readonly imageSources = signal<Record<string, string>>({});
  readonly imageErrors = signal<Record<string, boolean>>({});
  readonly imageDrafts = signal<Record<string, { alt: string; order: number }>>({});
  private readonly objectUrls = new Set<string>();
  private readonly imageDraftDirty = signal(false);
  readonly attributes = this.form.controls.attributes;
  readonly presentations = this.form.controls.presentations;

  constructor() {
    void this.loadCategories();
    if (this.productId) void this.loadProduct(); else this.addPresentation(false);
    this.destroyRef.onDestroy(() => this.objectUrls.forEach((url) => URL.revokeObjectURL(url)));
  }

  inputValue(event: Event): string { return (event.target as HTMLInputElement).value; }
  inputNumber(event: Event): number { return Number((event.target as HTMLInputElement).value); }
  imageDraft(image: AdminProduct['images'][number]): { alt: string; order: number } { return this.imageDrafts()[image.id] ?? { alt: image.alt, order: image.order }; }
  imageDraftChanged(image: AdminProduct['images'][number]): boolean { const draft = this.imageDraft(image); return draft.alt !== image.alt || draft.order !== image.order; }
  updateImageDraft(image: AdminProduct['images'][number], key: 'alt' | 'order', value: string | number): void {
    this.imageDrafts.update((drafts) => ({ ...drafts, [image.id]: { ...this.imageDraft(image), [key]: value } }));
    this.imageDraftDirty.set(true);
  }
  addAttribute(): void { if (this.attributes.length < 40) { this.attributes.push(this.fb.group({ key: '', value: '' })); this.form.markAsDirty(); } }
  removeAttribute(index: number): void { this.attributes.removeAt(index); this.form.markAsDirty(); }
  addPresentation(markDirty = true): void {
    if (this.presentations.length >= 3) return;
    this.presentations.push(new FormGroup({
      id: new FormControl('', { nonNullable: true }),
      unit: new FormControl<PresentationUnit>('UNIT', { nonNullable: true }),
      rollLengthMeters: new FormControl<number | null>(null),
      priceAmountMinor: new FormControl('0', { nonNullable: true, validators: [Validators.required, Validators.pattern(/^(0|[1-9][0-9]*)$/)] }),
      lowStockThreshold: new FormControl(0, { nonNullable: true, validators: [Validators.min(0), Validators.max(2147483647)] }),
      active: new FormControl(true, { nonNullable: true }), isDefault: new FormControl(this.presentations.length === 0, { nonNullable: true }),
    }));
    if (markDirty) this.form.markAsDirty();
  }
  removePresentation(index: number): void { if (!this.presentations.at(index).controls.id.value && this.presentations.length > 1) { this.presentations.removeAt(index); this.form.markAsDirty(); } }
  setDefault(index: number): void { this.presentations.controls.forEach((presentation, current) => presentation.controls.isDefault.setValue(current === index)); this.form.markAsDirty(); }

  presentationsValid(): boolean {
    const rows = this.presentations.getRawValue();
    const active = rows.filter((row) => row.active);
    return rows.length > 0 && new Set(rows.map((row) => row.unit)).size === rows.length && active.length > 0 &&
      active.filter((row) => row.isDefault).length === 1 && rows.every((row) => row.unit !== 'ROLL' || Number.isSafeInteger(row.rollLengthMeters) && row.rollLengthMeters! > 0) &&
      rows.every((row) => row.lowStockThreshold >= 0 && Number.isSafeInteger(row.lowStockThreshold) && /^(0|[1-9][0-9]*)$/.test(row.priceAmountMinor) && BigInt(row.priceAmountMinor) <= 9223372036854775807n);
  }

  canDeactivate(): boolean {
    return (!this.form.dirty && !this.imageDraftDirty() && !this.selectedImage()) ||
      window.confirm('Hay cambios sin guardar. ¿Querés salir sin guardarlos?');
  }

  async save(): Promise<void> {
    if (this.busy() || this.form.invalid || !this.presentationsValid()) { this.form.markAllAsTouched(); this.error.set('Revise los campos obligatorios, las unidades únicas y la presentación predeterminada.'); return; }
    this.busy.set(true); this.error.set('');
    const input = this.toWrite();
    try {
      const current = this.product();
      const saved = current
        ? await firstValueFrom(this.api.updateProduct(current.id, { ...input, expectedVersion: current.version } satisfies ProductPatch))
        : await firstValueFrom(this.api.createProduct(input));
      await this.hydrateProduct(saved); this.versionConflict.set(false);
      if (!current) await this.router.navigate(['/admin/productos', saved.id, 'editar']);
    } catch (error: unknown) { await this.showError(error); }
    finally { this.busy.set(false); }
  }

  selectImage(event: Event): void {
    const file = (event.target as HTMLInputElement).files?.item(0) ?? null;
    this.selectedImage.set(file); this.imageDraftDirty.set(Boolean(file)); this.error.set('');
    if (file) void this.validatePng(file);
  }

  async uploadImage(): Promise<void> {
    const file = this.selectedImage(); const product = this.product(); const alt = this.imageAlt().trim();
    if (!file || !product || !alt || this.busy()) return;
    const validation = await validatePngFile(file);
    if (validation) { this.error.set(validation); return; }
    this.busy.set(true); this.error.set('');
    try {
      const result = await firstValueFrom(this.api.uploadProductImage(product.id, file, alt, product.images.length, product.images.length === 0, product.version));
      this.applyGalleryResult(result); this.selectedImage.set(null); this.imageAlt.set(''); this.imageDraftDirty.set(false);
      const picker = document.getElementById('image-file') as HTMLInputElement | null; if (picker) picker.value = '';
    } catch (error: unknown) { await this.showError(error); }
    finally { this.busy.set(false); }
  }

  async makePrimary(imageId: string): Promise<void> {
    const product = this.product(); if (!product || this.busy()) return;
    this.busy.set(true); this.error.set('');
    try { this.applyGalleryResult(await firstValueFrom(this.api.updateProductImage(product.id, imageId, { isPrimary: true, expectedVersion: product.version }))); }
    catch (error: unknown) { await this.showError(error); }
    finally { this.busy.set(false); }
  }

  async saveImageMetadata(imageId: string): Promise<void> {
    const product = this.product(); const image = this.images().find((item) => item.id === imageId); const draft = this.imageDrafts()[imageId];
    if (!product || !image || !draft || this.busy() || !draft.alt.trim() || draft.alt.length > 200 || !Number.isSafeInteger(draft.order) || draft.order < 0 || draft.order > 7) return;
    this.busy.set(true); this.error.set('');
    try { this.applyGalleryResult(await firstValueFrom(this.api.updateProductImage(product.id, imageId, { alt: draft.alt.trim(), order: draft.order, expectedVersion: product.version }))); }
    catch (error: unknown) { await this.showError(error); }
    finally { this.busy.set(false); }
  }

  async deleteImage(imageId: string): Promise<void> {
    const product = this.product(); if (!product || this.busy() || !window.confirm('¿Querés eliminar esta imagen del producto?')) return;
    this.busy.set(true); this.error.set('');
    try { this.applyGalleryResult(await firstValueFrom(this.api.deleteProductImage(product.id, imageId, product.version))); }
    catch (error: unknown) { await this.showError(error); }
    finally { this.busy.set(false); }
  }

  async reloadAfterConflict(): Promise<void> {
    if (!this.productId || !this.versionConflict() || !window.confirm('Se descartarán los cambios locales y se recargará la versión vigente del producto. ¿Continuar?')) return;
    this.versionConflict.set(false); this.error.set(''); this.imageDraftDirty.set(false); this.selectedImage.set(null);
    await this.loadProduct();
  }

  private async loadCategories(): Promise<void> {
    try { this.categories.set((await firstValueFrom(this.api.listCategories({ active: true }))).items); }
    catch (error: unknown) { await this.showError(error); }
  }

  private async loadProduct(): Promise<void> {
    if (!this.productId) return;
    this.loading.set(true);
    try {
      const product = await firstValueFrom(this.api.getProduct(this.productId));
      await this.hydrateProduct(product);
    } catch (error: unknown) { await this.showError(error); }
    finally { this.loading.set(false); }
  }

  private async hydrateProduct(product: AdminProduct): Promise<void> {
    this.product.set(product); this.images.set(product.images); this.form.patchValue({
      name: product.name, slug: product.slug, categoryId: product.categoryId, brand: product.brand ?? '', sku: product.sku ?? '',
      shortDescription: product.shortDescription, description: product.description, active: product.active, featured: product.featured,
    });
    this.attributes.clear();
    product.attributes.forEach((attribute) => this.attributes.push(this.fb.group({ key: attribute.key, value: attribute.value })));
    this.presentations.clear();
    product.presentations.forEach((row) => this.presentations.push(new FormGroup({
      id: new FormControl(row.id, { nonNullable: true }), unit: new FormControl<PresentationUnit>(row.unit, { nonNullable: true }),
      rollLengthMeters: new FormControl<number | null>(row.rollLengthMeters),
      priceAmountMinor: new FormControl(row.price.amountMinor, { nonNullable: true, validators: [Validators.required, Validators.pattern(/^(0|[1-9][0-9]*)$/)] }),
      lowStockThreshold: new FormControl(row.lowStockThreshold, { nonNullable: true, validators: [Validators.min(0), Validators.max(2147483647)] }),
      active: new FormControl(row.active, { nonNullable: true }), isDefault: new FormControl(row.isDefault, { nonNullable: true }),
    })));
    this.form.markAsPristine(); this.imageDraftDirty.set(false); await this.refreshImagePreviews(product);
  }

  private toWrite(): ProductWrite {
    const value = this.form.getRawValue();
    const attributes: TechnicalAttribute[] = value.attributes.map(({ key, value: attributeValue }) => ({ key: key.trim(), value: attributeValue.trim() }))
      .filter((attribute) => attribute.key && attribute.value);
    return {
      name: value.name.trim(), slug: value.slug.trim(), categoryId: value.categoryId, brand: value.brand.trim() || null, sku: value.sku.trim() || null,
      shortDescription: value.shortDescription, description: value.description, attributes, active: value.active, featured: value.featured,
      presentations: value.presentations.map((row) => ({
        ...(row.id ? { id: row.id } : {}), unit: row.unit,
        ...(row.unit === 'ROLL' ? { rollLengthMeters: row.rollLengthMeters ?? undefined } : {}),
        price: { amountMinor: row.priceAmountMinor, currency: 'ARS' }, lowStockThreshold: row.lowStockThreshold, active: row.active, isDefault: row.isDefault,
      })),
    };
  }

  private applyGalleryResult(product: AdminProduct): void { this.product.set(product); this.images.set(product.images); this.imageDraftDirty.set(false); void this.refreshImagePreviews(product); }
  private async showError(error: unknown): Promise<void> {
    this.error.set(adminCatalogError(error)); this.versionConflict.set(error instanceof HttpErrorResponse && error.status === 409);
    this.staleCsrf.set(isAdminCatalogCsrfInvalid(error));
    await handleAdminCatalogSessionFailure(error, this.auth, this.router, this.productId ? `/admin/productos/${this.productId}/editar` : '/admin/productos/nuevo');
  }
  async refreshSession(): Promise<void> {
    this.refreshing.set(true); this.error.set(''); this.staleCsrf.set(false);
    const returnUrl = this.productId ? `/admin/productos/${this.productId}/editar` : '/admin/productos/nuevo';
    try {
      const session = await this.auth.refreshSession();
      if (!session) { await this.router.navigate(['/admin/login'], { queryParams: { returnUrl } }); return; }
      if (session.admin.mustChangePassword) { await this.router.navigate(['/admin/change-password']); return; }
      this.error.set('Sesión actualizada. Revise los datos y elija nuevamente la acción.');
    } catch { this.error.set('No se pudo actualizar la sesión. Inicie sesión nuevamente.'); }
    finally { this.refreshing.set(false); }
  }
  private async refreshImagePreviews(product: AdminProduct): Promise<void> {
    const old = this.imageSources(); Object.values(old).forEach((url) => { URL.revokeObjectURL(url); this.objectUrls.delete(url); });
    this.imageSources.set({}); this.imageErrors.set({});
    this.imageDrafts.set(Object.fromEntries(product.images.map((image) => [image.id, { alt: image.alt, order: image.order }])));
    for (const image of product.images) {
      try {
        const blob = await firstValueFrom(this.api.loadAdminImage(product.id, image.id));
        const url = URL.createObjectURL(blob); this.objectUrls.add(url); this.imageSources.update((sources) => ({ ...sources, [image.id]: url }));
      } catch { this.imageErrors.update((errors) => ({ ...errors, [image.id]: true })); this.error.set('No se pudo cargar una imagen protegida.'); }
    }
  }
  private async validatePng(file: File): Promise<void> {
    const message = await validatePngFile(file); if (message) this.error.set(message);
  }
}

export const unsavedProductGuard: CanDeactivateFn<AdminProductFormPageComponent> = (component) => component.canDeactivate();

async function validatePngFile(file: File): Promise<string | null> {
  if (file.type !== 'image/png' || !file.name.toLowerCase().endsWith('.png')) return 'Seleccione un archivo PNG.';
  if (file.size > 5 * 1024 * 1024) return 'La imagen no puede superar 5 MiB.';
  if (file.size < 24) return 'El archivo PNG está incompleto.';
  const header = new Uint8Array(await file.slice(0, 24).arrayBuffer());
  const signature = [137, 80, 78, 71, 13, 10, 26, 10];
  if (!signature.every((value, index) => header[index] === value)) return 'El contenido del archivo no tiene una firma PNG válida.';
  const view = new DataView(header.buffer);
  const width = view.getUint32(16); const height = view.getUint32(20);
  if (width < 1 || height < 1 || width > 4096 || height > 4096) return 'Las dimensiones máximas permitidas son 4096 × 4096 píxeles.';
  return null;
}
