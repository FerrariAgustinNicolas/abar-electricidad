import { DeliveryMode, PaymentMethodCode, QuoteItem } from '../cart/cart.models';
import { Money } from '../catalog/catalog.models';

export interface H4Terms {
  version: 'demo-2026-10-20-v1';
  text: string;
  demoMode: true;
  simulationEnabled: boolean;
}

export interface CreateOrderRequest {
  quoteId: string;
  customer: { firstName: string; lastName: string; email: string; phone: string };
  customerNote?: string;
  deliveryDetails?: { addressLine: string; locality: string; instructions?: string };
  acceptedTermsVersion: H4Terms['version'];
}

export interface CreateOrderResponse {
  orderId: string;
  orderNumber: string;
  orderStatus: 'RECEIVED';
  paymentStatus: 'PENDING';
  currentAttemptId: string;
  total: Money;
  accessToken: string;
  accessExpiresAt: string;
  nextActions: Array<'VIEW_ORDER' | 'RETRY_PAYMENT' | 'LOOKUP_ORDER'>;
  demoMode: true;
}

export type PaymentAttemptStatus = 'APPROVED' | 'PENDING' | 'REJECTED';
export interface PaymentAttempt {
  id: string;
  methodCode: PaymentMethodCode;
  status: PaymentAttemptStatus;
  sequence: number;
  createdAt: string;
  demoMode: true;
}
export interface PublicOrderView {
  orderId: string;
  orderNumber: string;
  createdAt: string;
  items: QuoteItem[];
  subtotal: Money;
  deliveryFee: Money;
  total: Money;
  deliveryMode: DeliveryMode;
  orderStatus: 'RECEIVED';
  paymentStatus: 'PENDING' | 'REJECTED';
  currentAttempt: PaymentAttempt;
  nextActions: Array<'VIEW_ORDER' | 'RETRY_PAYMENT' | 'LOOKUP_ORDER'>;
  demoMode: true;
}
export interface OrderLookupRequest { orderNumber: string; contact: string }
export interface OrderLookupResponse {
  orderNumber: string;
  createdAt: string;
  orderStatus: 'RECEIVED';
  paymentStatus: 'PENDING' | 'REJECTED';
  currentAttemptStatus: PaymentAttemptStatus;
  demoMode: true;
}
export type CreateAttemptRequest =
  | { methodCode: 'DEMO_PAY_ON_PICKUP' | 'DEMO_TRANSFER' }
  | { methodCode: 'DEMO_SIMULATION'; scenario: PaymentAttemptStatus };
export interface CreateAttemptResponse {
  orderId: string;
  orderStatus: 'RECEIVED';
  paymentStatus: 'PENDING' | 'REJECTED';
  currentAttempt: PaymentAttempt;
  nextActions: PublicOrderView['nextActions'];
  demoMode: true;
}

export interface OrderAccessSession { orderId: string; accessToken: string; accessExpiresAt: string }
