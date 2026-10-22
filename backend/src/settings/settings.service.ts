import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '../generated/prisma/client';
import { AdminUsersService } from '../auth/admin-users.service';
import { validateCatalogBody } from '../catalog-shared/catalog-contract';
import { CatalogException } from '../catalog-shared/catalog-error';
import { PrismaService } from '../prisma/prisma.service';

type DeliveryMode = 'PICKUP' | 'COORDINATED';
type MethodCode = 'DEMO_PAY_ON_PICKUP' | 'DEMO_TRANSFER' | 'DEMO_SIMULATION';
type StoredMethod = { code: MethodCode; label: string; instructions: string; demo: true; deliveryModes: DeliveryMode[]; enabled?: boolean };
type Contact = { displayName: string; email: string; phone: string; whatsapp: string; hours: string; address: string };
type Authorization = Awaited<ReturnType<AdminUsersService['authorizeCatalog']>>;
const MAX_VERSION = 2_147_483_647;
const MAX_MINOR = 9_223_372_036_854_775_807n;
const MODES = new Set<DeliveryMode>(['PICKUP', 'COORDINATED']);
const CODES: readonly MethodCode[] = ['DEMO_PAY_ON_PICKUP', 'DEMO_TRANSFER', 'DEMO_SIMULATION'];
const DEFAULT_METHODS: readonly StoredMethod[] = [
  { code: 'DEMO_PAY_ON_PICKUP', label: 'Pago DEMO al retirar', instructions: 'Demostración: no se realizará ningún cobro.', demo: true, deliveryModes: ['PICKUP'], enabled: false },
  { code: 'DEMO_TRANSFER', label: 'Transferencia DEMO', instructions: 'Datos ficticios para demostración; no realizar transferencias.', demo: true, deliveryModes: ['PICKUP', 'COORDINATED'], enabled: false },
  { code: 'DEMO_SIMULATION', label: 'Simulación DEMO', instructions: 'Demostración: no se realizará ningún cobro.', demo: true, deliveryModes: ['PICKUP', 'COORDINATED'], enabled: false },
];
const DEFAULT_CONTACT: Contact = {
  displayName: 'ABAR Electricidad — DEMO', email: 'contacto@example.test', phone: '', whatsapp: '',
  hours: 'Horario DEMO no confirmado.', address: 'Dirección DEMO no confirmada.',
};
const fail = (status: number, code: string): never => { throw new CatalogException(status, code); };
const isObject = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value);
const hasControl = (value: string, allowLineBreaks = false): boolean => {
  for (let index = 0; index < value.length; index++) {
    const code = value.charCodeAt(index);
    if ((code < 32 && !(allowLineBreaks && (code === 10 || code === 13))) || (code >= 127 && code <= 159)) return true;
  }
  return false;
};

function readMethods(value: unknown): StoredMethod[] {
  if (!Array.isArray(value) || value.length > CODES.length) return fail(503, 'SERVICE_UNAVAILABLE');
  const byCode = new Map<MethodCode, StoredMethod>();
  for (const raw of value) {
    if (!isObject(raw) || typeof raw.code !== 'string' || !CODES.includes(raw.code as MethodCode) || byCode.has(raw.code as MethodCode) ||
        typeof raw.label !== 'string' || raw.label.trim().length === 0 || raw.label.length > 120 || hasControl(raw.label) ||
        typeof raw.instructions !== 'string' || raw.instructions.trim().length === 0 || raw.instructions.length > 500 || hasControl(raw.instructions, true) ||
        raw.demo !== true || typeof (raw.enabled ?? true) !== 'boolean' || !Array.isArray(raw.deliveryModes) ||
        raw.deliveryModes.length < 1 || raw.deliveryModes.length > 2 || raw.deliveryModes.some((mode) => typeof mode !== 'string' || !MODES.has(mode as DeliveryMode)) ||
        new Set(raw.deliveryModes).size !== raw.deliveryModes.length) return fail(503, 'SERVICE_UNAVAILABLE');
    const method = { code: raw.code as MethodCode, label: raw.label, instructions: raw.instructions, demo: true as const,
      deliveryModes: raw.deliveryModes as DeliveryMode[], enabled: raw.enabled === undefined ? true : raw.enabled as boolean };
    if (method.code === 'DEMO_PAY_ON_PICKUP' && (method.deliveryModes.length !== 1 || method.deliveryModes[0] !== 'PICKUP')) return fail(503, 'SERVICE_UNAVAILABLE');
    byCode.set(method.code, method);
  }
  return CODES.map((code) => byCode.get(code) ?? { ...DEFAULT_METHODS.find((method) => method.code === code)! });
}

