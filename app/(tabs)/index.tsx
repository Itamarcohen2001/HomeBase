import React, { useMemo } from 'react';
import { Pressable, RefreshControl, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useHousehold } from '../../src/context/HouseholdContext';
import { useMonthData } from '../../src/hooks/useMonthData';
import { daysLeftInMonth, formatDate, formatMoney, monthLabel, monthStart } from '../../src/lib/format';
import { Body, Card, EmptyState, H2, H3, IconBubble, Muted, ProgressBar, Screen } from '../../src/ui';
import { colors, radius, rtlRow, rtlText, shadow, spacing } from '../../src/theme';

export default function Home() {
  const router = useRouter();
  const month = monthStart();
  const { household } = useHousehold();
  const { summary, transactions, loading, error, reload } = useMonthData(month);

  const recent = useMemo(() => transactions.slice(0, 5), [transactions]);
  const remaining = summary?.remaining ?? 0;
  const hasTarget = (summary?.overallBudget ?? 0) > 0 || (summary?.income ?? 0) > 0;
  const spentRatio = summary && summary.overallBudget > 0 ? summary.expense / summary.overallBudget : 0;

  return (
    <>
      <Screen refreshControl={<RefreshControl refreshing={loading} onRefresh={reload} tintColor={colors.primary} />}>
        <View style={{ ...rtlRow, justifyContent: 'space-between', marginBottom: spacing.lg }}>
          <View>
            <H2>{household?.name ?? 'משק הבית שלי'}</H2>
            <Muted>{monthLabel(month)}</Muted>
          </View>
          <Pressable onPress={() => router.push('/(tabs)/more')} hitSlop={10}>
            <IconBubble icon="person-circle" color={colors.primary} size={38} />
          </Pressable>
        </View>

        {error ? (
          <Card style={{ backgroundColor: colors.dangerSoft }}>
            <Body style={{ color: colors.danger }}>{error}</Body>
          </Card>
        ) : null}

        {/* כמה נשאר לי החודש */}
        <Card style={{ paddingVertical: spacing.xl }}>
          <Muted style={{ marginBottom: spacing.xs }}>כמה נשאר לי החודש</Muted>
          <Text
            style={{
              ...rtlText,
              fontSize: 46,
              fontWeight: '800',
              color: remaining < 0 ? colors.danger : colors.primary,
            }}
          >
            {formatMoney(remaining)}
          </Text>
          {hasTarget ? (
            <View style={{ marginTop: spacing.md }}>
              <ProgressBar ratio={spentRatio || (summary && summary.income > 0 ? summary.expense / summary.income : 0)} />
              <View style={{ ...rtlRow, justifyContent: 'space-between', marginTop: spacing.sm }}>
                <Muted>הוצאת {formatMoney(summary?.expense ?? 0)}</Muted>
                <Muted>נשארו {daysLeftInMonth()} ימים בחודש</Muted>
              </View>
            </View>
          ) : (
            <Muted style={{ marginTop: spacing.sm }}>
              כדי לראות כמה נשאר, הגדר יעד חודשי במסך "יעדים"
            </Muted>
          )}
        </Card>

        {/* הכנסות / הוצאות / חיסכון */}
        <View style={{ ...rtlRow, gap: spacing.md, marginBottom: spacing.md }}>
          <StatCard label="הכנסות" value={formatMoney(summary?.income ?? 0)} color={colors.income} icon="arrow-down-circle" />
          <StatCard label="הוצאות" value={formatMoney(summary?.expense ?? 0)} color={colors.expense} icon="arrow-up-circle" />
        </View>
        <Card>
          <View style={{ ...rtlRow, justifyContent: 'space-between' }}>
            <Body style={{ fontWeight: '700' }}>יתרה החודש</Body>
            <Body style={{ fontWeight: '800', color: (summary?.balance ?? 0) < 0 ? colors.danger : colors.primary }}>
              {formatMoney(summary?.balance ?? 0)}
            </Body>
          </View>
          <View style={{ ...rtlRow, justifyContent: 'space-between', marginTop: spacing.sm }}>
            <Muted>אחוז חיסכון</Muted>
            <Muted>{summary?.savingRate ?? 0}%</Muted>
          </View>
        </Card>

        {/* התקדמות לפי קטגוריות */}
        <H3 style={{ marginTop: spacing.md, marginBottom: spacing.sm }}>התקדמות לפי קטגוריות</H3>
        {summary && summary.byCategory.length > 0 ? (
          <Card>
            {summary.byCategory.map((row, i) => {
              const ratio = row.budget > 0 ? row.spent / row.budget : 0;
              return (
                <View key={row.category.id} style={{ marginTop: i === 0 ? 0 : spacing.lg }}>
                  <View style={{ ...rtlRow, justifyContent: 'space-between', marginBottom: 6 }}>
                    <View style={rtlRow}>
                      <IconBubble icon={row.category.icon} color={row.category.color} size={30} />
                      <Body style={{ marginRight: spacing.sm, fontWeight: '600' }}>{row.category.name}</Body>
                    </View>
                    <Muted>
                      {row.budget > 0
                        ? `${formatMoney(row.spent)} מתוך ${formatMoney(row.budget)}`
                        : formatMoney(row.spent)}
                    </Muted>
                  </View>
                  <ProgressBar ratio={ratio} color={row.category.color} />
                </View>
              );
            })}
          </Card>
        ) : (
          <Card>
            <EmptyState
              icon="flag-outline"
              title="עוד לא הוגדרו יעדים"
              subtitle="קבע יעד לכל קטגוריה כדי לעקוב אחרי ההתקדמות"
            />
          </Card>
        )}

        {/* תנועות אחרונות */}
        <View style={{ ...rtlRow, justifyContent: 'space-between', marginTop: spacing.md, marginBottom: spacing.sm }}>
          <H3>התנועות האחרונות</H3>
          <Pressable onPress={() => router.push('/(tabs)/history')} hitSlop={8}>
            <Muted style={{ color: colors.primary, fontWeight: '700' }}>הכול</Muted>
          </Pressable>
        </View>
        <Card>
          {recent.length === 0 ? (
            <EmptyState icon="receipt-outline" title="אין תנועות החודש" subtitle="הוסף את ההוצאה הראשונה" />
          ) : (
            recent.map((t, i) => (
              <Pressable
                key={t.id}
                onPress={() => router.push({ pathname: '/transaction/[id]', params: { id: t.id } })}
                style={{ ...rtlRow, justifyContent: 'space-between', paddingVertical: spacing.sm, borderTopWidth: i === 0 ? 0 : 1, borderTopColor: colors.border }}
              >
                <View style={rtlRow}>
                  <IconBubble icon={t.categories?.icon ?? 'pricetag'} color={t.categories?.color ?? colors.textFaint} size={34} />
                  <View style={{ marginRight: spacing.md }}>
                    <Body style={{ fontWeight: '600' }}>{t.categories?.name ?? 'ללא קטגוריה'}</Body>
                    <Muted style={{ fontSize: 12 }}>
                      {formatDate(t.occurred_on)} · {t.profiles?.full_name ?? t.profiles?.email ?? 'לא ידוע'}
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

      {/* כפתור הוספה מהירה */}
      <Pressable
        onPress={() => router.push('/add')}
        style={({ pressed }) => [
          {
            position: 'absolute',
            bottom: 24,
            alignSelf: 'center',
            backgroundColor: colors.primary,
            paddingHorizontal: spacing.xl,
            paddingVertical: 16,
            borderRadius: radius.pill,
            ...shadow.floating,
          },
          pressed && { opacity: 0.85 },
        ]}
      >
        <View style={rtlRow}>
          <Ionicons name="add" size={24} color={colors.white} />
          <Text style={{ color: colors.white, fontWeight: '800', fontSize: 17, marginRight: 6 }}>
            הוספת הוצאה
          </Text>
        </View>
      </Pressable>
    </>
  );
}

function StatCard({
  label,
  value,
  color,
  icon,
}: {
  label: string;
  value: string;
  color: string;
  icon: keyof typeof import('@expo/vector-icons').Ionicons.glyphMap;
}) {
  return (
    <Card style={{ flex: 1, marginBottom: 0 }}>
      <View style={rtlRow}>
        <Ionicons name={icon} size={18} color={color} />
        <Muted style={{ marginRight: 6 }}>{label}</Muted>
      </View>
      <Body style={{ fontWeight: '800', fontSize: 19, marginTop: 6 }}>{value}</Body>
    </Card>
  );
}
