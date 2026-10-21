export type OrderStatus = 'RECEIVED' | 'PREPARING' | 'READY' | 'DELIVERED' | 'CANCELLED';
export type PaymentStatus = 'PENDING' | 'REJECTED' | 'PAID';
export type DeliveryMode = 'PICKUP' | 'COORDINATED';
export type PresentationUnit = 'UNIT' | 'METER' | 'ROLL';
export interface Money { amountMinor: string; currency: 'ARS' }
export interface PageInfo { page: number; pageSize: number; totalItems: number; totalPages: number }
export interface AllowedOrderActions { confirmPayment: boolean; cancel: boolean; markReady: boolean; markDelivered: boolean; addNote: boolean }
export interface AdminOrderSummary {
  orderId: string; orderNumber: string; createdAt: string; version: number; orderStatus: OrderStatus;
  paymentStatus: PaymentStatus; deliveryMode: DeliveryMode;
  customer: { firstName: string; lastName: string; email: string; phone: string };
  total: Money; allowedActions: AllowedOrderActions;
}
export interface AdminOrderList { items: AdminOrderSummary[]; pageInfo: PageInfo }
export interface PaymentAttempt { id: string; methodCode: string; status: 'PENDING' | 'APPROVED' | 'REJECTED'; sequence: number; createdAt: string; demoMode: true }
export interface OrderItem {
  presentationId: string; productId: string; productSlug: string; productName: string; unit: PresentationUnit;
  rollLengthMeters: number | null; quantity: number; unitPrice: Money; lineTotal: Money;
}
export interface StockRequirement { presentationId: string; unit: PresentationUnit; quantity: number; availableQuantity: number; version: number }
export interface OrderHistoryEntry {
  id: string; eventType: string; createdAt: string; actorAdminUserId?: string; attemptId?: string;
  reason?: string; fromStatus?: OrderStatus; toStatus?: OrderStatus;
}
export interface OrderNote { id: string; orderId: string; actorAdminUserId: string; createdAt: string; text: string; version: number }
export interface AdminOrderDetail extends AdminOrderSummary {
  paymentId: string; paymentAmount: Money; currentAttempt: PaymentAttempt; items: OrderItem[];
  subtotal: Money; deliveryFee: Money; customerNote?: string;
  deliveryDetails?: { addressLine: string; locality: string; instructions?: string };
  stock: StockRequirement[]; history: OrderHistoryEntry[]; notes: OrderNote[];
}
export interface OrderMutationResponse {
  orderId: string; version: number; orderStatus: OrderStatus; paymentStatus: PaymentStatus; allowedActions: AllowedOrderActions;
}
export interface PaymentConfirmationResponse extends OrderMutationResponse {
  paymentId: string; attemptId: string; confirmedAt: string; confirmedByAdminUserId: string; stockOperationId: string; total: Money;
}
export interface PaymentConfirmationRequest { expectedVersion: number; attemptId: string; confirmedAmount: Money }
export interface OrderStatusRequest { expectedVersion: number; status: 'READY' | 'DELIVERED' }
export interface CancelOrderRequest { expectedVersion: number; reason: string }
export interface OrderNoteRequest { expectedVersion: number; text: string }
export interface AdminOrderFilters {
  page: number; pageSize: number; orderStatus?: OrderStatus; paymentStatus?: PaymentStatus;
  deliveryMode?: DeliveryMode; from?: string; to?: string; search?: string;
}
