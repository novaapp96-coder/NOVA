/**
 * My Cart — Domain Models
 * All models are related: User -> Cart/CartItem, Product -> Category/ProductImage/ProductVariant,
 * Order -> OrderItem/OrderStatusHistory, Favorite, Review, Coupon, Notification, Address, Settings.
 */

export type ID = string;

export type UserRole = 'customer' | 'admin';

export interface User {
  id: ID;
  name: string;
  phone: string;
  email?: string;
  passwordHash: string; // never stored as plain text
  salt: string;
  role: UserRole;
  avatar?: string | null;
  createdAt: string;
}

export interface PublicUser {
  id: ID;
  name: string;
  phone: string;
  email?: string;
  role: UserRole;
  avatar?: string | null;
  createdAt: string;
}

export interface Category {
  id: ID;
  name: string;
  icon: string; // MaterialCommunityIcons name
  emoji: string;
  active: boolean;
  sortOrder: number;
}

export interface ProductVariant {
  id: ID;
  type: 'size' | 'color';
  value: string;
  stock: number;
  swatch?: string;
}

export interface Product {
  id: ID;
  name: string;
  categoryId: ID;
  brand?: string;
  price: number;
  oldPrice?: number;
  description: string;
  images: string[];
  variants: ProductVariant[];
  stock: number;
  rating: number;
  reviewsCount: number;
  featured: boolean;
  isNew: boolean;
  hidden: boolean;
  soldCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface Review {
  id: ID;
  productId: ID;
  userId: ID;
  userName: string;
  rating: number;
  comment: string;
  createdAt: string;
}

export interface Favorite {
  id: ID;
  userId: ID;
  productId: ID;
  createdAt: string;
}

export interface CartItem {
  id: ID;
  productId: ID;
  variantIds: ID[];
  qty: number;
  createdAt: string;
}

export interface ResolvedCartItem {
  item: CartItem;
  product: Product;
  variantLabels: string[];
  unitPrice: number;
  lineTotal: number;
}

export interface Address {
  id: ID;
  userId: ID;
  fullName: string;
  phone: string;
  wilaya: string;
  commune: string;
  street: string;
  notes?: string;
  isDefault: boolean;
  createdAt: string;
}

export type OrderStatus =
  | 'received'
  | 'confirmed'
  | 'preparing'
  | 'out_for_delivery'
  | 'delivered'
  | 'cancelled';

export interface OrderStatusHistory {
  status: OrderStatus;
  at: string;
  note?: string;
  by: 'customer' | 'admin' | 'system';
}

export interface OrderItem {
  productId: ID;
  name: string;
  image: string;
  unitPrice: number;
  qty: number;
  variantLabels: string[];
}

export interface Order {
  id: string; // e.g. MC-2026-0001
  userId: ID;
  customerName: string;
  phone: string;
  wilaya: string;
  commune: string;
  address: string;
  notes?: string;
  items: OrderItem[];
  subtotal: number;
  deliveryFee: number;
  discount: number;
  total: number;
  couponCode?: string;
  paymentMethod: 'cod'; // Cash on Delivery — electronic payments can be added later
  status: OrderStatus;
  history: OrderStatusHistory[];
  createdAt: string;
  updatedAt: string;
}

export type NotificationType = 'order' | 'promo' | 'system';

export interface AppNotification {
  id: ID;
  userId: ID; // '*' = broadcast to everyone
  title: string;
  body: string;
  type: NotificationType;
  orderId?: string;
  read: boolean;
  createdAt: string;
}

export interface Coupon {
  id: ID;
  code: string;
  type: 'percent' | 'fixed';
  value: number;
  minSubtotal: number;
  active: boolean;
  expiresAt?: string | null;
  uses: number;
}

export interface AppSettings {
  storeName: string;
  slogan: string;
  supportPhone: string;
  deliveryFee: number;
  freeDeliveryThreshold: number;
  announcement: string;
  orderPrefix: string;
  orderYear: number;
}

export interface DBShape {
  version: number;
  users: User[];
  categories: Category[];
  products: Product[];
  reviews: Review[];
  favorites: Favorite[];
  carts: Record<ID, CartItem[]>;
  addresses: Address[];
  orders: Order[];
  notifications: AppNotification[];
  coupons: Coupon[];
  settings: AppSettings;
  orderSeq: number;
}

export type ProductSort =
  | 'newest'
  | 'price_asc'
  | 'price_desc'
  | 'best_selling'
  | 'top_rated';

export interface ProductQuery {
  search?: string;
  categoryId?: ID | null;
  sort?: ProductSort;
  minPrice?: number;
  maxPrice?: number;
  inStockOnly?: boolean;
  offersOnly?: boolean;
  featured?: boolean;
  newOnly?: boolean;
  page?: number;
  pageSize?: number;
}
