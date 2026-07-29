import React, { useEffect, useMemo, useState } from 'react';
import { RefreshControl, View } from 'react-native';
import { useHousehold } from '../../src/context/HouseholdContext';
import { useMonthData } from '../../src/hooks/useMonthData';
import * as db from '../../src/lib/db';
import { formatMoney, monthLabel, monthStart, shekelsToAgorot } from '../../src/lib/format';
import {
  AmountInput,
  Body,
  Button,
  Card,
  H2,
  IconBubble,
  InlineMessage,
  Muted,
  ProgressBar,
  Screen,
  SectionTitle,
} from '../../src/ui';
import { colors, rtlRow, spacing } from '../../src/theme';

export default function Budgets() {
  const month = monthStart();
  const { householdId, bumpVersion } = useHousehold();
  const { categories, budgets, summary, loading, reload } = useMonthData(month);

  const [overall, setOverall] = useState('');
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: 'error' | 'success'; text: string } | null>(null);

  const budgetByCategory = useMemo(() => {
    const map = new Map<string, number>();
    for (const b of budgets) if (b.category_id) map.set(b.category_id, b.amount_agorot);
    return map;
  }, [budgets]);

  useEffect(() => {
    setOverall(summary && summary.overallBudget > 0 ? String(summary.overallBudget / 100) : '');
    const next: Record<string, string> = {};
    for (const [id, v] of budgetByCategory) next[id] = String(v / 100);
    setDrafts(next);
  }, [summary?.overallBudget, budgetByCategory]);

  const expenseCategories = useMemo(() => categories.filter((c) => c.kind === 'expense'), [categories]);

  const totalCategoryBudgets = useMemo(
    () => Object.values(drafts).reduce((sum, v) => sum + shekelsToAgorot(v || '0'), 0),
    [drafts],
  );

  async function onSave() {
    if (!householdId) return;
    setBusy(true);
    setMessage(null);
    try {
      await db.setBudget(householdId, month, null, shekelsToAgorot(overall || '0'));
      for (const c of expenseCategories) {
        const value = shekelsToAgorot(drafts[c.id] ?? '0');
        const current = budgetByCategory.get(c.id) ?? 0;
        if (value !== current) await db.setBudget(householdId, month, c.id, value);
      }
      bumpVersion();
      await reload();
      setMessage({ tone: 'success', text: 'היעדים נשמרו ויתגלגלו אוטומטית לחודש הבא' });
    } catch (e) {
      setMessage({ tone: 'error', text: e instanceof Error ? e.message : 'לא הצלחנו לשמור' });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen refreshControl={<RefreshControl refreshing={loading} onRefresh={reload} tintColor={colors.primary} />}>
      <H2>יעדים</H2>
      <Muted style={{ marginBottom: spacing.lg }}>{monthLabel(month)} · היעדים מתגלגלים אוטומטית לחודש הבא</Muted>

      {message ? <InlineMessage tone={message.tone}>{message.text}</InlineMessage> : null}

      <Card>
        <Body style={{ fontWeight: '700', marginBottom: spacing.sm }}>יעד כללי לחודש</Body>
        <AmountInput value={overall} onChangeText={setOverall} size="lg" />
        {summary && summary.overallBudget > 0 ? (
          <View style={{ marginTop: spacing.md }}>
            <ProgressBar ratio={summary.expense / summary.overallBudget} />
            <Muted style={{ marginTop: spacing.xs }}>
              הוצאת {formatMoney(summary.expense)} מתוך {formatMoney(summary.overallBudget)}
            </Muted>
          </View>
        ) : null}
        <Muted style={{ marginTop: spacing.md }}>
          סכום יעדי הקטגוריות: {formatMoney(totalCategoryBudgets)}
        </Muted>
      </Card>

      <SectionTitle>יעד לכל קטגוריה</SectionTitle>
      <Card>
        {expenseCategories.map((c, i) => {
          const spent = summary?.byCategory.find((r) => r.category.id === c.id)?.spent ?? 0;
          const budget = shekelsToAgorot(drafts[c.id] ?? '0');
          return (
            <View
              key={c.id}
              style={{
                paddingVertical: spacing.md,
                borderTopWidth: i === 0 ? 0 : 1,
                borderTopColor: colors.border,
              }}
            >
              <View style={{ ...rtlRow, gap: spacing.md, justifyContent: 'space-between' }}>
                {/* minWidth:0 + flexShrink מאפשרים לשם הקטגוריה להתקצר במקום לדחוף
                    את שדה הסכום אל מחוץ למסך */}
                <View style={{ ...rtlRow, gap: spacing.sm, flex: 1, minWidth: 0 }}>
                  <IconBubble icon={c.icon} color={c.color} size={34} />
                  <Body numberOfLines={1} style={{ fontWeight: '600', flexShrink: 1 }}>
                    {c.name}
                  </Body>
                </View>
                <AmountInput
                  align="compact"
                  value={drafts[c.id] ?? ''}
                  onChangeText={(t) => setDrafts((d) => ({ ...d, [c.id]: t }))}
                  accessibilityLabel={`יעד לקטגוריה ${c.name}`}
                />
              </View>
              {budget > 0 || spent > 0 ? (
                <View style={{ marginTop: spacing.sm }}>
                  <ProgressBar ratio={budget > 0 ? spent / budget : 0} color={c.color} />
                  <Muted style={{ marginTop: spacing.xs, fontSize: 12 }}>
                    {budget > 0 ? `${formatMoney(spent)} מתוך ${formatMoney(budget)}` : `הוצאת ${formatMoney(spent)} ללא יעד`}
                  </Muted>
                </View>
              ) : null}
            </View>
          );
        })}
      </Card>

      <Button title="שמירת יעדים" onPress={onSave} loading={busy} size="lg" icon="save" />
    </Screen>
  );
}
