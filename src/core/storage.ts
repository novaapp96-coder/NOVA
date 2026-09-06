import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

/** JSON key-value storage (local repository layer). */
export const storage = {
  async get<T>(key: string): Promise<T | null> {
    try {
      const raw = await AsyncStorage.getItem(key);
      return raw ? (JSON.parse(raw) as T) : null;
    } catch {
      return null;
    }
  },
  async set(key: string, value: unknown): Promise<void> {
    try {
      await AsyncStorage.setItem(key, JSON.stringify(value));
    } catch {
      /* storage unavailable — app keeps working from memory */
    }
  },
  async remove(key: string): Promise<void> {
    try {
      await AsyncStorage.removeItem(key);
    } catch {
      /* ignore */
    }
  },
};

const SESSION_KEY = 'mycart.session.v1';

/** Session token storage — SecureStore on native, AsyncStorage fallback on web preview. */
export const sessionStore = {
  async get(): Promise<{ userId: string } | null> {
    try {
      if (Platform.OS !== 'web') {
        const raw = await SecureStore.getItemAsync(SESSION_KEY);
        return raw ? (JSON.parse(raw) as { userId: string }) : null;
      }
      return await storage.get<{ userId: string }>(SESSION_KEY);
    } catch {
      return null;
    }
  },
  async set(userId: string): Promise<void> {
    try {
      if (Platform.OS !== 'web') await SecureStore.setItemAsync(SESSION_KEY, JSON.stringify({ userId }));
      else await storage.set(SESSION_KEY, { userId });
    } catch {
      /* ignore */
    }
  },
  async clear(): Promise<void> {
    try {
      if (Platform.OS !== 'web') await SecureStore.deleteItemAsync(SESSION_KEY);
      else await storage.remove(SESSION_KEY);
    } catch {
      /* ignore */
    }
  },
};
