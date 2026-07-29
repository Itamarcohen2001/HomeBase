import React, { useMemo, useState } from 'react';
import { Pressable, RefreshControl, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useMonthData } from '../../src/hooks/useMonthData';
import { formatDate, formatMoney, monthStart } from '../../src/lib/format';
import type { Kind } from '../../src/lib/types';
import { Badge, Body, Card, EmptyState, H2, IconBubble, Muted, MonthNav, Screen } from '../../src/ui';
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
  return (
    <Screen refreshControl={<RefreshControl refreshing={loading} onRefresh={reload} tintColor={colors.primary} />}>
      <H2 style={{ marginBottom: spacing.md }}>תנועות</H2>

      {/* ניווט בין חודשים — ב-RTL: "הקודם" בימין, "הבא" בשמאל */}
      <Card style={{ paddingVertical: spacing.md }}>
        <MonthNav month={month} onChange={setMonth}>
          <View style={{ ...rtlRow, gap: spacing.sm, justifyContent: 'space-between', marginTop: spacing.md }}>
            <Muted>הכנסות {formatMoney(summary?.income ?? 0)}</Muted>
            <Muted>הוצאות {formatMoney(summary?.expense ?? 0)}</Muted>
            <Muted style={{ color: (summary?.balance ?? 0) < 0 ? colors.danger : colors.primary, fontWeight: '700' }}>
              יתרה {formatMoney(summary?.balance ?? 0)}
            </Muted>
          </View>
        </MonthNav>
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
            accessibilityRole="button"
            accessibilityState={{ selected: filter === key }}
            onPress={() => setFilter(key)}
            style={{
              paddingHorizontal: spacing.lg,
              paddingVertical: spacing.sm,
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
              accessibilityRole="button"
              accessibilityLabel={`עריכת תנועה ${t.categories?.name ?? ''}`}
              onPress={() => router.push({ pathname: '/transaction/[id]', params: { id: t.id } })}
              style={{
                ...rtlRow,
                gap: spacing.sm,
                justifyContent: 'space-between',
                paddingVertical: spacing.md,
                borderTopWidth: i === 0 ? 0 : 1,
                borderTopColor: colors.border,
              }}
            >
              <View style={{ ...rtlRow, gap: spacing.md, flexShrink: 1, minWidth: 0 }}>
                <IconBubble icon={t.categories?.icon ?? 'pricetag'} color={t.categories?.color ?? colors.textFaint} size={36} />
                <View style={{ flexShrink: 1, minWidth: 0 }}>
                  <View style={{ ...rtlRow, gap: spacing.xs + 2 }}>
                    <Body numberOfLines={1} style={{ fontWeight: '600', flexShrink: 1 }}>
                      {t.categories?.name ?? 'ללא קטגוריה'}
                    </Body>
                    {t.is_shared ? <Badge icon="people" color={colors.primary}>משותף</Badge> : null}
                  </View>
                  <Muted style={{ fontSize: 12 }} numberOfLines={1}>
                    {formatDate(t.occurred_on)} · {t.profiles?.full_name ?? t.profiles?.email ?? 'לא ידוע'}
                    {t.recurring_rule_id ? ' · קבועה' : ''}
                    {t.note ? ` · ${t.note}` : ''}
                  </Muted>
                </View>
              </View>
              <Body style={{ fontWeight: '700', color: t.kind === 'income' ? colors.income : colors.text }}>
                {formatMoney(t.amount_agorot, { signed: t.kind === 'income' })}
              </Body>
            </Pressable>
          ))
        )}
      </Card>
    </Screen>
  );
}
