import React from 'react';
import { Alert, Pressable, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../src/context/AuthContext';
import { useHousehold } from '../../src/context/HouseholdContext';
import { Body, Card, H2, IconBubble, Muted, Screen } from '../../src/ui';
import { colors, rtlRow, spacing } from '../../src/theme';

type Row = {
  icon: keyof typeof Ionicons.glyphMap;
  color: string;
  title: string;
  subtitle: string;
  href: string;
};

const ROWS: Row[] = [
  { icon: 'pricetags', color: '#4F7FE4', title: 'קטגוריות', subtitle: 'הוספה, עריכה ומחיקה', href: '/categories' },
  { icon: 'repeat', color: '#E4894F', title: 'הוצאות קבועות', subtitle: 'שכירות, ארנונה, מנויים', href: '/recurring' },
  { icon: 'people', color: '#9B6BDF', title: 'בני הבית', subtitle: 'חברים והזמנות למייל', href: '/members' },
  { icon: 'settings', color: '#5BC0BE', title: 'הגדרות', subtitle: 'שם משק הבית וחשבון', href: '/settings' },
];

export default function More() {
  const router = useRouter();
  const { user, signOut } = useAuth();
  const { household } = useHousehold();

  return (
    <Screen>
      <H2 style={{ marginBottom: spacing.lg }}>עוד</H2>

      <Card>
        <View style={rtlRow}>
          <IconBubble icon="home" color={colors.primary} size={46} />
          <View style={{ marginRight: spacing.md }}>
            <Body style={{ fontWeight: '700' }}>{household?.name ?? 'משק הבית שלי'}</Body>
            <Muted>{user?.email}</Muted>
          </View>
        </View>
      </Card>

      <Card style={{ paddingVertical: spacing.xs }}>
        {ROWS.map((row, i) => (
          <Pressable
            key={row.href}
            onPress={() => router.push(row.href as never)}
            style={{
              ...rtlRow,
              justifyContent: 'space-between',
              paddingVertical: spacing.md,
              borderTopWidth: i === 0 ? 0 : 1,
              borderTopColor: colors.border,
            }}
          >
            <View style={rtlRow}>
              <IconBubble icon={row.icon} color={row.color} size={38} />
              <View style={{ marginRight: spacing.md }}>
                <Body style={{ fontWeight: '600' }}>{row.title}</Body>
                <Muted style={{ fontSize: 12 }}>{row.subtitle}</Muted>
              </View>
            </View>
            <Ionicons name="chevron-back" size={18} color={colors.textFaint} />
          </Pressable>
        ))}
      </Card>

      <Card
        onPress={() =>
          Alert.alert('התנתקות', 'להתנתק מהחשבון?', [
            { text: 'ביטול', style: 'cancel' },
            { text: 'התנתקות', style: 'destructive', onPress: () => void signOut() },
          ])
        }
      >
        <View style={rtlRow}>
          <Ionicons name="log-out-outline" size={20} color={colors.danger} />
          <Body style={{ marginRight: spacing.sm, color: colors.danger, fontWeight: '700' }}>התנתקות</Body>
        </View>
      </Card>
    </Screen>
  );
}
