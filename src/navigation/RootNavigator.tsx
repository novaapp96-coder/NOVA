import React from 'react';
import { ActivityIndicator, View } from 'react-native';
import { NavigationContainer, DefaultTheme, DarkTheme } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useApp } from '../state/AppProvider';
import MainTabs from './MainTabs';
import LoginScreen from '../screens/auth/LoginScreen';
import RegisterScreen from '../screens/auth/RegisterScreen';
import ProductDetailsScreen from '../screens/shop/ProductDetailsScreen';
import FavoritesScreen from '../screens/shop/FavoritesScreen';
import CheckoutScreen from '../screens/checkout/CheckoutScreen';
import OrderSuccessScreen from '../screens/checkout/OrderSuccessScreen';
import OrdersScreen from '../screens/main/OrdersScreen';
import OrderDetailsScreen from '../screens/orders/OrderDetailsScreen';
import NotificationsScreen from '../screens/misc/NotificationsScreen';
import SupportScreen from '../screens/misc/SupportScreen';
import StaticContentScreen from '../screens/misc/StaticContentScreen';
import MyInfoScreen from '../screens/profile/MyInfoScreen';
import AddressesScreen from '../screens/profile/AddressesScreen';
import AdminNavigator from './AdminNavigator';
import type { RootStackParamList } from './types';

const Stack = createNativeStackNavigator<RootStackParamList>();

export default function RootNavigator() {
  const { booted, user, theme } = useApp();

  if (!booted) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.c.bg }}>
        <ActivityIndicator color={theme.c.primary} size="large" />
      </View>
    );
  }

  const navTheme = {
    ...(theme.dark ? DarkTheme : DefaultTheme),
    colors: {
      ...(theme.dark ? DarkTheme.colors : DefaultTheme.colors),
      background: theme.c.bg,
      card: theme.c.surface,
      text: theme.c.text,
      primary: theme.c.primary,
      border: theme.c.border,
    },
  };

  return (
    <NavigationContainer theme={navTheme}>
      {!user ? (
        <Stack.Navigator screenOptions={{ headerShown: false, animation: 'slide_from_left' }}>
          <Stack.Screen name="Login" component={LoginScreen} />
          <Stack.Screen name="Register" component={RegisterScreen} />
        </Stack.Navigator>
      ) : (
        <Stack.Navigator screenOptions={{ headerShown: false }}>
          <Stack.Screen name="Main" component={MainTabs} options={{ animation: 'fade' }} />
          <Stack.Screen name="ProductDetails" component={ProductDetailsScreen} options={{ animation: 'slide_from_left' }} />
          <Stack.Screen name="Favorites" component={FavoritesScreen} />
          <Stack.Screen name="Checkout" component={CheckoutScreen} />
          <Stack.Screen name="OrderSuccess" component={OrderSuccessScreen} options={{ animation: 'fade', gestureEnabled: false }} />
          <Stack.Screen name="OrderDetails" component={OrderDetailsScreen} />
          <Stack.Screen name="OrdersTab" component={OrdersScreen} />
          <Stack.Screen name="Notifications" component={NotificationsScreen} />
          <Stack.Screen name="Support" component={SupportScreen} />
          <Stack.Screen name="About" component={StaticContentScreen} />
          <Stack.Screen name="Terms" component={StaticContentScreen} />
          <Stack.Screen name="Privacy" component={StaticContentScreen} />
          <Stack.Screen name="MyInfo" component={MyInfoScreen} />
          <Stack.Screen name="Addresses" component={AddressesScreen} />
          <Stack.Screen name="Admin" component={AdminNavigator} options={{ animation: 'slide_from_left' }} />
        </Stack.Navigator>
      )}
    </NavigationContainer>
  );
}
