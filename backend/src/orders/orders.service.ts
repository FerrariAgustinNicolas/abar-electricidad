import { createCipheriv, createDecipheriv, createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '../generated/prisma/client';
import { CatalogException } from '../catalog-shared/catalog-error';
import { validateCatalogBody } from '../catalog-shared/catalog-contract';
import { CheckoutService } from '../checkout/checkout.service';
import { PrismaService } from '../prisma/prisma.service';

const TERMS_VERSION = 'demo-2026-10-20-v1';
const KEY_PATTERN = /^[A-Za-z0-9_-]{16,200}$/;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const CONTACT_PATTERN = /^[+0-9 ()-]{7,32}$/;
const DEMO_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const SIMULATION_ERROR = 'SERVICE_UNAVAILABLE';
type CreateOrder = { quoteId: string; customer: { firstName: string; lastName: string; email: string; phone: string }; customerNote?: string; deliveryDetails?: { addressLine: string; locality: string; instructions?: string }; acceptedTermsVersion: string };
type AttemptInput = { methodCode: 'DEMO_PAY_ON_PICKUP' | 'DEMO_TRANSFER' | 'DEMO_SIMULATION'; scenario?: 'APPROVED' | 'PENDING' | 'REJECTED' };

function fail(status: number, code: string): never { throw new CatalogException(status, code); }
function canonical(value: any): any {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])]));
  return value;
}
function fingerprint(value: unknown): string { return createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex'); }
function digest(value: string): Buffer { return createHash('sha256').update(value).digest(); }
function constantEqual(a: Buffer, b: Buffer): boolean { return a.length === b.length && timingSafeEqual(a, b); }
function normalizedContact(value: string): string { return value.trim().toLowerCase(); }

@Injectable()
export class OrdersService {
  constructor(private readonly prisma: PrismaService, private readonly checkout: CheckoutService, private readonly config: ConfigService) {}

  terms() {
    return { version: TERMS_VERSION, demoMode: true,
      simulationEnabled: this.config.get<boolean>('H4_DEMO_SIMULATION_ENABLED', false),
      text: 'Condiciones de demostración académica, provisionales y no validadas como términos legales de ABAR. Registrar un pedido no reserva ni garantiza existencias futuras. Los medios e intentos de pago son ficticios. Una simulación aprobada no confirma un cobro: requiere confirmación administrativa posterior fuera de H4.' };
  }

  async create(input: unknown, key: unknown) {
    const body = validateCatalogBody<CreateOrder>('CreateOrderRequest', input);
    if (typeof key !== 'string' || !KEY_PATTERN.test(key) || !UUID_PATTERN.test(body.quoteId) || body.acceptedTermsVersion !== TERMS_VERSION ||
        !DEMO_EMAIL.test(body.customer.email) || !CONTACT_PATTERN.test(body.customer.phone) ||
        !body.customer.firstName.trim() || !body.customer.lastName.trim() ||
        (body.deliveryDetails && (!body.deliveryDetails.addressLine.trim() || !body.deliveryDetails.locality.trim()))) fail(400, 'VALIDATION_ERROR');
    const normalizedBody: CreateOrder = { ...body, quoteId: body.quoteId.toLowerCase(), customer: { ...body.customer,
      firstName: body.customer.firstName.trim(), lastName: body.customer.lastName.trim(), email: normalizedContact(body.customer.email), phone: body.customer.phone.trim() },
      ...(body.customerNote !== undefined ? { customerNote: body.customerNote.trim() } : {}),
      ...(body.deliveryDetails ? { deliveryDetails: { ...body.deliveryDetails, addressLine: body.deliveryDetails.addressLine.trim(), locality: body.deliveryDetails.locality.trim(), ...(body.deliveryDetails.instructions !== undefined ? { instructions: body.deliveryDetails.instructions.trim() } : {}) } } : {}) };
    const requestFingerprint = fingerprint(normalizedBody);
    const keyBytes = this.replayKey();
    try {
      return await this.prisma.$transaction(async (tx) => {
        await this.lockKey(tx, 'create-order', key);
        const replay = await tx.orderIdempotencyKey.findUnique({ where: { scope_key: { scope: 'create-order', key } } });
        if (replay) return this.replay(replay, requestFingerprint, 'create-order', key, keyBytes);

        await tx.$queryRaw`SELECT id FROM "CheckoutQuote" WHERE id = ${normalizedBody.quoteId}::uuid FOR UPDATE`;
        const quote = await tx.checkoutQuote.findUnique({ where: { id: normalizedBody.quoteId } });
        if (!quote) fail(409, 'QUOTE_CHANGED');
        if (quote.expiresAt <= new Date()) fail(409, 'QUOTE_EXPIRED');
        const snapshot = await this.checkout.revalidateOrderQuote(tx, quote.response);
        if (snapshot.quoteId.toLowerCase() !== normalizedBody.quoteId) fail(409, 'QUOTE_CHANGED');
        const coordinated = snapshot.deliveryMode === 'COORDINATED';
        if (coordinated && !normalizedBody.deliveryDetails) fail(400, 'VALIDATION_ERROR');

        const now = new Date();
        const accessToken = randomBytes(32).toString('base64url');
        const accessExpiresAt = new Date(now.getTime() + this.config.get<number>('H4_ACCESS_TTL_SECONDS', 86400) * 1000);
        const orderNumber = `ABAR-${now.toISOString().slice(0, 10).replaceAll('-', '')}-${randomBytes(5).toString('hex').toUpperCase()}`;
        const order = await tx.order.create({ data: {
          orderNumber, quoteId: snapshot.quoteId, createdAt: now, status: 'RECEIVED', deliveryMode: snapshot.deliveryMode,
          customerFirstName: normalizedBody.customer.firstName, customerLastName: normalizedBody.customer.lastName,
          customerEmail: normalizedBody.customer.email, customerPhone: normalizedBody.customer.phone,
          customerNote: normalizedBody.customerNote,
          ...(coordinated ? { deliveryAddressLine: normalizedBody.deliveryDetails!.addressLine,
            deliveryLocality: normalizedBody.deliveryDetails!.locality, deliveryInstructions: normalizedBody.deliveryDetails!.instructions } : {}),
          acceptedTermsVersion: TERMS_VERSION, subtotalMinor: BigInt(snapshot.subtotal.amountMinor),
          deliveryFeeMinor: BigInt(snapshot.deliveryFee.amountMinor), totalMinor: BigInt(snapshot.total.amountMinor),
          accessTokenHash: digest(accessToken).toString('hex'), accessExpiresAt,
          items: { create: snapshot.items.map((item) => ({ presentationId: item.presentationId, productId: item.productId,
            productSlug: item.productSlug, productName: item.productName, unit: item.unit,
            rollLengthMeters: item.rollLengthMeters, quantity: item.quantity, unitPriceMinor: BigInt(item.unitPrice.amountMinor),
            lineTotalMinor: BigInt(item.lineTotal.amountMinor), snapshot: item as unknown as Prisma.InputJsonValue })) },
        } });
        const payment = await tx.payment.create({ data: { orderId: order.id, status: 'PENDING', amountMinor: order.totalMinor } });
        const attempt = await tx.paymentAttempt.create({ data: { paymentId: payment.id, methodCode: snapshot.paymentMethod.code,
          status: 'PENDING', sequence: 1, createdAt: now, updatedAt: now } });
        await tx.payment.update({ where: { id: payment.id }, data: { currentAttemptId: attempt.id } });
        await tx.orderEvent.create({ data: { orderId: order.id, eventType: 'ORDER_CREATED', createdAt: now, details: { source: 'H4_GUEST_CHECKOUT' } } });
        await tx.orderEvent.create({ data: { orderId: order.id, attemptId: attempt.id, eventType: 'PAYMENT_ATTEMPT_CREATED', createdAt: now, details: { sequence: 1, methodCode: snapshot.paymentMethod.code } } });
        const response = { orderId: order.id, orderNumber, orderStatus: 'RECEIVED', paymentStatus: 'PENDING', currentAttemptId: attempt.id,
          total: snapshot.total, accessToken, accessExpiresAt: accessExpiresAt.toISOString(), nextActions: ['VIEW_ORDER', 'RETRY_PAYMENT', 'LOOKUP_ORDER'], demoMode: true };
        await tx.notificationJob.createMany({ data: [
          { orderId: order.id, kind: 'ORDER_CREATED_BUYER', recipient: normalizedBody.customer.email, dedupeKey: `${order.id}:created:buyer`, state: 'PENDING', payload: { template: 'ORDER_CREATED', orderNumber } },
          { orderId: order.id, kind: 'ORDER_CREATED_ADMIN', recipient: this.config.get<string>('H4_ADMIN_NOTIFICATION_EMAIL') ?? 'orders-admin@example.test', dedupeKey: `${order.id}:created:admin`, state: 'PENDING', payload: { template: 'ORDER_CREATED_ADMIN', orderNumber } },
        ] });
        await this.storeReplay(tx, { kind: 'CREATE_ORDER', scope: 'create-order', key, fingerprint: requestFingerprint, responseStatus: 201,
          orderId: order.id, response }, keyBytes);
        return response;
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait: 5000, timeout: 10000 });
    } catch (error) {
      if (error instanceof CatalogException) throw error;
      if ((error as any)?.code === 'P2002' || (error as any)?.code === '23505' || (error as any)?.code === 'P2034') {
        const replay = await this.prisma.orderIdempotencyKey.findUnique({ where: { scope_key: { scope: 'create-order', key } } }).catch(() => null);
        if (replay) return this.replay(replay, requestFingerprint, 'create-order', key, keyBytes);
        const used = await this.prisma.order.findUnique({ where: { quoteId: normalizedBody.quoteId }, select: { id: true } }).catch(() => null);
        if (used) fail(409, 'QUOTE_ALREADY_USED');
      }
      fail(503, 'SERVICE_UNAVAILABLE');
    }
  }

  async get(orderId: string, token: unknown) {
    if (!UUID_PATTERN.test(orderId) || typeof token !== 'string' || token.length < 40 || token.length > 128) fail(403, 'ORDER_ACCESS_INVALID');
    const order = await this.prisma.order.findUnique({ where: { id: orderId }, include: { items: true, payment: { include: { currentAttempt: true } } } });
    if (!this.validAccess(order, token)) fail(403, 'ORDER_ACCESS_INVALID');
    return this.publicView(order);
  }

  async lookup(input: unknown) {
    const body = validateCatalogBody<{ orderNumber: string; contact: string }>('OrderLookupRequest', input);
    const number = body.orderNumber.trim();
    const contact = normalizedContact(body.contact);
    if (!number || number.length > 64 || contact.length > 254) fail(400, 'VALIDATION_ERROR');
    const order = await this.prisma.order.findUnique({ where: { orderNumber: number }, include: { payment: { include: { currentAttempt: true } } } });
    const candidate = digest(contact);
    const expected = order ? digest(normalizedContact(order.customerEmail) === contact ? order.customerEmail : order.customerPhone) : digest('constant-time-invalid-contact');
    const matches = constantEqual(candidate, expected) && !!order && (normalizedContact(order.customerEmail) === contact || normalizedContact(order.customerPhone) === contact);
    if (!matches) fail(404, 'ORDER_NOT_FOUND');
    return { orderNumber: order!.orderNumber, createdAt: order!.createdAt.toISOString(), orderStatus: order!.status,
      paymentStatus: order!.payment!.status, currentAttemptStatus: order!.payment!.currentAttempt!.status, demoMode: true };
  }

  async createAttempt(orderId: string, token: unknown, key: unknown, input: unknown) {
    if (!UUID_PATTERN.test(orderId) || typeof token !== 'string' || typeof key !== 'string' || !KEY_PATTERN.test(key)) fail(400, 'VALIDATION_ERROR');
    const body = validateCatalogBody<AttemptInput>('AttemptRequest', input);
    if (body.methodCode === 'DEMO_SIMULATION' && !this.config.get<boolean>('H4_DEMO_SIMULATION_ENABLED', false)) fail(403, 'DEMO_DISABLED');
    if (body.methodCode !== 'DEMO_SIMULATION' && body.scenario !== undefined) fail(400, 'VALIDATION_ERROR');
    const requestFingerprint = fingerprint({ orderId, body });
    const keyBytes = this.replayKey();
    const scope = `attempt:${orderId}`;
    try {
      return await this.prisma.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT id FROM "Order" WHERE id = ${orderId}::uuid FOR UPDATE`;
        const order = await tx.order.findUnique({ where: { id: orderId }, include: { payment: { include: { currentAttempt: true } } } });
        if (!this.validAccess(order, token)) fail(403, 'ORDER_ACCESS_INVALID');
        await this.lockKey(tx, scope, key);
        const existing = await tx.orderIdempotencyKey.findUnique({ where: { scope_key: { scope, key } } });
        if (existing) return this.replay(existing, requestFingerprint, scope, key, keyBytes);
        if (order!.status !== 'RECEIVED') fail(409, 'ORDER_CANCELLED');
        const methods = await this.checkout.getOrderPaymentMethods(tx, order!.deliveryMode, body.methodCode);
        if (!methods) fail(409, 'METHOD_UNAVAILABLE');
        const scenario = body.methodCode === 'DEMO_SIMULATION' ? body.scenario ?? 'PENDING' : 'PENDING';
        const attempt = await tx.paymentAttempt.create({ data: { paymentId: order!.payment!.id, methodCode: body.methodCode,
          status: scenario, demoScenario: body.methodCode === 'DEMO_SIMULATION' ? scenario : null,
          sequence: (order!.payment!.currentAttempt?.sequence ?? 0) + 1, createdAt: new Date(), updatedAt: new Date() } });
        const paymentStatus = scenario === 'REJECTED' ? 'REJECTED' : 'PENDING';
        await tx.payment.update({ where: { id: order!.payment!.id }, data: { currentAttemptId: attempt.id, status: paymentStatus } });
        await tx.orderEvent.create({ data: { orderId, attemptId: attempt.id, eventType: 'PAYMENT_ATTEMPT_CREATED', details: { sequence: attempt.sequence, methodCode: body.methodCode } } });
        const response = { orderId, orderStatus: 'RECEIVED', paymentStatus, currentAttempt: this.attemptView(attempt),
          nextActions: ['VIEW_ORDER', 'RETRY_PAYMENT', 'LOOKUP_ORDER'], demoMode: true };
        await this.storeReplay(tx, { kind: 'PAYMENT_ATTEMPT', scope, key, fingerprint: requestFingerprint,
          responseStatus: 201, orderId, attemptId: attempt.id, response }, keyBytes);
        return response;
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait: 5000, timeout: 10000 });
    } catch (error) {
      if (error instanceof CatalogException) throw error;
      if ((error as any)?.code === 'P2002' || (error as any)?.code === '23505' || (error as any)?.code === 'P2034') {
        const existing = await this.prisma.orderIdempotencyKey.findUnique({ where: { scope_key: { scope, key } } }).catch(() => null);
        if (existing) return this.replay(existing, requestFingerprint, scope, key, keyBytes);
      }
      fail(503, 'SERVICE_UNAVAILABLE');
    }
  }

  private publicView(order: any) {
    const payment = order.payment;
    return { orderId: order.id, orderNumber: order.orderNumber, createdAt: order.createdAt.toISOString(),
      items: order.items.map((item: any) => item.snapshot), subtotal: { amountMinor: order.subtotalMinor.toString(), currency: 'ARS' },
      deliveryFee: { amountMinor: order.deliveryFeeMinor.toString(), currency: 'ARS' }, total: { amountMinor: order.totalMinor.toString(), currency: 'ARS' },
      deliveryMode: order.deliveryMode, orderStatus: order.status, paymentStatus: payment.status,
      currentAttempt: this.attemptView(payment.currentAttempt), nextActions: ['VIEW_ORDER', 'RETRY_PAYMENT', 'LOOKUP_ORDER'], demoMode: true };
  }

  private attemptView(attempt: any) { return { id: attempt.id, methodCode: attempt.methodCode, status: attempt.status,
    sequence: attempt.sequence, createdAt: attempt.createdAt.toISOString(), demoMode: true }; }

  private validAccess(order: any, token: unknown): boolean {
    if (!order || typeof token !== 'string' || order.accessExpiresAt <= new Date()) return false;
    return constantEqual(digest(token), Buffer.from(order.accessTokenHash, 'hex'));
  }

  private replayKey(): Buffer {
    const encoded = this.config.get<string>('H4_REPLAY_KEY_BASE64');
    if (!encoded) fail(503, SIMULATION_ERROR);
    const key = Buffer.from(encoded, 'base64');
    if (key.length !== 32) fail(503, SIMULATION_ERROR);
    return key;
  }

  private aad(scope: string, key: string, hash: string): Buffer { return Buffer.from(`${scope}:${key}:${hash}`, 'utf8'); }

  private encrypt(response: unknown, scope: string, key: string, hash: string, replayKey: Buffer) {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', replayKey, iv);
    cipher.setAAD(this.aad(scope, key, hash));
    const ciphertext = Buffer.concat([cipher.update(JSON.stringify(response), 'utf8'), cipher.final()]);
    return { responseCiphertext: new Uint8Array(ciphertext), responseIv: new Uint8Array(iv), responseTag: new Uint8Array(cipher.getAuthTag()) };
  }

  private decrypt(row: any, scope: string, key: string, replayKey: Buffer): unknown {
    try {
      const decipher = createDecipheriv('aes-256-gcm', replayKey, row.responseIv);
      decipher.setAAD(this.aad(scope, key, row.fingerprint));
      decipher.setAuthTag(row.responseTag);
      return JSON.parse(Buffer.concat([decipher.update(row.responseCiphertext), decipher.final()]).toString('utf8'));
    } catch { return fail(503, SIMULATION_ERROR); }
  }

  private replay(row: any, requestHash: string, scope: string, key: string, replayKey: Buffer) {
    if (row.fingerprint !== requestHash) fail(409, 'IDEMPOTENCY_CONFLICT');
    return this.decrypt(row, scope, key, replayKey);
  }

  private async lockKey(tx: Prisma.TransactionClient, scope: string, key: string): Promise<void> {
    await tx.$queryRaw`SELECT 1 AS locked FROM pg_advisory_xact_lock(hashtextextended(${`${scope}:${key}`}, 0))`;
  }

  private async storeReplay(tx: Prisma.TransactionClient, row: { kind: any; scope: string; key: string; fingerprint: string; responseStatus: number; orderId?: string; attemptId?: string; response: unknown }, replayKey: Buffer) {
    const encrypted = this.encrypt(row.response, row.scope, row.key, row.fingerprint, replayKey);
    await tx.orderIdempotencyKey.create({ data: { kind: row.kind, scope: row.scope, key: row.key,
      fingerprint: row.fingerprint, responseStatus: row.responseStatus, ...encrypted,
      ...(row.orderId ? { order: { connect: { id: row.orderId } } } : {}),
      ...(row.attemptId ? { attempt: { connect: { id: row.attemptId } } } : {}) } });
  }
}
