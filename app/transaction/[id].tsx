import { useTheme } from '../../src/context/ThemeContext';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Platform, Pressable, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { goBack } from '../../src/lib/nav';
import { Ionicons } from '@expo/vector-icons';
import DateTimePicker from '@react-native-community/datetimepicker';
import { useAuth } from '../../src/context/AuthContext';
import { useHousehold } from '../../src/context/HouseholdContext';
import { useMonthData } from '../../src/hooks/useMonthData';
import * as db from '../../src/lib/db';
import { formatDate, shekelsToAgorot, toDateString } from '../../src/lib/format';
import type { HouseholdMember, Transaction } from '../../src/lib/types';
import {
  AmountInput,
  AssignmentChips,
  Badge,
  Body,
  Button,
  Card,
  Field,
  InlineMessage,
  Loading,
  memberLabels,
  Muted,
  PageHeader,
  Screen,
  useDialog,
  type AssignableMember,
} from '../../src/ui';
import { radius, rtlRow, spacing } from '../../src/theme';
import { errorText } from '../../src/lib/authErrors';

export default function EditTransaction() {
  const { colors } = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { confirm } = useDialog();
  const { user } = useAuth();
  const { householdId, bumpVersion } = useHousehold();
  const { transactions, categories, loading } = useMonthData();

  const [tx, setTx] = useState<Transaction | null>(null);
  const [amount, setAmount] = useState('');
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [note, setNote] = useState('');
  /** `null` = משותף, אחרת ה-`user_id` שההוצאה נזקפת לו */
  const [assignedTo, setAssignedTo] = useState<string | null>(null);
  const [members, setMembers] = useState<HouseholdMember[]>([]);
  const [sharedAvailable, setSharedAvailable] = useState(false);
  const [date, setDate] = useState(new Date());
  const [showPicker, setShowPicker] = useState(false);
  const [busy, setBusy] = useState(false);
  const [fetching, setFetching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** מזהה התנועה שכבר נטענה לטופס — שומר על עריכות שטרם נשמרו */
  const loadedId = useRef<string | undefined>(undefined);

  useEffect(() => {
    let alive = true;
    db.hasSharedColumn().then((ok) => {
      if (alive) setSharedAvailable(ok);
    });
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    let alive = true;
    if (!householdId) return;
    db.listMembers(householdId)
      .then((list) => {
        if (alive) setMembers(list);
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [householdId]);

  useEffect(() => {
    let alive = true;
    const apply = (found: Transaction) => {
      setTx(found);
      setAmount(String(found.amount_agorot / 100));
      setCategoryId(found.category_id);
      setNote(found.note ?? '');
      setAssignedTo(found.is_shared === true ? null : found.user_id);
      setDate(new Date(`${found.occurred_on}T00:00:00`));
    };

    // כבר טענו את התנועה הזאת — טעינה מחדש הייתה דורסת עריכות שטרם נשמרו
    if (loadedId.current === id) return;

    const inMonth = transactions.find((t) => t.id === id) ?? null;
    if (inMonth) {
      loadedId.current = id;
      apply(inMonth);
      setFetching(false);
      return;
    }
    // התנועה אינה בחודש הטעון — קורה בכל פתיחה של תנועה מחודש אחר, למשל אחרי
    // ייבוא דוח אשראי של חודש קודם. בלי השליפה הזאת המסך היה מציג "לא נמצאה".
    if (loading || !id) return;
    setFetching(true);
    db.getTransaction(id)
      .then((found) => {
        if (!alive) return;
        if (found) {
          loadedId.current = id;
          apply(found);
        }
      })
      .catch(() => undefined)
      .finally(() => {
        if (alive) setFetching(false);
      });
    return () => {
      alive = false;
    };
  }, [transactions, id, loading]);

  const visible = useMemo(
    () => categories.filter((c) => c.kind === (tx?.kind ?? 'expense')),
    [categories, tx?.kind],
  );

  const assignmentVisible = sharedAvailable && tx?.kind === 'expense';

  /**
   * בני משק הבית לבחירה. אם התנועה נזקפת למי שכבר אינו חבר במשק הבית, הוא
   * מתווסף לרשימה — אחרת המצב הנוכחי לא היה מיוצג בבורר ונראה כאילו לא נבחר
   * כלום, והשמירה הייתה משנה שיוך שהמשתמש לא ביקש לשנות.
   */
  const pickerMembers = useMemo<AssignableMember[]>(() => {
    const list: AssignableMember[] = members.map((m) => ({
      user_id: m.user_id,
      profiles: m.profiles,
    }));
    const current = tx?.user_id;
    if (current && !list.some((m) => m.user_id === current)) {
      list.push({ user_id: current, profiles: tx?.profiles });
    }
    return list;
  }, [members, tx?.user_id, tx?.profiles]);

  const memberNameById = useMemo(
    () => memberLabels(pickerMembers, user?.id),
    [pickerMembers, user?.id],
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
      // רק שינוי מפורש של המשתמש נכתב. תנועה ישנה יכולה להיות במצב שאין לו
      // ייצוג בבורר (למשל בלי user_id כלל), ואסור ששמירה של הסכום או ההערה
      // תשנה לה את השיוך בשקט.
      const initial = tx.is_shared === true ? null : tx.user_id;
      const assignmentChanged = assignmentVisible && assignedTo !== initial;

      await db.updateTransaction(tx.id, {
        amount_agorot: amountAgorot,
        category_id: categoryId,
        note: note.trim() || null,
        occurred_on: toDateString(date),
        // כשההוצאה משותפת ה-user_id נשאר כפי שהוא — הוא עדיין מציין מי רשם
        // אותה, פשוט לא נזקף לו בפיצול (types.ts:57).
        ...(assignmentChanged
          ? assignedTo === null
            ? { is_shared: true }
            : { is_shared: false, user_id: assignedTo }
          : {}),
      });
      bumpVersion();
      goBack(router, '/(tabs)/history');
    } catch (e) {
      setError(errorText(e, 'לא הצלחנו לשמור'));
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
      goBack(router, '/(tabs)/history');
    } catch (e) {
      setError(errorText(e, 'לא הצלחנו למחוק את התנועה'));
    }
  }

  if ((loading || fetching) && !tx) return <Loading />;
  if (!tx) {
    return (
      <Screen>
        <PageHeader title="תנועה" onBack={() => goBack(router, '/(tabs)/history')} />
        <Card>
          <Muted>התנועה לא נמצאה.</Muted>
        </Card>
      </Screen>
    );
  }

  return (
    <Screen>
      <PageHeader title={tx.kind === 'income' ? 'עריכת הכנסה' : 'עריכת הוצאה'} onBack={() => goBack(router, '/(tabs)/history')} />

      {error ? <InlineMessage tone="error">{error}</InlineMessage> : null}

      <Card>
        <View style={{ ...rtlRow, gap: spacing.sm, justifyContent: 'space-between' }}>
          <View style={{ flexShrink: 1, minWidth: 0 }}>
            <Muted>נרשם על ידי</Muted>
            <Body style={{ fontWeight: '600' }}>{tx.profiles?.full_name ?? tx.profiles?.email ?? 'לא ידוע'}</Body>
          </View>
          {(assignmentVisible ? assignedTo === null : tx.is_shared === true) ? (
            <Badge icon="people" color={colors.primary}>משותף</Badge>
          ) : null}
        </View>
      </Card>

      <Card>
        <Muted style={{ marginBottom: spacing.xs }}>סכום</Muted>
        <AmountInput value={amount} onChangeText={setAmount} size="lg" accessibilityLabel="סכום" />
      </Card>

      {/* בורר השיוך יושב כאן, מעל הקטגוריות וההערה — לא כאלמנט האחרון בגלילה */}
      {assignmentVisible ? (
        <Card style={{ marginBottom: spacing.md }}>
          <Body style={{ fontWeight: '700', marginBottom: spacing.xs }}>שיוך ההוצאה</Body>
          <Muted style={{ fontSize: 12, marginBottom: spacing.md }}>
            הוצאה משותפת לא נזקפת לאף אחד בפיצול בין בני הבית.
          </Muted>
          <AssignmentChips
            value={assignedTo}
            members={pickerMembers}
            labels={memberNameById}
            onChange={setAssignedTo}
            accessibilityLabel="שיוך ההוצאה"
            sharedTestID="hb-edit-shared"
            memberTestID={(userId) => `hb-edit-assign-${userId}`}
          />
        </Card>
      ) : null}

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
