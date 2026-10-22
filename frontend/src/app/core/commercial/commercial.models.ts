export type DeliveryMode = 'PICKUP' | 'COORDINATED';

export type PaymentMethodCode =
  | 'DEMO_PAY_ON_PICKUP'
  | 'DEMO_TRANSFER'
  | 'DEMO_SIMULATION';

export type NotificationState = 'PENDING' | 'PROCESSING' | 'RETRY_WAIT' | 'SENT' | 'FAILED';

export type NotificationKind =
  | 'ORDER_CREATED_BUYER'
  | 'ORDER_CREATED_ADMIN'
  | 'PAYMENT_CONFIRMED_BUYER'
  | 'PAYMENT_CONFIRMED_ADMIN'
  | 'ORDER_READY_BUYER'
  | 'ORDER_CANCELLED_BUYER'
  | 'ORDER_CANCELLED_ADMIN';

export interface CommercialContact {
  displayName: string;
  email: string;
  phone: string;
  whatsapp: string;
  hours: string;
  address: string;
}

export interface PaymentMethodView {
  code: PaymentMethodCode;
  version: number;
  enabled: boolean;
  label: string;
  instructions: string;
  demo: true;
  deliveryModes: DeliveryMode[];
}

export interface SettingsView {
  version: number;
  feeMinor: string;
  enabledDeliveryModes: DeliveryMode[];
  contact: CommercialContact;
  paymentMethods: PaymentMethodView[];
}

export interface SettingsWrite {
  expectedVersion: number;
  feeMinor: string;
  enabledDeliveryModes: DeliveryMode[];
  contact: CommercialContact;
}

export interface PaymentMethodWrite {
  expectedVersion: number;
  enabled: boolean;
  instructions: string;
  deliveryModes: DeliveryMode[];
}

export interface NotificationView {
  id: string;
  orderId: string;
  kind: NotificationKind;
  state: NotificationState;
  version: number;
  attemptCount: number;
  nextAttemptAt: string | null;
  sentAt: string | null;
  lastError: 'SMTP_UNAVAILABLE' | 'SMTP_REJECTED' | 'INVALID_JOB' | 'LEASE_EXPIRED' | null;
  createdAt: string;
}

export interface NotificationList {
  items: NotificationView[];
  pageInfo: {
    page: number;
    pageSize: number;
    totalItems: number;
    totalPages: number;
  };
}

export interface NotificationFilters {
  page: number;
  pageSize: number;
  state?: NotificationState;
  orderId?: string;
  from?: string;
  to?: string;
}

export interface PublicContact {
  demo: true;
  version: number;
  contact: CommercialContact;
}
