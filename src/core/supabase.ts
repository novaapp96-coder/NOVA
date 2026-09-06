/**
 * My Cart — Supabase Client
 * Single source of truth for all Supabase interactions.
 *
 * Environment variables (loaded automatically by Expo at build time):
 *   - EXPO_PUBLIC_SUPABASE_URL     → your project URL
 *   - EXPO_PUBLIC_SUPABASE_ANON_KEY → your public anon key
 *
 * The anon key is safe to ship in the client bundle — Supabase enforces
 * authorization through Row Level Security (RLS) policies at the database
 * level. See /supabase/schema.sql for the full security policy set.
 *
 * Session persistence: tokens are stored in AsyncStorage so the user stays
 * signed in across app restarts. For a more secure option on native
 * (keystore / keychain), swap to expo-secure-store — same API.
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import AsyncStorage from '@react-native-async-storage/async-storage';

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';
const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '';

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  // Soft warning — the app still boots in offline/local mode.
  // eslint-disable-next-line no-console
  console.warn(
    '[supabase] Missing EXPO_PUBLIC_SUPABASE_URL or EXPO_PUBLIC_SUPABASE_ANON_KEY. ' +
      'The app will run in local-only mode until these are set in .env',
  );
}

/**
 * Custom storage adapter that uses AsyncStorage. The Supabase client only
 * requires an interface with getItem / setItem / removeItem.
 */
const ExpoAsyncStorage = {
  getItem: (key: string): Promise<string | null> => AsyncStorage.getItem(key),
  setItem: (key: string, value: string): Promise<void> => AsyncStorage.setItem(key, value),
  removeItem: (key: string): Promise<void> => AsyncStorage.removeItem(key),
};

export const supabase: SupabaseClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    storage: ExpoAsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false, // not needed in React Native
  },
  // Keep realtime / fetch defaults — explicit here for documentation.
  global: {
    headers: { 'x-application-name': 'my-cart' },
  },
});

/** True when both env vars are present and Supabase is usable. */
export const isSupabaseConfigured: boolean = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);
