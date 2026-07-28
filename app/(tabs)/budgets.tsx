import React, { useEffect, useMemo, useState } from 'react';
import { Alert, RefreshControl, TextInput, View } from 'react-native';
import { useHousehold } from '../../src/context/HouseholdContext';
import { useMonthData } from '../../src/hooks/useMonthData';
import * as db from '../../src/lib/db';
import { formatMoney, monthLabel, monthStart, shekelsToAgorot } from '../../src/lib/format';
import { Body, Button, Card, H2, H3, IconBubble, Muted, ProgressBar, Screen } from '../../src/ui';
import { colors, radius, rtlRow, rtlText, spacing } from '../../src/theme';

export default function Budgets() {
  const month = monthStart();
  const { householdId, bumpVersion } = useHousehold();
  const { categories, budgets, summary, loading, reload } = useMonthData(month);

  const [overall, setOverall] = useState('');
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

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
    try {
      await db.setBudget(householdId, month, null, shekelsToAgorot(overall || '0'));
      for (const c of expenseCategories) {
        const value = shekelsToAgorot(drafts[c.id] ?? '0');
        const current = budgetByCategory.get(c.id) ?? 0;
        if (value !== current) await db.setBudget(householdId, month, c.id, value);
      }
      bumpVersion();
      await reload();
      Alert.alert('נשמר', 'היעדים עודכנו ויתגלגלו אוטומטית לחודש הבא');
    } catch (e) {
      Alert.alert('לא הצלחנו לשמור', e instanceof Error ? e.message : 'שגיאה לא ידועה');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen refreshControl={<RefreshControl refreshing={loading} onRefresh={reload} tintColor={colors.primary} />}>
      <H2>יעדים</H2>
      <Muted style={{ marginBottom: spacing.lg }}>{monthLabel(month)} · היעדים מתגלגלים אוטומטית לחודש הבא</Muted>

      <Card>
        <H3 style={{ marginBottom: spacing.sm }}>יעד כללי לחודש</H3>
        <View style={{ ...rtlRow }}>
          <Body style={{ fontSize: 24, fontWeight: '800', color: colors.textFaint }}>₪</Body>
          <TextInput
            value={overall}
            onChangeText={(t) => setOverall(t.replace(/[^\d.]/g, ''))}
            keyboardType="decimal-pad"
            placeholder="0"
            placeholderTextColor={colors.textFaint}
            style={{ ...rtlText, flex: 1, fontSize: 26, fontWeight: '800', color: colors.text, marginRight: spacing.sm }}
          />
        </View>
        {summary && summary.overallBudget > 0 ? (
          <View style={{ marginTop: spacing.md }}>
            <ProgressBar ratio={summary.expense / summary.overallBudget} />
            <Muted style={{ marginTop: 6 }}>
              הוצאת {formatMoney(summary.expense)} מתוך {formatMoney(summary.overallBudget)}
            </Muted>
          </View>
        ) : null}
        <Muted style={{ marginTop: spacing.md }}>
          סכום יעדי הקטגוריות: {formatMoney(totalCategoryBudgets)}
        </Muted>
      </Card>

      <H3 style={{ marginTop: spacing.md, marginBottom: spacing.sm }}>יעד לכל קטגוריה</H3>
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
              <View style={{ ...rtlRow, justifyContent: 'space-between' }}>
                <View style={rtlRow}>
                  <IconBubble icon={c.icon} color={c.color} size={34} />
                  <Body style={{ marginRight: spacing.sm, fontWeight: '600' }}>{c.name}</Body>
                </View>
                <View
                  style={{
                    ...rtlRow,
                    borderWidth: 1,
                    borderColor: colors.border,
                    borderRadius: radius.sm,
                    paddingHorizontal: spacing.md,
                    minWidth: 110,
                  }}
                >
                  <Body style={{ color: colors.textFaint }}>₪</Body>
                  <TextInput
                    value={drafts[c.id] ?? ''}
                    onChangeText={(t) => setDrafts((d) => ({ ...d, [c.id]: t.replace(/[^\d.]/g, '') }))}
                    keyboardType="decimal-pad"
                    placeholder="0"
                    placeholderTextColor={colors.textFaint}
                    style={{ ...rtlText, flex: 1, paddingVertical: 8, fontSize: 16, fontWeight: '700', color: colors.text }}
                  />
                </View>
              </View>
              {budget > 0 || spent > 0 ? (
                <View style={{ marginTop: spacing.sm }}>
                  <ProgressBar ratio={budget > 0 ? spent / budget : 0} color={c.color} />
                  <Muted style={{ marginTop: 4, fontSize: 12 }}>
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
