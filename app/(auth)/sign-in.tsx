import React, { useState } from 'react';
import { KeyboardAvoidingView, Platform, View } from 'react-native';
import { Link } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../src/context/AuthContext';
import { Body, Button, Card, Field, H1, InlineMessage, Muted, Screen, TextLink } from '../../src/ui';
import { colors, rtlRow, spacing } from '../../src/theme';
import { errorText } from '../../src/lib/authErrors';

export default function SignIn() {
  const { signInWithEmail, signInWithGoogle, resetPassword } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [googleBusy, setGoogleBusy] = useState(false);
  // הודעות מוצגות בתוך המסך. Alert של react-native לא מרנדר כלום בדפדפן,
  // ולכן בעבר התחברות עם סיסמה שגויה פשוט לא הגיבה.
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  function reset() {
    setError(null);
    setInfo(null);
  }

  async function onSubmit() {
    reset();
    if (!email.trim() || !password) {
      setError('יש להזין כתובת מייל וסיסמה');
      return;
    }
    setBusy(true);
    try {
      await signInWithEmail(email, password);
    } catch (e) {
      setError(errorText(e, 'שגיאה לא ידועה'));
    } finally {
      setBusy(false);
    }
  }

  async function onGoogle() {
    reset();
    setGoogleBusy(true);
    try {
      await signInWithGoogle();
    } catch (e) {
      setError(errorText(e, 'שגיאה לא ידועה'));
    } finally {
      // חובה לאפס גם כשההתחברות מצליחה ומנווטת — אחרת הכפתור נתקע ב-loading
      setGoogleBusy(false);
    }
  }

  async function onForgot() {
    reset();
    if (!email.trim()) {
      setError('יש להזין קודם את כתובת המייל בשדה למעלה');
      return;
    }
    try {
      await resetPassword(email);
      setInfo('שלחנו לך מייל עם קישור לאיפוס הסיסמה');
    } catch (e) {
      setError(errorText(e, 'שגיאה לא ידועה'));
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
          {error ? <InlineMessage tone="error">{error}</InlineMessage> : null}
          {info ? <InlineMessage tone="success">{info}</InlineMessage> : null}

          <Field
            label="כתובת מייל"
            value={email}
            onChangeText={(t) => {
              setEmail(t);
              reset();
            }}
            autoCapitalize="none"
            autoComplete="email"
            keyboardType="email-address"
            textContentType="emailAddress"
            placeholder="you@example.com"
          />
          <Field
            label="סיסמה"
            value={password}
            onChangeText={(t) => {
              setPassword(t);
              reset();
            }}
            secureTextEntry
            autoComplete="current-password"
            textContentType="password"
            placeholder="••••••••"
          />
          <Button title="התחברות" onPress={onSubmit} loading={busy} size="lg" />

          <TextLink
            title="שכחתי סיסמה"
            onPress={onForgot}
            color={colors.textMuted}
            style={{ marginTop: spacing.md }}
          />

          <View style={{ ...rtlRow, gap: spacing.md, marginVertical: spacing.lg }}>
            <View style={{ flex: 1, height: 1, backgroundColor: colors.border }} />
            <Muted>או</Muted>
            <View style={{ flex: 1, height: 1, backgroundColor: colors.border }} />
          </View>

          <Button
            title="התחברות עם Google"
            icon="logo-google"
            variant="secondary"
            onPress={onGoogle}
            loading={googleBusy}
          />
        </Card>

        <View style={{ ...rtlRow, gap: spacing.xs, justifyContent: 'center', marginTop: spacing.lg }}>
          <Muted>אין לך חשבון עדיין?</Muted>
          <Link href="/(auth)/sign-up">
            <Body style={{ color: colors.primary, fontWeight: '700' }}>הרשמה</Body>
          </Link>
        </View>
      </KeyboardAvoidingView>
    </Screen>
  );
}
