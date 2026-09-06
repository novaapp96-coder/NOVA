import 'react-native-gesture-handler';
import React from 'react';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { useFonts, Tajawal_400Regular, Tajawal_500Medium, Tajawal_700Bold } from '@expo-google-fonts/tajawal';
import { View, ActivityIndicator } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { AppProvider, useApp } from './src/state/AppProvider';
import RootNavigator from './src/navigation/RootNavigator';
import { ConfirmDialog, Toasts } from './src/components/UI';

function Gate() {
  const { theme } = useApp();
  return (
    <View style={{ flex: 1, backgroundColor: theme.c.bg }}>
      <StatusBar style={theme.dark ? 'light' : 'dark'} />
      <RootNavigator />
      <Toasts />
      <ConfirmDialog />
    </View>
  );
}

export default function App() {
  const [fontsLoaded] = useFonts({
    Tajawal_400Regular,
    Tajawal_500Medium,
    Tajawal_700Bold,
    ...Ionicons.font,
    ...MaterialCommunityIcons.font,
  });

  if (!fontsLoaded) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#FAF7FF' }}>
        <ActivityIndicator color="#7C5CFC" size="large" />
      </View>
    );
  }

  return (
    <SafeAreaProvider>
      <AppProvider>
        <Gate />
      </AppProvider>
    </SafeAreaProvider>
  );
}
