import type { NavigatorScreenParams } from '@react-navigation/native';

export type MainTabParamList = {
  Home: undefined;
  Products: { search?: string; categoryId?: string; offers?: boolean } | undefined;
  Cart: undefined;
  Orders: undefined;
  Profile: undefined;
};

export type RootStackParamList = {
  Login: undefined;
  Register: undefined;
  Main: NavigatorScreenParams<MainTabParamList> | undefined;
  OrdersTab: undefined;
  ProductDetails: { productId: string };
  Checkout: undefined;
  OrderSuccess: { orderId: string };
  OrderDetails: { orderId: string };
  Favorites: undefined;
  Notifications: undefined;
  Support: undefined;
  About: undefined;
  Terms: undefined;
  Privacy: undefined;
  MyInfo: undefined;
  Addresses: undefined;
  Admin: NavigatorScreenParams<AdminStackParamList> | undefined;
};

export type AdminStackParamList = {
  AdminDashboard: undefined;
  AdminProducts: undefined;
  AdminProductEdit: { productId?: string } | undefined;
  AdminOrders: undefined;
  AdminOrderDetails: { orderId: string };
  AdminCategories: undefined;
  AdminCoupons: undefined;
  AdminCustomers: undefined;
  AdminNotifications: undefined;
  AdminSettings: undefined;
  AdminTelegram: undefined;
};
