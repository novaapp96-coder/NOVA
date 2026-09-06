import React from 'react';
import { Platform, View } from 'react-native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useApp } from '../state/AppProvider';
import { AppText } from '../components/UI';
import HomeScreen from '../screens/main/HomeScreen';
import ProductsScreen from '../screens/main/ProductsScreen';
import CartScreen from '../screens/main/CartScreen';
import OrdersScreen from '../screens/main/OrdersScreen';
import ProfileScreen from '../screens/main/ProfileScreen';
import type { MainTabParamList } from './types';

const Tab = createBottomTabNavigator<MainTabParamList>();

/**
 * Bottom navigation: الرئيسية، المنتجات، السلة، طلباتي، حسابي.
 * Tabs are declared in reverse so the RTL order puts الرئيسية on the right.
 */
export default function MainTabs() {
  const { theme, cart, orders } = useApp();
  const cartCount = cart.reduce((s, l) => s + l.item.qty, 0);
  const activeOrders = orders.filter((o) =>
    ['received', 'confirmed', 'preparing', 'out_for_delivery'].includes(o.status),
  ).length;

  const icons: Record<keyof MainTabParamList, string> = {
    Home: 'home-variant',
    Products: 'view-grid-outline',
    Cart: 'basket-outline',
    Orders: 'package-variant-closed',
    Profile: 'account-circle-outline',
  };
  const labels: Record<keyof MainTabParamList, string> = {
    Home: 'الرئيسية',
    Products: 'المنتجات',
    Cart: 'السلة',
    Orders: 'طلباتي',
    Profile: 'حسابي',
  };

  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarActiveTintColor: theme.c.primary,
        tabBarInactiveTintColor: theme.c.textMuted,
        tabBarStyle: {
          backgroundColor: theme.c.surface,
          borderTopColor: theme.c.border,
          height: Platform.OS === 'ios' ? 86 : 66,
          paddingTop: 6,
          paddingBottom: Platform.OS === 'ios' ? 28 : 10,
        },
        tabBarLabelStyle: { fontFamily: 'Tajawal_500Medium', fontSize: 11.5 },
        tabBarIcon: ({ color, focused }) => (
          <View style={{ alignItems: 'center' }}>
            <MaterialCommunityIcons
              name={(focused ? icons[route.name].replace('-outline', '') : icons[route.name]) as never}
              size={23}
              color={color}
            />
            {route.name === 'Cart' && cartCount > 0 ? (
              <View
                style={{
                  position: 'absolute',
                  top: -5,
                  left: 12,
                  backgroundColor: theme.c.accent,
                  borderRadius: 9,
                  minWidth: 17,
                  height: 17,
                  alignItems: 'center',
                  justifyContent: 'center',
                  paddingHorizontal: 3,
                }}
              >
                <AppText size={10} weight="bold" color="#fff">
                  {cartCount}
                </AppText>
              </View>
            ) : null}
            {route.name === 'Orders' && activeOrders > 0 ? (
              <View
                style={{
                  position: 'absolute',
                  top: -5,
                  left: 12,
                  backgroundColor: theme.c.warning,
                  borderRadius: 9,
                  minWidth: 17,
                  height: 17,
                  alignItems: 'center',
                  justifyContent: 'center',
                  paddingHorizontal: 3,
                }}
              >
                <AppText size={10} weight="bold" color="#fff">
                  {activeOrders}
                </AppText>
              </View>
            ) : null}
          </View>
        ),
        tabBarLabel: ({ color }) => (
          <AppText size={11.5} color={color} weight="medium" align="center" style={{ textAlign: 'center' }}>
            {labels[route.name]}
          </AppText>
        ),
      })}
    >
      <Tab.Screen name="Profile" component={ProfileScreen} />
      <Tab.Screen name="Orders" component={OrdersScreen} />
      <Tab.Screen name="Cart" component={CartScreen} />
      <Tab.Screen name="Products" component={ProductsScreen} />
      <Tab.Screen name="Home" component={HomeScreen} />
    </Tab.Navigator>
  );
}
