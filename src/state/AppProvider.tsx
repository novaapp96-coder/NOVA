import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useColorScheme } from 'react-native';
import { makeTheme, ThemeMode, AppTheme } from '../core/theme';
import { messageOf } from '../data/errors';
import { authRepository } from '../repositories/authRepository';
import { catalogRepository } from '../repositories/catalogRepository';
import { cartRepository } from '../repositories/cartRepository';
import { orderRepository, CheckoutInput } from '../repositories/orderRepository';
import { notificationRepository } from '../repositories/notificationRepository';
import { addressRepository } from '../repositories/addressRepository';
import type {
  Address,
  AppNotification,
  AppSettings,
  Category,
  ID,
  Order,
  Product,
  PublicUser,
  ResolvedCartItem,
} from '../core/types';
import { DEFAULT_SETTINGS } from '../core/constants';

export type ToastType = 'success' | 'error' | 'info';

interface ToastState {
  id: number;
  message: string;
  type: ToastType;
}

interface ConfirmOptions {
  title: string;
  message?: string;
  confirmText?: string;
  cancelText?: string;
  destructive?: boolean;
}

interface AppContextValue {
  booted: boolean;
  user: PublicUser | null;
  theme: AppTheme;
  themeMode: ThemeMode;
  setThemeMode: (m: ThemeMode) => void;
  categories: Category[];
  products: Product[];
  cart: ResolvedCartItem[];
  orders: Order[];
  notifications: AppNotification[];
  unreadCount: number;
  favoriteIds: ID[];
  addresses: Address[];
  settings: AppSettings;
  loading: { products: boolean; cart: boolean; orders: boolean; notifications: boolean };
  refreshCatalog: () => Promise<void>;
  refreshCart: () => Promise<void>;
  refreshOrders: () => Promise<void>;
  refreshNotifications: () => Promise<void>;
  refreshAddresses: () => Promise<void>;
  refreshAll: () => Promise<void>;
  login: (identifier: string, password: string) => Promise<void>;
  register: (i: { name: string; phone: string; email?: string; password: string }) => Promise<void>;
  logout: () => Promise<void>;
  updateProfile: (patch: { name?: string; phone?: string; email?: string }) => Promise<void>;
  changePassword: (current: string, next: string) => Promise<void>;
  addToCart: (productId: ID, variantIds?: ID[], qty?: number) => Promise<void>;
  updateCartQty: (lineId: ID, qty: number) => Promise<void>;
  removeFromCart: (lineId: ID) => Promise<void>;
  clearCart: () => Promise<void>;
  toggleFavorite: (productId: ID) => Promise<boolean>;
  checkout: (input: CheckoutInput) => Promise<Order>;
  cancelOrder: (orderId: ID) => Promise<void>;
  markAllNotificationsRead: () => Promise<void>;
  saveAddress: (input: Omit<Address, 'id' | 'userId' | 'createdAt'>, id?: ID) => Promise<void>;
  removeAddress: (id: ID) => Promise<void>;
  toast: (message: string, type?: ToastType) => void;
  confirm: (options: ConfirmOptions) => Promise<boolean>;
  toasts: ToastState[];
  confirmRequest: (ConfirmOptions & { resolve: (v: boolean) => void }) | null;
  resolveConfirm: (value: boolean) => void;
}

const AppContext = createContext<AppContextValue | null>(null);

