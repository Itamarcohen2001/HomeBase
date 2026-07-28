import React, { useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, View } from 'react-native';
import { Link } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../src/context/AuthContext';
import { Body, Button, Card, Field, H1, Muted, Screen } from '../../src/ui';
import { colors, rtlRow, spacing } from '../../src/theme';

export default function SignIn() {
  const { signInWithEmail, signInWithGoogle, resetPassword } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [googleBusy, setGoogleBusy] = useState(false);

  async function onSubmit() {
    if (!email.trim() || !password) {
      Alert.alert('חסרים פרטים', 'יש להזין כתובת מייל וסיסמה');
      return;
    }
    setBusy(true);
    try {
      await signInWithEmail(email, password);
    } catch (e) {
      Alert.alert('לא הצלחנו להתחבר', e instanceof Error ? e.message : 'שגיאה לא ידועה');
    } finally {
      setBusy(false);
    }
  }

  async function onGoogle() {
    setGoogleBusy(true);
    try {
      await signInWithGoogle();
    } catch (e) {
      Alert.alert('התחברות עם Google נכשלה', e instanceof Error ? e.message : 'שגיאה לא ידועה');
    } finally {
      setGoogleBusy(false);
    }
  }

  async function onForgot() {
    if (!email.trim()) {
      Alert.alert('שכחת סיסמה?', 'יש להזין קודם את כתובת המייל בשדה למעלה');
      return;
    }
    try {
      await resetPassword(email);
      Alert.alert('נשלח מייל', 'שלחנו לך קישור לאיפוס הסיסמה');
    } catch (e) {
      Alert.alert('שגיאה', e instanceof Error ? e.message : 'שגיאה לא ידועה');
    }
  }

  return (
    <Screen>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={{ alignItems: 'center', marginTop: spacing.xxl, marginBottom: spacing.xl }}>
          <Ionicons name="home" size={52} color={colors.primary} />
          <H1 style={{ marginTop: spacing.sm }}>HomeBase</H1>
          <Muted>ניהול תקציב משק הבית, פשוט וברור</Muted>
        </View>

        <Card>
          <Field
            label="כתובת מייל"
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            keyboardType="email-address"
            textContentType="emailAddress"
            placeholder="you@example.com"
          />
          <Field
            label="סיסמה"
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            textContentType="password"
            placeholder="••••••••"
          />
          <Button title="התחברות" onPress={onSubmit} loading={busy} size="lg" />

          <View style={{ ...rtlRow, marginVertical: spacing.lg }}>
            <View style={{ flex: 1, height: 1, backgroundColor: colors.border }} />
            <Muted style={{ marginHorizontal: spacing.md }}>או</Muted>
            <View style={{ flex: 1, height: 1, backgroundColor: colors.border }} />
          </View>

          <Button
            title="התחברות עם Google"
            icon="logo-google"
            variant="secondary"
            onPress={onGoogle}
            loading={googleBusy}
          />

          <Button title="שכחתי סיסמה" variant="ghost" onPress={onForgot} style={{ marginTop: spacing.md }} />
        </Card>

        <View style={{ ...rtlRow, justifyContent: 'center', marginTop: spacing.md }}>
          <Muted>אין לך חשבון עדיין? </Muted>
          <Link href="/(auth)/sign-up">
            <Body style={{ color: colors.primary, fontWeight: '700' }}>הרשמה</Body>
          </Link>
        </View>
      </KeyboardAvoidingView>
    </Screen>
  );
}
