import { useTheme } from '../src/context/ThemeContext';
import React, { useEffect, useMemo, useState } from 'react';
import { Platform, Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { goBack } from '../src/lib/nav';
import { Ionicons } from '@expo/vector-icons';
import DateTimePicker from '@react-native-community/datetimepicker';
import { useAuth } from '../src/context/AuthContext';
import { useHousehold } from '../src/context/HouseholdContext';
import { useMonthData } from '../src/hooks/useMonthData';
import * as db from '../src/lib/db';
import { formatDate, shekelsToAgorot, toDateString } from '../src/lib/format';
import type { Kind } from '../src/lib/types';
import * as nw from '../src/lib/networth';
import { AmountInput, Body, Button, Card, Checkbox, Field, H2, IconBubble, InlineMessage, Muted } from '../src/ui';
import { layout, radius, rtlRow, spacing } from '../src/theme';
import { errorText } from '../src/lib/authErrors';

export default function AddTransaction() {
  const { colors } = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { householdId, bumpVersion } = useHousehold();
  const { categories } = useMonthData();

  const [kind, setKind] = useState<Kind>('expense');
  const [amount, setAmount] = useState('');
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [showMore, setShowMore] = useState(false);
  const [isShared, setIsShared] = useState(false);
  const [sharedAvailable, setSharedAvailable] = useState(false);
  const [note, setNote] = useState('');
  const [date, setDate] = useState(new Date());
  const [showPicker, setShowPicker] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [accounts, setAccounts] = useState<nw.TrackedAccount[]>([]);
  const [accountId, setAccountId] = useState<string | null>(null);
  // גובה הפוטר הצף נמדד בפועל — כך הריווח התחתון של הגלילה תמיד מדויק,
  // גם כשגובה הכפתור או ה-safe area משתנים.
  const [footerHeight, setFooterHeight] = useState(layout.fabHeight + spacing.lg * 2);

  const visible = useMemo(() => categories.filter((c) => c.kind === kind), [categories, kind]);
  const amountAgorot = shekelsToAgorot(amount);
  const canSave = amountAgorot > 0 && Boolean(categoryId);

  // הסימון "הוצאה משותפת" תלוי בעמודה שנוספה במיגרציה 0005. אם היא עדיין
  // לא קיימת במסד — לא מציגים תיבה שלא תישמר.
  useEffect(() => {
    let alive = true;
    db.hasSharedColumn().then((ok) => {
      if (alive) setSharedAvailable(ok);
    });
    if (householdId) {
      nw.listTrackedAccounts(householdId).then((accts) => {
        if (alive) {
          setAccounts(accts);
          if (accts.length > 0) setAccountId(accts[0].id);
        }
      });
    }
    return () => {
      alive = false;
    };
  }, [householdId]);

  async function onSave() {
    if (!householdId || !user || !canSave) return;
    setBusy(true);
    setError(null);
    try {
      await db.addTransaction({
        householdId,
        userId: user.id,
        categoryId,
        kind,
        amountAgorot,
        occurredOn: toDateString(date),
        note: note.trim() || null,
        accountId: accountId,
        isShared: kind === 'expense' && isShared,
      });
      bumpVersion();
      goBack(router, '/(tabs)');
    } catch (e) {
      setError(errorText(e, 'לא הצלחנו לשמור את התנועה'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <View
        style={{
          ...rtlRow,
          gap: spacing.md,
          justifyContent: 'space-between',
          padding: spacing.lg,
          paddingTop: spacing.xl,
        }}
      >
        <H2>{kind === 'expense' ? 'הוצאה חדשה' : 'הכנסה חדשה'}</H2>
        <Pressable accessibilityRole="button" accessibilityLabel="סגירה" onPress={() => goBack(router, '/(tabs)')} hitSlop={10}>
          <Ionicons name="close" size={26} color={colors.textMuted} />
        </Pressable>
      </View>

      <ScrollView
        contentContainerStyle={{
          padding: spacing.lg,
          paddingTop: 0,
          // הפוטר של "שמירה" צף מעל הגלילה. בלי ריווח בגובהו המדוד (ולא מספר
          // קסם) הוא מכסה את סוף התוכן ו-elementFromPoint מחזיר אותו במקום
          // הכפתור שמתחתיו.
          paddingBottom: footerHeight + spacing.lg,
        }}
        keyboardShouldPersistTaps="handled"
      >
        {error ? <InlineMessage tone="error">{error}</InlineMessage> : null}

        {/* מתג הוצאה / הכנסה */}
        <View
          style={{
            ...rtlRow,
            backgroundColor: colors.surface,
            borderRadius: radius.md,
            padding: spacing.xs,
            marginBottom: spacing.lg,
            borderWidth: 1,
            borderColor: colors.border,
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
          <AmountInput value={amount} onChangeText={setAmount} size="xl" autoFocus accessibilityLabel="סכום" />
        </Card>

        {accounts.length > 0 && (
          <Card style={{ marginTop: spacing.md, marginBottom: spacing.md }}>
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
          </Card>
        )}

        {/* פרטים נוספים — מעל רשת הקטגוריות כדי שלא יהיה תלוי בגלילה */}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="פרטים נוספים"
          accessibilityState={{ expanded: showMore }}
          testID="hb-add-more"
          onPress={() => setShowMore((v) => !v)}
          style={{
            ...rtlRow,
            gap: spacing.sm,
            alignItems: 'center',
            justifyContent: 'space-between',
            minHeight: 44,
            paddingHorizontal: spacing.md,
            marginBottom: spacing.md,
            borderRadius: radius.md,
            borderWidth: 1,
            borderColor: colors.border,
            backgroundColor: colors.surface,
          }}
        >
          <View style={{ ...rtlRow, gap: spacing.sm, alignItems: 'center' }}>
            <Ionicons name="create-outline" size={18} color={colors.primary} />
            <Body style={{ color: colors.primary, fontWeight: '700' }}>הערה ותאריך</Body>
          </View>
          <Ionicons name={showMore ? 'chevron-up' : 'chevron-down'} size={18} color={colors.primary} />
        </Pressable>

        {showMore ? (
          <Card>
            <Field label="הערה" value={note} onChangeText={setNote} placeholder="למשל: קניות לשבת" />
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

        {/* הוצאה משותפת — יושב מעל רשת הקטגוריות, ליד "הערה ותאריך", כדי
            שלא ייפול מתחת לקו הקיפול ולא ייחסם על ידי פוטר "שמירה". */}
        {sharedAvailable && kind === 'expense' ? (
          <Checkbox
            testID="hb-add-shared"
            value={isShared}
            onValueChange={setIsShared}
            icon="people"
            label="הוצאה משותפת"
            hint="לא תיזקף לאף אחד בפיצול בין בני הבית"
            accessibilityLabel="הוצאה משותפת"
            style={{ marginBottom: spacing.lg }}
          />
        ) : null}

        {/* קטגוריה */}
        <Muted style={{ marginBottom: spacing.sm }}>קטגוריה</Muted>
        <View style={{ flexDirection: 'row-reverse', flexWrap: 'wrap', gap: spacing.sm }}>
          {visible.map((c) => {
            const active = categoryId === c.id;
            return (
              <Pressable
                key={c.id}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
                accessibilityLabel={c.name}
                onPress={() => setCategoryId(c.id)}
                style={{
                  width: '31.5%',
                  backgroundColor: active ? `${c.color}22` : colors.surface,
                  borderWidth: 1.5,
                  borderColor: active ? c.color : colors.border,
                  borderRadius: radius.md,
                  paddingVertical: spacing.md,
                  paddingHorizontal: spacing.xs,
                  alignItems: 'center',
                }}
              >
                <IconBubble icon={c.icon} color={c.color} size={34} />
                <Text
                  numberOfLines={1}
                  style={{ marginTop: spacing.xs, fontSize: 12, fontWeight: '600', color: colors.text }}
                >
                  {c.name}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </ScrollView>

      <View
        onLayout={(e) => setFooterHeight(e.nativeEvent.layout.height)}
        style={{
          position: 'absolute',
          bottom: 0,
          left: 0,
          right: 0,
          padding: spacing.lg,
          paddingBottom: spacing.lg + insets.bottom,
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

