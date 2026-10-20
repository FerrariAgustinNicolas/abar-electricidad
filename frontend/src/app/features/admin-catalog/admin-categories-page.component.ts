import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { AuthSessionService } from '../../core/auth/auth-session.service';
import { Category, CategoryList, CategoryWrite } from '../../core/catalog/catalog.models';
import { AdminCatalogApiService } from '../../core/catalog/admin-catalog-api.service';
import { adminCatalogError, handleAdminCatalogSessionFailure, isAdminCatalogCsrfInvalid } from './admin-catalog.shared';

interface CategoryDraft { name: string; slug: string; description: string; active: boolean; order: number; }

@Component({
  selector: 'abar-admin-categories-page', standalone: true,
  template: `
    <section aria-labelledby="categories-title">
      <header class="page-heading"><div><p class="eyebrow">Catálogo</p><h1 id="categories-title">Categorías</h1><p>Organice las categorías visibles y su orden.</p></div>
        <button class="button-secondary" type="button" (click)="load()" [disabled]="loading()">Actualizar</button></header>
      @if (error()) { <p class="form-error" role="alert">{{ error() }}</p> }
      @if (staleCsrf()) { <p class="field-hint" role="status">La sesión cambió en otra pestaña; la acción no se repitió y los borradores se conservaron.</p><button class="button-secondary" type="button" (click)="refreshSession()" [disabled]="refreshing()">{{ refreshing() ? 'Actualizando sesión…' : 'Actualizar sesión para un nuevo intento' }}</button> }
      <details class="panel" [open]="createOpen()"><summary>Crear categoría</summary>
        <form class="form-grid" (submit)="$event.preventDefault(); createCategory()">
          <label for="new-category-name">Nombre<input id="new-category-name" required maxlength="100" [value]="newDraft().name" (input)="updateNew('name', inputValue($event))" /></label>
          <label for="new-category-slug">Identificador<input id="new-category-slug" required maxlength="120" pattern="[a-z0-9]+(?:-[a-z0-9]+)*" [value]="newDraft().slug" (input)="updateNew('slug', inputValue($event))" /></label>
          <label for="new-category-description">Descripción<textarea id="new-category-description" maxlength="1000" [value]="newDraft().description" (input)="updateNew('description', inputValue($event))"></textarea></label>
          <label for="new-category-order">Orden<input id="new-category-order" type="number" min="0" step="1" [value]="newDraft().order" (input)="updateNew('order', inputNumber($event))" /></label>
          <label class="check-field"><input type="checkbox" [checked]="newDraft().active" (change)="updateNew('active', inputChecked($event))" /> Activa</label>
          <button type="submit" [disabled]="busy() || !validDraft(newDraft())">Crear categoría</button>
        </form>
      </details>
      @if (loading() && !categories()) { <p role="status">Cargando categorías…</p> }
      @if (categories()?.items?.length === 0) { <p class="empty-state">No hay categorías para mostrar.</p> }
      @if (categories()?.items?.length) {
        <div class="table-wrap"><table><caption>Categorías ordenadas</caption>
          <thead><tr><th scope="col">Categoría</th><th scope="col">Estado</th><th scope="col">Orden</th><th scope="col">Acciones</th></tr></thead>
          <tbody>@for (category of orderDraft(); track category.id; let index = $index) {
            <tr><td>
              <label [for]="'category-name-' + category.id">Nombre</label><input [id]="'category-name-' + category.id" [value]="draft(category).name" maxlength="100" (input)="updateDraft(category, 'name', inputValue($event))" />
              <label [for]="'category-slug-' + category.id">Identificador</label><input [id]="'category-slug-' + category.id" [value]="draft(category).slug" maxlength="120" pattern="[a-z0-9]+(?:-[a-z0-9]+)*" (input)="updateDraft(category, 'slug', inputValue($event))" />
              <label [for]="'category-description-' + category.id">Descripción</label><textarea [id]="'category-description-' + category.id" maxlength="1000" [value]="draft(category).description" (input)="updateDraft(category, 'description', inputValue($event))"></textarea>
            </td><td><label class="check-field"><input type="checkbox" [checked]="draft(category).active" (change)="updateDraft(category, 'active', inputChecked($event))" /> {{ draft(category).active ? 'Activa' : 'Inactiva' }}</label><small>Versión {{ category.version }}</small></td>
            <td>{{ category.order }}<div class="action-cell"><button class="button-secondary" type="button" (click)="move(index, -1)" [disabled]="index === 0">Subir</button><button class="button-secondary" type="button" (click)="move(index, 1)" [disabled]="index === orderDraft().length - 1">Bajar</button></div></td>
            <td class="action-cell"><button type="button" (click)="save(category)" [disabled]="busy() || !validDraft(draft(category))">Guardar cambios</button>
              <button class="button-secondary" type="button" (click)="toggleActive(category)" [disabled]="busy()">{{ draft(category).active ? 'Desactivar' : 'Activar' }}</button></td></tr>
          }</tbody>
        </table></div>
        <div class="action-cell"><button type="button" (click)="saveOrder()" [disabled]="busy() || !orderChanged()">Guardar orden completo</button>
          <button class="button-secondary" type="button" (click)="resetOrder()" [disabled]="busy()">Descartar cambios de orden</button></div>
      }
    </section>
  `,
  styles: [`.check-field { display:flex;align-items:center;gap:.5rem } .check-field input { width:auto;min-height:auto } .action-cell { display:flex;flex-wrap:wrap;gap:.5rem } input,textarea { width:100%;min-height:2.75rem;padding:.5rem;border:1px solid var(--color-border);border-radius:.25rem;font:inherit }`],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminCategoriesPageComponent {
  private readonly api = inject(AdminCatalogApiService);
  private readonly auth = inject(AuthSessionService);
  private readonly router = inject(Router);
  readonly categories = signal<CategoryList | null>(null);
  readonly orderDraft = signal<Category[]>([]);
  readonly loading = signal(false);
  readonly busy = signal(false);
  readonly error = signal('');
  readonly staleCsrf = signal(false);
  readonly refreshing = signal(false);
  readonly createOpen = signal(true);
  readonly newDraft = signal<CategoryWrite>({ name: '', slug: '', description: '', active: true, order: 0 });
  private readonly drafts = new Map<string, CategoryDraft>();

  constructor() { void this.load(); }
  inputValue(event: Event): string { return (event.target as HTMLInputElement | HTMLTextAreaElement).value; }
  inputNumber(event: Event): number { return Number((event.target as HTMLInputElement).value); }
  inputChecked(event: Event): boolean { return (event.target as HTMLInputElement).checked; }
  validDraft(draft: CategoryDraft | CategoryWrite): boolean {
    return draft.name.trim().length > 0 && draft.name.trim().length <= 100 && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(draft.slug) &&
      draft.slug.length <= 120 && draft.description.length <= 1000 && Number.isSafeInteger(draft.order) && draft.order >= 0;
  }
  draft(category: Category): CategoryDraft { return this.drafts.get(category.id) ?? this.toDraft(category); }
  updateNew(key: keyof CategoryWrite, value: string | number | boolean): void { this.newDraft.update((draft) => ({ ...draft, [key]: value })); }
  updateDraft(category: Category, key: keyof CategoryDraft, value: string | number | boolean): void {
    this.drafts.set(category.id, { ...this.draft(category), [key]: value });
  }
  orderChanged(): boolean { return this.orderDraft().some((category, index) => this.categories()?.items[index]?.id !== category.id); }
  resetOrder(): void { this.orderDraft.set([...(this.categories()?.items ?? [])]); }
  move(index: number, delta: number): void {
    const rows = [...this.orderDraft()]; const next = index + delta;
    if (next < 0 || next >= rows.length) return;
    [rows[index], rows[next]] = [rows[next], rows[index]]; this.orderDraft.set(rows);
  }

  async load(): Promise<void> {
    if (this.loading()) return;
    this.loading.set(true); this.error.set('');
    try {
      const result = await firstValueFrom(this.api.listCategories()); this.categories.set(result);
      this.orderDraft.set([...result.items]);
      for (const category of result.items) if (!this.drafts.has(category.id)) this.drafts.set(category.id, this.toDraft(category));
    } catch (error: unknown) { await this.reportError(error); }
    finally { this.loading.set(false); }
  }

  async createCategory(): Promise<void> {
    const draft = this.newDraft(); if (this.busy() || !this.validDraft(draft)) return;
    this.busy.set(true); this.error.set('');
    try {
      await firstValueFrom(this.api.createCategory({ ...draft, name: draft.name.trim(), slug: draft.slug.trim() }));
      this.newDraft.set({ name: '', slug: '', description: '', active: true, order: 0 }); this.createOpen.set(false); await this.load();
    } catch (error: unknown) { await this.reportError(error); }
    finally { this.busy.set(false); }
  }

  async save(category: Category): Promise<void> {
    const draft = this.draft(category); if (this.busy() || !this.validDraft(draft)) return;
    const original = this.toDraft(category); const patch: Record<string, unknown> = { expectedVersion: category.version };
    for (const key of ['name', 'slug', 'description', 'active'] as const) if (draft[key] !== original[key]) patch[key] = key === 'name' ? draft[key].trim() : draft[key];
    if (!Object.keys(patch).some((key) => key !== 'expectedVersion')) return;
    this.busy.set(true); this.error.set('');
    try {
      await firstValueFrom(this.api.updateCategory(category.id, patch as { expectedVersion: number } & Partial<CategoryWrite>));
      this.drafts.delete(category.id); await this.load();
    } catch (error: unknown) { await this.reportError(error); }
    finally { this.busy.set(false); }
  }

  async toggleActive(category: Category): Promise<void> {
    const draft = this.draft(category);
    this.updateDraft(category, 'active', !draft.active);
    await this.save(category);
  }

  async saveOrder(): Promise<void> {
    const categories = this.categories()?.items ?? [];
    if (this.busy() || !this.orderChanged()) return;
    const orderedIds = this.orderDraft().map((category) => category.id);
    this.busy.set(true); this.error.set('');
    try {
      const result = await firstValueFrom(this.api.reorderCategories({ items: orderedIds.map((id) => ({ id, expectedVersion: categories.find((category) => category.id === id)!.version })) }));
      this.categories.set(result); this.orderDraft.set([...result.items]);
    } catch (error: unknown) { await this.reportError(error); }
    finally { this.busy.set(false); }
  }

  private toDraft(category: Category): CategoryDraft { return { name: category.name, slug: category.slug, description: category.description, active: category.active, order: category.order }; }
  async refreshSession(): Promise<void> {
    this.refreshing.set(true); this.error.set(''); this.staleCsrf.set(false);
    try {
      const session = await this.auth.refreshSession();
      if (!session) { await this.router.navigate(['/admin/login'], { queryParams: { returnUrl: '/admin/categorias' } }); return; }
      if (session.admin.mustChangePassword) { await this.router.navigate(['/admin/change-password']); return; }
      this.error.set('Sesión actualizada. Revise los datos y elija nuevamente la acción.');
    } catch { this.error.set('No se pudo actualizar la sesión. Inicie sesión nuevamente.'); }
    finally { this.refreshing.set(false); }
  }
  private async reportError(error: unknown): Promise<void> {
    this.error.set(adminCatalogError(error)); this.staleCsrf.set(isAdminCatalogCsrfInvalid(error));
    await handleAdminCatalogSessionFailure(error, this.auth, this.router, '/admin/categorias');
  }
}
