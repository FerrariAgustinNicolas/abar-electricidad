import { Money, PresentationUnit } from '../catalog/catalog.models';

export type DeliveryMode = 'PICKUP' | 'COORDINATED';
export type PaymentMethodCode = 'DEMO_PAY_ON_PICKUP' | 'DEMO_TRANSFER' | 'DEMO_SIMULATION';
export interface DemoPaymentMethod {
  code: PaymentMethodCode; label: string; instructions: string; demo: true; deliveryModes: DeliveryMode[];
}
export interface PublicSettings {
  mode: 'DEMO'; policyVersion: number; deliveryModes: DeliveryMode[]; deliveryFee: Money;
  quoteTtlSeconds: number; maxLines: 100; maxQuantity: 1_000_000;
}
export interface QuoteRequest {
  items: Array<{ presentationId: string; quantity: number }>;
  deliveryMode: DeliveryMode;
  paymentMethodCode: PaymentMethodCode;
}
export interface QuoteItem {
  presentationId: string; productId: string; productSlug: string; productName: string;
  unit: PresentationUnit; rollLengthMeters: number | null; quantity: number; unitPrice: Money; lineTotal: Money;
}
export interface QuoteResponse {
  quoteId: string; expiresAt: string; items: QuoteItem[]; subtotal: Money; deliveryFee: Money; total: Money;
  deliveryMode: DeliveryMode; paymentMethod: DemoPaymentMethod; policyVersion: number; stateFingerprint: string;
  warnings: Array<'QUOTE_DOES_NOT_RESERVE_STOCK' | 'DEMO_PAYMENT_METHODS_ONLY'>;
}
export interface PublicPaymentMethods { items: DemoPaymentMethod[] }
