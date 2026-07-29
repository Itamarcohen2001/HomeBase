import React, { useEffect, useMemo, useState } from 'react';
import { Platform, Pressable, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import DateTimePicker from '@react-native-community/datetimepicker';
import { useHousehold } from '../../src/context/HouseholdContext';
import { useMonthData } from '../../src/hooks/useMonthData';
import * as db from '../../src/lib/db';
import { formatDate, shekelsToAgorot, toDateString } from '../../src/lib/format';
import type { Transaction } from '../../src/lib/types';
import {
  AmountInput,
  Body,
  Button,
  Card,
  Field,
  InlineMessage,
  Loading,
  Muted,
  PageHeader,
  Screen,
  useDialog,
} from '../../src/ui';
import { colors, radius, rtlRow, spacing } from '../../src/theme';

export default function EditTransaction() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { confirm } = useDialog();
  const { bumpVersion } = useHousehold();
  const { transactions, categories, loading } = useMonthData();

  const [tx, setTx] = useState<Transaction | null>(null);
  const [amount, setAmount] = useState('');
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [date, setDate] = useState(new Date());
  const [showPicker, setShowPicker] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const found = transactions.find((t) => t.id === id) ?? null;
    if (!found) return;
    setTx(found);
    setAmount(String(found.amount_agorot / 100));
    setCategoryId(found.category_id);
    setNote(found.note ?? '');
    setDate(new Date(`${found.occurred_on}T00:00:00`));
  }, [transactions, id]);

  const visible = useMemo(
    () => categories.filter((c) => c.kind === (tx?.kind ?? 'expense')),
    [categories, tx?.kind],
  );

  async function onSave() {
    if (!tx) return;
    const amountAgorot = shekelsToAgorot(amount);
    if (amountAgorot <= 0) {
      setError('הסכום חייב להיות גדול מאפס');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await db.updateTransaction(tx.id, {
        amount_agorot: amountAgorot,
        category_id: categoryId,
        note: note.trim() || null,
        occurred_on: toDateString(date),
      });
      bumpVersion();
      router.back();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'לא הצלחנו לשמור');
    } finally {
      setBusy(false);
    }
  }

  async function onDelete() {
    if (!tx) return;
    const ok = await confirm({
      title: 'מחיקת תנועה',
      message: 'למחוק את התנועה? הפעולה אינה הפיכה.',
      confirmText: 'מחיקה',
      cancelText: 'ביטול',
      destructive: true,
    });
    if (!ok) return;
    try {
      await db.deleteTransaction(tx.id);
      bumpVersion();
      router.back();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'לא הצלחנו למחוק את התנועה');
    }
  }

  if (loading && !tx) return <Loading />;
  if (!tx) {
    return (
      <Screen>
        <PageHeader title="תנועה" onBack={() => router.back()} />
        <Card>
          <Muted>התנועה לא נמצאה (ייתכן שהיא בחודש אחר).</Muted>
        </Card>
      </Screen>
    );
  }

  return (
    <Screen>
      <PageHeader title={tx.kind === 'income' ? 'עריכת הכנסה' : 'עריכת הוצאה'} onBack={() => router.back()} />

      {error ? <InlineMessage tone="error">{error}</InlineMessage> : null}

      <Card>
        <Muted>נרשם על ידי</Muted>
        <Body style={{ fontWeight: '600' }}>{tx.profiles?.full_name ?? tx.profiles?.email ?? 'לא ידוע'}</Body>
      </Card>

      <Card>
        <Muted style={{ marginBottom: spacing.xs }}>סכום</Muted>
        <AmountInput value={amount} onChangeText={setAmount} size="lg" accessibilityLabel="סכום" />
      </Card>

      <Muted style={{ marginBottom: spacing.sm }}>קטגוריה</Muted>
      <View style={{ flexDirection: 'row-reverse', flexWrap: 'wrap', gap: spacing.sm, marginBottom: spacing.lg }}>
        {visible.map((c) => (
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

      <Card>
        <Field label="הערה" value={note} onChangeText={setNote} placeholder="ללא הערה" />
        <Muted style={{ marginBottom: spacing.xs }}>תאריך</Muted>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="בחירת תאריך"
          onPress={() => setShowPicker(true)}
          style={{
            ...rtlRow,
            gap: spacing.sm,
            justifyContent: 'space-between',
            borderWidth: 1,
            borderColor: colors.border,
            borderRadius: radius.md,
            padding: spacing.lg,
          }}
        >
          <Body>{formatDate(toDateString(date))}</Body>
          <Ionicons name="calendar" size={18} color={colors.textMuted} />
        </Pressable>
        {showPicker ? (
          <DateTimePicker
            value={date}
            mode="date"
            display={Platform.OS === 'ios' ? 'spinner' : 'default'}
            onChange={(_e, selected) => {
              setShowPicker(Platform.OS === 'ios');
              if (selected) setDate(selected);
            }}
          />
        ) : null}
      </Card>

      <Button title="שמירה" onPress={onSave} loading={busy} size="lg" icon="checkmark" />
      <Button title="מחיקת התנועה" variant="danger" icon="trash" onPress={onDelete} style={{ marginTop: spacing.md }} />
    </Screen>
  );
}
