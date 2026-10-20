import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, provideRouter } from '@angular/router';
import { of, Subject } from 'rxjs';
import { OrderAccessSessionService } from '../../core/orders/order-access-session.service';
import { OrdersApiService } from '../../core/orders/orders-api.service';
import { PublicOrderView } from '../../core/orders/orders.models';
import { OrderResultPageComponent } from './order-result-page.component';

describe('OrderResultPageComponent', () => {
  it('separates an approved demo attempt from the still-pending commercial payment', async () => {
    const view: PublicOrderView = {
      orderId: 'order-1', orderNumber: 'AB-100', createdAt: '2026-10-20T12:00:00Z', items: [],
      subtotal: { amountMinor: '1000', currency: 'ARS' }, deliveryFee: { amountMinor: '0', currency: 'ARS' },
      total: { amountMinor: '1000', currency: 'ARS' }, deliveryMode: 'PICKUP', orderStatus: 'RECEIVED', paymentStatus: 'PENDING',
      currentAttempt: { id: 'attempt-1', methodCode: 'DEMO_SIMULATION', status: 'APPROVED', sequence: 1, createdAt: '2026-10-20T12:00:00Z', demoMode: true },
      nextActions: ['VIEW_ORDER'], demoMode: true,
    };
    TestBed.configureTestingModule({ imports: [OrderResultPageComponent], providers: [
      provideRouter([]),
      { provide: ActivatedRoute, useValue: { snapshot: { paramMap: { get: () => 'order-1' } } } },
      { provide: OrdersApiService, useValue: { getOrder: () => of(view) } },
      { provide: OrderAccessSessionService, useValue: { get: () => ({ orderId: 'order-1', accessToken: 'opaque', accessExpiresAt: new Date(Date.now() + 60_000).toISOString() }) } },
    ] });
    const fixture = TestBed.createComponent(OrderResultPageComponent);
    await fixture.whenStable(); fixture.detectChanges();
    const copy = fixture.nativeElement.textContent as string;
    expect(copy).toContain('Aprobado en la simulación');
    expect(copy).toContain('Pendiente de confirmación');
    expect(copy).toContain('no confirma un cobro');
    expect(copy).not.toContain('Pagado');
    expect(copy).not.toContain('Total abonado');
    TestBed.resetTestingModule();
  });
});

