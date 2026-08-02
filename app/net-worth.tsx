/**
 * מסך שווי נטו — כמה כסף יש למשק הבית בסך הכול.
 *
 * v1 מציג שווי נוכחי בלבד בלי גרף, אבל `account_snapshots` נכתבת בכל רענון
 * ולכן גרף עתידי לא ידרוש מיגרציה.
 *
 * 🔴 המסך לא מציג לעולם מספר שנראה שלם כשהוא אינו: אחזקה בלי מחיר חי וגם
 *    בלי שווי בדוח נספרת ב-`unpriced_holdings` ומוצגת כפער מפורש.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { RefreshControl, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { goBack } from '../src/lib/nav';
import { useAuth } from '../src/context/AuthContext';
import { useHousehold } from '../src/context/HouseholdContext';
import * as nw from '../src/lib/networth';
import { formatMoney, shekelsToAgorot } from '../src/lib/format';
import {
  Badge,
  Body,
  Button,
  Card,
  Checkbox,
  Field,
  H1,
  IconBubble,
  InlineMessage,
  Loading,
  Muted,
  PageHeader,
  Screen,
  SectionTitle,
} from '../src/ui';
import { colors, rtlRow, spacing } from '../src/theme';
import { Donut } from '../src/ui/Donut';
import type { AnalysisSlice } from '../src/lib/types';
import { errorText } from '../src/lib/authErrors';

const KIND_ICON: Record<nw.AccountKind, { icon: 'business' | 'trending-up' | 'cash'; color: string }> = {
  bank: { icon: 'business', color: '#4F7FE4' },
  brokerage: { icon: 'trending-up', color: '#2F8F5B' },
  cash: { icon: 'cash', color: '#E4894F' },
};

const KIND_ORDER: nw.AccountKind[] = ['bank', 'brokerage', 'cash'];

export default function NetWorth() {
  const router = useRouter();
  const { user } = useAuth();
  const { householdId } = useHousehold();

  const [ready, setReady] = useState(false);
  const [schemaOk, setSchemaOk] = useState(true);
  const [rows, setRows] = useState<nw.AccountValue[]>([]);
  const [classes, setClasses] = useState<nw.AssetClassValue[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [pricing, setPricing] = useState(false);
  const [message, setMessage] = useState<{ tone: 'error' | 'success' | 'info'; text: string } | null>(null);

  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');
  const [kind, setKind] = useState<nw.AccountKind>('bank');
  const [amount, setAmount] = useState('');
  const [overdrawn, setOverdrawn] = useState(false);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    if (!householdId) return;
    try {
      const ok = await nw.hasNetWorthSchema();
      setSchemaOk(ok);
      if (!ok) {
        setRows([]);
        setClasses([]);
        return;
      }
      setRows(await nw.listAccountValues(householdId));
      // ⚠️ ה-view נוסף במיגרציה 0011, בעוד `hasNetWorthSchema` בודקת את 0010.
      //    כשרק 0010 רצה — מציגים את הסכום בלי הגרף במקום לשבור את המסך.
      try {
        setClasses(await nw.listAssetClassValues(householdId));
      } catch {
        setClasses([]);
      }
    } catch (e) {
      setMessage({ tone: 'error', text: errorText(e, 'לא הצלחנו לטעון את החשבונות') });
    } finally {
      setReady(true);
      setLoading(false);
    }
  }, [householdId]);

  useEffect(() => {
    void load();
  }, [load]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const totals = useMemo(() => {
    const total = rows.reduce((s, r) => s + Number(r.total_agorot ?? 0), 0);
    const unpriced = rows.reduce((s, r) => s + Number(r.unpriced_holdings ?? 0), 0);
    const fromReport = rows.reduce((s, r) => s + Number(r.report_valued_holdings ?? 0), 0);
    const oldest = rows.reduce<string | null>((acc, r) => {
      if (!r.captured_at) return acc;
      return acc === null || r.captured_at < acc ? r.captured_at : acc;
    }, null);
    return { total, unpriced, fromReport, oldest };
  }, [rows]);

  /**
   * פרוסות ההתפלגות. הלוגיקה יושבת ב-`networth.ts` כדי שתהיה ניתנת
   * למדידה בלי לרנדר מסך.
   */
  const distribution = useMemo(() => nw.buildDistribution(classes), [classes]);

  const grouped = useMemo(() => {
    const by = new Map<nw.AccountKind, nw.AccountValue[]>();
    for (const k of KIND_ORDER) by.set(k, []);
    for (const r of rows) {
      const list = by.get(r.kind) ?? by.get('bank')!;
      list.push(r);
    }
    return KIND_ORDER.map((k) => ({ kind: k, items: (by.get(k) ?? []).slice().sort((a, b) => Number(b.total_agorot) - Number(a.total_agorot)) })).filter(
      (g) => g.items.length > 0,
    );
  }, [rows]);

  async function onRefreshPrices() {
    setPricing(true);
    setMessage(null);
    try {
      const res = await nw.refreshPrices();
      await load();
      setMessage({
        tone: res.failed > 0 ? 'info' : 'success',
        text:
          res.failed > 0
            ? `עודכנו ${res.priced} מחירים. ל-${res.failed} ניירות לא התקבל מחיר מהבורסה, והם מוצגים לפי הסכום שהיה בדוח.`
            : `עודכנו ${res.priced} מחירים מהבורסה.`,
      });
    } catch (e) {
      setMessage({
        tone: 'error',
        text: errorText(e, 'לא הצלחנו לעדכן מחירים. ייתכן ששירות המחירים עדיין לא הופעל.'),
      });
    } finally {
      setPricing(false);
    }
  }

  async function onAddAccount() {
    if (!householdId || !user) return;
    const clean = name.trim();
    if (!clean) {
      setMessage({ tone: 'error', text: 'צריך לתת שם לחשבון' });
      return;
    }
    setSaving(true);
    setMessage(null);
    try {
      // 🪤 AmountInput מסנן תווים שאינם ספרות, ולכן אי אפשר להקליד מינוס.
      //    עו"ש במינוס הוא מצב אמיתי (נמדד), ולכן הסימן מגיע מהתיבה.
      const magnitude = shekelsToAgorot(amount || '0');
      await nw.addAccount({
        householdId,
        userId: user.id,
        name: clean,
        kind,
        balanceAgorot: overdrawn ? -magnitude : magnitude,
      });
      setName('');
      setAmount('');
      setOverdrawn(false);
      setAdding(false);
      await load();
      setMessage({ tone: 'success', text: 'החשבון נוסף' });
    } catch (e) {
      setMessage({ tone: 'error', text: errorText(e, 'לא הצלחנו להוסיף את החשבון') });
    } finally {
      setSaving(false);
    }
  }

  if (loading && !ready) {
    return (
      <Screen>
        <PageHeader title="שווי נטו" onBack={() => goBack(router)} />
        <Loading />
      </Screen>
    );
  }

  return (
    <Screen
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={async () => {
            setRefreshing(true);
            await load();
            setRefreshing(false);
          }}
        />
      }
    >
      <PageHeader title="שווי נטו" onBack={() => goBack(router)} />

      {!schemaOk ? (
        <InlineMessage tone="info">
          התכונה הזו דורשת עדכון של מסד הנתונים (מיגרציה 0010). עד שהיא תרוץ, אי אפשר לנהל כאן
          חשבונות והשווי לא יוצג.
        </InlineMessage>
      ) : null}

      {message ? <InlineMessage tone={message.tone}>{message.text}</InlineMessage> : null}

      <Card testID="hb-networth-total">
        <Muted>סך הכול</Muted>
        <H1 testID="hb-networth-total-amount" style={{ marginTop: spacing.xs }}>
          {formatMoney(totals.total)}
        </H1>

        <View style={{ ...rtlRow, gap: spacing.sm, flexWrap: 'wrap', marginTop: spacing.sm }}>
          <Badge icon="time-outline" color={nw.isStale(totals.oldest) ? colors.warning : colors.textMuted}>
            {rows.length === 0 ? 'אין חשבונות' : nw.stalenessLabel(totals.oldest)}
          </Badge>
          {totals.fromReport > 0 ? (
            <Badge icon="document-text-outline" color={colors.textMuted}>
              {`${totals.fromReport} לפי הדוח`}
            </Badge>
          ) : null}
          {totals.unpriced > 0 ? (
            <Badge icon="alert-circle-outline" color={colors.warning}>
              {`${totals.unpriced} בלי שווי`}
            </Badge>
          ) : null}
        </View>

        {totals.unpriced > 0 ? (
          <Muted testID="hb-networth-gap" style={{ marginTop: spacing.md, fontSize: 12 }}>
            {`ל-${totals.unpriced} אחזקות אין מחיר מהבורסה וגם לא שווי בדוח, ולכן הן אינן נכללות בסכום.
הסכום שמוצג נמוך מהאמיתי.`}
          </Muted>
        ) : null}

        <Button
          title="עדכון מחירים מהבורסה"
          icon="refresh"
          variant="secondary"
          size="sm"
          loading={pricing}
          disabled={!schemaOk}
          testID="hb-networth-refresh-prices"
          onPress={onRefreshPrices}
          style={{ marginTop: spacing.lg }}
        />
      </Card>

      {/* 🔴 גם כשאין ולו פרוסה אחת — אם יש אחזקות בלי מחיר, זו בדיוק
          המצב שחייב להיאמר. תנאי `slices.length > 0` לבדו היה מסתיר
          את האזהרה דווקא כשהיא הכי נחוצה. */}
      {distribution.slices.length > 0 || distribution.unpriced > 0 ? (
        <Card testID="hb-networth-distribution">
          <SectionTitle>התפלגות</SectionTitle>
          {distribution.slices.length > 0 ? (
            <View style={{ alignItems: 'center', marginBottom: spacing.lg }}>
              <Donut
                slices={distribution.slices}
                accessibilityLabel="התפלגות ההון לפי סוג נכס"
              >
                <Muted style={{ fontSize: 11 }}>סך הנכסים</Muted>
                <Body style={{ fontWeight: '700' }}>{formatMoney(distribution.sum)}</Body>
              </Donut>
            </View>
          ) : null}

          {distribution.slices.map((slice) => (
            <View
              key={slice.key}
              testID={`hb-networth-slice-${slice.key}`}
              style={{
                ...rtlRow,
                alignItems: 'center',
                gap: spacing.sm,
                paddingVertical: spacing.xs,
              }}
            >
              <View
                style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: slice.color }}
              />
              <Body style={{ flex: 1 }}>{slice.label}</Body>
              <Muted style={{ fontSize: 12 }}>{`${slice.percent}%`}</Muted>
              <Body style={{ fontWeight: '600' }}>{formatMoney(slice.amount)}</Body>
            </View>
          ))}

          {distribution.pending > 0 ? (
            <Muted testID="hb-networth-pending-note" style={{ marginTop: spacing.md, fontSize: 12 }}>
              {`${formatMoney(distribution.pending)} סומנו כהעברה להשקעות ועדיין לא שויכו לחשבון. הכסף נספר בהון, אבל כדאי להוסיף את האחזקה שנרכשה.`}
            </Muted>
          ) : null}

          {distribution.unpriced > 0 ? (
            <Muted testID="hb-networth-distribution-unpriced" style={{ marginTop: spacing.md, fontSize: 12 }}>
              {`ל-${distribution.unpriced} אחזקות אין מחיר וגם אין שווי בדוח, ולכן הן נספרו כאפס. האחוזים כאן מחושבים על בסיס חסר.`}
            </Muted>
          ) : null}

          {distribution.negative.length > 0 ? (
            <Muted testID="hb-networth-negative-note" style={{ marginTop: spacing.md, fontSize: 12 }}>
              {`${distribution.negative
                .map((n) => `${n.label} ${formatMoney(n.amount)}`)
                .join(' · ')} — יתרה שלילית אינה מוצגת בגרף, אבל היא כלולה בסך הכול.`}
            </Muted>
          ) : null}
        </Card>
      ) : null}

      {grouped.map((group) => (
        <View key={group.kind}>
          <SectionTitle>{nw.ACCOUNT_KIND_LABEL[group.kind]}</SectionTitle>
          {group.items.map((row) => (
            <AccountRow key={row.account_id} row={row} onPress={() => router.push(`/account/${row.account_id}` as never)} />
          ))}
        </View>
      ))}

      {schemaOk && rows.length === 0 ? (
        <Card>
          <Body style={{ fontWeight: '700', marginBottom: spacing.xs }}>עוד אין חשבונות</Body>
          <Muted>
            הוסיפו חשבון בנק, בית השקעות או מזומן, ונחשב לכם את השווי הכולל. שווי ניירות ערך
            יתעדכן ממחירי הבורסה.
          </Muted>
        </Card>
      ) : null}

      {adding ? (
        <Card testID="hb-networth-add-form">
          <SectionTitle>חשבון חדש</SectionTitle>
          <Field
            label="שם החשבון"
            value={name}
            onChangeText={setName}
            placeholder="עובר ושב, קרן השתלמות, ארנק…"
            accessibilityLabel="שם החשבון"
            testID="hb-account-name"
          />

          <Muted style={{ marginBottom: spacing.xs }}>סוג</Muted>
          <View style={{ ...rtlRow, gap: spacing.sm, flexWrap: 'wrap', marginBottom: spacing.lg }}>
            {KIND_ORDER.map((k) => {
              const active = kind === k;
              return (
                <Button
                  key={k}
                  title={nw.ACCOUNT_KIND_LABEL[k]}
                  icon={KIND_ICON[k].icon}
                  size="sm"
                  variant={active ? 'primary' : 'ghost'}
                  onPress={() => setKind(k)}
                  testID={`hb-account-kind-${k}`}
                  style={{ flexGrow: 0, paddingHorizontal: spacing.lg }}
                />
              );
            })}
          </View>

          <Muted style={{ marginBottom: spacing.xs }}>
            {kind === 'brokerage' ? 'יתרת מזומן בחשבון' : 'יתרה נוכחית'}
          </Muted>
          <View style={{ marginBottom: spacing.md }}>
            <Field
              value={amount}
              onChangeText={(t) => setAmount(t.replace(/[^\d.]/g, ''))}
              placeholder="0"
              keyboardType="decimal-pad"
              inputMode="decimal"
              accessibilityLabel="יתרה בשקלים"
              testID="hb-account-balance"
            />
          </View>

          {/* ⚠️ אם המשתמש יזין את הסכום שהבנק מציג — שכולל קרן כספית —
              וגם יוסיף את הקרן כאחזקה, היא תיספר פעמיים **בשקט**. */}
          <Muted testID="hb-account-balance-hint" style={{ marginTop: -spacing.xs, marginBottom: spacing.md, fontSize: 12 }}>
            {kind === 'brokerage'
              ? 'יתרת המזומן בלבד — בלי ניירות ערך. את הניירות מוסיפים בתוך החשבון, אחרת הם ייספרו פעמיים.'
              : 'יתרת העובר ושב בלבד — בלי קרנות וניירות ערך שהוזנו בנפרד, אחרת הם ייספרו פעמיים.'}
          </Muted>

          {/* יתרת עו"ש שלילית היא מצב אמיתי ונמדד — ולכן העמודה במסד חתומה */}
          <Checkbox
            value={overdrawn}
            onValueChange={setOverdrawn}
            label="החשבון במינוס"
            hint="יתרת עובר ושב יכולה להיות שלילית, והיא תופחת מהשווי הכולל"
            accessibilityLabel="החשבון במינוס"
            testID="hb-account-overdrawn"
          />

          <View style={{ ...rtlRow, gap: spacing.sm, marginTop: spacing.lg }}>
            <Button
              title="שמירה"
              onPress={onAddAccount}
              loading={saving}
              testID="hb-account-save"
              style={{ flex: 1 }}
            />
            <Button
              title="ביטול"
              variant="ghost"
              onPress={() => {
                setAdding(false);
                setMessage(null);
              }}
              style={{ flex: 1 }}
            />
          </View>
        </Card>
      ) : (
        <Button
          title="הוספת חשבון"
          icon="add"
          variant="secondary"
          disabled={!schemaOk}
          onPress={() => setAdding(true)}
          testID="hb-networth-add-account"
        />
      )}
    </Screen>
  );
}

