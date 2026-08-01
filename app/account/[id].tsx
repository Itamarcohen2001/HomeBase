/**
 * פירוט חשבון — יתרה, אחזקות, והוספת נייר ערך.
 *
 * 🎯 הוספת נייר נעשית דרך **חיפוש בקטלוג החי של הבורסה** (כ-11,000 ניירות).
 *    אין בקוד ולו מספר נייר אחד — זו הדרישה הגנרית, והמסך הזה הוא ההוכחה
 *    שלה מול המשתמש.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { goBack } from '../../src/lib/nav';
import { useHousehold } from '../../src/context/HouseholdContext';
import * as nw from '../../src/lib/networth';
import { formatMoney, shekelsToAgorot, toDateString } from '../../src/lib/format';
import {
  Badge,
  Body,
  Button,
  Card,
  Checkbox,
  Divider,
  Field,
  H2,
  InlineMessage,
  Loading,
  Muted,
  PageHeader,
  Screen,
  SectionTitle,
  useDialog,
} from '../../src/ui';
import { colors, rtlRow, spacing } from '../../src/theme';
import { errorText } from '../../src/lib/authErrors';

export default function AccountDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { confirm } = useDialog();
  const { householdId } = useHousehold();

  const [account, setAccount] = useState<nw.Account | null>(null);
  const [holdings, setHoldings] = useState<nw.HoldingView[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<{ tone: 'error' | 'success' | 'info'; text: string } | null>(null);

  const [balance, setBalance] = useState('');
  const [overdrawn, setOverdrawn] = useState(false);
  const [savingBalance, setSavingBalance] = useState(false);

  const [query, setQuery] = useState('');
  const [results, setResults] = useState<nw.CatalogResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [picked, setPicked] = useState<nw.CatalogResult | null>(null);
  const [quantity, setQuantity] = useState('');
  const [addingHolding, setAddingHolding] = useState(false);

  const load = useCallback(async () => {
    if (!householdId || !id) return;
    try {
      const accounts = await nw.listAccounts(householdId);
      const found = accounts.find((a) => a.id === id) ?? null;
      setAccount(found);
      if (found) {
        setBalance(String(Math.abs(found.balance_agorot) / 100));
        setOverdrawn(found.balance_agorot < 0);
        setHoldings(await nw.listHoldings(found.id));
      }
    } catch (e) {
      setMessage({ tone: 'error', text: errorText(e, 'לא הצלחנו לטעון את החשבון') });
    } finally {
      setLoading(false);
    }
  }, [householdId, id]);

  useEffect(() => {
    void load();
  }, [load]);

  const holdingsTotal = useMemo(
    () => holdings.reduce((s, h) => s + (h.value_agorot ?? 0), 0),
    [holdings],
  );
  const unpriced = useMemo(() => holdings.filter((h) => h.value_agorot === null).length, [holdings]);

  async function onSaveBalance() {
    if (!account) return;
    setSavingBalance(true);
    setMessage(null);
    try {
      const magnitude = shekelsToAgorot(balance || '0');
      await nw.updateAccountBalance(account.id, overdrawn ? -magnitude : magnitude);
      await load();
      setMessage({ tone: 'success', text: 'היתרה עודכנה' });
    } catch (e) {
      setMessage({ tone: 'error', text: errorText(e, 'לא הצלחנו לעדכן את היתרה') });
    } finally {
      setSavingBalance(false);
    }
  }

  async function onSearch() {
    const q = query.trim();
    if (q.length < 2) {
      setMessage({ tone: 'error', text: 'צריך להקליד לפחות שתי אותיות' });
      return;
    }
    setSearching(true);
    setMessage(null);
    try {
      const found = await nw.searchSecurities(q);
      setResults(found);
      if (found.length === 0) {
        setMessage({ tone: 'info', text: 'לא נמצא נייר מתאים בקטלוג הבורסה' });
      }
    } catch (e) {
      setMessage({
        tone: 'error',
        text: errorText(e, 'לא הצלחנו לחפש בקטלוג. ייתכן ששירות המחירים עדיין לא הופעל.'),
      });
    } finally {
      setSearching(false);
    }
  }

  async function onAddHolding() {
    if (!account || !householdId || !picked) return;
    const qty = Number(quantity.replace(/[^\d.]/g, ''));
    if (!Number.isFinite(qty) || qty <= 0) {
      setMessage({ tone: 'error', text: 'צריך להזין כמות גדולה מאפס' });
      return;
    }
    setAddingHolding(true);
    setMessage(null);
    try {
      const security = await nw.resolveSecurity(picked);
      await nw.addHolding({
        householdId,
        accountId: account.id,
        securityId: security.id,
        quantity: qty,
        asOf: toDateString(new Date()),
      });
      setPicked(null);
      setQuantity('');
      setQuery('');
      setResults([]);
      await load();
      setMessage({ tone: 'success', text: 'הנייר נוסף. השווי יתעדכן בעדכון המחירים הבא.' });
    } catch (e) {
      setMessage({ tone: 'error', text: errorText(e, 'לא הצלחנו להוסיף את הנייר') });
    } finally {
      setAddingHolding(false);
    }
  }

  async function onDeleteHolding(holding: nw.HoldingView) {
    const ok = await confirm({
      title: 'מחיקת אחזקה',
      message: `למחוק את ${holding.securities?.name ?? 'הנייר'} מהחשבון?`,
      confirmText: 'מחיקה',
      destructive: true,
    });
    if (!ok) return;
    try {
      await nw.deleteHolding(holding.id);
      await load();
    } catch (e) {
      setMessage({ tone: 'error', text: errorText(e, 'לא הצלחנו למחוק את האחזקה') });
    }
  }

  if (loading) {
    return (
      <Screen>
        <PageHeader title="חשבון" onBack={() => goBack(router)} />
        <Loading />
      </Screen>
    );
  }

  if (!account) {
    return (
      <Screen>
        <PageHeader title="חשבון" onBack={() => goBack(router)} />
        <InlineMessage tone="error">החשבון לא נמצא</InlineMessage>
      </Screen>
    );
  }

  return (
    <Screen>
      <PageHeader title={account.name} onBack={() => goBack(router)} />

      {message ? <InlineMessage tone={message.tone}>{message.text}</InlineMessage> : null}

      <Card>
        <Muted>{nw.ACCOUNT_KIND_LABEL[account.kind]}</Muted>
        <H2 testID="hb-account-total" style={{ marginTop: spacing.xs }}>
          {formatMoney(account.balance_agorot + holdingsTotal)}
        </H2>
        <Muted style={{ marginTop: spacing.xs, fontSize: 12 }}>
          {nw.stalenessLabel(account.captured_at)}
        </Muted>
      </Card>

      <SectionTitle>יתרת מזומן</SectionTitle>
      <Card>
        <Field
          value={balance}
          onChangeText={(t) => setBalance(t.replace(/[^\d.]/g, ''))}
          placeholder="0"
          keyboardType="decimal-pad"
          inputMode="decimal"
          accessibilityLabel="יתרה בשקלים"
          testID="hb-account-balance-edit"
        />
        <Checkbox
          value={overdrawn}
          onValueChange={setOverdrawn}
          label="החשבון במינוס"
          accessibilityLabel="החשבון במינוס"
          testID="hb-account-overdrawn-edit"
        />
        <Button
          title="עדכון היתרה"
          onPress={() => void onSaveBalance()}
          loading={savingBalance}
          testID="hb-account-balance-save"
          style={{ marginTop: spacing.md }}
        />
      </Card>

      <SectionTitle>ניירות ערך</SectionTitle>

      {holdings.length === 0 ? (
        <Card>
          <Muted>אין אחזקות בחשבון הזה.</Muted>
        </Card>
      ) : (
        <Card>
          {unpriced > 0 ? (
            <Muted style={{ marginBottom: spacing.md, color: colors.warning, fontSize: 12 }}>
              {`ל-${unpriced} אחזקות אין מחיר מהבורסה וגם לא שווי בדוח. הן אינן נכללות בסכום.`}
            </Muted>
          ) : null}
          {holdings.map((h, i) => (
            <View key={h.id}>
              {i > 0 ? <Divider /> : null}
              <View style={{ ...rtlRow, justifyContent: 'space-between', gap: spacing.md }}>
                <View style={{ flexShrink: 1, minWidth: 0 }}>
                  <Body style={{ fontWeight: '700' }} numberOfLines={1}>
                    {h.securities?.name ?? 'נייר לא ידוע'}
                  </Body>
                  <View style={{ ...rtlRow, gap: spacing.xs, flexWrap: 'wrap', marginTop: 2 }}>
                    <Muted style={{ fontSize: 12 }}>
                      {`${h.quantity.toLocaleString('he-IL')} יחידות`}
                    </Muted>
                    {h.ils_price_agorot !== null ? (
                      <Badge icon="pricetag-outline" color={colors.textMuted}>
                        {formatMoney(h.ils_price_agorot)}
                      </Badge>
                    ) : h.value_agorot !== null ? (
                      <Badge icon="document-text-outline" color={colors.textMuted}>
                        לפי הדוח
                      </Badge>
                    ) : (
                      <Badge icon="alert-circle-outline" color={colors.warning}>
                        אין מחיר
                      </Badge>
                    )}
                  </View>
                </View>
                <View style={{ ...rtlRow, gap: spacing.sm }}>
                  <Body style={{ fontWeight: '800' }}>
                    {h.value_agorot === null ? 'הסכום חסר' : formatMoney(h.value_agorot)}
                  </Body>
                  <Button
                    title=""
                    icon="trash-outline"
                    variant="ghost"
                    size="sm"
                    accessibilityLabel={`מחיקת ${h.securities?.name ?? 'נייר'}`}
                    onPress={() => void onDeleteHolding(h)}
                    style={{ flexGrow: 0, paddingHorizontal: spacing.md }}
                  />
                </View>
              </View>
            </View>
          ))}
        </Card>
      )}

      <SectionTitle>הוספת נייר ערך</SectionTitle>
      <Card testID="hb-security-search">
        <Field
          label="חיפוש בקטלוג הבורסה"
          value={query}
          onChangeText={setQuery}
          onSubmitEditing={() => void onSearch()}
          placeholder="שם נייר, סימול או מספר"
          hint="החיפוש רץ מול קטלוג הבורסה המלא, ולא מול רשימה קבועה"
          accessibilityLabel="חיפוש נייר ערך"
          testID="hb-security-query"
        />
        <Button
          title="חיפוש"
          icon="search"
          variant="secondary"
          loading={searching}
          onPress={() => void onSearch()}
          testID="hb-security-search-button"
        />

        {results.map((r) => {
          const active = picked?.external_id === r.external_id && picked?.price_feed === r.price_feed;
          return (
            <Card
              key={`${r.price_feed}:${r.external_id}`}
              onPress={() => setPicked(active ? null : r)}
              accessibilityLabel={r.name}
              testID={`hb-security-result-${r.external_id}`}
              style={{
                marginTop: spacing.md,
                marginBottom: 0,
                borderWidth: 1,
                borderColor: active ? colors.primary : colors.border,
                backgroundColor: active ? colors.primarySoft : colors.surface,
              }}
            >
              <Body style={{ fontWeight: '700' }} numberOfLines={2}>
                {r.name}
              </Body>
              <View style={{ ...rtlRow, gap: spacing.xs, flexWrap: 'wrap', marginTop: spacing.xs }}>
                {r.category ? <Badge color={colors.textMuted}>{r.category}</Badge> : null}
                {r.symbol ? <Badge color={colors.textMuted}>{r.symbol}</Badge> : null}
                <Muted style={{ fontSize: 11 }}>{r.external_id}</Muted>
              </View>
            </Card>
          );
        })}

        {picked ? (
          <View style={{ marginTop: spacing.lg }}>
            <Field
              label="כמות"
              value={quantity}
              onChangeText={(t) => setQuantity(t.replace(/[^\d.]/g, ''))}
              placeholder="0"
              keyboardType="decimal-pad"
              inputMode="decimal"
              hint="באיגרות חוב הכמות היא הערך הנקוב"
              accessibilityLabel="כמות יחידות"
              testID="hb-holding-quantity"
            />
            <Button
              title="הוספה לחשבון"
              onPress={() => void onAddHolding()}
              loading={addingHolding}
              testID="hb-holding-add"
            />
          </View>
        ) : null}
      </Card>
    </Screen>
  );
}