// Exercise native option registration and the public retry action, not signal state alone.
describe('R3 asynchronous method selection', () => {
  const orderId = '40000000-0000-4000-8000-000000000001';
  const methods = [
    { code: 'DEMO_PAY_ON_PICKUP', label: 'Pickup demo', instructions: 'Demo only', deliveryModes: ['PICKUP'], demo: true },
    { code: 'DEMO_TRANSFER', label: 'Transfer demo', instructions: 'Demo only', deliveryModes: ['PICKUP', 'COORDINATED'], demo: true },
    { code: 'DEMO_SIMULATION', label: 'Simulation demo', instructions: 'Demo only', deliveryModes: ['PICKUP', 'COORDINATED'], demo: true },
  ] as const;
  const view = (): PublicOrderView => ({
    orderId, orderNumber: 'DEMO-R3', createdAt: '2026-10-20T12:00:00Z', items: [],
    subtotal: { amountMinor: '100', currency: 'ARS' }, deliveryFee: { amountMinor: '0', currency: 'ARS' }, total: { amountMinor: '100', currency: 'ARS' },
    deliveryMode: 'PICKUP', orderStatus: 'RECEIVED', paymentStatus: 'PENDING', demoMode: true,
    currentAttempt: { id: 'attempt-1', methodCode: 'DEMO_SIMULATION', status: 'PENDING', sequence: 1, createdAt: '2026-10-20T12:00:00Z', demoMode: true }, nextActions: ['RETRY_PAYMENT'],
  });
  let api: { getOrder: ReturnType<typeof vi.fn>; paymentMethods: ReturnType<typeof vi.fn>; terms: ReturnType<typeof vi.fn>; createAttempt: ReturnType<typeof vi.fn> };
  beforeEach(() => {
    api = {
      getOrder: vi.fn(() => of(view())), paymentMethods: vi.fn(() => of({ items: methods })),
      terms: vi.fn(() => of({version:'demo-2026-10-20-v1',text:'Provisional demo',demoMode:true,simulationEnabled:true})),
      createAttempt: vi.fn((_id, _token, body) => of({orderId, orderStatus:'RECEIVED',paymentStatus:body.scenario==='REJECTED'?'REJECTED':'PENDING',currentAttempt:{...view().currentAttempt,id:'attempt-2',methodCode:body.methodCode,status:body.scenario??'PENDING',sequence:2},nextActions:['RETRY_PAYMENT'],demoMode:true})),
    };
    TestBed.configureTestingModule({imports:[OrderResultPageComponent],providers:[provideRouter([]),
      {provide:ActivatedRoute,useValue:{snapshot:{paramMap:{get:()=>orderId}}}},
      {provide:OrdersApiService,useValue:api},
      {provide:OrderAccessSessionService,useValue:{get:()=>({orderId,accessToken:'unit-test-only-not-an-operational-token',accessExpiresAt:'2099-01-01T00:00:00Z'})}},
    ]});
  });
  afterEach(() => TestBed.resetTestingModule());
  async function render(waitForMethods = true) {
    const f = TestBed.createComponent(OrderResultPageComponent);
    await vi.waitFor(() => { f.detectChanges(); expect(f.componentInstance.order()).not.toBeNull(); });
    if (waitForMethods) await vi.waitFor(() => expect(f.componentInstance.methodsLoading()).toBe(false));
    await settle(f);
    return f;
  }
  async function settle(f: Awaited<ReturnType<typeof render>>) {
    await Promise.resolve(); await Promise.resolve();
    f.detectChanges(); await f.whenStable(); f.detectChanges();
  }
  function choose(f: Awaited<ReturnType<typeof render>>, id: string, value: string) {
    const select=f.nativeElement.querySelector(id) as HTMLSelectElement; select.value=value;select.dispatchEvent(new Event('change'));return select;
  }
  it('registers async options with the server attempt selected and submits the visible method',async()=>{
    const pending=new Subject<{items:typeof methods}>();api.paymentMethods.mockReturnValueOnce(pending);
    const f=await render(false);expect(api.createAttempt).not.toHaveBeenCalled();
    expect(f.componentInstance.methodsLoading()).toBe(true);
    pending.next({items:methods});pending.complete();await settle(f);
    const select=f.nativeElement.querySelector('#retry-method') as HTMLSelectElement;
    expect(select.value).toBe('DEMO_SIMULATION');
    await f.componentInstance.retryAttempt();expect(api.createAttempt.mock.calls[0][2].methodCode).toBe(select.value);
  });
  it('sends an explicitly selected manual method without scenario and restores the server method on reload',async()=>{
    let f=await render();choose(f,'#retry-method','DEMO_TRANSFER');await settle(f);
    expect(f.nativeElement.querySelector('#retry-scenario')).toBeNull();await f.componentInstance.retryAttempt();
    expect(api.createAttempt.mock.calls[0][2]).toEqual({methodCode:'DEMO_TRANSFER'});
    f.destroy();f=await render();expect((f.nativeElement.querySelector('#retry-method') as HTMLSelectElement).value).toBe('DEMO_SIMULATION');
  });
  it('ignores an older method response that arrives after a newer response and explicit selection',async()=>{
    const older=new Subject<{items:ReadonlyArray<(typeof methods)[number]>}>();const newer=new Subject<{items:typeof methods}>();
    api.paymentMethods.mockReturnValueOnce(older).mockReturnValueOnce(newer);
    const f=await render(false);const refresh=f.componentInstance.loadMethods();
    newer.next({items:methods});newer.complete();await refresh;await settle(f);
    choose(f,'#retry-method','DEMO_TRANSFER');await settle(f);
    older.next({items:methods.filter((method)=>method.code!=='DEMO_TRANSFER')});older.complete();await settle(f);
    expect((f.nativeElement.querySelector('#retry-method') as HTMLSelectElement).value).toBe('DEMO_TRANSFER');
    await f.componentInstance.retryAttempt();expect(api.createAttempt.mock.calls[0][2]).toEqual({methodCode:'DEMO_TRANSFER'});
  });
  for(const scenario of ['APPROVED','PENDING','REJECTED'] as const) it(`uses ${scenario} only for an enabled simulation`,async()=>{
    const f=await render();choose(f,'#retry-method','DEMO_SIMULATION');await settle(f);choose(f,'#retry-scenario',scenario);await settle(f);
    await f.componentInstance.retryAttempt();expect(api.createAttempt.mock.calls[0][2]).toEqual({methodCode:'DEMO_SIMULATION',scenario});
    choose(f,'#retry-method','DEMO_PAY_ON_PICKUP');await settle(f);await f.componentInstance.retryAttempt();
    expect(api.createAttempt.mock.calls[1][2]).toEqual({methodCode:'DEMO_PAY_ON_PICKUP'});
  });
  it('rejects incompatible options before creating a key or sending a request',async()=>{
    api.getOrder.mockReturnValue(of({...view(),deliveryMode:'COORDINATED'}));
    api.terms.mockReturnValue(of({version:'demo-2026-10-20-v1',text:'Demo',demoMode:true,simulationEnabled:false}));
    const f=await render();const key=vi.spyOn(crypto,'randomUUID');
    const select=f.nativeElement.querySelector('#retry-method') as HTMLSelectElement;
    const forged=document.createElement('option');forged.value='DEMO_PAY_ON_PICKUP';select.append(forged);choose(f,'#retry-method','DEMO_PAY_ON_PICKUP');await settle(f);
    await f.componentInstance.retryAttempt();expect(api.createAttempt).not.toHaveBeenCalled();expect(key).not.toHaveBeenCalled();
    expect(f.nativeElement.querySelector('#retry-scenario')).toBeNull();key.mockRestore();
  });
});
