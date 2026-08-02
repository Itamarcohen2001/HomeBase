/**
 * פירוט חשבון — יתרה, אחזקות, והוספת נייר ערך.
 *
 * 🎯 הוספת נייר נעשית דרך **חיפוש בקטלוג החי של הבורסה** (כ-11,000 ניירות).
 *    אין בקוד ולו מספר נייר אחד — זו הדרישה הגנרית, והמסך הזה הוא ההוכחה
 *    שלה מול המשתמש.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Platform, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as DocumentPicker from 'expo-document-picker';
import { goBack } from '../../src/lib/nav';
import { useHousehold } from '../../src/context/HouseholdContext';
import * as nw from '../../src/lib/networth';
import { parsePortfolioFile, type PortfolioHolding, type PortfolioParseResult } from '../../src/lib/portfolio/parse';
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

const WEB_ACCEPT =
  '.xlsx,.xls,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel,text/csv';
const NATIVE_TYPES = [
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-excel',
  'text/csv',
];

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
  const [marking, setMarking] = useState(false);
  const [trackingSchemaOk, setTrackingSchemaOk] = useState(false);

  const [query, setQuery] = useState('');
  const [results, setResults] = useState<nw.CatalogResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [picked, setPicked] = useState<nw.CatalogResult | null>(null);
  const [quantity, setQuantity] = useState('');
  const [addingHolding, setAddingHolding] = useState(false);

  // ── ייבוא קובץ אחזקות ──────────────────────────────────────────────────────
  const webInput = useRef<HTMLInputElement | null>(null);
  const [pending, setPending] = useState<PortfolioParseResult | null>(null);
  const [selected, setSelected] = useState<boolean[]>([]);
  const [dropMissing, setDropMissing] = useState(true);
  const [importing, setImporting] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!householdId || !id) return;
    try {
      const accounts = await nw.listAccounts(householdId);
      const found = accounts.find((a) => a.id === id) ?? null;
      setAccount(found);
      // 🔴 בלי 0013 אין מה לסמן — הצ'קבוקס לא יוצג במקום להיכשל בלחיצה.
      setTrackingSchemaOk(await nw.hasTransactionAccountColumn());
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

  const isTxAccount = Boolean(account?.is_transaction_account);

  const selectedCount = useMemo(() => selected.filter(Boolean).length, [selected]);
  const selectedTotal = useMemo(
    () => (pending ? pending.holdings.reduce((s, h, i) => (selected[i] ? s + h.statedValue : s), 0) : 0),
    [pending, selected],
  );

  async function onSaveBalance() {
    if (!account) return;
    setSavingBalance(true);
    setMessage(null);
    try {
      const magnitude = shekelsToAgorot(balance || '0');
      await nw.updateAccountBalance(account.id, overdrawn ? -magnitude : magnitude);
      await load();
      // 🎯 החלטה 18: הקלדה ידנית היא **תיקון עוגן** — היא מציבה captured_at
      //    חדש, ולכן הצבירה מתחילה מכאן ומה שנצבר עד עכשיו כבר בתוך המספר.
      setMessage({
        tone: 'success',
        text: isTxAccount
          ? 'היתרה עודכנה. מכאן נמשיך לעקוב לפי התנועות שתרשמו.'
          : 'היתרה עודכנה',
      });
    } catch (e) {
      setMessage({ tone: 'error', text: errorText(e, 'לא הצלחנו לעדכן את היתרה') });
    } finally {
      setSavingBalance(false);
    }
  }

  /**
   * 🔴 סימון חשבון התנועות. **החלפה, לא הוספה** — הפונקציה בשרת מבטלת את
   *    הקודם באותה טרנזקציה, אחרת האינדקס החלקי היה מחזיר שגיאה סתומה.
   */
  async function onSetTransactionAccount(next: boolean) {
    if (!account || marking) return;
    setMarking(true);
    setMessage(null);
    try {
      if (next) await nw.setTransactionAccount(account.id);
      else await nw.clearTransactionAccount(account.id);
      await load();
      setMessage({
        tone: 'success',
        text: next ? 'החשבון סומן כחשבון התנועות' : 'הסימון בוטל. התנועות לא יעדכנו אף חשבון.',
      });
    } catch (e) {
      setMessage({ tone: 'error', text: errorText(e, 'לא הצלחנו לסמן את החשבון') });
    } finally {
      setMarking(false);
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

  // ── ייבוא קובץ אחזקות ──────────────────────────────────────────────────────

  /** ב-web יש אובייקט `File` אמיתי; בנייטיב מקבלים `file://` וקוראים דרך fetch. */
  async function assetToBuffer(asset: DocumentPicker.DocumentPickerAsset): Promise<ArrayBuffer> {
    if (asset.file) return asset.file.arrayBuffer();
    const response = await fetch(asset.uri);
    return response.arrayBuffer();
  }

  async function loadFile(name: string, data: ArrayBuffer) {
    setMessage(null);
    try {
      const parsed = await parsePortfolioFile({ name, data });
      setPending(parsed);
      // 🔴 אף שורה לא נכתבת בלי אישור. הכול מסומן, והמשתמש מוריד סימון.
      setSelected(parsed.holdings.map(() => true));
    } catch (e) {
      setPending(null);
      setSelected([]);
      setMessage({ tone: 'error', text: errorText(e, 'לא הצלחנו לקרוא את הקובץ') });
    }
  }

  async function onPickPortfolio() {
    setMessage(null);
    if (Platform.OS === 'web') {
      webInput.current?.click();
      return;
    }
    try {
      const res = await DocumentPicker.getDocumentAsync({
        type: NATIVE_TYPES,
        multiple: false,
        copyToCacheDirectory: true,
      });
      if (res.canceled || !res.assets?.length) return;
      const asset = res.assets[0];
      await loadFile(asset.name, await assetToBuffer(asset));
    } catch (e) {
      setMessage({ tone: 'error', text: errorText(e, 'לא הצלחנו לפתוח את הקובץ') });
    }
  }

  function cancelImport() {
    setPending(null);
    setSelected([]);
    setProgress(null);
  }

  async function onConfirmImport() {
    if (!pending || !account || !householdId) return;
    const chosen = pending.holdings.filter((_, i) => selected[i]);
    if (!chosen.length) {
      setMessage({ tone: 'error', text: 'לא נבחרה אף אחזקה לייבוא' });
      return;
    }
    setImporting(true);
    setMessage(null);
    const asOf = toDateString(new Date());
    const securityIds: string[] = [];
    const unresolved: string[] = [];
    try {
      for (let i = 0; i < chosen.length; i++) {
        const h = chosen[i];
        setProgress(`מייבא ${i + 1} מתוך ${chosen.length}…`);
        let security: nw.Security;
        try {
          security = await nw.resolveSecurity({
            external_id: h.externalId,
            price_feed: h.priceFeed,
            name: h.name,
            symbol: h.symbol,
          });
        } catch {
          // נייר בודד שלא נפתר לא מפיל את כל הייבוא — הוא מדווח בסוף.
          unresolved.push(h.name);
          continue;
        }
        await nw.addHolding({
          householdId,
          accountId: account.id,
          securityId: security.id,
          quantity: h.quantity,
          asOf,
          statedValueAgorot: Math.round(h.statedValue * 100),
          statedSharePct: h.sharePct,
        });
        securityIds.push(security.id);
      }

      let removed = 0;
      if (dropMissing && securityIds.length) {
        setProgress('מסיר אחזקות שאינן בקובץ…');
        removed = await nw.deleteHoldingsNotIn(account.id, securityIds);
      }

      cancelImport();
      await load();
      const parts = [`יובאו ${securityIds.length} אחזקות`];
      if (removed) parts.push(`והוסרו ${removed} שכבר אינן בקובץ`);
      if (unresolved.length) parts.push(`${unresolved.length} ניירות לא זוהו ולא יובאו`);
      setMessage({
        tone: unresolved.length ? 'info' : 'success',
        text: `${parts.join(', ')}. השווי יתעדכן בעדכון המחירים הבא.`,
      });
    } catch (e) {
      setMessage({ tone: 'error', text: errorText(e, 'הייבוא נכשל') });
    } finally {
      setImporting(false);
      setProgress(null);
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

  if (pending) {
    return (
      <Screen>
        <PageHeader title="אישור ייבוא אחזקות" onBack={cancelImport} />

        {message ? <InlineMessage tone={message.tone}>{message.text}</InlineMessage> : null}

        <Card>
          <Muted>{pending.source}</Muted>
          <H2 testID="hb-portfolio-stated-total" style={{ marginTop: spacing.xs }}>
            {formatMoney(Math.round(pending.statedTotal * 100))}
          </H2>
          <Muted style={{ marginTop: spacing.xs, fontSize: 12 }}>
            {`${pending.holdings.length} אחזקות בקובץ · נכון ל-${toDateString(new Date())}`}
          </Muted>
          <Muted style={{ marginTop: spacing.xs, fontSize: 12 }}>
            הסכומים כאן הם מה שכתוב בקובץ. אחרי הייבוא השווי יחושב לפי מחירי הבורסה
            העדכניים, ולכן הוא עשוי להיות שונה.
          </Muted>
        </Card>

        {pending.notes.map((note, i) => (
          <InlineMessage key={i} tone="info" testID={`hb-portfolio-note-${i}`}>
            {note}
          </InlineMessage>
        ))}

        <Card>
          <Checkbox
            value={selected.every(Boolean)}
            onValueChange={(v) => setSelected(pending.holdings.map(() => v))}
            label="לסמן את כל האחזקות"
            accessibilityLabel="לסמן את כל האחזקות"
            testID="hb-portfolio-select-all"
          />
          <Divider />
          <Checkbox
            value={dropMissing}
            onValueChange={setDropMissing}
            label="להסיר אחזקות שאינן בקובץ"
            hint="בלי זה נייר שמכרתם יישאר בחשבון וימשיך להיספר בשווי הכולל"
            accessibilityLabel="להסיר אחזקות שאינן בקובץ"
            testID="hb-portfolio-drop-missing"
          />
        </Card>

        <Card>
          {pending.holdings.map((h, i) => (
            <View key={`${h.externalId}-${i}`}>
              {i > 0 ? <Divider /> : null}
              <View style={{ ...rtlRow, justifyContent: 'space-between', gap: spacing.md }}>
                <View style={{ flexShrink: 1, minWidth: 0 }}>
                  <Checkbox
                    value={Boolean(selected[i])}
                    onValueChange={(v) =>
                      setSelected((prev) => prev.map((s, j) => (j === i ? v : s)))
                    }
                    label={h.name}
                    accessibilityLabel={`ייבוא ${h.name}`}
                    testID={`hb-portfolio-row-${i}`}
                  />
                  <View style={{ ...rtlRow, gap: spacing.xs, flexWrap: 'wrap', marginTop: 2 }}>
                    <Muted style={{ fontSize: 12 }}>
                      {`${h.quantity.toLocaleString('he-IL')} יחידות`}
                    </Muted>
                    {h.isFxCash ? (
                      <Badge icon="cash-outline" color={colors.textMuted}>
                        מזומן מט"ח
                      </Badge>
                    ) : null}
                    {h.currency !== 'ILS' && !h.isFxCash ? (
                      <Badge color={colors.textMuted}>{h.currency}</Badge>
                    ) : null}
                    {!h.reconciled ? (
                      <Badge icon="alert-circle-outline" color={colors.warning}>
                        השווי בקובץ אינו מסתדר
                      </Badge>
                    ) : null}
                  </View>
                </View>
                <Body style={{ fontWeight: '800' }}>
                  {formatMoney(Math.round(h.statedValue * 100))}
                </Body>
              </View>
            </View>
          ))}
        </Card>

        <Card>
          <Body testID="hb-portfolio-summary" style={{ fontWeight: '700' }}>
            {`${selectedCount} אחזקות · ${formatMoney(Math.round(selectedTotal * 100))}`}
          </Body>
          {progress ? (
            <Muted style={{ marginTop: spacing.xs, fontSize: 12 }}>{progress}</Muted>
          ) : null}
          <Button
            title="ייבוא לחשבון"
            onPress={() => void onConfirmImport()}
            loading={importing}
            testID="hb-portfolio-confirm"
            style={{ marginTop: spacing.md }}
          />
          <Button
            title="ביטול"
            variant="ghost"
            onPress={cancelImport}
            testID="hb-portfolio-cancel"
          />
        </Card>
      </Screen>
    );
  }

  return (
    <Screen>
      <PageHeader title={account.name} onBack={() => goBack(router)} />

      {/* input אמיתי ב-DOM: יציב לאוטומציה, ולא נמחק אחרי הבחירה */}
      {Platform.OS === 'web' ? (
        <input
          ref={webInput}
          type="file"
          id="hb-portfolio-input"
          data-testid="hb-portfolio-input"
          aria-label="בחירת קובץ אחזקות"
          accept={WEB_ACCEPT}
          onChange={(event) => {
            const file = event.target.files?.[0];
            // איפוס הערך כדי שבחירה חוזרת באותו קובץ תפעיל onChange שוב
            event.target.value = '';
            if (file) void file.arrayBuffer().then((buf) => loadFile(file.name, buf));
          }}
          style={{ position: 'absolute', width: 1, height: 1, opacity: 0, pointerEvents: 'none' }}
        />
      ) : null}

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
        {/* ⚠️ הסכום שהבנק מציג כולל לעתים קרנות כספיות. אם הן מוזנות גם
            כאחזקה למטה, הן ייספרו פעמיים **בלי שום שגיאה**. */}
        <Muted testID="hb-account-balance-hint-edit" style={{ marginBottom: spacing.sm, fontSize: 12 }}>
          יתרת המזומן בלבד — בלי ניירות ערך וקרנות שמופיעים ברשימה למטה, אחרת הם ייספרו פעמיים.
        </Muted>
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

      {/* 🎯 החלטה 19: חשבון אחד אחראי על התנועות, והמשתמש בוחר אותו.
          «יש לי כמה חשבונות עו"ש, ואני אסמן אחד כאחראי על התנועות».
          🔴 מוצג רק כשהעמודה קיימת: בלי 0013 הצ'קבוקס היה נראה זמין
          וה-RPC היה נכשל — פעולה שמובטחת ונשברת גרועה מפעולה שאינה מוצגת. */}
      {account.kind === 'bank' && trackingSchemaOk ? (
        <Card>
          <Checkbox
            value={isTxAccount}
            onValueChange={(v) => void onSetTransactionAccount(v)}
            label="חשבון התנועות"
            accessibilityLabel="חשבון התנועות"
            testID="hb-account-transaction-account"
          />
          <Muted testID="hb-account-transaction-hint" style={{ marginTop: spacing.sm, fontSize: 12 }}>
            {isTxAccount
              ? 'כל ההוצאות וההכנסות שנרשמות באפליקציה יורדות מהחשבון הזה, והיתרה מתעדכנת לפיהן מאליה. הקלדת יתרה חדשה מאפסת את הספירה ומתחילה מחדש.'
              : 'סימון החשבון הזה יגרום לכל ההוצאות וההכנסות שנרשמות באפליקציה להתעדכן ביתרה שלו. אפשר לסמן חשבון אחד בלבד — הסימון הקודם יבוטל.'}
          </Muted>
        </Card>
      ) : null}

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

      <SectionTitle>ייבוא קובץ אחזקות</SectionTitle>
      <Card testID="hb-portfolio-import">
        <Muted style={{ fontSize: 13 }}>
          אפשר להעלות את קובץ האחזקות שבית ההשקעות מייצא (Excel או CSV). הקובץ נקרא
          ומוצג לאישור, ושום דבר לא נשמר לפני שמאשרים.
        </Muted>
        <Button
          title="בחירת קובץ"
          icon="cloud-upload-outline"
          variant="secondary"
          onPress={() => void onPickPortfolio()}
          testID="hb-portfolio-pick"
          style={{ marginTop: spacing.md }}
        />
      </Card>

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
                {/* 🎯 מספר הנייר הוא לעתים הדיסקרימינטור **היחיד**: חמש קרנות
                    בקטלוג נקראות «אנליסט כספית» ושתיים מהן «כספית שקלית».
                    לכן הוא מודגש ולא מוסתר כטקסט משני. */}
                <Badge icon="pricetag-outline" color={colors.primary}>{r.external_id}</Badge>
                {r.category ? <Badge color={colors.textMuted}>{r.category}</Badge> : null}
                {r.symbol ? <Badge color={colors.textMuted}>{r.symbol}</Badge> : null}
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
