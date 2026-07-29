import React, { useMemo, useState } from 'react';
import { RefreshControl, View } from 'react-native';
import { useMonthData } from '../../src/hooks/useMonthData';
import { formatMoney, monthStart } from '../../src/lib/format';
import { splitByCategory, splitByPerson, totalOf } from '../../src/lib/analysis';
import type { AnalysisSlice } from '../../src/lib/types';
import {
  Body,
  Card,
  Donut,
  EmptyState,
  H2,
  H3,
  IconBubble,
  MonthNav,
  Muted,
  Screen,
} from '../../src/ui';
import { colors, rtlRow, spacing } from '../../src/theme';

function Legend({ slices }: { slices: AnalysisSlice[] }) {
  return (
    <View style={{ marginTop: spacing.lg }}>
      {slices.map((slice, i) => (
        <View
          key={slice.key}
          style={{
            ...rtlRow,
            gap: spacing.sm,
            justifyContent: 'space-between',
            paddingVertical: spacing.sm,
            borderTopWidth: i === 0 ? 0 : 1,
            borderTopColor: colors.border,
          }}
        >
          {/* minWidth:0 מאפשר לשם ארוך בעברית להתקצר במקום לדחוף את הסכום מהמסך */}
          <View style={{ ...rtlRow, gap: spacing.sm, flexShrink: 1, minWidth: 0 }}>
            <View
              style={{
                width: 12,
                height: 12,
                borderRadius: 4,
                backgroundColor: slice.color,
                flexGrow: 0,
                flexShrink: 0,
              }}
            />
            {slice.icon ? <IconBubble icon={slice.icon} color={slice.color} size={26} /> : null}
            <Body numberOfLines={1} style={{ fontWeight: '600', flexShrink: 1 }}>
              {slice.label}
            </Body>
          </View>
          <View style={{ ...rtlRow, gap: spacing.sm, flexGrow: 0, flexShrink: 0 }}>
            <Body style={{ fontWeight: '700' }}>{formatMoney(slice.amount)}</Body>
            <Muted style={{ fontSize: 12, minWidth: 34, textAlign: 'left' }}>{slice.percent}%</Muted>
          </View>
        </View>
      ))}
    </View>
  );
}

function ChartCard({
  title,
  subtitle,
  slices,
  emptyTitle,
  emptySubtitle,
  chartLabel,
  testID,
}: {
  title: string;
  subtitle: string;
  slices: AnalysisSlice[];
  emptyTitle: string;
  emptySubtitle: string;
  chartLabel: string;
  testID: string;
}) {
  const total = totalOf(slices);

  return (
    <Card testID={testID}>
      <H3>{title}</H3>
      <Muted style={{ marginTop: spacing.xs }}>{subtitle}</Muted>

      {slices.length === 0 ? (
        <EmptyState icon="pie-chart-outline" title={emptyTitle} subtitle={emptySubtitle} />
      ) : (
        <>
          <View style={{ alignItems: 'center', marginTop: spacing.lg }}>
            <Donut
              slices={slices}
              size={208}
              accessibilityLabel={`${chartLabel}: ${slices
                .map((s) => `${s.label} ${s.percent}%`)
                .join(', ')}`}
            >
              <Muted style={{ fontSize: 12, textAlign: 'center' }}>סה״כ</Muted>
              <Body numberOfLines={1} style={{ fontWeight: '800', textAlign: 'center' }}>
                {formatMoney(total)}
              </Body>
            </Donut>
          </View>
          <Legend slices={slices} />
        </>
      )}
    </Card>
  );
}

export default function Analysis() {
  const [month, setMonth] = useState(monthStart());
  const { transactions, summary, loading, reload } = useMonthData(month);

  const byCategory = useMemo(() => splitByCategory(transactions), [transactions]);
  const byPerson = useMemo(() => splitByPerson(transactions), [transactions]);

  return (
    <Screen refreshControl={<RefreshControl refreshing={loading} onRefresh={reload} tintColor={colors.primary} />}>
      <H2 style={{ marginBottom: spacing.md }}>ניתוח</H2>

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

      <ChartCard
        testID="hb-chart-categories"
        title="הוצאות לפי קטגוריה"
        subtitle="כל ההוצאות בחודש, כולל ההוצאות המשותפות"
        chartLabel="פיצול הוצאות לפי קטגוריה"
        slices={byCategory}
        emptyTitle="אין עדיין הוצאות בחודש הזה"
        emptySubtitle="ברגע שתוסיפו הוצאה היא תופיע כאן לפי קטגוריה"
      />

      <ChartCard
        testID="hb-chart-people"
        title="הוצאות לפי בני הבית"
        subtitle="הוצאה שסומנה כמשותפת מרוכזת בפרוסת ״משותף״ ולא נזקפת לאף אחד"
        chartLabel="פיצול הוצאות לפי בני הבית"
        slices={byPerson}
        emptyTitle="אין עדיין הוצאות בחודש הזה"
        emptySubtitle="הפיצול בין בני הבית יופיע כאן אחרי ההוצאה הראשונה"
      />
    </Screen>
  );
}
