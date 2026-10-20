import { HttpErrorResponse } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of, throwError } from 'rxjs';
import { AuthSessionService } from '../../core/auth/auth-session.service';
import { AdminCatalogApiService } from '../../core/catalog/admin-catalog-api.service';
import { CategoryList } from '../../core/catalog/catalog.models';
import { AdminCategoriesPageComponent } from './admin-categories-page.component';

describe('AdminCategoriesPageComponent', () => {
  const initial: CategoryList = { items: [
    { id: 'c1', name: 'Cables', slug: 'cables', description: '', order: 0, active: true, version: 4 },
    { id: 'c2', name: 'Iluminación', slug: 'iluminacion', description: '', order: 1, active: true, version: 7 },
  ] };
  const api = {
    listCategories: () => of(initial),
    reorderCategories: (input: { items: Array<{ id: string; expectedVersion: number }> }) => of({ items: input.items.map((item, index) => ({ ...initial.items.find((category) => category.id === item.id)!, order: index })) }),
    updateCategory: () => of(initial.items[0]),
    createCategory: () => of(initial.items[0]),
  };

  beforeEach(() => TestBed.configureTestingModule({ providers: [provideRouter([]),
    { provide: AdminCatalogApiService, useValue: api },
    { provide: AuthSessionService, useValue: { expire: vi.fn(), refreshSession: vi.fn() } },
  ] }));

  it('reorders with the complete versioned category snapshot', async () => {
    const component = TestBed.createComponent(AdminCategoriesPageComponent).componentInstance;
    await Promise.resolve();
    const reorder = vi.spyOn(api, 'reorderCategories');
    component.move(1, -1);
    await component.saveOrder();

    expect(reorder).toHaveBeenCalledWith({ items: [{ id: 'c2', expectedVersion: 7 }, { id: 'c1', expectedVersion: 4 }] });
  });

  it('keeps category edits visible after a version conflict', async () => {
    const component = TestBed.createComponent(AdminCategoriesPageComponent).componentInstance;
    await Promise.resolve();
    const category = initial.items[0];
    component.updateDraft(category, 'name', 'Cables eléctricos');
    vi.spyOn(api, 'updateCategory').mockReturnValueOnce(throwError(() => new HttpErrorResponse({ status: 409, error: { code: 'VERSION_CONFLICT' } })));
    await component.save(category);

    expect(component.draft(category).name).toBe('Cables eléctricos');
    expect(component.error()).toContain('Los cambios siguen en el formulario');
  });
});
