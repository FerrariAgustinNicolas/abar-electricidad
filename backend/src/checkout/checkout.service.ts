import { createHash, randomUUID } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import { Injectable } from '@nestjs/common';
import { Prisma } from '../generated/prisma/client';
import { CatalogException } from '../catalog-shared/catalog-error';
import { validateCatalogBody } from '../catalog-shared/catalog-contract';
import { PrismaService } from '../prisma/prisma.service';

type DeliveryMode = 'PICKUP' | 'COORDINATED';
type MethodCode = 'DEMO_PAY_ON_PICKUP' | 'DEMO_TRANSFER' | 'DEMO_SIMULATION';
type Money = { amountMinor: string; currency: 'ARS' };
type QuoteItemView = {
  presentationId: string; productId: string; productSlug: string; productName: string;
  unit: 'UNIT' | 'METER' | 'ROLL'; rollLengthMeters: number | null; quantity: number;
  unitPrice: Money; lineTotal: Money;
};
type QuoteResponse = {
  quoteId: string; expiresAt: string; items: QuoteItemView[]; subtotal: Money; deliveryFee: Money; total: Money;
  deliveryMode: DeliveryMode; paymentMethod: DemoPaymentMethod; policyVersion: number; stateFingerprint: string; warnings: string[];
};
type DemoPaymentMethod = { code: MethodCode; label: string; instructions: string; demo: true; deliveryModes: DeliveryMode[] };
type QuoteRequest = { items: Array<{ presentationId: string; quantity: number }>; deliveryMode: DeliveryMode; paymentMethodCode: MethodCode };
type Policy = { id: string; feeMinor: bigint; quoteTtlSeconds: number; enabledDeliveryModes: DeliveryMode[]; paymentMethods: DemoPaymentMethod[]; version: number };
const MAX_MINOR = 9_223_372_036_854_775_807n;
const MAX_LINES = 100;
const MAX_QUANTITY = 1_000_000;
const DELIVERY_MODES = new Set(['PICKUP', 'COORDINATED']);
const METHOD_CODES = new Set(['DEMO_PAY_ON_PICKUP', 'DEMO_TRANSFER', 'DEMO_SIMULATION']);
const NO_RESERVATION = 'QUOTE_DOES_NOT_RESERVE_STOCK';
const DEMO_ONLY = 'DEMO_PAYMENT_METHODS_ONLY';
const unavailable = () => new CatalogException(503, 'SERVICE_UNAVAILABLE');
const money = (amountMinor: bigint): Money => ({ amountMinor: amountMinor.toString(), currency: 'ARS' });
const isObject = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value);
export function checkoutStateFingerprint(reference: object): string {
  return createHash('sha256').update(JSON.stringify(reference)).digest('hex');
}

@Injectable()
export class CheckoutService {
  constructor(private readonly prisma: PrismaService) {}

  async getPublicSettings() {
    const policy = await this.readPolicy();
    return {
      mode: 'DEMO' as const,
      policyVersion: policy.version,
      deliveryModes: policy.enabledDeliveryModes,
      deliveryFee: money(policy.feeMinor),
      quoteTtlSeconds: policy.quoteTtlSeconds,
      maxLines: MAX_LINES as 100,
      maxQuantity: MAX_QUANTITY as 1_000_000,
    };
  }

  async getPublicPaymentMethods(deliveryMode: unknown) {
    if (typeof deliveryMode !== 'string' || !DELIVERY_MODES.has(deliveryMode)) throw new CatalogException(400, 'VALIDATION_ERROR');
    const policy = await this.readPolicy();
    const mode = deliveryMode as DeliveryMode;
    if (!policy.enabledDeliveryModes.includes(mode)) return { items: [] as DemoPaymentMethod[] };
    return { items: policy.paymentMethods.filter((method) => method.deliveryModes.includes(mode) && policy.enabledDeliveryModes.includes(mode)) };
  }

