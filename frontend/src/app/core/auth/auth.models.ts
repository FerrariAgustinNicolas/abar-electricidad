export interface AdminIdentity {
  id: string;
  name: string;
  email: string;
  mustChangePassword: boolean;
}

export interface AdminSessionView {
  admin: AdminIdentity;
  expiresAt: string;
}

export interface CsrfMetadata {
  csrfToken: string;
  headerName: 'X-CSRF-Token';
}

export interface SessionResponse {
  session: AdminSessionView;
  csrfToken: string;
}

export interface AdminUserView {
  id: string;
  name: string;
  email: string;
  active: boolean;
  mustChangePassword: boolean;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface AdminUserList {
  items: AdminUserView[];
  pageInfo: { page: number; pageSize: number; totalItems: number; totalPages: number };
}

export interface ApiErrorBody {
  code: string;
  message: string;
  fieldErrors?: Array<{ field: string; code: string; message: string }>;
  requestId: string;
}
