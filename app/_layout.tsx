import React, { useEffect } from 'react';
import { I18nManager, View } from 'react-native';
import { Stack, useRouter, useSegments } from 'expo-router';
import Head from 'expo-router/head';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AuthProvider, useAuth } from '../src/context/AuthContext';
import { HouseholdProvider, useHousehold } from '../src/context/HouseholdContext';
import { Loading } from '../src/ui';
import { colors } from '../src/theme';

// אנחנו מיישרים ידנית ל-RTL בכל רכיב (textAlign / row-reverse),
// כדי שההתנהגות תהיה זהה ב-iOS וב-Android ב-Expo Go ללא צורך בהפעלה מחדש.
I18nManager.allowRTL(false);

function Gate() {
  const { session, loading: authLoading, configured } = useAuth();
  const { householdId, loading: hhLoading } = useHousehold();
  const segments = useSegments();
  const router = useRouter();

  const busy = authLoading || (Boolean(session) && hhLoading);

  useEffect(() => {
    if (busy) return;

    const group = segments[0];
    const inAuth = group === '(auth)';
    const inSetup = group === 'setup';
    const inWelcome = group === 'welcome';

    if (!configured) {
      if (!inWelcome) router.replace('/welcome');
      return;
    }
    if (!session) {
      if (!inAuth) router.replace('/(auth)/sign-in');
      return;
    }
    if (!householdId) {
      if (!inSetup) router.replace('/setup');
      return;
    }
    const atRoot = (segments as unknown as string[]).length === 0;
    if (inAuth || inSetup || inWelcome || atRoot) {      router.replace('/(tabs)');
    }
  }, [busy, configured, session, householdId, segments, router]);

  if (busy) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg }}>
        <Loading />
      </View>
    );
  }

  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bg } }}>
      <Stack.Screen name="add" options={{ presentation: 'modal' }} />
    </Stack>
  );
}

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <Head>
        <title>HomeBase — תקציב משק הבית</title>
      </Head>
      <StatusBar style="dark" />
      <AuthProvider>
        <HouseholdProvider>
          <Gate />
        </HouseholdProvider>
      </AuthProvider>
    </SafeAreaProvider>
  );
}
