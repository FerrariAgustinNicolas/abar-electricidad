import { CheckoutService } from '../src/checkout/checkout.service';
import { SettingsService } from '../src/settings/settings.service';
import { CatalogException } from '../src/catalog-shared/catalog-error';

const policy = (paymentMethods = [
  { code: 'DEMO_PAY_ON_PICKUP', label: 'Demo pay on pickup', instructions: 'Fictitious instructions.', deliveryModes: ['PICKUP'], demo: true },
  { code: 'DEMO_TRANSFER', label: 'Demo transfer', instructions: 'Fictitious instructions.', deliveryModes: ['PICKUP', 'COORDINATED'], demo: true },
  { code: 'DEMO_SIMULATION', label: 'Demo simulation', instructions: 'Fictitious instructions.', deliveryModes: ['PICKUP', 'COORDINATED'], demo: true },
]) => ({
  id: 'default', feeMinor: 250n, quoteTtlSeconds: 600, version: 1,
  enabledDeliveryModes: ['PICKUP', 'COORDINATED'], paymentMethods,
});

function checkout(paymentMethods?: ReturnType<typeof policy>['paymentMethods']) {
  const reader = { findUnique: jest.fn().mockResolvedValue(policy(paymentMethods)) };
  const tx = { checkoutPolicy: reader, productPresentation: { findMany: jest.fn() }, checkoutQuote: { create: jest.fn() } };
  const prisma = { checkoutPolicy: reader, $transaction: jest.fn(async (callback: (value: typeof tx) => unknown) => callback(tx)) };
  return { service: new CheckoutService(prisma as never), reader };
}

describe('H6 checkout payment-method compatibility', () => {
  it('hides disabled methods from new public choices while preserving the closed H3 DTO', async () => {
    const methods = policy().paymentMethods.map((method) => method.code === 'DEMO_TRANSFER'
      ? { ...method, enabled: false }
      : method);
    const { service } = checkout(methods as never);

    expect(await service.getPublicPaymentMethods('COORDINATED')).toEqual({
      items: [{ code: 'DEMO_SIMULATION', label: 'Demo simulation', instructions: 'Fictitious instructions.', demo: true, deliveryModes: ['PICKUP', 'COORDINATED'] }],
    });
  });

  it('rejects new quotes using a method disabled by current policy', async () => {
    const methods = policy().paymentMethods.map((method) => method.code === 'DEMO_TRANSFER' ? { ...method, enabled: false } : method);
    const { service, reader } = checkout(methods as never);
    await expect(service.createQuote({
      items: [{ presentationId: '00000000-0000-4000-8000-000000000001', quantity: 1 },
      ], deliveryMode: 'COORDINATED', paymentMethodCode: 'DEMO_TRANSFER',
    })).rejects.toMatchObject({ message: 'METHOD_UNAVAILABLE' });
    expect(reader.findUnique).toHaveBeenCalledTimes(1);
  });

  it('accepts the H6 instructions limit without adding H6 fields to legacy method DTOs', async () => {
    const methods = policy().paymentMethods.map((method) => method.code === 'DEMO_TRANSFER'
      ? { ...method, instructions: 'x'.repeat(500) }
      : method);
    const { service } = checkout(methods);

    const result = await service.getPublicPaymentMethods('COORDINATED');
    expect(result.items.find((method) => method.code === 'DEMO_TRANSFER')?.instructions).toHaveLength(500);
    expect(result.items[0]).not.toHaveProperty('enabled');
  });
});