export function AppProvider({ children }: { children: React.ReactNode }) {
  const scheme = useColorScheme();
  const [themeMode, setThemeMode] = useState<ThemeMode>('light');
  const [booted, setBooted] = useState(false);
  const [user, setUser] = useState<PublicUser | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [cart, setCart] = useState<ResolvedCartItem[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [favoriteIds, setFavoriteIds] = useState<ID[]>([]);
  const [addresses, setAddresses] = useState<Address[]>([]);
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [loading, setLoading] = useState({
    products: true,
    cart: false,
    orders: false,
    notifications: false,
  });
  const [toasts, setToasts] = useState<ToastState[]>([]);
  const [confirmRequest, setConfirmRequest] = useState<
    (ConfirmOptions & { resolve: (v: boolean) => void }) | null
  >(null);
  const toastId = useRef(0);

  const theme = useMemo(
    () => makeTheme(themeMode === 'system' ? scheme === 'dark' : themeMode === 'dark'),
    [themeMode, scheme],
  );

  const toast = useCallback((message: string, type: ToastType = 'info') => {
    const id = ++toastId.current;
    setToasts((t) => [...t, { id, message, type }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3200);
  }, []);

  const confirm = useCallback(
    (options: ConfirmOptions) =>
      new Promise<boolean>((resolve) => setConfirmRequest({ ...options, resolve })),
    [],
  );

  const resolveConfirm = useCallback((value: boolean) => {
    setConfirmRequest((req) => {
      req?.resolve(value);
      return null;
    });
  }, []);

  const refreshCatalog = useCallback(async () => {
    setLoading((l) => ({ ...l, products: true }));
    try {
      const [cats, prods] = await Promise.all([
        catalogRepository.getCategories(),
        catalogRepository.getProducts({ pageSize: 60 }),
      ]);
      setCategories(cats);
      setProducts(prods);
    } catch (e) {
      toast(messageOf(e, 'تعذّر تحميل المنتجات.'), 'error');
    } finally {
      setLoading((l) => ({ ...l, products: false }));
    }
  }, [toast]);

  const refreshCart = useCallback(async () => {
    if (!user) return setCart([]);
    setLoading((l) => ({ ...l, cart: true }));
    try {
      setCart(await cartRepository.getCart(user as never));
    } catch {
      /* cart failures keep previous state */
    } finally {
      setLoading((l) => ({ ...l, cart: false }));
    }
  }, [user]);

  const refreshOrders = useCallback(async () => {
    if (!user) return setOrders([]);
    setLoading((l) => ({ ...l, orders: true }));
    try {
      setOrders(await orderRepository.listOrders(user));
    } catch {
      /* ignore */
    } finally {
      setLoading((l) => ({ ...l, orders: false }));
    }
  }, [user]);

  const refreshNotifications = useCallback(async () => {
    if (!user) return setNotifications([]);
    setLoading((l) => ({ ...l, notifications: true }));
    try {
      setNotifications(await notificationRepository.list(user.id));
    } catch {
      /* ignore */
    } finally {
      setLoading((l) => ({ ...l, notifications: false }));
    }
  }, [user]);

  const refreshAddresses = useCallback(async () => {
    if (!user) return setAddresses([]);
    try {
      setAddresses(await addressRepository.list(user.id));
    } catch {
      /* ignore */
    }
  }, [user]);

  const refreshFavorites = useCallback(async () => {
    if (!user) return setFavoriteIds([]);
    try {
      setFavoriteIds(await catalogRepository.getFavoriteIds(user.id));
    } catch {
      /* ignore */
    }
  }, [user]);

  const refreshSettings = useCallback(async () => {
    try {
      const { localDatabase } = await import('../data/database');
      const db = await localDatabase.read();
      setSettings(db.settings);
    } catch {
      /* ignore */
    }
  }, []);

  const refreshAll = useCallback(async () => {
    await Promise.all([
      refreshCatalog(),
      refreshCart(),
      refreshOrders(),
      refreshNotifications(),
      refreshFavorites(),
      refreshAddresses(),
      refreshSettings(),
    ]);
  }, [
    refreshCatalog,
    refreshCart,
    refreshOrders,
    refreshNotifications,
    refreshFavorites,
    refreshAddresses,
    refreshSettings,
  ]);

  // Boot: restore session, load public data
  useEffect(() => {
    (async () => {
      try {
        const session = await authRepository.restoreSession();
        setUser(session);
        await refreshCatalog();
        await refreshSettings();
        if (session) {
          await Promise.all([
            refreshCart(),
            refreshOrders(),
            refreshNotifications(),
            refreshFavorites(),
            refreshAddresses(),
          ]);
        }
      } catch {
        toast('تعذّر تجهيز البيانات. أعيدي المحاولة.', 'error');
      } finally {
        setBooted(true);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const login = useCallback(
    async (identifier: string, password: string) => {
      const u = await authRepository.login(identifier, password);
      setUser(u);
      await refreshAll();
      toast(`أهلًا بكِ ${u.name.split(' ')[0]} 💜`, 'success');
    },
    [refreshAll, toast],
  );

  const register = useCallback(
    async (input: { name: string; phone: string; email?: string; password: string }) => {
      await authRepository.register(input);
      const u = await authRepository.login(input.phone, input.password);
      setUser(u);
      await refreshAll();
      toast('تم إنشاء حسابكِ بنجاح 💜', 'success');
    },
    [refreshAll, toast],
  );

  const logout = useCallback(async () => {
    await authRepository.logout();
    setUser(null);
    setCart([]);
    setOrders([]);
    setNotifications([]);
    setFavoriteIds([]);
    setAddresses([]);
  }, []);

  const updateProfile = useCallback(
    async (patch: { name?: string; phone?: string; email?: string }) => {
      if (!user) throw new Error('unauthorized');
      const updated = await authRepository.updateProfile(user.id, patch);
      setUser(updated);
      toast('تم تحديث بياناتكِ بنجاح.', 'success');
    },
    [user, toast],
  );

  const changePassword = useCallback(
    async (current: string, next: string) => {
      if (!user) throw new Error('unauthorized');
      await authRepository.changePassword(user.id, current, next);
      toast('تم تغيير كلمة المرور بنجاح.', 'success');
    },
    [user, toast],
  );

  const addToCart = useCallback(
    async (productId: ID, variantIds: ID[] = [], qty = 1) => {
      if (!user) throw new Error('unauthorized');
      const lines = await cartRepository.addToCart(user as never, productId, variantIds, qty);
      setCart(lines);
      toast('تمت الإضافة إلى السلة 🛒', 'success');
    },
    [user, toast],
  );

  const updateCartQty = useCallback(
    async (lineId: ID, qty: number) => {
      if (!user) return;
      setCart(await cartRepository.updateQty(user as never, lineId, qty));
    },
    [user],
  );

  const removeFromCart = useCallback(
    async (lineId: ID) => {
      if (!user) return;
      setCart(await cartRepository.removeItem(user as never, lineId));
      toast('تم حذف المنتج من السلة.', 'info');
    },
    [user, toast],
  );

  const clearCart = useCallback(async () => {
    if (!user) return;
    await cartRepository.clearCart(user as never);
    setCart([]);
  }, [user]);

  const toggleFavorite = useCallback(
    async (productId: ID) => {
      if (!user) {
        toast('سجّلي الدخول لحفظ المفضلة 💜', 'error');
        return false;
      }
      const isNow = await catalogRepository.toggleFavorite(user.id, productId);
      setFavoriteIds((ids) => (isNow ? [...ids, productId] : ids.filter((i) => i !== productId)));
      toast(isNow ? 'تمت الإضافة إلى المفضلة ❤️' : 'تمت الإزالة من المفضلة', 'info');
      return isNow;
    },
    [user, toast],
  );

  const checkout = useCallback(
    async (input: CheckoutInput) => {
      if (!user) throw new Error('unauthorized');
      const order = await orderRepository.createOrder(user as never, input);
      await Promise.all([refreshOrders(), refreshCart(), refreshNotifications(), refreshCatalog()]);
      return order;
    },
    [user, refreshOrders, refreshCart, refreshNotifications, refreshCatalog],
  );

  const cancelOrder = useCallback(
    async (orderId: ID) => {
      if (!user) return;
      await orderRepository.cancelOrder(user, orderId);
      await Promise.all([refreshOrders(), refreshCatalog(), refreshNotifications()]);
      toast('تم إلغاء الطلب وسيعاد المنتج إلى المخزون.', 'info');
    },
    [user, refreshOrders, refreshCatalog, refreshNotifications, toast],
  );

  const markAllNotificationsRead = useCallback(async () => {
    if (!user) return;
    await notificationRepository.markAllRead(user.id);
    await refreshNotifications();
  }, [user, refreshNotifications]);

  const saveAddress = useCallback(
    async (input: Omit<Address, 'id' | 'userId' | 'createdAt'>, id?: ID) => {
      if (!user) return;
      await addressRepository.save(user.id, input, id);
      await refreshAddresses();
      toast('تم حفظ العنوان بنجاح.', 'success');
    },
    [user, refreshAddresses, toast],
  );

  const removeAddress = useCallback(
    async (id: ID) => {
      if (!user) return;
      setAddresses(await addressRepository.remove(user.id, id));
      toast('تم حذف العنوان.', 'info');
    },
    [user, toast],
  );

  const unreadCount = useMemo(() => notifications.filter((n) => !n.read).length, [notifications]);

  const value: AppContextValue = {
    booted,
    user,
    theme,
    themeMode,
    setThemeMode,
    categories,
    products,
    cart,
    orders,
    notifications,
    unreadCount,
    favoriteIds,
    addresses,
    settings,
    loading,
    refreshCatalog,
    refreshCart,
    refreshOrders,
    refreshNotifications,
    refreshAddresses,
    refreshAll,
    login,
    register,
    logout,
    updateProfile,
    changePassword,
    addToCart,
    updateCartQty,
    removeFromCart,
    clearCart,
    toggleFavorite,
    checkout,
    cancelOrder,
    markAllNotificationsRead,
    saveAddress,
    removeAddress,
    toast,
    confirm,
    toasts,
    confirmRequest,
    resolveConfirm,
  };

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp(): AppContextValue {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used inside AppProvider');
  return ctx;
}
