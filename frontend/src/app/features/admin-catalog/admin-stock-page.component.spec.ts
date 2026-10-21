import { provideHttpClient } from '@angular/common/http';
import { HttpErrorResponse } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { of, throwError } from 'rxjs';
import { vi } from 'vitest';
import { AuthSessionService } from '../../core/auth/auth-session.service';
import { AdminCatalogApiService } from '../../core/catalog/admin-catalog-api.service';
import { RollOpeningRequest, StockOperationView } from '../../core/catalog/catalog.models';
import { AdminStockPageComponent } from './admin-stock-page.component';

describe('AdminStockPageComponent', () => {
  const api = {
    listStock: () => of({ items: [], pageInfo: { page: 1, pageSize: 20, totalItems: 0, totalPages: 0 } }),
    listMovements: () => of({ items: [], pageInfo: { page: 1, pageSize: 20, totalItems: 0, totalPages: 0 } }),
    openRolls: (input: RollOpeningRequest, key: string) => { void input; void key; return of({ id: 'operation-1', type: 'ROLL_OPENING', reason: 'Apertura', actorAdminUserId: 'admin-1', createdAt: '2026-10-20T00:00:00Z', entries: [] } as StockOperationView); },
  };

  beforeEach(() => TestBed.configureTestingModule({ providers: [
    { provide: AdminCatalogApiService, useValue: api },
    { provide: AuthSessionService, useValue: { tokenForWrite: () => 'token', expire: vi.fn(), refreshSession: vi.fn() } },
    { provide: Router, useValue: { navigate: vi.fn() } },
  ] }));
  afterEach(() => { vi.restoreAllMocks(); TestBed.resetTestingModule(); });

  it('renders PAYMENT_CONFIRMATION distinctly while preserving adjustment and roll-opening labels', async () => {
    const fixture = TestBed.createComponent(AdminStockPageComponent);
    await fixture.whenStable();
    const items = ['ADJUSTMENT', 'ROLL_OPENING', 'PAYMENT_CONFIRMATION'].map((type, i) => ({ id: `movement-${i}`, type, reason: 'Synthetic audit', actorAdminUserId: 'admin-1', createdAt: '2026-10-21T00:00:00Z', entries: [] } as unknown as StockOperationView));
    fixture.componentInstance.movements.set({ items, pageInfo: { page: 1, pageSize: 20, totalItems: 3, totalPages: 1 } });
    fixture.detectChanges();
    const text = fixture.nativeElement.textContent;
    expect(text).toContain('Confirmación de pago');
    expect(text).toContain('Ajuste');
    expect(text).toContain('Apertura de rollo');
    expect(fixture.nativeElement.querySelector('option[value="PAYMENT_CONFIRMATION"]')).not.toBeNull();
  });

  it('shows paid pending delivery demand separately without subtracting it from the available balance', async () => {
    const fixture = TestBed.createComponent(AdminStockPageComponent);
    await fixture.whenStable();
    const row = { presentationId: 'unit', productId: 'p1', productName: 'Cable', unit: 'UNIT' as const, rollLengthMeters: null, active: true, availableQuantity: 4, requestedUnpaidQuantity: 2, paidPendingDeliveryQuantity: 3, lowStockThreshold: 0, version: 2, availability: 'AVAILABLE' as const };
    fixture.componentInstance.stock.set({ items: [row], pageInfo: { page: 1, pageSize: 20, totalItems: 1, totalPages: 1 } });
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Pagado pendiente de entrega (ya descontado)');
    const cells = [...fixture.nativeElement.querySelectorAll('tbody tr:first-child td')].map((e: unknown) => (e as HTMLElement).textContent?.trim());
    expect(cells.slice(2, 5)).toEqual(['4', '2', '3']);
  });

  it('projects roll openings from the configured roll length, not a fixed default', () => {
    const component = TestBed.createComponent(AdminStockPageComponent).componentInstance;
    component.openingPairs.set([{ roll: { presentationId: 'roll', productId: 'p1', productName: 'Cable', unit: 'ROLL', rollLengthMeters: 75, active: true, availableQuantity: 3, lowStockThreshold: 1, version: 2, availability: 'AVAILABLE' },
      meter: { presentationId: 'meter', productId: 'p1', productName: 'Cable', unit: 'METER', rollLengthMeters: null, active: true, availableQuantity: 20, lowStockThreshold: 5, version: 4, availability: 'AVAILABLE' } }]);
    component.opening.set({ productId: 'p1', rollQuantity: '1', reason: 'Apertura física' });

    expect(component.projected()).toEqual({ roll: 2, meter: 95 });
  });

  it('shows requested unpaid demand separately from available stock in the admin table', async () => {
    const fixture = TestBed.createComponent(AdminStockPageComponent);
    await fixture.whenStable();
    fixture.componentInstance.stock.set({ items: [{ presentationId: 'p-1', productId: 'product-1', productName: 'Cable', unit: 'METER', rollLengthMeters: null, active: true, availableQuantity: 3, requestedUnpaidQuantity: 7, lowStockThreshold: 1, version: 2, availability: 'AVAILABLE' }], pageInfo: { page: 1, pageSize: 20, totalItems: 1, totalPages: 1 } });
    fixture.detectChanges();
    const cells = [...fixture.nativeElement.querySelectorAll('tbody tr')][0].querySelectorAll('td');
    expect(cells[2].textContent.trim()).toBe('3');
    expect(cells[3].textContent.trim()).toBe('7');
    expect(fixture.nativeElement.textContent).toContain('informativa');
  });

  it('reuses the same idempotency key only for an explicit retry of the unchanged request', async () => {
    const fixture = TestBed.createComponent(AdminStockPageComponent);
    await fixture.whenStable();
    const component = fixture.componentInstance;
    component.openingPairs.set([{ roll: { presentationId: 'roll', productId: 'p1', productName: 'Cable', unit: 'ROLL', rollLengthMeters: 40, active: true, availableQuantity: 2, lowStockThreshold: 0, version: 3, availability: 'AVAILABLE' },
      meter: { presentationId: 'meter', productId: 'p1', productName: 'Cable', unit: 'METER', rollLengthMeters: null, active: true, availableQuantity: 5, lowStockThreshold: 0, version: 1, availability: 'AVAILABLE' } }]);
    component.opening.set({ productId: 'p1', rollQuantity: '1', reason: 'Apertura física' });
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);
    const open = vi.spyOn(api, 'openRolls').mockReturnValueOnce(throwError(() => new HttpErrorResponse({ status: 409 })))
      .mockReturnValueOnce(of({ id: 'operation-1', type: 'ROLL_OPENING', reason: 'Apertura física', actorAdminUserId: 'admin-1', createdAt: '2026-10-20T00:00:00Z', entries: [] }));

    await component.openSelectedRolls();
    await component.openSelectedRolls();

    expect(open).toHaveBeenCalledTimes(2);
    expect(open.mock.calls[0][1]).toBe(open.mock.calls[1][1]);
    expect(confirm).toHaveBeenCalledTimes(2);
    confirm.mockRestore();
  });

  it('keeps a roll selectable after the stock table is filtered and loads its pair by product id', async () => {
    const roll = { presentationId: 'roll', productId: 'p1', productName: 'Cable', unit: 'ROLL', rollLengthMeters: 75, active: true, availableQuantity: 3, lowStockThreshold: 1, version: 2, availability: 'AVAILABLE' } as const;
    const meter = { presentationId: 'meter', productId: 'p1', productName: 'Cable', unit: 'METER', rollLengthMeters: null, active: true, availableQuantity: 20, lowStockThreshold: 5, version: 4, availability: 'AVAILABLE' } as const;
    const rollTwo = { ...roll, presentationId: 'roll-2', productId: 'p2', productName: 'Cable azul' };
    const meterTwo = { ...meter, presentationId: 'meter-2', productId: 'p2', productName: 'Cable azul' };
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting(),
      { provide: AuthSessionService, useValue: { tokenForWrite: () => 'token', expire: vi.fn(), refreshSession: vi.fn() } },
      { provide: Router, useValue: { navigate: vi.fn() } },
    ] });
    const http = TestBed.inject(HttpTestingController);
    const fixture = TestBed.createComponent(AdminStockPageComponent);
    const stockTable = http.expectOne((request) => request.url === '/api/v1/admin/stock' && request.params.get('pageSize') === '20');
    stockTable.flush({ items: [roll], pageInfo: { page: 2, pageSize: 20, totalItems: 21, totalPages: 2 } });
    http.expectOne('/api/v1/admin/stock/movements?page=1&pageSize=20').flush({ items: [], pageInfo: { page: 1, pageSize: 20, totalItems: 0, totalPages: 0 } });
    http.expectOne((request) => request.url === '/api/v1/admin/stock' && request.params.get('unit') === 'ROLL' && request.params.get('page') === '1').flush({ items: [roll], pageInfo: { page: 1, pageSize: 100, totalItems: 101, totalPages: 2 } });
    await Promise.resolve();
    http.expectOne((request) => request.url === '/api/v1/admin/stock' && request.params.get('unit') === 'ROLL' && request.params.get('page') === '2').flush({ items: [rollTwo], pageInfo: { page: 2, pageSize: 100, totalItems: 101, totalPages: 2 } });
    await Promise.resolve(); await Promise.resolve();
    http.expectOne((request) => request.url === '/api/v1/admin/stock' && request.params.get('productId') === 'p1').flush({ items: [roll, meter], pageInfo: { page: 1, pageSize: 100, totalItems: 2, totalPages: 1 } });
    http.expectOne((request) => request.url === '/api/v1/admin/stock' && request.params.get('productId') === 'p2').flush({ items: [rollTwo, meterTwo], pageInfo: { page: 1, pageSize: 100, totalItems: 2, totalPages: 1 } });
    await fixture.whenStable(); fixture.detectChanges();
    const component = fixture.componentInstance;
    component.stock.set({ items: [roll], pageInfo: { page: 2, pageSize: 20, totalItems: 21, totalPages: 2 } });
    expect(component.rollProducts().map((row) => row.productId)).toEqual(['p1', 'p2']);
    component.opening.set({ productId: 'p1', rollQuantity: '1', reason: 'Apertura física' });
    expect(component.selectedRollPair()).toEqual({ roll, meter });
    expect(component.projected()).toEqual({ roll: 2, meter: 95 });
    http.verify();
  });

  it('invalidates the canonical H1 session and routes to login after a 401', async () => {
    const expire = vi.fn(); const navigate = vi.fn();
    TestBed.resetTestingModule();
    const empty = { items: [], pageInfo: { page: 1, pageSize: 100, totalItems: 0, totalPages: 0 } };
    const listStock = vi.fn().mockReturnValueOnce(throwError(() => new HttpErrorResponse({ status: 401 }))).mockReturnValue(of(empty));
    TestBed.configureTestingModule({ providers: [
      { provide: AdminCatalogApiService, useValue: { ...api, listStock } },
      { provide: AuthSessionService, useValue: { expire } }, { provide: Router, useValue: { navigate } },
    ] });
    const fixture = TestBed.createComponent(AdminStockPageComponent);
    await fixture.whenStable();
    expect(expire).toHaveBeenCalledOnce();
    expect(navigate).toHaveBeenCalledWith(['/admin/login'], { queryParams: { returnUrl: '/admin/stock' } });
  });

  it('refreshes H1 CSRF only on explicit action and preserves the opening draft without replay', async () => {
    const refreshSession = vi.fn().mockResolvedValue({ admin: { mustChangePassword: false } });
    const auth = { tokenForWrite: () => 'valid-token', expire: vi.fn(), refreshSession };
    const navigate = vi.fn();
    TestBed.resetTestingModule();
    const openRolls = vi.fn().mockReturnValue(throwError(() => new HttpErrorResponse({ status: 403, error: { code: 'CSRF_INVALID' } })));
    TestBed.configureTestingModule({ providers: [
      { provide: AdminCatalogApiService, useValue: { ...api, openRolls } },
      { provide: AuthSessionService, useValue: auth }, { provide: Router, useValue: { navigate } },
    ] });
    const fixture = TestBed.createComponent(AdminStockPageComponent);
    await fixture.whenStable();
    const component = fixture.componentInstance;
    component.openingPairs.set([{ roll: { presentationId: 'roll', productId: 'p1', productName: 'Cable', unit: 'ROLL', rollLengthMeters: 40, active: true, availableQuantity: 2, lowStockThreshold: 0, version: 3, availability: 'AVAILABLE' },
      meter: { presentationId: 'meter', productId: 'p1', productName: 'Cable', unit: 'METER', rollLengthMeters: null, active: true, availableQuantity: 5, lowStockThreshold: 0, version: 1, availability: 'AVAILABLE' } }]);
    component.opening.set({ productId: 'p1', rollQuantity: '1', reason: 'Apertura física' });
    vi.spyOn(window, 'confirm').mockReturnValue(true);

    await component.openSelectedRolls();
    expect(openRolls).toHaveBeenCalledOnce();
    expect(component.opening()).toEqual({ productId: 'p1', rollQuantity: '1', reason: 'Apertura física' });
    expect(component.staleCsrf()).toBe(true);
    expect(refreshSession).not.toHaveBeenCalled();

    await component.refreshSession();
    expect(refreshSession).toHaveBeenCalledOnce();
    expect(openRolls).toHaveBeenCalledOnce();
    expect(component.opening()).toEqual({ productId: 'p1', rollQuantity: '1', reason: 'Apertura física' });

    openRolls.mockReturnValueOnce(of({ id: 'operation-1', type: 'ROLL_OPENING', reason: 'Apertura física', actorAdminUserId: 'admin-1', createdAt: '2026-10-20T00:00:00Z', entries: [] } as StockOperationView));
    await component.openSelectedRolls();
    expect(openRolls).toHaveBeenCalledTimes(2);
  });
});
