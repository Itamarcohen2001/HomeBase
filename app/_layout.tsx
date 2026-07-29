import React, { useEffect } from 'react';
import { I18nManager, View } from 'react-native';
import { Stack, useRootNavigationState, useRouter, useSegments } from 'expo-router';
import Head from 'expo-router/head';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AuthProvider, useAuth } from '../src/context/AuthContext';
import { HouseholdProvider, useHousehold } from '../src/context/HouseholdContext';
import { DialogProvider, Loading } from '../src/ui';
import { colors } from '../src/theme';

// אנחנו מיישרים ידנית ל-RTL בכל רכיב (textAlign / row-reverse),
// כדי שההתנהגות תהיה זהה ב-iOS, ב-Android ובוובי. ראה גם app/+html.tsx.
I18nManager.allowRTL(false);

function Gate() {
  const { session, loading: authLoading, configured } = useAuth();
  const { householdId, loading: hhLoading } = useHousehold();
  const segments = useSegments();
  const router = useRouter();
  const navigationState = useRootNavigationState();

  const busy = authLoading || (Boolean(session) && hhLoading);
  // לפני שה-navigator עלה, useSegments() מחזיר מערך ריק — וכל ניתוב שנעשה
  // בשלב הזה גם נכשל וגם "מוחק" את הכתובת שאליה המשתמש ניסה להיכנס.
  const navigatorReady = Boolean(navigationState?.key);

  useEffect(() => {
    if (busy || !navigatorReady) return;

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
    // משתמש מחובר עם משק בית: רק מסכי הכניסה ומסך הפתיחה מנתבים הלאה.
    // כל שאר הכתובות (כולל רענון על /budgets או /settings) נשארות במקומן.
    const atRoot = (segments as unknown as string[]).length === 0;
    if (inAuth || inSetup || inWelcome || atRoot) {
      router.replace('/(tabs)');
    }
  }, [busy, navigatorReady, configured, session, householdId, segments, router]);

  // ה-Stack מרונדר תמיד. אם מחליפים אותו במסך טעינה, ה-navigator מתפרק בכל
  // שינוי מצב, הכתובת הנוכחית הולכת לאיבוד ורענון במסך פנימי זורק לדף הבית.
  return (
    <>
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bg } }}>
        <Stack.Screen name="add" options={{ presentation: 'modal' }} />
      </Stack>
      {busy ? (
        <View
          style={{ position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, backgroundColor: colors.bg }}
        >
          <Loading />
        </View>
      ) : null}
    </>
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
          <DialogProvider>
            <Gate />
          </DialogProvider>
        </HouseholdProvider>
      </AuthProvider>
    </SafeAreaProvider>
  );
}