function readModes(value: unknown): DeliveryMode[] {
  if (!Array.isArray(value) || value.length < 1 || value.length > 2 || value.some((mode) => typeof mode !== 'string' || !MODES.has(mode as DeliveryMode)) || new Set(value).size !== value.length) {
    return fail(503, 'SERVICE_UNAVAILABLE');
  }
  return value as DeliveryMode[];
}

function readContact(value: unknown): Contact {
  if (!isObject(value)) return { ...DEFAULT_CONTACT };
  const names: (keyof Contact)[] = ['displayName', 'email', 'phone', 'whatsapp', 'hours', 'address'];
  if (names.some((key) => typeof value[key] !== 'string' || (value[key] as string).length > ({ displayName: 100, email: 254, phone: 32, whatsapp: 16, hours: 300, address: 300 }[key]) || hasControl(value[key] as string))) return fail(503, 'SERVICE_UNAVAILABLE');
  const contact = Object.fromEntries(names.map((key) => [key, value[key]])) as Contact;
  if (!contact.displayName.trim() || !/^[A-Za-z0-9._%+-]+@example\.test$/.test(contact.email) || !/^(|\+[1-9][0-9]{7,14})$/.test(contact.whatsapp)) return fail(503, 'SERVICE_UNAVAILABLE');
  return contact;
}

function validCombination(modes: DeliveryMode[], methods: StoredMethod[], simulationEnabled: boolean): boolean {
  return methods.some((method) => method.enabled !== false &&
    (method.code !== 'DEMO_SIMULATION' || simulationEnabled) && method.deliveryModes.some((mode) => modes.includes(mode)));
}

function assertWriteStrings(value: unknown, fields: readonly string[], allowEmpty = false): void {
  if (!isObject(value)) return;
  for (const field of fields) {
    const entry = value[field];
    if (typeof entry === 'string' && (hasControl(entry) || (!allowEmpty && entry.trim().length === 0))) fail(400, 'VALIDATION_ERROR');
  }
}

@Injectable()
export class SettingsService {
  constructor(private readonly prisma: PrismaService, private readonly admins: AdminUsersService,
    private readonly config: ConfigService) {}

  private simulationEnabled(): boolean {
    return this.config.get<boolean>('H4_DEMO_SIMULATION_ENABLED', false) === true;
  }

  async getSettings(auth: Authorization) {
    return this.prisma.$transaction(async (tx) => {
      await auth.recheck(tx);
      const row = await tx.checkoutPolicy.findUnique({ where: { id: 'default' } });
      await auth.recheck(tx);
      const state = this.state(row);
      return { version: state.version, feeMinor: state.feeMinor.toString(), enabledDeliveryModes: state.modes,
        contact: state.contact, paymentMethods: state.methods.map((method) => this.methodView(method, state.version)) };
    });
  }

  async getPaymentMethod(auth: Authorization, code: unknown) {
    const methodCode = this.code(code);
    return this.prisma.$transaction(async (tx) => {
      await auth.recheck(tx);
      const row = await tx.checkoutPolicy.findUnique({ where: { id: 'default' } });
      await auth.recheck(tx);
      const state = this.state(row);
      return this.methodView(state.methods.find((method) => method.code === methodCode)!, state.version);
    });
  }

  async getPublicContact() {
    return this.prisma.$transaction(async (tx) => {
      const row = await tx.checkoutPolicy.findUnique({ where: { id: 'default' } });
      const state = this.state(row);
      return { demo: true as const, version: state.version, contact: state.contact };
    });
  }

