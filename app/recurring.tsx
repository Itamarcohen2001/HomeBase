import React, { useCallback, useEffect, useState } from 'react';
import { Alert, Modal, Pressable, ScrollView, Switch, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../src/context/AuthContext';
import { useHousehold } from '../src/context/HouseholdContext';
import * as db from '../src/lib/db';
import { formatMoney, shekelsToAgorot } from '../src/lib/format';
import type { Category, Kind, RecurringRule } from '../src/lib/types';
import { Body, Button, Card, EmptyState, Field, IconBubble, Loading, Muted, PageHeader, Screen } from '../src/ui';
import { colors, radius, rtlRow, spacing } from '../src/theme';

export default function Recurring() {
  const router = useRouter();
  const { householdId, bumpVersion } = useHousehold();
  const [rules, setRules] = useState<RecurringRule[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [editor, setEditor] = useState<{ open: boolean; rule: RecurringRule | null }>({ open: false, rule: null });

  const load = useCallback(async () => {
    if (!householdId) return;
    setLoading(true);
    try {
      const [r, c] = await Promise.all([db.listRecurring(householdId), db.listCategories(householdId)]);
      setRules(r);
      setCategories(c);
    } catch (e) {
      Alert.alert('שגיאה', e instanceof Error ? e.message : 'לא הצלחנו לטעון');
    } finally {
      setLoading(false);
    }
  }, [householdId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function onToggle(rule: RecurringRule, value: boolean) {
    try {
      await db.toggleRecurring(rule.id, value);
      setRules((rs) => rs.map((r) => (r.id === rule.id ? { ...r, is_active: value } : r)));
    } catch (e) {
      Alert.alert('שגיאה', e instanceof Error ? e.message : 'לא הצלחנו לעדכן');
    }
  }

  function confirmDelete(rule: RecurringRule) {
    Alert.alert('מחיקה', `למחוק את "${rule.title}"?`, [
      { text: 'ביטול', style: 'cancel' },
      {
        text: 'מחיקה',
        style: 'destructive',
        onPress: async () => {
          await db.deleteRecurring(rule.id);
          await load();
        },
      },
    ]);
  }

  async function onRunNow() {
    if (!householdId) return;
    try {
      const count = await db.applyRecurring(householdId);
      bumpVersion();
      await load();
      Alert.alert('בוצע', count > 0 ? `נרשמו ${count} תנועות קבועות` : 'הכול כבר מעודכן לחודש הזה');
    } catch (e) {
      Alert.alert('שגיאה', e instanceof Error ? e.message : 'לא הצלחנו להריץ');
    }
  }

  if (loading) return <Loading />;

  return (
    <Screen>
      <PageHeader
        title="הוצאות קבועות"
        onBack={() => router.back()}
        action={
          <Pressable onPress={() => setEditor({ open: true, rule: null })} hitSlop={8} style={rtlRow}>
            <Ionicons name="add-circle" size={22} color={colors.primary} />
            <Muted style={{ color: colors.primary, fontWeight: '700', marginRight: 4 }}>חדשה</Muted>
          </Pressable>
        }
      />

      <Muted style={{ marginBottom: spacing.lg }}>
        תנועות שנרשמות אוטומטית בכל חודש ביום שתבחר — שכירות, ארנונה, מנויים ועוד.
      </Muted>

      {rules.length === 0 ? (
        <Card>
          <EmptyState icon="repeat-outline" title="אין עדיין הוצאות קבועות" subtitle="הוסף את הראשונה בלחיצה על 'חדשה'" />
        </Card>
      ) : (
        <Card>
          {rules.map((r, i) => (
            <View
              key={r.id}
              style={{
                ...rtlRow,
                justifyContent: 'space-between',
                paddingVertical: spacing.md,
                borderTopWidth: i === 0 ? 0 : 1,
                borderTopColor: colors.border,
              }}
            >
              <Pressable style={{ ...rtlRow, flex: 1 }} onPress={() => setEditor({ open: true, rule: r })}>
                <IconBubble icon={r.categories?.icon ?? 'repeat'} color={r.categories?.color ?? colors.primary} size={38} />
                <View style={{ marginRight: spacing.md, flexShrink: 1 }}>
                  <Body style={{ fontWeight: '600' }}>{r.title}</Body>
                  <Muted style={{ fontSize: 12 }}>
                    {formatMoney(r.amount_agorot)} · בכל {r.day_of_month} בחודש · {r.categories?.name ?? 'ללא קטגוריה'}
                    {r.kind === 'income' ? ' · הכנסה' : ''}
                  </Muted>
                </View>
              </Pressable>
              <View style={rtlRow}>
                <Switch
                  value={r.is_active}
                  onValueChange={(v) => onToggle(r, v)}
                  trackColor={{ true: colors.primary, false: colors.border }}
                />
                <Pressable onPress={() => confirmDelete(r)} hitSlop={8} style={{ marginRight: spacing.md }}>
                  <Ionicons name="trash-outline" size={20} color={colors.danger} />
                </Pressable>
              </View>
            </View>
          ))}
        </Card>
      )}

      <Button title="הרצה עכשיו לחודש הנוכחי" variant="secondary" icon="play" onPress={onRunNow} />

      <RuleEditor
        visible={editor.open}
        rule={editor.rule}
        categories={categories}
        onClose={() => setEditor({ open: false, rule: null })}
        onSaved={async () => {
          setEditor({ open: false, rule: null });
          bumpVersion();
          await load();
        }}
      />
    </Screen>
  );
}

function RuleEditor({
  visible,
  rule,
  categories,
  onClose,
  onSaved,
}: {
  visible: boolean;
  rule: RecurringRule | null;
  categories: Category[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const { user } = useAuth();
  const { householdId } = useHousehold();
  const [title, setTitle] = useState('');
  const [amount, setAmount] = useState('');
  const [day, setDay] = useState('1');
  const [kind, setKind] = useState<Kind>('expense');
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!visible) return;
    setTitle(rule?.title ?? '');
    setAmount(rule ? String(rule.amount_agorot / 100) : '');
    setDay(String(rule?.day_of_month ?? 1));
    setKind(rule?.kind ?? 'expense');
    setCategoryId(rule?.category_id ?? null);
  }, [visible, rule]);

  async function onSave() {
    const amountAgorot = shekelsToAgorot(amount);
    const dayNum = Math.min(31, Math.max(1, parseInt(day || '1', 10)));
    if (!householdId || !user || !title.trim() || amountAgorot <= 0) {
      Alert.alert('חסרים פרטים', 'יש להזין שם וסכום גדול מאפס');
      return;
    }
    setBusy(true);
    try {
      await db.upsertRecurring({
        id: rule?.id,
        householdId,
        categoryId,
        kind,
        title: title.trim(),
        amountAgorot,
        dayOfMonth: dayNum,
        isActive: rule?.is_active ?? true,
        createdBy: user.id,
      });
      onSaved();
    } catch (e) {
      Alert.alert('שגיאה', e instanceof Error ? e.message : 'לא הצלחנו לשמור');
    } finally {
      setBusy(false);
    }
  }

  const visibleCategories = categories.filter((c) => c.kind === kind);

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: colors.bg, padding: spacing.lg, paddingTop: spacing.xl }}>
        <PageHeader title={rule ? 'עריכת קבועה' : 'הוצאה קבועה חדשה'} onBack={onClose} />
        <ScrollView keyboardShouldPersistTaps="handled">
          <Card>
            <View style={{ ...rtlRow, backgroundColor: colors.bg, borderRadius: radius.md, padding: 4, marginBottom: spacing.lg }}>
              {(['expense', 'income'] as Kind[]).map((k) => (
                <Pressable
                  key={k}
                  onPress={() => {
                    setKind(k);
                    setCategoryId(null);
                  }}
                  style={{
                    flex: 1,
                    paddingVertical: 10,
                    borderRadius: radius.sm,
                    alignItems: 'center',
                    backgroundColor: kind === k ? colors.primarySoft : 'transparent',
                  }}
                >
                  <Text style={{ fontWeight: '700', color: kind === k ? colors.primaryDark : colors.textMuted }}>
                    {k === 'expense' ? 'הוצאה' : 'הכנסה'}
                  </Text>
                </Pressable>
              ))}
            </View>

            <Field label="שם" value={title} onChangeText={setTitle} placeholder="למשל: שכר דירה" />
            <Field
              label="סכום בשקלים"
              value={amount}
              onChangeText={(t) => setAmount(t.replace(/[^\d.]/g, ''))}
              keyboardType="decimal-pad"
              placeholder="0"
            />
            <Field
              label="יום בחודש"
              value={day}
              onChangeText={(t) => setDay(t.replace(/[^\d]/g, '').slice(0, 2))}
              keyboardType="number-pad"
              placeholder="1"
              hint="אם החודש קצר יותר, התנועה תירשם ביום האחרון של החודש"
            />

            <Muted style={{ marginBottom: spacing.sm }}>קטגוריה</Muted>
            <View style={{ flexDirection: 'row-reverse', flexWrap: 'wrap', gap: spacing.sm }}>
              {visibleCategories.map((c) => (
                <Pressable
                  key={c.id}
                  onPress={() => setCategoryId(c.id)}
                  style={{
                    ...rtlRow,
                    paddingHorizontal: spacing.md,
                    paddingVertical: 8,
                    borderRadius: radius.pill,
                    borderWidth: 1.5,
                    borderColor: categoryId === c.id ? c.color : colors.border,
                    backgroundColor: categoryId === c.id ? `${c.color}22` : colors.surface,
                  }}
                >
                  <Ionicons name={c.icon as keyof typeof Ionicons.glyphMap} size={15} color={c.color} />
                  <Text style={{ marginRight: 6, fontSize: 13, fontWeight: '600', color: colors.text }}>{c.name}</Text>
                </Pressable>
              ))}
            </View>
          </Card>

          <Button title="שמירה" onPress={onSave} loading={busy} size="lg" />
        </ScrollView>
      </View>
    </Modal>
  );
}
