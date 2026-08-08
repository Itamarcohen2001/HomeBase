import { useTheme } from '../../src/context/ThemeContext';
import React, { useState } from 'react';
import { Pressable, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../src/context/AuthContext';
import { useHousehold } from '../../src/context/HouseholdContext';
import {  Body, Card, H2, IconBubble, InlineMessage, Muted, Screen, useDialog , GlobalHeaderActions } from '../../src/ui';
import { rtlRow, spacing } from '../../src/theme';
import { errorText } from '../../src/lib/authErrors';

type Row = {
  icon: keyof typeof Ionicons.glyphMap;
  color: string;
  title: string;
  subtitle: string;
  href: string;
};

const ROWS: Row[] = [
  { icon: 'flag', color: '#2E9E6B', title: 'יעדים', subtitle: 'יעד חודשי לכל קטגוריה', href: '/budgets' },
  { icon: 'pricetags', color: '#4F7FE4', title: 'קטגוריות', subtitle: 'הוספה, עריכה ומחיקה', href: '/categories' },
  { icon: 'repeat', color: '#E4894F', title: 'הוצאות קבועות', subtitle: 'שכירות, ארנונה, מנויים', href: '/recurring' },
  { icon: 'cloud-upload', color: '#4F8FE4', title: 'ייבוא מהבנק', subtitle: 'קובץ דוח אשראי מהבנק', href: '/import' },
  { icon: 'people', color: '#9B6BDF', title: 'בני הבית', subtitle: 'חברים והזמנות למייל', href: '/members' },
  { icon: 'settings', color: '#5BC0BE', title: 'הגדרות', subtitle: 'שם משק הבית וחשבון', href: '/settings' },
];

export default function More() {
  const { colors } = useTheme();
  const router = useRouter();
  const { user, signOut } = useAuth();
  const { household } = useHousehold();
  const { confirm } = useDialog();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSignOut() {
    setError(null);
    const approved = await confirm({
      title: 'התנתקות',
      message: 'להתנתק מהחשבון?',
      confirmText: 'התנתקות',
      cancelText: 'ביטול',
      destructive: true,
    });
    if (!approved) return;
    setBusy(true);
    try {
      await signOut();
    } catch (e) {
      setError(errorText(e, 'לא הצלחנו להתנתק'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen>
      <H2 style={{ marginBottom: spacing.lg }}>עוד</H2>

      <Card>
        <View style={{ ...rtlRow, gap: spacing.md }}>
          <IconBubble icon="home" color={colors.primary} size={46} />
          <View style={{ flexShrink: 1, minWidth: 0 }}>
            <Body style={{ fontWeight: '700' }}>{household?.name ?? 'משק הבית שלי'}</Body>
            <Muted numberOfLines={1}>{user?.email}</Muted>
          </View>
        </View>
      </Card>

      <Card style={{ paddingVertical: spacing.xs }}>
        {ROWS.map((row, i) => (
          <Pressable
            key={row.href}
            accessibilityRole="button"
            accessibilityLabel={row.title}
            onPress={() => router.push(row.href as never)}
            style={{
              ...rtlRow,
              justifyContent: 'space-between',
              paddingVertical: spacing.md,
              borderTopWidth: i === 0 ? 0 : 1,
              borderTopColor: colors.border,
            }}
          >
            <View style={{ ...rtlRow, gap: spacing.md, flexShrink: 1, minWidth: 0 }}>
              <IconBubble icon={row.icon} color={row.color} size={38} />
              <View style={{ flexShrink: 1, minWidth: 0 }}>
                <Body style={{ fontWeight: '600' }}>{row.title}</Body>
                <Muted style={{ fontSize: 12 }}>{row.subtitle}</Muted>
              </View>
            </View>
            <Ionicons name="chevron-back" size={18} color={colors.textFaint} />
          </Pressable>
        ))}
      </Card>

      {error ? <InlineMessage tone="error">{error}</InlineMessage> : null}

      <Card onPress={busy ? undefined : onSignOut} accessibilityLabel="התנתקות" testID="hb-signout">
        <View style={{ ...rtlRow, gap: spacing.sm }}>
          <Ionicons name="log-out-outline" size={20} color={colors.danger} />
          <Body style={{ color: colors.danger, fontWeight: '700' }}>
            {busy ? 'מתנתק…' : 'התנתקות'}
          </Body>
        </View>
      </Card>
    </Screen>
  );
}