  async getOrderPaymentMethods(tx: Prisma.TransactionClient, deliveryMode: unknown, methodCode: unknown): Promise<boolean> {
    if (typeof deliveryMode !== 'string' || !DELIVERY_MODES.has(deliveryMode) || typeof methodCode !== 'string' || !METHOD_CODES.has(methodCode)) return false;
    const policy = await this.readPolicy(tx);
    return policy.enabledDeliveryModes.includes(deliveryMode as DeliveryMode) &&
      policy.paymentMethods.some((method) => method.code === methodCode && method.deliveryModes.includes(deliveryMode as DeliveryMode));
  }

  async createQuote(input: unknown): Promise<QuoteResponse> {
    const body = validateCatalogBody<QuoteRequest>('QuoteRequest', input);
    const quantities = new Map<string, number>();
    for (const item of body.items) {
      const presentationId = item.presentationId.toLowerCase();
      const quantity = (quantities.get(presentationId) ?? 0) + item.quantity;
      if (!Number.isSafeInteger(quantity) || quantity > MAX_QUANTITY) throw new CatalogException(400, 'VALIDATION_ERROR');
      quantities.set(presentationId, quantity);
    }
    const ids = [...quantities.keys()].sort();

    try {
      return await this.prisma.$transaction(async (tx) => {
        const policy = await this.readPolicy(tx);
        if (!policy.enabledDeliveryModes.includes(body.deliveryMode)) throw new CatalogException(409, 'DELIVERY_UNAVAILABLE');
        const paymentMethod = policy.paymentMethods.find((method) => method.code === body.paymentMethodCode && method.deliveryModes.includes(body.deliveryMode));
        if (!paymentMethod) throw new CatalogException(409, 'METHOD_UNAVAILABLE');
        const rows = await tx.productPresentation.findMany({
          where: { id: { in: ids } },
          include: { product: { include: { category: true } }, balance: true },
        });
        const byId = new Map(rows.map((row) => [row.id, row]));
        const items = ids.map((id) => {
          const row = byId.get(id);
          if (!row || !row.active || !row.product.active || !row.product.category.active) throw new CatalogException(409, 'PRODUCT_UNAVAILABLE');
          const quantity = quantities.get(id)!;
          const available = row.balance?.availableQuantity ?? 0;
          if (!Number.isSafeInteger(available) || available < quantity) throw new CatalogException(409, 'INSUFFICIENT_STOCK');
          if (row.amountMinor < 0n || row.amountMinor > MAX_MINOR) throw unavailable();
          if ((row.unit === 'ROLL' && (!Number.isSafeInteger(row.rollLengthMeters) || (row.rollLengthMeters ?? 0) < 1)) ||
              (row.unit !== 'ROLL' && row.rollLengthMeters !== null)) throw unavailable();
          const lineTotal = row.amountMinor * BigInt(quantity);
          if (lineTotal > MAX_MINOR) throw new CatalogException(400, 'VALIDATION_ERROR');
          return {
            presentationId: row.id,
            productId: row.product.id,
            productSlug: row.product.slug,
            productName: row.product.name,
            unit: row.unit,
            rollLengthMeters: row.rollLengthMeters,
            quantity,
            unitPrice: money(row.amountMinor),
            lineTotal: money(lineTotal),
            _lineTotalMinor: lineTotal,
            _reference: {
              presentationId: row.id, presentationVersion: row.version, unit: row.unit,
              rollLengthMeters: row.rollLengthMeters, unitPriceMinor: row.amountMinor.toString(),
              productId: row.product.id, productVersion: row.product.version, productSlug: row.product.slug, productName: row.product.name,
              categoryId: row.product.category.id, categoryVersion: row.product.category.version,
            },
          };
        });
        const subtotalMinor = items.reduce((sum, item) => sum + item._lineTotalMinor, 0n);
        const deliveryFeeMinor = body.deliveryMode === 'PICKUP' ? 0n : policy.feeMinor;
        const totalMinor = subtotalMinor + deliveryFeeMinor;
        if (subtotalMinor > MAX_MINOR || totalMinor > MAX_MINOR) throw new CatalogException(400, 'VALIDATION_ERROR');
        const reference = {
          policyVersion: policy.version,
          deliveryMode: body.deliveryMode,
          paymentMethodCode: paymentMethod.code,
          deliveryFeeMinor: deliveryFeeMinor.toString(),
          items: items.map(({ _reference }) => _reference),
        };
        const fingerprint = checkoutStateFingerprint(reference);
        const createdAt = new Date();
        const expiresAt = new Date(createdAt.getTime() + policy.quoteTtlSeconds * 1000);
        const response = {
          quoteId: randomUUID(), expiresAt: expiresAt.toISOString(),
          items: items.map(({ _lineTotalMinor: _ignored, _reference: _ignoredReference, ...item }) => item),
          subtotal: money(subtotalMinor), deliveryFee: money(deliveryFeeMinor), total: money(totalMinor),
          deliveryMode: body.deliveryMode, paymentMethod, policyVersion: policy.version,
          stateFingerprint: fingerprint, warnings: [NO_RESERVATION, DEMO_ONLY],
        };
        await tx.checkoutQuote.create({ data: {
          id: response.quoteId, policyVersion: policy.version, stateFingerprint: fingerprint,
          response: response as Prisma.InputJsonValue, createdAt, expiresAt,
        } });
        return response;
      }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
    } catch (error) {
      if (error instanceof CatalogException) throw error;
      throw unavailable();
    }
  }

  /** Revalidates a stored H3 quote inside the caller's order transaction without creating a quote. */
  async revalidateOrderQuote(tx: Prisma.TransactionClient, raw: unknown): Promise<QuoteResponse> {
    if (!isObject(raw) || !Array.isArray(raw.items) || raw.items.length < 1 || raw.items.length > MAX_LINES ||
        (raw.deliveryMode !== 'PICKUP' && raw.deliveryMode !== 'COORDINATED') || !isObject(raw.paymentMethod) ||
        typeof raw.stateFingerprint !== 'string') throw new CatalogException(409, 'QUOTE_CHANGED');
    const policy = await this.readPolicy(tx);
    const mode = raw.deliveryMode as DeliveryMode;
    const methodCode = raw.paymentMethod.code;
    if (!policy.enabledDeliveryModes.includes(mode)) throw new CatalogException(409, 'DELIVERY_UNAVAILABLE');
    const method = policy.paymentMethods.find((entry) => entry.code === methodCode && entry.deliveryModes.includes(mode));
    if (!method) throw new CatalogException(409, 'METHOD_UNAVAILABLE');
    const ids: string[] = [];
    const quantities = new Map<string, number>();
    for (const item of raw.items) {
      if (!isObject(item) || typeof item.presentationId !== 'string' || !/^[0-9a-f-]{36}$/i.test(item.presentationId) ||
          !Number.isSafeInteger(item.quantity) || (item.quantity as number) < 1 || (item.quantity as number) > MAX_QUANTITY ||
          quantities.has(item.presentationId.toLowerCase())) throw new CatalogException(409, 'QUOTE_CHANGED');
      const id = item.presentationId.toLowerCase();
      ids.push(id);
      quantities.set(id, item.quantity as number);
    }
    if (ids.join(',') !== [...ids].sort().join(',')) throw new CatalogException(409, 'QUOTE_CHANGED');
    const rows = await tx.productPresentation.findMany({ where: { id: { in: ids } }, include: { product: { include: { category: true } }, balance: true } });
    const byId = new Map(rows.map((row) => [row.id, row]));
    const items: QuoteItemView[] = [];
    const refItems: object[] = [];
    let subtotal = 0n;
    for (const id of ids) {
      const row = byId.get(id);
      const quantity = quantities.get(id)!;
      if (!row || !row.active || !row.product.active || !row.product.category.active) throw new CatalogException(409, 'PRODUCT_UNAVAILABLE');
      if ((row.balance?.availableQuantity ?? 0) < quantity) throw new CatalogException(409, 'INSUFFICIENT_STOCK');
      if (row.amountMinor < 0n || row.amountMinor > MAX_MINOR ||
          (row.unit === 'ROLL' && (!Number.isSafeInteger(row.rollLengthMeters) || (row.rollLengthMeters ?? 0) < 1)) ||
          (row.unit !== 'ROLL' && row.rollLengthMeters !== null)) throw unavailable();
      const line = row.amountMinor * BigInt(quantity);
      subtotal += line;
      const item = { presentationId: row.id, productId: row.product.id, productSlug: row.product.slug, productName: row.product.name,
        unit: row.unit, rollLengthMeters: row.rollLengthMeters, quantity, unitPrice: money(row.amountMinor), lineTotal: money(line) };
      const saved = raw.items[items.length];
      if (!isObject(saved) || !isDeepStrictEqual(saved, item)) throw new CatalogException(409, 'QUOTE_CHANGED');
      items.push(item);
      refItems.push({ presentationId: row.id, presentationVersion: row.version, unit: row.unit,
        rollLengthMeters: row.rollLengthMeters, unitPriceMinor: row.amountMinor.toString(), productId: row.product.id,
        productVersion: row.product.version, productSlug: row.product.slug, productName: row.product.name,
        categoryId: row.product.category.id, categoryVersion: row.product.category.version });
    }
    const fee = mode === 'PICKUP' ? 0n : policy.feeMinor;
    const reference = { policyVersion: policy.version, deliveryMode: mode, paymentMethodCode: method.code,
      deliveryFeeMinor: fee.toString(), items: refItems };
    if (checkoutStateFingerprint(reference) !== raw.stateFingerprint || raw.policyVersion !== policy.version ||
        !isObject(raw.subtotal) || raw.subtotal.amountMinor !== subtotal.toString() ||
        !isObject(raw.deliveryFee) || raw.deliveryFee.amountMinor !== fee.toString() ||
        !isObject(raw.total) || raw.total.amountMinor !== (subtotal + fee).toString()) throw new CatalogException(409, 'QUOTE_CHANGED');
    return raw as unknown as QuoteResponse;
  }

  private async readPolicy(tx: Prisma.TransactionClient | PrismaService = this.prisma): Promise<Policy> {
    try {
      const row = await tx.checkoutPolicy.findUnique({ where: { id: 'default' } });
      if (!row || typeof row.feeMinor !== 'bigint' || row.feeMinor < 0n || row.feeMinor > MAX_MINOR ||
          !Number.isInteger(row.quoteTtlSeconds) || row.quoteTtlSeconds < 60 || row.quoteTtlSeconds > 3600 ||
          !Number.isInteger(row.version) || row.version < 1) throw unavailable();
      const modesValue: unknown = row.enabledDeliveryModes;
      if (!Array.isArray(modesValue) || modesValue.length < 1 || modesValue.some((mode) => typeof mode !== 'string' || !DELIVERY_MODES.has(mode)) || new Set(modesValue).size !== modesValue.length) throw unavailable();
      const methodsValue: unknown = row.paymentMethods;
      if (!Array.isArray(methodsValue) || methodsValue.length < 1 || methodsValue.length > 3) throw unavailable();
      const methods: DemoPaymentMethod[] = [];
      const seenCodes = new Set<string>();
      for (const value of methodsValue) {
        if (!isObject(value) || typeof value.code !== 'string' || !METHOD_CODES.has(value.code) || seenCodes.has(value.code) ||
            typeof value.label !== 'string' || value.label.trim().length < 1 || value.label.length > 120 ||
            typeof value.instructions !== 'string' || value.instructions.trim().length < 1 || value.instructions.length > 300 ||
            value.demo !== true || !Array.isArray(value.deliveryModes) || value.deliveryModes.length < 1 || value.deliveryModes.length > 2 ||
            value.deliveryModes.some((mode) => typeof mode !== 'string' || !DELIVERY_MODES.has(mode)) || new Set(value.deliveryModes).size !== value.deliveryModes.length) throw unavailable();
        if (value.code === 'DEMO_PAY_ON_PICKUP' && (value.deliveryModes.length !== 1 || value.deliveryModes[0] !== 'PICKUP')) throw unavailable();
        seenCodes.add(value.code);
        methods.push({ code: value.code as MethodCode, label: value.label, instructions: value.instructions, demo: true, deliveryModes: value.deliveryModes as DeliveryMode[] });
      }
      return { id: row.id, feeMinor: row.feeMinor, quoteTtlSeconds: row.quoteTtlSeconds,
        enabledDeliveryModes: modesValue as DeliveryMode[], paymentMethods: methods, version: row.version };
    } catch (error) {
      if (error instanceof CatalogException) throw error;
      throw unavailable();
    }
  }
}
