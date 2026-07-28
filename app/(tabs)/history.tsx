import React, { useMemo, useState } from 'react';
import { Pressable, RefreshControl, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useMonthData } from '../../src/hooks/useMonthData';
import { addMonths, formatDate, formatMoney, monthLabel, monthStart } from '../../src/lib/format';
import type { Kind } from '../../src/lib/types';
import { Body, Card, EmptyState, H2, IconBubble, Muted, Screen } from '../../src/ui';
import { colors, radius, rtlRow, spacing } from '../../src/theme';

type Filter = 'all' | Kind;

export default function History() {
  const router = useRouter();
  const [month, setMonth] = useState(monthStart());
  const [filter, setFilter] = useState<Filter>('all');
  const { transactions, summary, loading, reload } = useMonthData(month);

  const rows = useMemo(
    () => (filter === 'all' ? transactions : transactions.filter((t) => t.kind === filter)),
    [transactions, filter],
  );

  const isCurrentMonth = month === monthStart();

  return (
    <Screen refreshControl={<RefreshControl refreshing={loading} onRefresh={reload} tintColor={colors.primary} />}>
      <H2 style={{ marginBottom: spacing.md }}>תנועות</H2>

      {/* ניווט בין חודשים */}
      <Card style={{ paddingVertical: spacing.md }}>
        <View style={{ ...rtlRow, justifyContent: 'space-between' }}>
          <Pressable onPress={() => setMonth(addMonths(month, -1))} hitSlop={10}>
            <Ionicons name="chevron-forward" size={22} color={colors.primary} />
          </Pressable>
          <Body style={{ fontWeight: '700' }}>{monthLabel(month)}</Body>
          <Pressable onPress={() => !isCurrentMonth && setMonth(addMonths(month, 1))} hitSlop={10} disabled={isCurrentMonth}>
            <Ionicons name="chevron-back" size={22} color={isCurrentMonth ? colors.border : colors.primary} />
          </Pressable>
        </View>
        <View style={{ ...rtlRow, justifyContent: 'space-between', marginTop: spacing.md }}>
          <Muted>הכנסות {formatMoney(summary?.income ?? 0)}</Muted>
          <Muted>הוצאות {formatMoney(summary?.expense ?? 0)}</Muted>
          <Muted style={{ color: (summary?.balance ?? 0) < 0 ? colors.danger : colors.primary, fontWeight: '700' }}>
            יתרה {formatMoney(summary?.balance ?? 0)}
          </Muted>
        </View>
      </Card>

      {/* פילטר */}
      <View style={{ ...rtlRow, gap: spacing.sm, marginBottom: spacing.md }}>
        {([
          ['all', 'הכול'],
          ['expense', 'הוצאות'],
          ['income', 'הכנסות'],
        ] as [Filter, string][]).map(([key, label]) => (
          <Pressable
            key={key}
            onPress={() => setFilter(key)}
            style={{
              paddingHorizontal: spacing.lg,
              paddingVertical: 8,
              borderRadius: radius.pill,
              backgroundColor: filter === key ? colors.primary : colors.surface,
              borderWidth: 1,
              borderColor: filter === key ? colors.primary : colors.border,
            }}
          >
            <Text style={{ fontWeight: '700', fontSize: 13, color: filter === key ? colors.white : colors.textMuted }}>
              {label}
            </Text>
          </Pressable>
        ))}
      </View>

      <Card>
        {rows.length === 0 ? (
          <EmptyState icon="receipt-outline" title="אין תנועות להצגה" subtitle="נסה חודש אחר או הוסף תנועה" />
        ) : (
          rows.map((t, i) => (
            <Pressable
              key={t.id}
              onPress={() => router.push({ pathname: '/transaction/[id]', params: { id: t.id } })}
              style={{
                ...rtlRow,
                justifyContent: 'space-between',
                paddingVertical: spacing.md,
                borderTopWidth: i === 0 ? 0 : 1,
                borderTopColor: colors.border,
              }}
            >
              <View style={rtlRow}>
                <IconBubble icon={t.categories?.icon ?? 'pricetag'} color={t.categories?.color ?? colors.textFaint} size={36} />
                <View style={{ marginRight: spacing.md, flexShrink: 1 }}>
                  <Body style={{ fontWeight: '600' }}>{t.categories?.name ?? 'ללא קטגוריה'}</Body>
                  <Muted style={{ fontSize: 12 }} numberOfLines={1}>
                    {formatDate(t.occurred_on)} · {t.profiles?.full_name ?? t.profiles?.email ?? 'לא ידוע'}
                    {t.recurring_rule_id ? ' · קבועה' : ''}
                    {t.note ? ` · ${t.note}` : ''}
                  </Muted>
                </View>
              </View>
              <Body style={{ fontWeight: '700', color: t.kind === 'income' ? colors.income : colors.text }}>
                {t.kind === 'income' ? '+' : ''}
                {formatMoney(t.amount_agorot)}
              </Body>
            </Pressable>
          ))
        )}
      </Card>
    </Screen>
  );
}
