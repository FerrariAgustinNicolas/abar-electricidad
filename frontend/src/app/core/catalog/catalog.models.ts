/** H2 contract 0.5.0. Keep these DTOs aligned with contracts/openapi.yaml. */
export type PresentationUnit = 'UNIT' | 'METER' | 'ROLL';
export type Availability = 'AVAILABLE' | 'LOW_STOCK' | 'OUT_OF_STOCK';
export interface Money { amountMinor: string; currency: 'ARS' }
export interface PageInfo { page: number; pageSize: number; totalItems: number; totalPages: number }
export interface Page<T> { items: T[]; pageInfo: PageInfo }
export interface PublicCategory { id: string; name: string; slug: string; description: string; order: number }
export interface Category extends PublicCategory { active: boolean; version: number }
export interface CategoryWrite { name: string; slug: string; description: string; order: number; active: boolean }
export type CategoryPatch = Partial<CategoryWrite> & { expectedVersion: number };
export interface ProductImageView { id: string; url: string; alt: string; order: number; isPrimary: boolean }
export interface PublicPresentation {
  id: string; unit: PresentationUnit; rollLengthMeters: number | null; price: Money;
  availability: Availability; sellable: boolean;
}
export interface AdminPresentation extends PublicPresentation {
  active: boolean; isDefault: boolean; version: number; availableQuantity: number;
  stockVersion: number; lowStockThreshold: number;
}
export interface ProductSummary {
  id: string; slug: string; name: string; brand: string | null; category: PublicCategory;
  primaryImage: ProductImageView | null; defaultPresentationId: string; displayPresentationId: string;
  presentations: PublicPresentation[];
}
export interface TechnicalAttribute { key: string; value: string }
export interface ProductDetail extends ProductSummary {
  shortDescription: string; description: string; attributes: TechnicalAttribute[]; images: ProductImageView[];
}
export interface PresentationWrite {
  id?: string; unit: PresentationUnit; rollLengthMeters?: number; price: Money;
  lowStockThreshold: number; active: boolean; isDefault: boolean;
}
export interface ProductWrite {
  name: string; slug: string; categoryId: string; brand: string | null; sku: string | null;
  shortDescription: string; description: string; attributes: TechnicalAttribute[];
  active: boolean; featured: boolean; presentations: PresentationWrite[];
}
/** Product updates require the full editable catalog payload, not partial merge semantics. */
export interface ProductPatch extends ProductWrite { expectedVersion: number }
export interface AdminProduct extends Omit<ProductWrite, 'presentations'> {
  id: string; version: number; presentations: AdminPresentation[]; images: ProductImageView[];
  createdAt: string; updatedAt: string;
}
export interface CatalogHome {
  categories: PublicCategory[]; featuredProducts: ProductSummary[]; lowStockProducts: ProductSummary[];
}
export interface StockRow {
  presentationId: string; productId: string; productName: string; unit: PresentationUnit;
  rollLengthMeters: number | null; active: boolean; availableQuantity: number;
  lowStockThreshold: number; version: number; availability: Availability; requestedUnpaidQuantity?: number; paidPendingDeliveryQuantity?: number;
}
export interface StockEntryView { presentationId: string; delta: number; resultingQuantity: number; version: number }
export interface StockOperationView {
  id: string; type: 'ADJUSTMENT' | 'ROLL_OPENING' | 'PAYMENT_CONFIRMATION'; paymentId?: string; orderId?: string; reason: string; actorAdminUserId: string;
  createdAt: string; entries: StockEntryView[];
}
export interface StockAdjustmentRequest { presentationId: string; delta: number; reason: string; expectedVersion: number }
export interface RollOpeningRequest {
  productId: string; rollQuantity: number; reason: string; expectedVersions: { roll: number; meter: number };
}
export type ProductList = Page<ProductSummary>;
export type AdminProductList = Page<AdminProduct>;
export type StockList = Page<StockRow>;
export type StockOperationList = Page<StockOperationView>;
export interface PublicCategoryList { items: PublicCategory[] }
export interface CategoryList { items: Category[] }