function AccountRow({ row, onPress }: { row: nw.AccountValue; onPress: () => void }) {
  const meta = KIND_ICON[row.kind] ?? KIND_ICON.bank;
  const holdings = Number(row.holdings_agorot ?? 0);
  const balance = Number(row.balance_agorot ?? 0);

  return (
    <Card
      onPress={onPress}
      accessibilityLabel={row.name}
      testID={`hb-account-row-${row.account_id}`}
      style={{ paddingVertical: spacing.md }}
    >
      <View style={{ ...rtlRow, justifyContent: 'space-between', gap: spacing.md }}>
        <View style={{ ...rtlRow, gap: spacing.md, flexShrink: 1, minWidth: 0 }}>
          <IconBubble icon={meta.icon} color={meta.color} size={38} />
          <View style={{ flexShrink: 1, minWidth: 0 }}>
            <Body style={{ fontWeight: '700' }} numberOfLines={1}>
              {row.name}
            </Body>
            <Muted style={{ fontSize: 12 }}>
              {holdings !== 0
                ? `${formatMoney(balance)} מזומן · ${formatMoney(holdings)} ניירות`
                : nw.stalenessLabel(row.captured_at)}
            </Muted>
          </View>
        </View>
        <View style={{ alignItems: 'flex-start' }}>
          <Body
            style={{
              fontWeight: '800',
              color: Number(row.total_agorot) < 0 ? colors.danger : colors.text,
            }}
          >
            {formatMoney(Number(row.total_agorot ?? 0))}
          </Body>
          {Number(row.unpriced_holdings) > 0 ? (
            <Muted style={{ fontSize: 11, color: colors.warning }}>הסכום חסר</Muted>
          ) : null}
        </View>
      </View>
    </Card>
  );
}
