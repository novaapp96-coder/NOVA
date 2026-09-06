import React from 'react';
import { View } from 'react-native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useApp } from '../state/AppProvider';
import { EmptyState, Screen } from '../components/UI';
import AdminDashboardScreen from '../screens/admin/AdminDashboardScreen';
import AdminProductsScreen from '../screens/admin/AdminProductsScreen';
import AdminProductEditScreen from '../screens/admin/AdminProductEditScreen';
import AdminOrdersScreen from '../screens/admin/AdminOrdersScreen';
import AdminOrderDetailsScreen from '../screens/admin/AdminOrderDetailsScreen';
import AdminCategoriesScreen from '../screens/admin/AdminCategoriesScreen';
import AdminCouponsScreen from '../screens/admin/AdminCouponsScreen';
import AdminCustomersScreen from '../screens/admin/AdminCustomersScreen';
import AdminNotificationsScreen from '../screens/admin/AdminNotificationsScreen';
import AdminSettingsScreen from '../screens/admin/AdminSettingsScreen';
import type { AdminStackParamList } from './types';

const Stack = createNativeStackNavigator<AdminStackParamList>();

/** Admin area is protected: only users with role === 'admin' can enter. */
function AdminGuard({ children }: { children: React.ReactNode }) {
  const { user } = useApp();
  if (user?.role !== 'admin') {
    return (
      <Screen>
        <EmptyState
          emoji="🔒"
          title="وصول محظور"
          message="هذه الصفحة مخصّصة لإدارة المتجر. تسجّلي الدخول بحساب إدارة للدخول."
        />
      </Screen>
    );
  }
  return <View style={{ flex: 1 }}>{children}</View>;
}

export default function AdminNavigator() {
  const { user } = useApp();
  if (user?.role !== 'admin') {
    return (
      <Screen>
        <EmptyState
          emoji="🔒"
          title="وصول محظور"
          message="هذه الصفحة مخصّصة لإدارة المتجر. يرجى تسجيل الدخول بحساب إدارة."
        />
      </Screen>
    );
  }
  return (
    <AdminGuard>
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        <Stack.Screen name="AdminDashboard" component={AdminDashboardScreen} />
        <Stack.Screen name="AdminProducts" component={AdminProductsScreen} />
        <Stack.Screen name="AdminProductEdit" component={AdminProductEditScreen} />
        <Stack.Screen name="AdminOrders" component={AdminOrdersScreen} />
        <Stack.Screen name="AdminOrderDetails" component={AdminOrderDetailsScreen} />
        <Stack.Screen name="AdminCategories" component={AdminCategoriesScreen} />
        <Stack.Screen name="AdminCoupons" component={AdminCouponsScreen} />
        <Stack.Screen name="AdminCustomers" component={AdminCustomersScreen} />
        <Stack.Screen name="AdminNotifications" component={AdminNotificationsScreen} />
        <Stack.Screen name="AdminSettings" component={AdminSettingsScreen} />
      </Stack.Navigator>
    </AdminGuard>
  );
}
