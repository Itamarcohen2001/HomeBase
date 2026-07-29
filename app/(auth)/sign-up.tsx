import React, { useState } from 'react';
import { KeyboardAvoidingView, Platform, View } from 'react-native';
import { Link, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../src/context/AuthContext';
import { Body, Button, Card, Field, H1, InlineMessage, Muted, Screen, useDialog } from '../../src/ui';
import { colors, rtlRow, spacing } from '../../src/theme';

export default function SignUp() {
  const { signUpWithEmail, signInWithGoogle } = useAuth();
  const { notify } = useDialog();
  const router = useRouter();
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [googleBusy, setGoogleBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit() {
    setError(null);
    if (!fullName.trim() || !email.trim() || password.length < 6) {
      setError('יש למלא שם, מייל וסיסמה באורך 6 תווים לפחות');
      return;
    }
    setBusy(true);
    try {
      const { needsConfirm } = await signUpWithEmail(email, password, fullName);
      if (needsConfirm) {
        await notify({
          title: 'כמעט סיימנו',
          message: 'שלחנו לך מייל לאימות הכתובת. אחרי האישור אפשר להתחבר.',
          tone: 'success',
        });
        router.replace('/(auth)/sign-in');
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'שגיאה לא ידועה');
    } finally {
      setBusy(false);
    }
  }

  async function onGoogle() {
    setError(null);
    setGoogleBusy(true);
    try {
      await signInWithGoogle();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'שגיאה לא ידועה');
    } finally {
      setGoogleBusy(false);
    }
  }

  return (
    <Screen>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={{ alignItems: 'center', marginTop: spacing.xl, marginBottom: spacing.lg }}>
          <Ionicons name="person-add" size={46} color={colors.primary} />
          <H1 style={{ marginTop: spacing.sm }}>יצירת חשבון</H1>
          <Muted>דקה אחת וסיימנו</Muted>
        </View>

        <Card>
          {error ? <InlineMessage tone="error">{error}</InlineMessage> : null}
          <Field
            label="השם שלך"
            value={fullName}
            onChangeText={(t) => {
              setFullName(t);
              setError(null);
            }}
            placeholder="ישראל ישראלי"
          />
          <Field
            label="כתובת מייל"
            value={email}
            onChangeText={(t) => {
              setEmail(t);
              setError(null);
            }}
            autoCapitalize="none"
            autoComplete="email"
            keyboardType="email-address"
            placeholder="you@example.com"
          />
          <Field
            label="סיסמה"
            value={password}
            onChangeText={(t) => {
              setPassword(t);
              setError(null);
            }}
            secureTextEntry
            autoComplete="new-password"
            placeholder="לפחות 6 תווים"
          />
          <Button title="הרשמה" onPress={onSubmit} loading={busy} size="lg" />
          <Button
            title="הרשמה עם Google"
            icon="logo-google"
            variant="secondary"
            onPress={onGoogle}
            loading={googleBusy}
            style={{ marginTop: spacing.md }}
          />
        </Card>

        <View style={{ ...rtlRow, gap: spacing.xs, justifyContent: 'center', marginTop: spacing.lg }}>
          <Muted>כבר יש לך חשבון?</Muted>
          <Link href="/(auth)/sign-in">
            <Body style={{ color: colors.primary, fontWeight: '700' }}>התחברות</Body>
          </Link>
        </View>
      </KeyboardAvoidingView>
    </Screen>
  );
}