  async patchSettings(auth: Authorization, input: unknown) {
    const body = validateCatalogBody<{ expectedVersion: number; feeMinor: string; enabledDeliveryModes: DeliveryMode[]; contact: Contact }>('H6SettingsWrite', input);
    assertWriteStrings(body.contact, ['displayName', 'email']);
    assertWriteStrings(body.contact, ['phone', 'whatsapp', 'hours', 'address'], true);
    const feeMinor = BigInt(body.feeMinor);
    if (feeMinor < 0n || feeMinor > MAX_MINOR) return fail(400, 'VALIDATION_ERROR');
    return this.mutate(auth, body.expectedVersion, (state) => {
      const modes = readModes(body.enabledDeliveryModes);
      const contact = readContact(body.contact);
      if (!validCombination(modes, state.methods, this.simulationEnabled())) fail(409, 'NO_VALID_CHECKOUT_COMBINATION');
      return { ...state, feeMinor, modes, contact };
    });
  }

  async patchPaymentMethod(auth: Authorization, code: unknown, input: unknown) {
    const methodCode = this.code(code);
    const body = validateCatalogBody<{ expectedVersion: number; enabled: boolean; instructions: string; deliveryModes: DeliveryMode[] }>('H6PaymentMethodWrite', input);
    assertWriteStrings(body, ['instructions']);
    const result = await this.mutate(auth, body.expectedVersion, (state) => {
      const modes = readModes(body.deliveryModes);
      if (methodCode === 'DEMO_PAY_ON_PICKUP' && (modes.length !== 1 || modes[0] !== 'PICKUP')) fail(400, 'VALIDATION_ERROR');
      const methods = state.methods.map((method) => method.code === methodCode
        ? { ...method, enabled: body.enabled, instructions: body.instructions, deliveryModes: modes } : method);
      if (!validCombination(state.modes, methods, this.simulationEnabled())) fail(409, 'NO_VALID_CHECKOUT_COMBINATION');
      return { ...state, methods };
    });
    return result.paymentMethods.find((method) => method.code === methodCode)!;
  }

  private async mutate(auth: Authorization, expectedVersion: number, update: (state: ReturnType<SettingsService['state']>) => ReturnType<SettingsService['state']>) {
    return this.prisma.$transaction(async (tx) => {
      await auth.recheck(tx);
      await tx.$queryRaw`SELECT "id" FROM "CheckoutPolicy" WHERE "id" = 'default' FOR UPDATE`;
      const row = await tx.checkoutPolicy.findUnique({ where: { id: 'default' } });
      const state = this.state(row);
      if (state.version !== expectedVersion || state.version >= MAX_VERSION) fail(409, 'VERSION_CONFLICT');
      const next = update(state);
      await auth.recheck(tx);
      const updated = await tx.checkoutPolicy.updateMany({ where: { id: 'default', version: expectedVersion }, data: {
        feeMinor: next.feeMinor, enabledDeliveryModes: next.modes,
        paymentMethods: next.methods.map(({ enabled, ...method }) => ({ ...method, enabled })),
        contact: next.contact as unknown as Prisma.InputJsonValue, version: { increment: 1 },
      } });
      if (updated.count !== 1) fail(409, 'VERSION_CONFLICT');
      const saved = this.state(await tx.checkoutPolicy.findUnique({ where: { id: 'default' } }));
      await auth.recheck(tx);
      return { version: saved.version, feeMinor: saved.feeMinor.toString(), enabledDeliveryModes: saved.modes,
        contact: saved.contact, paymentMethods: saved.methods.map((method) => this.methodView(method, saved.version)) };
    });
  }

  private state(row: any) {
    if (!row || row.id !== 'default' || typeof row.feeMinor !== 'bigint' || row.feeMinor < 0n || row.feeMinor > MAX_MINOR ||
        !Number.isInteger(row.version) || row.version < 1 || row.version > MAX_VERSION) return fail(503, 'SERVICE_UNAVAILABLE');
    const modes = readModes(row.enabledDeliveryModes);
    const methods = readMethods(row.paymentMethods);
    return { id: row.id, version: row.version as number, feeMinor: row.feeMinor as bigint, modes,
      methods, contact: readContact(row.contact) };
  }

  private methodView(method: StoredMethod, version: number) {
    if (method.label.length > 100) return fail(503, 'SERVICE_UNAVAILABLE');
    return { code: method.code, version, enabled: method.enabled !== false, label: method.label, instructions: method.instructions,
      demo: true as const, deliveryModes: method.deliveryModes };
  }

  private code(value: unknown): MethodCode {
    if (typeof value !== 'string' || !CODES.includes(value as MethodCode)) return fail(400, 'VALIDATION_ERROR');
    return value as MethodCode;
  }
}
