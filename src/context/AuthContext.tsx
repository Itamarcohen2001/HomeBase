import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { Platform } from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import * as Linking from 'expo-linking';
import type { Session, User } from '@supabase/supabase-js';
import { supabase, isSupabaseConfigured } from '../lib/supabase';
import { translateAuthError } from '../lib/authErrors';

WebBrowser.maybeCompleteAuthSession();

const isWeb = Platform.OS === 'web';

/** כתובת החזרה אחרי התחברות/איפוס סיסמה — דומיין האתר בוובי, deep link בנייטיב */
function redirectUrl(path: string): string {
  if (isWeb && typeof window !== 'undefined') return window.location.origin;
  return Linking.createURL(path);
}

type AuthValue = {
  session: Session | null;
  user: User | null;
  loading: boolean;
  configured: boolean;
  signInWithEmail: (email: string, password: string) => Promise<void>;
  signUpWithEmail: (email: string, password: string, fullName: string) => Promise<{ needsConfirm: boolean }>;
  signInWithGoogle: () => Promise<void>;
  resetPassword: (email: string) => Promise<void>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!isSupabaseConfigured) {
      setLoading(false);
      return;
    }
    let mounted = true;

    supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return;
      setSession(data.session);
      setLoading(false);
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next);
      setLoading(false);
    });

    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  const signInWithEmail = useCallback(async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim().toLowerCase(),
      password,
    });
    if (error) throw new Error(translateAuthError(error));
  }, []);

  const signUpWithEmail = useCallback(async (email: string, password: string, fullName: string) => {
    const { data, error } = await supabase.auth.signUp({
      email: email.trim().toLowerCase(),
      password,
      options: { data: { full_name: fullName.trim() } },
    });
    if (error) throw new Error(translateAuthError(error));
    return { needsConfirm: !data.session };
  }, []);

  const signInWithGoogle = useCallback(async () => {
    // בדפדפן אין WebBrowser session — צריך לתת ל-Supabase לנווט את החלון עצמו,
    // ואז detectSessionInUrl (ראה src/lib/supabase.ts) קולט את הטוקן בחזרה.
    if (isWeb) {
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo: redirectUrl('auth-callback') },
      });
      if (error) throw new Error(translateAuthError(error));
      // ברירת המחדל של supabase-js בוובי היא לנווט בעצמה. אם משום מה היא רק
      // החזירה כתובת — מנווטים ידנית כדי שהכפתור לא ייתקע ב-loading לנצח.
      if (data?.url && typeof window !== 'undefined' && window.location.href !== data.url) {
        window.location.assign(data.url);
      }
      return;
    }

    const redirectTo = redirectUrl('auth-callback');
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo, skipBrowserRedirect: true },
    });
    if (error) throw new Error(translateAuthError(error));
    if (!data?.url) throw new Error('לא התקבלה כתובת התחברות מ-Google');

    const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
    if (result.type !== 'success' || !result.url) return;

    const parsed = Linking.parse(result.url);
    const fragment = result.url.includes('#') ? result.url.split('#')[1] : '';
    const params = new URLSearchParams(fragment);
    const accessToken = params.get('access_token');
    const refreshToken = params.get('refresh_token');
    const code = (parsed.queryParams?.code as string | undefined) ?? null;

    if (accessToken && refreshToken) {
      const { error: setErr } = await supabase.auth.setSession({
        access_token: accessToken,
        refresh_token: refreshToken,
      });
      if (setErr) throw new Error(translateAuthError(setErr));
      return;
    }

    if (code) {
      const { error: exErr } = await supabase.auth.exchangeCodeForSession(code);
      if (exErr) throw new Error(translateAuthError(exErr));
      return;
    }

    throw new Error('ההתחברות עם Google לא הושלמה');
  }, []);

  const resetPassword = useCallback(async (email: string) => {
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim().toLowerCase(), {
      redirectTo: redirectUrl('reset-password'),
    });
    if (error) throw new Error(translateAuthError(error));
  }, []);

  const signOut = useCallback(async () => {
    try {
      const { error } = await supabase.auth.signOut();
      // אם הטוקן כבר לא תקף בשרת עדיין רוצים לנקות את הסשן המקומי
      if (error && !/session|token|jwt/i.test(error.message)) {
        throw new Error(translateAuthError(error));
      }
    } finally {
      setSession(null);
    }
  }, []);

  const value = useMemo<AuthValue>(
    () => ({
      session,
      user: session?.user ?? null,
      loading,
      configured: isSupabaseConfigured,
      signInWithEmail,
      signUpWithEmail,
      signInWithGoogle,
      resetPassword,
      signOut,
    }),
    [session, loading, signInWithEmail, signUpWithEmail, signInWithGoogle, resetPassword, signOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
