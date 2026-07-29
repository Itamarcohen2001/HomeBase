import 'react-native-url-polyfill/auto';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

const url = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';
const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '';

/** האם הוגדרו מפתחות Supabase תקינים בקובץ .env */
export const isSupabaseConfigured = Boolean(url && anonKey && url.startsWith('http'));

const isWeb = Platform.OS === 'web';

export const supabase: SupabaseClient = createClient(
  isSupabaseConfigured ? url : 'https://placeholder.supabase.co',
  isSupabaseConfigured ? anonKey : 'public-anon-key-placeholder',
  {
    auth: {
      // בוובי משאירים את ברירת המחדל (localStorage) כדי שהסשן ישרוד
      // סגירה ופתיחה של האפליקציה מהמסך הבית.
      storage: isWeb ? undefined : AsyncStorage,
      autoRefreshToken: true,
      persistSession: true,
      // בוובי החזרה מאיפוס סיסמה ומ-Google OAuth מגיעה עם הטוקן ב-URL,
      // ולכן שם חייבים לזהות אותו אוטומטית. בנייטיב מטפלים בזה ידנית.
      detectSessionInUrl: isWeb,
    },
  },
);
