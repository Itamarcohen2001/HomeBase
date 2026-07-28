import React, { useMemo, useState } from 'react';
import { Alert, Platform, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import DateTimePicker from '@react-native-community/datetimepicker';
import { useAuth } from '../src/context/AuthContext';
import { useHousehold } from '../src/context/HouseholdContext';
import { useMonthData } from '../src/hooks/useMonthData';
import * as db from '../src/lib/db';
import { formatDate, shekelsToAgorot, toDateString } from '../src/lib/format';
import type { Kind } from '../src/lib/types';
import { Body, Button, Card, Field, H2, IconBubble, Muted } from '../src/ui';
import { colors, radius, rtlRow, rtlText, spacing } from '../src/theme';

export default function AddTransaction() {
  const router = useRouter();
  const { user } = useAuth();
  const { householdId, bumpVersion } = useHousehold();
  const { categories } = useMonthData();

  const [kind, setKind] = useState<Kind>('expense');
  const [amount, setAmount] = useState('');
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [showMore, setShowMore] = useState(false);
  const [note, setNote] = useState('');
  const [date, setDate] = useState(new Date());
  const [showPicker, setShowPicker] = useState(false);
  const [busy, setBusy] = useState(false);

  const visible = useMemo(() => categories.filter((c) => c.kind === kind), [categories, kind]);
  const amountAgorot = shekelsToAgorot(amount);
  const canSave = amountAgorot > 0 && Boolean(categoryId);

  async function onSave() {
    if (!householdId || !user || !canSave) return;
    setBusy(true);
    try {
      await db.addTransaction({
        householdId,
        userId: user.id,
        categoryId,
        kind,
        amountAgorot,
        occurredOn: toDateString(date),
        note: note.trim() || null,
      });
      bumpVersion();
      router.back();
    } catch (e) {
      Alert.alert('לא הצלחנו לשמור', e instanceof Error ? e.message : 'שגיאה לא ידועה');
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <View style={{ ...rtlRow, justifyContent: 'space-between', padding: spacing.lg, paddingTop: spacing.xl }}>
        <H2>{kind === 'expense' ? 'הוצאה חדשה' : 'הכנסה חדשה'}</H2>
        <Pressable onPress={() => router.back()} hitSlop={10}>
          <Ionicons name="close" size={26} color={colors.textMuted} />
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingTop: 0, paddingBottom: 140 }} keyboardShouldPersistTaps="handled">
        {/* מתג הוצאה / הכנסה */}
        <View style={{ ...rtlRow, backgroundColor: colors.surface, borderRadius: radius.md, padding: 4, marginBottom: spacing.lg, borderWidth: 1, borderColor: colors.border }}>
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
                backgroundColor: kind === k ? colors.primarySoft : 'transparent',
                alignItems: 'center',
              }}
            >
              <Text style={{ fontWeight: '700', color: kind === k ? colors.primaryDark : colors.textMuted }}>
                {k === 'expense' ? 'הוצאה' : 'הכנסה'}
              </Text>
            </Pressable>
          ))}
        </View>

        {/* סכום */}
        <Card>
          <Muted style={{ marginBottom: spacing.xs }}>סכום</Muted>
          <View style={{ ...rtlRow }}>
            <Text style={{ fontSize: 38, fontWeight: '800', color: colors.textFaint }}>₪</Text>
            <TextInput
              value={amount}
              onChangeText={(t) => setAmount(t.replace(/[^\d.]/g, ''))}
              keyboardType="decimal-pad"
              autoFocus
              placeholder="0"
              placeholderTextColor={colors.textFaint}
              style={{
                ...rtlText,
                flex: 1,
                fontSize: 40,
                fontWeight: '800',
                color: colors.text,
                paddingVertical: 4,
                marginRight: spacing.sm,
              }}
            />
          </View>
        </Card>

        {/* קטגוריה */}
        <Muted style={{ marginBottom: spacing.sm }}>קטגוריה</Muted>
        <View style={{ flexDirection: 'row-reverse', flexWrap: 'wrap', gap: spacing.sm }}>
          {visible.map((c) => {
            const active = categoryId === c.id;
            return (
              <Pressable
                key={c.id}
                onPress={() => setCategoryId(c.id)}
                style={{
                  width: '31.5%',
                  backgroundColor: active ? `${c.color}22` : colors.surface,
                  borderWidth: 1.5,
                  borderColor: active ? c.color : colors.border,
                  borderRadius: radius.md,
                  paddingVertical: spacing.md,
                  alignItems: 'center',
                }}
              >
                <IconBubble icon={c.icon} color={c.color} size={34} />
                <Text numberOfLines={1} style={{ marginTop: 6, fontSize: 12, fontWeight: '600', color: colors.text }}>
                  {c.name}
                </Text>
              </Pressable>
            );
          })}
        </View>

        {/* עוד */}
        <Pressable onPress={() => setShowMore((v) => !v)} style={{ ...rtlRow, marginTop: spacing.lg }} hitSlop={8}>
          <Ionicons name={showMore ? 'chevron-up' : 'chevron-down'} size={18} color={colors.primary} />
          <Body style={{ color: colors.primary, fontWeight: '700', marginRight: 4 }}>עוד</Body>
        </Pressable>

        {showMore ? (
          <Card style={{ marginTop: spacing.md }}>
            <Field label="הערה" value={note} onChangeText={setNote} placeholder="למשל: קניות לשבת" />
            <Muted style={{ marginBottom: 6 }}>תאריך</Muted>
            <Pressable
              onPress={() => setShowPicker(true)}
              style={{
                ...rtlRow,
                justifyContent: 'space-between',
                borderWidth: 1,
                borderColor: colors.border,
                borderRadius: radius.md,
                padding: spacing.lg,
                backgroundColor: colors.surface,
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
                maximumDate={new Date()}
                onChange={(_e, selected) => {
                  setShowPicker(Platform.OS === 'ios');
                  if (selected) setDate(selected);
                }}
              />
            ) : null}
          </Card>
        ) : null}
      </ScrollView>

      <View
        style={{
          position: 'absolute',
          bottom: 0,
          left: 0,
          right: 0,
          padding: spacing.lg,
          paddingBottom: spacing.xl,
          backgroundColor: colors.surface,
          borderTopWidth: 1,
          borderTopColor: colors.border,
        }}
      >
        <Button title="שמירה" onPress={onSave} disabled={!canSave} loading={busy} size="lg" icon="checkmark" />
      </View>
    </View>
  );
}
