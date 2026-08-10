import React, { useCallback, useEffect, useState } from 'react';
import { Modal, Pressable, ScrollView, Switch, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { goBack } from '../src/lib/nav';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../src/context/AuthContext';
import { useHousehold } from '../src/context/HouseholdContext';
import * as db from '../src/lib/db';
import { formatMoney, shekelsToAgorot } from '../src/lib/format';
import type { Category, Kind, RecurringRule } from '../src/lib/types';
import * as nw from '../src/lib/networth';
import {
  Badge,
  Body,
  Button,
  Card,
  Checkbox,
  EmptyState,
  Field,
  IconBubble,
  InlineMessage,
  Loading,
  Muted,
  PageHeader,
  Screen,
  useDialog,
} from '../src/ui';
import { radius, rtlRow, spacing } from '../src/theme';
import { useTheme } from '../src/context/ThemeContext';
import { errorText } from '../src/lib/authErrors';

export default function Recurring() {
  const { colors } = useTheme();
  const router = useRouter();
  const { confirm } = useDialog();
  const { householdId, bumpVersion } = useHousehold();
  const [rules, setRules] = useState<RecurringRule[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [accounts, setAccounts] = useState<nw.TrackedAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<{ tone: 'error' | 'success'; text: string } | null>(null);
  const [editor, setEditor] = useState<{ open: boolean; rule: RecurringRule | null }>({ open: false, rule: null });
  const [sharedAvailable, setSharedAvailable] = useState(false);

  useEffect(() => {
    let alive = true;
    void db.hasRecurringSharedColumn().then((ok) => {
      if (alive) setSharedAvailable(ok);
    });
    return () => {
      alive = false;
    };
  }, []);

  const load = useCallback(async () => {
    if (!householdId) return;
    setLoading(true);
    try {
      const [r, c, a] = await Promise.all([
        db.listRecurring(householdId), 
        db.listCategories(householdId),
        nw.listTrackedAccounts(householdId)
      ]);
      setRules(r);
      setCategories(c);
      setAccounts(a);
    } catch (e) {
      setMessage({ tone: 'error', text: errorText(e, 'לא הצלחנו לטעון') });
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
      setMessage({ tone: 'error', text: errorText(e, 'לא הצלחנו לעדכן') });
    }
  }

  async function confirmDelete(rule: RecurringRule) {
    const ok = await confirm({
      title: 'מחיקת הוצאה קבועה',
      message: `למחוק את "${rule.title}"?`,
      confirmText: 'מחיקה',
      cancelText: 'ביטול',
      destructive: true,
    });
    if (!ok) return;
    try {
      await db.deleteRecurring(rule.id);
      await load();
    } catch (e) {
      setMessage({ tone: 'error', text: errorText(e, 'לא הצלחנו למחוק') });
    }
  }

  async function onRunNow() {
    if (!householdId) return;
    setMessage(null);
    try {
      const count = await db.applyRecurring(householdId);
      bumpVersion();
      await load();
      setMessage({
        tone: 'success',
        text: count > 0 ? `נרשמו ${count} תנועות קבועות` : 'הכול כבר מעודכן לחודש הזה',
      });
    } catch (e) {
      setMessage({ tone: 'error', text: errorText(e, 'לא הצלחנו להריץ') });
    }
  }

  if (loading) return <Loading />;

  return (
    <Screen>
      <PageHeader
        title="הוצאות קבועות"
        onBack={() => goBack(router, '/(tabs)/more')}
        action={
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="הוצאה קבועה חדשה"
            onPress={() => setEditor({ open: true, rule: null })}
            hitSlop={8}
            style={{ ...rtlRow, gap: spacing.sm }}
          >
            <Ionicons name="add-circle" size={22} color={colors.primary} />
            <Muted style={{ color: colors.primary, fontWeight: '700' }}>חדשה</Muted>
          </Pressable>
        }
      />

      <Muted style={{ marginBottom: spacing.lg }}>
        תנועות שנרשמות אוטומטית בכל חודש ביום שתבחר — שכירות, ארנונה, מנויים ועוד.
      </Muted>

      {message ? <InlineMessage tone={message.tone}>{message.text}</InlineMessage> : null}

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
                gap: spacing.sm,
                justifyContent: 'space-between',
                paddingVertical: spacing.md,
                borderTopWidth: i === 0 ? 0 : 1,
                borderTopColor: colors.border,
              }}
            >
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`עריכת ${r.title}`}
                style={{ ...rtlRow, gap: spacing.md, flex: 1, minWidth: 0 }}
                onPress={() => setEditor({ open: true, rule: r })}
              >
                <IconBubble icon={r.categories?.icon ?? 'repeat'} color={r.categories?.color ?? colors.primary} size={38} />
                <View style={{ flexShrink: 1, minWidth: 0 }}>
                  <View style={{ ...rtlRow, gap: spacing.sm, alignItems: 'center' }}>
                    <Body numberOfLines={1} style={{ fontWeight: '600', flexShrink: 1 }}>
                      {r.title}
                    </Body>
                    {r.is_shared ? (
                      <Badge icon="people" color={colors.primary}>
                        משותף
                      </Badge>
                    ) : null}
                  </View>
                  <Muted numberOfLines={1} style={{ fontSize: 12 }}>
                    {formatMoney(r.amount_agorot)} · בכל {r.day_of_month} בחודש · {r.categories?.name ?? 'ללא קטגוריה'}
                    {r.kind === 'income' ? ' · הכנסה' : ''}
                  </Muted>
                </View>
              </Pressable>
              <View style={{ ...rtlRow, gap: spacing.md }}>
                <Switch
                  value={r.is_active}
                  onValueChange={(v) => onToggle(r, v)}
                  trackColor={{ true: colors.primary, false: colors.border }}
                />
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`מחיקת ${r.title}`}
                  onPress={() => confirmDelete(r)}
                  hitSlop={8}
                >
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
        accounts={accounts}
        sharedAvailable={sharedAvailable}
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
  accounts,
  sharedAvailable,
  onClose,
  onSaved,
}: {
  visible: boolean;
  rule: RecurringRule | null;
  categories: Category[];
  accounts: nw.TrackedAccount[];
  sharedAvailable: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { colors } = useTheme();
  const { user } = useAuth();
  const { householdId } = useHousehold();
  const [title, setTitle] = useState('');
  const [amount, setAmount] = useState('');
  const [day, setDay] = useState('1');
  const [kind, setKind] = useState<Kind>('expense');
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [accountId, setAccountId] = useState<string | null>(null);
  const [isShared, setIsShared] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!visible) return;
    setTitle(rule?.title ?? '');
    setAmount(rule ? String(rule.amount_agorot / 100) : '');
    setDay(String(rule?.day_of_month ?? 1));
    setKind(rule?.kind ?? 'expense');
    setCategoryId(rule?.category_id ?? null);
    setAccountId(rule?.account_id ?? (accounts.length > 0 ? accounts[0].id : null));
    setIsShared(Boolean(rule?.is_shared));
    setError(null);
  }, [visible, rule]);

  async function onSave() {
    const amountAgorot = shekelsToAgorot(amount);
    const dayNum = Math.min(31, Math.max(1, parseInt(day || '1', 10)));
    if (!householdId || !user || !title.trim() || amountAgorot <= 0) {
      setError('יש להזין שם וסכום גדול מאפס');
      return;
    }
    setBusy(true);
    setError(null);
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
        accountId: accountId,
        isShared: kind === 'expense' && isShared,
      });
      onSaved();
    } catch (e) {
      setError(errorText(e, 'לא הצלחנו לשמור'));
    } finally {
      setBusy(false);
    }
  }

  const visibleCategories = categories.filter((c) => c.kind === kind);

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: colors.bg, padding: spacing.lg, paddingTop: spacing.xl }}>
        <PageHeader title={rule ? 'עריכת קבועה' : 'הוצאה קבועה חדשה'} onBack={onClose} />
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: spacing.xxl }}>
          {error ? <InlineMessage tone="error">{error}</InlineMessage> : null}
          <Card>
            <View
              style={{
                ...rtlRow,
                backgroundColor: colors.bg,
                borderRadius: radius.md,
                padding: spacing.xs,
                marginBottom: spacing.lg,
              }}
            >
              {(['expense', 'income'] as Kind[]).map((k) => (
                <Pressable
                  key={k}
                  accessibilityRole="button"
                  accessibilityState={{ selected: kind === k }}
                  onPress={() => {
                    setKind(k);
                    setCategoryId(null);
                  }}
                  style={{
                    flex: 1,
                    minWidth: 0,
                    paddingVertical: spacing.sm + 2,
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

            {accounts.length > 0 && (
              <View style={{ marginBottom: spacing.lg }}>
                <Muted style={{ marginBottom: spacing.sm }}>חשבון משויך</Muted>
                <View style={{ flexDirection: 'row-reverse', flexWrap: 'wrap', gap: spacing.sm }}>
                  {accounts.map((a) => {
                    const active = accountId === a.id;
                    return (
                      <Pressable
                        key={a.id}
                        accessibilityRole="button"
                        accessibilityState={{ selected: active }}
                        onPress={() => setAccountId(active ? null : a.id)}
                        style={{
                          paddingVertical: spacing.sm,
                          paddingHorizontal: spacing.md,
                          backgroundColor: active ? `${colors.primary}22` : colors.surface,
                          borderWidth: 1.5,
                          borderColor: active ? colors.primary : colors.border,
                          borderRadius: radius.md,
                        }}
                      >
                        <Body style={{ color: active ? colors.primaryDark : colors.text, fontWeight: active ? '700' : '400' }}>
                          {a.name}
                        </Body>
                      </Pressable>
                    );
                  })}
                </View>
              </View>
            )}

            {/* הוצאה משותפת — מעל רשת הקטגוריות, לא כאלמנט האחרון בגלילה, כדי
                שלא ייפול מתחת לקו הקיפול (באג 1 מסבב 2). כל תנועה שתיווצר
                מהכלל הזה תירש את הסימון דרך apply_recurring. */}
            {sharedAvailable && kind === 'expense' ? (
              <Checkbox
                testID="hb-recurring-shared"
                value={isShared}
                onValueChange={setIsShared}
                icon="people"
                label="הוצאה משותפת"
                hint="לא תיזקף לאף אחד בפיצול בין בני הבית"
                accessibilityLabel="הוצאה משותפת"
                style={{ marginBottom: spacing.lg }}
              />
            ) : null}

            <Muted style={{ marginBottom: spacing.sm }}>קטגוריה</Muted>
            <View style={{ flexDirection: 'row-reverse', flexWrap: 'wrap', gap: spacing.sm }}>
              {visibleCategories.map((c) => (
                <Pressable
                  key={c.id}
                  accessibilityRole="button"
                  accessibilityState={{ selected: categoryId === c.id }}
                  onPress={() => setCategoryId(c.id)}
                  style={{
                    ...rtlRow,
                    gap: spacing.xs + 2,
                    paddingHorizontal: spacing.md,
                    paddingVertical: spacing.sm,
                    borderRadius: radius.pill,
                    borderWidth: 1.5,
                    borderColor: categoryId === c.id ? c.color : colors.border,
                    backgroundColor: categoryId === c.id ? `${c.color}22` : colors.surface,
                  }}
                >
                  <Ionicons name={c.icon as keyof typeof Ionicons.glyphMap} size={15} color={c.color} />
                  <Text style={{ fontSize: 13, fontWeight: '600', color: colors.text }}>{c.name}</Text>
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