describe('SettingsService', () => {
  const contact = { displayName: 'ABAR DEMO', email: 'contacto@example.test', phone: '', whatsapp: '', hours: 'Horario DEMO.', address: 'Dirección DEMO.' };
  const methods = policy().paymentMethods;
  function fixture(overrides: Record<string, unknown> = {}, simulationEnabled = false) {
    const row: Record<string, unknown> = {
      id: 'default', feeMinor: 0n, quoteTtlSeconds: 600, enabledDeliveryModes: ['PICKUP', 'COORDINATED'],
      paymentMethods: methods, version: 1, contact, ...overrides,
    };
    const tx = {
      checkoutPolicy: {
        findUnique: jest.fn(async () => ({ ...row })),
        updateMany: jest.fn(async ({ where, data }: any) => {
          const currentVersion = row.version as number;
          if (where.version !== currentVersion) return { count: 0 };
          Object.assign(row, data, { version: currentVersion + 1 });
          return { count: 1 };
        }),
      },
      $queryRaw: jest.fn(async () => []),
    };
    const prisma = { $transaction: jest.fn(async (callback: (client: typeof tx) => unknown) => callback(tx)) };
    const auth = { recheck: jest.fn(async () => undefined) };
    const config = { get: jest.fn((_key: string, fallback: boolean) => simulationEnabled ?? fallback) };
    const service = new SettingsService(prisma as never, {} as never, config as never);
    return { service: service as SettingsService, tx, row, auth };
  }

  it('projects all fixed methods, with missing entries disabled and fictitious DEMO contact', async () => {
    const { service, auth } = fixture({ paymentMethods: [] });
    const settings = await service.getSettings(auth as never);
    expect(settings.paymentMethods).toHaveLength(3);
    expect(settings.paymentMethods.every((method) => method.enabled === false)).toBe(true);
    expect(settings.contact.email).toBe('contacto@example.test');
    expect(auth.recheck).toHaveBeenCalledTimes(2);
  });

  it('rejects a change that would leave no enabled method for an enabled mode', async () => {
    const { service, auth, tx } = fixture({ paymentMethods: [methods[0]] });
    const input = { expectedVersion: 1, enabled: false, instructions: 'No se realizan cobros.', deliveryModes: ['PICKUP'] };
    await expect(service.patchPaymentMethod(auth as never, 'DEMO_PAY_ON_PICKUP', input)).rejects.toMatchObject({ message: 'NO_VALID_CHECKOUT_COMBINATION' });
    expect(tx.checkoutPolicy.updateMany).not.toHaveBeenCalled();
  });

  it('rejects simulation as the only method when the server feature flag is disabled without persisting', async () => {
    const simulationOnly = methods.map((method) => ({ ...method, enabled: method.code === 'DEMO_SIMULATION' }));
    const { service, auth, tx, row } = fixture({ paymentMethods: simulationOnly });
    const before = { ...row };

    await expect(service.patchPaymentMethod(auth as never, 'DEMO_TRANSFER', {
      expectedVersion: 1, enabled: false, instructions: 'Datos ficticios.', deliveryModes: ['PICKUP', 'COORDINATED'],
    })).rejects.toMatchObject({ message: 'NO_VALID_CHECKOUT_COMBINATION' });

    expect(tx.checkoutPolicy.updateMany).not.toHaveBeenCalled();
    expect(row).toEqual(before);
  });

  it('allows simulation as the only method when the server feature flag is enabled', async () => {
    const simulationOnly = methods.map((method) => ({ ...method, enabled: method.code === 'DEMO_SIMULATION' }));
    const { service, auth } = fixture({ paymentMethods: simulationOnly }, true);

    const result = await service.patchPaymentMethod(auth as never, 'DEMO_TRANSFER', {
      expectedVersion: 1, enabled: false, instructions: 'Datos ficticios.', deliveryModes: ['PICKUP', 'COORDINATED'],
    });

    expect(result.version).toBe(2);
  });

  it('still accepts a non-simulation method as the only enabled method when simulation is disabled', async () => {
    const manualOnly = methods.map((method) => ({ ...method, enabled: method.code === 'DEMO_TRANSFER' }));
    const { service, auth } = fixture({ paymentMethods: manualOnly });

    const result = await service.patchPaymentMethod(auth as never, 'DEMO_PAY_ON_PICKUP', {
      expectedVersion: 1, enabled: false, instructions: 'Demostración ficticia.', deliveryModes: ['PICKUP'],
    });

    expect(result.version).toBe(2);
  });

  it('uses the shared version predicate and returns the incremented payment method version', async () => {
    const { service, auth, tx } = fixture();
    const result = await service.patchPaymentMethod(auth as never, 'DEMO_TRANSFER', {
      expectedVersion: 1, enabled: false, instructions: 'Datos ficticios; no transferir.', deliveryModes: ['PICKUP', 'COORDINATED'],
    });
    expect(tx.checkoutPolicy.updateMany).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'default', version: 1 } }));
    expect(result).toMatchObject({ code: 'DEMO_TRANSFER', enabled: false, version: 2 });
    expect(result).not.toHaveProperty('feeMinor');
    expect(auth.recheck).toHaveBeenCalledTimes(3);
  });

  it('rejects whitespace-only instructions instead of persisting a blank method', async () => {
    const { service, auth, tx } = fixture();
    await expect(service.patchPaymentMethod(auth as never, 'DEMO_TRANSFER', {
      expectedVersion: 1, enabled: true, instructions: '   ', deliveryModes: ['PICKUP', 'COORDINATED'],
    })).rejects.toMatchObject({ message: 'VALIDATION_ERROR' });
    expect(tx.checkoutPolicy.updateMany).not.toHaveBeenCalled();
  });

  it('turns a lost compare-and-swap into the contractual conflict', async () => {
    const { service, auth, tx } = fixture();
    tx.checkoutPolicy.updateMany.mockResolvedValue({ count: 0 });
    await expect(service.patchPaymentMethod(auth as never, 'DEMO_TRANSFER', {
      expectedVersion: 1, enabled: false, instructions: 'Datos ficticios; no transferir.', deliveryModes: ['PICKUP', 'COORDINATED'],
    })).rejects.toBeInstanceOf(CatalogException);
    await expect(service.patchPaymentMethod(auth as never, 'DEMO_TRANSFER', {
      expectedVersion: 1, enabled: false, instructions: 'Datos ficticios; no transferir.', deliveryModes: ['PICKUP', 'COORDINATED'],
    })).rejects.toMatchObject({ message: 'VERSION_CONFLICT' });
  });
});
