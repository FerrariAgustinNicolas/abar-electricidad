export type H7MethodCode = 'DEMO_SIMULATION' | 'DEMO_PAY_ON_PICKUP' | 'DEMO_TRANSFER';
export type H7OrderStatus = 'RECEIVED' | 'PREPARING' | 'READY' | 'DELIVERED' | 'CANCELLED';
export type H7PaymentStatus = 'PENDING' | 'REJECTED' | 'PAID';
export type H7Filters = {
  from: string;
  to: string;
  methodCode: H7MethodCode | null;
  orderStatus: H7OrderStatus | null;
  paymentStatus: H7PaymentStatus | null;
};
export type H7Money = Readonly<{ amountMinor: string; currency: 'ARS' }>;
export type H7SalesReport = Readonly<{
  demoMode: true;
  period: Readonly<{ from: string; to: string; timeZone: 'America/Argentina/Buenos_Aires'; semantics: '[from,to)' }>;
  filters: Readonly<{ methodCode: H7MethodCode | null; orderStatus: H7OrderStatus | null; paymentStatus: H7PaymentStatus | null }>;
  totals: Readonly<{
    confirmedOrderCount: number; productsSubtotal: H7Money; deliveryFees: H7Money; confirmedTotal: H7Money;
    averageTicket: H7Money; empty: boolean;
  }>;
  orders: Readonly<{
    createdCount: number; activeUnpaidCount: number; cancelledUnpaidCount: number; rejectedPaymentCount: number;
    rejectedCurrentAttemptCount: number; byStatus: readonly Readonly<{ orderStatus: H7OrderStatus; count: number }>[];
  }>;
  series: readonly Readonly<{ date: string; confirmedOrderCount: number; confirmedTotal: H7Money }>[];
  byMethod: readonly Readonly<{ methodCode: H7MethodCode; confirmedOrderCount: number; confirmedTotal: H7Money }>[];
  byDelivery: readonly Readonly<{ deliveryMode: 'PICKUP' | 'COORDINATED'; confirmedOrderCount: number; deliveryFees: H7Money; confirmedTotal: H7Money }>[];
  presentations: readonly Readonly<{
    productId: string; presentationId: string; productName: string; unit: 'UNIT' | 'METER' | 'ROLL';
    rollLengthMeters: number | null; quantity: string; productsSubtotal: H7Money;
  }>[];
}>;
