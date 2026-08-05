import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Modal, Platform, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useTheme } from '../src/context/ThemeContext';
import { Ionicons } from '@expo/vector-icons';
import * as DocumentPicker from 'expo-document-picker';
import { goBack } from '../src/lib/nav';
import { useAuth } from '../src/context/AuthContext';
import { useHousehold } from '../src/context/HouseholdContext';
import * as db from '../src/lib/db';
import { formatDate, formatILS, monthEnd, monthLabel, monthStart } from '../src/lib/format';
import { parseFile } from '../src/lib/import/parse';
import { cardRefFromCharge, rowKind, type ParseResult } from '../src/lib/import/shared';
import {
  buildDraft,
  noteFor,
  rulesToLearn,
  toAgorot,
  type DraftRow,
  type ImportRule,
} from '../src/lib/import/draft';
import {
  aggregateNote,
  applyAggregateRule,
  matchAggregate,
  type CreditBatchRef,
} from '../src/lib/import/aggregate';
import type { Category, HouseholdMember } from '../src/lib/types';
import {
  AssignmentChips,
  Badge,
  Body,
  Button,
  Card,
  Checkbox,
  Divider,
  H3,
  IconBubble,
  InlineMessage,
  memberLabels,
  Muted,
  PageHeader,
  useDialog,
} from '../src/ui';
import { font, layout, radius, rtlRow, rtlText, spacing } from '../src/theme';
import { errorText } from '../src/lib/authErrors';

/** סוגי הקבצים שאפשר להעלות. ב-web צריך גם סיומות, כי דפדפנים לא תמיד
 *  מזהים MIME לקבצי אקסל שיוצאו מאתרי הבנקים. */
const WEB_ACCEPT = [
  '.xls',
  '.xlsx',
  '.csv',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'text/csv',
].join(',');

const NATIVE_TYPES = [
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'text/csv',
  'text/comma-separated-values',
];

type Message = { tone: 'error' | 'success' | 'info'; text: string } | null;

/** הפרש שנחשב "אותו סכום" בהשוואה לשורת הסה"כ שבקובץ */
const TOTAL_EPSILON = 0.01;

/**
 * החודש שאליו שייכות רוב התנועות שיובאו — לשם מנווטים בסיום.
 * לא לוקחים את התאריך המאוחר ביותר: קובץ שנפרס על שני חודשים (למשל דוח
 * מסטרקארד של פברואר–מרץ) היה שולח את המשתמש לחודש שבו יש פחות שורות.
 * שוויון נשבר לטובת החודש המאוחר יותר.
 * מוחזרת גם הספירה של אותו חודש, כדי שההודעה למשתמש תוכל לומר את האמת
 * כשהייבוא נפרס על כמה חודשים ורק חלק מהשורות נראות במסך שאליו נוחתים.
 */
function busiestMonth(dates: string[]): { month: string; inMonth: number; months: number } {
  const counts = new Map<string, number>();
  for (const date of dates) {
    const month = `${date.slice(0, 7)}-01`;
    counts.set(month, (counts.get(month) ?? 0) + 1);
  }
  let best = monthStart();
  let bestCount = 0;
  for (const [month, count] of [...counts].sort((a, b) => a[0].localeCompare(b[0]))) {
    if (count >= bestCount) {
      best = month;
      bestCount = count;
    }
  }
  return { month: best, inMonth: bestCount, months: counts.size };
}


export default function Import() {
  const { colors } = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { householdId, bumpVersion } = useHousehold();
  const { confirm, notify } = useDialog();

  const [fileName, setFileName] = useState<string | null>(null);
  const [result, setResult] = useState<ParseResult | null>(null);
  const [rows, setRows] = useState<DraftRow[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [members, setMembers] = useState<HouseholdMember[]>([]);
  const [creditBatches, setCreditBatches] = useState<CreditBatchRef[]>([]);
  /**
   * 🔴 האם קישור האצוות בכלל זמין (0012 הורצה). ברירת המחדל `true` כדי
   *    שההסבר הרגיל יוצג עד שנדע אחרת — הקריאה מעדכנת אותו מיד.
   */
  const [batchLinkage, setBatchLinkage] = useState(true);
  const [sharedAvailable, setSharedAvailable] = useState(false);
  const [pickerRowId, setPickerRowId] = useState<string | null>(null);
  const [assignRowId, setAssignRowId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<Message>(null);
  // גובה הפוטר הצף נמדד בפועל. בלי זה הפוטר מכסה את סוף התוכן ולחיצה על
  // האלמנט האחרון פוגעת בפוטר במקום בו (באג ידוע מסבב קודם).
  const [footerHeight, setFooterHeight] = useState(layout.fabHeight + spacing.lg * 2);

  const knownRules = useRef<ImportRule[]>([]);
  const webInput = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    let alive = true;
    void db.hasSharedColumn().then((ok) => {
      if (alive) setSharedAvailable(ok);
    });
    return () => {
      alive = false;
    };
  }, []);

  const categoryById = useMemo(() => new Map(categories.map((c) => [c.id, c])), [categories]);

  /** תוויות השיוך לפי `user_id`, לתג שבשורה ולבוררים */
  const memberNameById = useMemo(() => memberLabels(members, user?.id), [members, user?.id]);

  /**
   * השיוך הגורף נגזר מהשורות ולא נשמר בנפרד, כדי שלא ייווצר מצב שבו הבורר
   * מציג "משותף" אחרי שהמשתמש שינה שורה בודדת. `undefined` = שיוך מעורב.
   */
  const globalAssignment = useMemo(() => {
    if (!rows.length) return null;
    const first = rows[0].assignedTo;
    return rows.every((r) => r.assignedTo === first) ? first : undefined;
  }, [rows]);

  const selected = useMemo(() => rows.filter((r) => r.selected && !r.isRefund), [rows]);
  const selectedTotal = useMemo(
    () => selected.reduce((sum, r) => sum + toAgorot(r.amount), 0) / 100,
    [selected],
  );

  /**
   * דוח עו"ש מכיל הכנסות והוצאות יחד, ולכן סכום אחד היה מחבר משכורת עם קניות.
   * בקבצים חד-כיווניים (דוחות אשראי) `income` הוא אפס והתצוגה נשארת כשהייתה.
   */
  const selectedByKind = useMemo(() => {
    let income = 0;
    let expense = 0;
    for (const r of selected) {
      if (r.kind === 'income') income += toAgorot(r.amount);
      else expense += toAgorot(r.amount);
    }
    return { income: income / 100, expense: expense / 100 };
  }, [selected]);

  const parsedByKind = useMemo(() => {
    let income = 0;
    let expense = 0;
    for (const r of result?.rows ?? []) {
      const agorot = toAgorot(r.amount) * (r.isRefund ? -1 : 1);
      if (rowKind(r) === 'income') income += agorot;
      else expense += agorot;
    }
    return { income: income / 100, expense: expense / 100 };
  }, [result]);

  const totalsMismatch =
    result?.statedTotal != null && Math.abs(result.statedTotal - result.parsedTotal) > TOTAL_EPSILON;

  const duplicateCount = useMemo(() => rows.filter((r) => r.duplicate).length, [rows]);
  const refundCount = useMemo(() => rows.filter((r) => r.isRefund).length, [rows]);
  const recurringCount = useMemo(() => rows.filter((r) => r.recurringOverlap).length, [rows]);

  // ── קריאת הקובץ ───────────────────────────────────────────────────────────

  const load = useCallback(
    async (name: string, data: ArrayBuffer) => {
      if (!householdId) {
        setMessage({ tone: 'error', text: 'לא נבחר משק בית' });
        return;
      }
      setBusy(true);
      setMessage(null);
      try {
        const parsed = await parseFile({ name, data });
        const dates = parsed.rows.map((r) => r.date).sort();
        // קוראים חודשים שלמים ולא את טווח השורות עצמו: כלל חוזר מתממש ביום
        // קבוע בחודש, וקובץ שמתחיל ב-6 בפברואר היה מחמיץ תנועה מה-1 בו.
        const from = dates.length ? `${dates[0].slice(0, 8)}01` : monthStart();
        const to = dates.length ? monthEnd(dates[dates.length - 1]) : monthEnd(monthStart());
        const [allCategories, existing, rules, householdMembers, creditBatchList] = await Promise.all([
          db.listCategories(householdId),
          db.listTransactionsInRange(householdId, from, to),
          db.listImportRules(householdId).catch(() => [] as ImportRule[]),
          db.listMembers(householdId).catch(() => [] as HouseholdMember[]),
          db.listCreditBatches(householdId).catch(() => ({ available: false, batches: [] })),
        ]);
        // הקטגוריות נמסרות במלואן — `buildDraft` מסנן לפי כיוון כל שורה.
        // סינון מוקדם להוצאות בלבד היה מפיל בשקט כלל שמצביע על קטגוריית הכנסה.
        knownRules.current = rules;
        setCategories(allCategories);
        setMembers(householdMembers);
        setCreditBatches(creditBatchList.batches);
        setBatchLinkage(creditBatchList.available);
        setResult(parsed);
        // 🔴 החלטה 20 מוחלת **כאן ולא ב-`draft.ts`**: שם נקבעת ברירת מחדל
        //    תחבירית, וכאן הכלל הסמנטי שדורש מצב מה-DB. שורת חיוב מרוכז
        //    שאין לה דוח אשראי מיובא היא הוצאה אמיתית ותסומן.
        setRows(
          applyAggregateRule(
            buildDraft(parsed.rows, { categories: allCategories, existing, rules }),
            creditBatchList.batches,
          ).rows,
        );
        setFileName(name);
      } catch (e) {
        setResult(null);
        setRows([]);
        setFileName(null);
        setMessage({ tone: 'error', text: errorText(e, 'לא הצלחנו לקרוא את הקובץ') });
      } finally {
        setBusy(false);
      }
    },
    [householdId],
  );

  /** ב-web יש אובייקט `File` אמיתי; בנייטיב מקבלים `file://` וקוראים דרך fetch. */
  async function assetToBuffer(asset: DocumentPicker.DocumentPickerAsset): Promise<ArrayBuffer> {
    if (asset.file) return asset.file.arrayBuffer();
    const response = await fetch(asset.uri);
    return response.arrayBuffer();
  }

  async function onPickFile() {
    setMessage(null);
    // ב-web אנחנו מפעילים input אמיתי שיושב ב-DOM (ראה WebFileInput למטה)
    if (Platform.OS === 'web') {
      webInput.current?.click();
      return;
    }
    try {
      const picked = await DocumentPicker.getDocumentAsync({
        type: NATIVE_TYPES,
        multiple: false,
        copyToCacheDirectory: true,
      });
      if (picked.canceled || !picked.assets?.length) return;
      const asset = picked.assets[0];
      await load(asset.name, await assetToBuffer(asset));
    } catch (e) {
      setMessage({ tone: 'error', text: errorText(e, 'לא הצלחנו לפתוח את הקובץ') });
    }
  }

  async function onWebFile(file: File) {
    try {
      await load(file.name, await file.arrayBuffer());
    } catch (e) {
      setMessage({ tone: 'error', text: errorText(e, 'לא הצלחנו לפתוח את הקובץ') });
    }
  }

  // ── עריכת השורות ──────────────────────────────────────────────────────────

  function toggleRow(row: DraftRow, next: boolean) {
    if (next && row.isRefund) {
      // amount_agorot במסד חייב להיות חיובי — זיכוי אינו הוצאה ואי אפשר לרשום אותו
      setMessage({
        tone: 'error',
        text: 'שורת זיכוי (החזר) אינה הוצאה ולכן לא ניתן לייבא אותה. אפשר לרשום אותה ידנית כהכנסה.',
      });
      return;
    }
    setMessage(null);
    setRows((rs) => rs.map((r) => (r.id === row.id ? { ...r, selected: next } : r)));
  }

  /**
   * האם לשורת החיוב המרוכז כבר יש דוח אשראי מיובא שמפרט אותה.
   * ⚠️ תלוי ב-`creditBatches`, ולכן חייב להיקרא בתוך הרכיב ולא במודול.
   */
  function isSuperseded(row: DraftRow): boolean {
    return matchAggregate(row, creditBatches).batchId !== null;
  }

  function setAllSelected(next: boolean) {
    // 🎯 חיוב מרוכז מוחרג מהסימון הגורף **רק אם דוח האשראי שלו כבר יובא**.
    //    ההחרגה הגורפת הקודמת הפילה 9,955.55 ₪ במדידה על הקובץ האמיתי:
    //    חמש שורות ריכוז שאיש לא פירט אותן פשוט נעלמו.
    setRows((rs) =>
      rs.map((r) => ({
        ...r,
        selected: next ? !r.isRefund && !isSuperseded(r) : false,
      })),
    );
    const skipped: string[] = [];
    if (next && rows.some((r) => r.isRefund)) skipped.push('שורות זיכוי — לא ניתן לייבא החזר כהוצאה');
    if (next && rows.some((r) => isSuperseded(r)))
      skipped.push('שורות חיוב מרוכז שכבר יובאו במפורט מדוח האשראי');
    setMessage(
      skipped.length
        ? { tone: 'info', text: `לא נכללו בסימון: ${skipped.join(' · ')}. אפשר לסמן אותן ידנית.` }
        : null,
    );
  }

  /** שיוך גורף לכל השורות — משותף או בן משק בית מסוים */
  function assignAll(assignedTo: string | null) {
    setRows((rs) => rs.map((r) => ({ ...r, assignedTo })));
  }

  function assignRow(rowId: string, assignedTo: string | null) {
    setAssignRowId(null);
    setRows((rs) => rs.map((r) => (r.id === rowId ? { ...r, assignedTo } : r)));
  }

  function chooseCategory(rowId: string, categoryId: string | null) {
    setPickerRowId(null);
    setRows((rs) =>
      rs.map((r) =>
        r.id === rowId
          ? // 'user' מסמן שהמשתמש בחר בעצמו — רק כאלה נלמדים ככלל לפעם הבאה
            { ...r, categoryId, categorySource: categoryId ? 'user' : 'none' }
          : r,
      ),
    );
  }

  function reset() {
    setResult(null);
    setRows([]);
    setFileName(null);
    setMembers([]);
    setPickerRowId(null);
    setAssignRowId(null);
    setMessage(null);
  }

  // ── כתיבה ─────────────────────────────────────────────────────────────────

  async function onImport() {
    if (!householdId || !user) return;
    // סינון הגנתי: גם אם משהו סימן שורת זיכוי, היא לא תגיע למסד
    const toWrite = rows.filter((r) => r.selected && !r.isRefund);
    if (!toWrite.length) {
      setMessage({ tone: 'error', text: 'לא סומנה אף תנועה לייבוא' });
      return;
    }

    const missingCategory = toWrite.filter((r) => !r.categoryId).length;
    if (missingCategory > 0) {
      const approved = await confirm({
        title: 'ייבוא בלי קטגוריה',
        message:
          missingCategory === 1
            ? 'לתנועה אחת עדיין לא נבחרה קטגוריה. אפשר לייבא כך ולסדר אחר כך במסך התנועות.'
            : `ל-${missingCategory} תנועות עדיין לא נבחרה קטגוריה. אפשר לייבא כך ולסדר אחר כך במסך התנועות.`,
        confirmText: 'ייבוא בכל זאת',
        cancelText: 'חזרה לבחירה',
      });
      if (!approved) return;
    }

    setBusy(true);
    setMessage(null);
    try {
      const count = await db.addTransactionsBulk(
        toWrite.map((r) => ({
          householdId,
          categoryId: r.categoryId,
          kind: r.kind,
          amountAgorot: toAgorot(r.amount),
          occurredOn: r.date,
          note: noteFor(r),
          // משותף: user_id נשאר של המייבא ו-is_shared מסמן שההוצאה לא נזקפת
          // לאף אחד. שיוך לבן בית: הוא נזקף אליו ולכן אינה משותפת.
          userId: r.assignedTo ?? user.id,
          isShared: sharedAvailable && r.assignedTo === null,
        })),
        // 🎯 האצווה נושאת את מה שהקובץ הצהיר: המזהה (חשבון/כרטיס), הסך
        //    והתאריכים. **שום שדה כאן אינו מוקלד** — ולכן אין מה לשכוח
        //    ואין מה לנחש.
        result
          ? {
              source: result.source,
              statedTotalAgorot: result.statedTotal === null ? null : toAgorot(result.statedTotal),
              parsedTotalAgorot: toAgorot(result.parsedTotal),
              kind: result.statementKind ?? 'credit_report',
              ref: result.accountRef
                ? { value: result.accountRef.ref, kind: result.accountRef.kind }
                : null,
              chargeDate: result.chargeDate ?? null,
              statementDate: result.statementDate ?? null,
              // 🎯 שורות החיוב המרוכז נשמרות **תמיד**, גם כשהן כן יובאו
              //    כתנועה: הן החוליה שמאפשרת לדוח אשראי עתידי לבטל אותן
              //    למפרע (`linkBatchCharges` מחבר להן את מזהה התנועה).
              cardCharges: result.rows
                .filter((r) => r.isCardCharge)
                .map((r) => ({
                  ref: cardRefFromCharge(r.description),
                  amountAgorot: toAgorot(r.amount),
                  occurredOn: r.date,
                }))
                .filter((c): c is { ref: string; amountAgorot: number; occurredOn: string } =>
                  Boolean(c.ref),
                ),
            }
          : undefined,
      );

      // לומדים רק קטגוריות שהמשתמש בחר בעצמו, כדי שהפעם הבאה תהיה מדויקת יותר
      const learn = rulesToLearn(rows, knownRules.current);
      if (learn.length) {
        try {
          await db.saveImportRules(householdId, learn);
        } catch {
          /* הלמידה היא בונוס — כישלון בה לא אמור להפיל ייבוא שכבר נכתב */
        }
      }

      bumpVersion();
      reset();
      // מסך התנועות נפתח על החודש הנוכחי. דוח אשראי מיובא כמעט תמיד אחרי סוף
      // החודש שאליו הוא שייך, ולכן בלי ההעברה הזאת המשתמש נוחת על חודש ריק
      // בדיוק אחרי שקיבל הודעה שיובאו לו תנועות.
      const { month, inMonth, months } = busiestMonth(toWrite.map((r) => r.date));
      router.replace({ pathname: '/(tabs)/history', params: { month } });
      const imported = count === 1 ? 'יובאה תנועה אחת' : `יובאו ${count} תנועות`;
      void notify({
        title: 'הייבוא הושלם',
        // כשהקובץ נפרס על כמה חודשים רואים במסך רק את השורות של החודש שאליו
        // נוחתים. אסור להבטיח שכולן שם — המשתמש יספור ויחשוב שחלק נבלעו.
        message:
          months > 1
            ? `${imported} מהקובץ, על פני יותר מחודש אחד. ${inMonth === 1 ? 'אחת מהן מוצגת' : `${inMonth} מהן מוצגות`} כאן בחודש ${monthLabel(month)} — אפשר לדפדף לחודשים הסמוכים כדי לראות את השאר.`
            : `${imported} מהקובץ. ${count === 1 ? 'היא מוצגת' : 'הן מוצגות'} כאן בחודש ${monthLabel(month)}.`,
        tone: 'success',
      });
    } catch (e) {
      setMessage({ tone: 'error', text: errorText(e, 'לא הצלחנו לייבא את התנועות') });
    } finally {
      setBusy(false);
    }
  }

  // ── תצוגה ─────────────────────────────────────────────────────────────────

  const pickerRow = pickerRowId ? rows.find((r) => r.id === pickerRowId) ?? null : null;
  const assignRow_ = assignRowId ? rows.find((r) => r.id === assignRowId) ?? null : null;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }} edges={['top', 'left', 'right']}>
      <View style={{ paddingHorizontal: spacing.lg, paddingTop: spacing.lg }}>
        <PageHeader title="ייבוא דוח אשראי" onBack={() => goBack(router, '/(tabs)/more')} />
      </View>

      <ScrollView
        contentContainerStyle={{
          paddingHorizontal: spacing.lg,
          paddingBottom: result ? footerHeight + insets.bottom + spacing.lg : spacing.xxl + insets.bottom,
        }}
        keyboardShouldPersistTaps="handled"
      >
        {/* input אמיתי ב-DOM: יציב לאוטומציה, ולא נמחק אחרי הבחירה */}
        {Platform.OS === 'web' ? (
          <WebFileInput inputRef={webInput} onFile={onWebFile} />
        ) : null}

        {!result ? (
          <>
            {message ? <InlineMessage tone={message.tone}>{message.text}</InlineMessage> : null}

            <Card>
              <View style={{ ...rtlRow, gap: spacing.md, marginBottom: spacing.md }}>
                <IconBubble icon="cloud-upload" color={colors.primary} size={46} />
                <View style={{ flexShrink: 1, minWidth: 0 }}>
                  <Body style={{ fontWeight: '700' }}>העלאת דוח מחברת האשראי</Body>
                  <Muted style={{ fontSize: 12 }}>קבצי Excel‏ (xlsx / xls) או CSV</Muted>
                </View>
              </View>
              <Muted style={{ marginBottom: spacing.lg }}>
                אחרי הבחירה נציג לך את כל השורות לאישור — שום דבר לא נרשם לפני שתאשר.
              </Muted>
              <Button
                title={busy ? 'קורא את הקובץ…' : 'בחירת קובץ'}
                icon="document-attach"
                size="lg"
                loading={busy}
                onPress={onPickFile}
                testID="hb-import-pick"
              />
            </Card>

            <Card>
              <H3 style={{ marginBottom: spacing.sm }}>איך מורידים את הדוח</H3>
              <Muted>
                בכ.א.ל / אוצר החייל: פירוט עסקאות ← ייצוא לאקסל. בבנק הפועלים: מסטרקארד דירקט ← פירוט
                חיובים ← ייצוא. אפשר להעלות גם קובץ CSV של כל חברת אשראי אחרת.
              </Muted>
            </Card>
          </>
        ) : (
          <>
            {/* סיכום הקובץ */}
            <Card testID="hb-import-summary">
              <View style={{ ...rtlRow, gap: spacing.md }}>
                <IconBubble icon="document-text" color={colors.primary} size={42} />
                <View style={{ flexShrink: 1, minWidth: 0 }}>
                  <Body style={{ fontWeight: '700' }} numberOfLines={2}>
                    {result.source}
                  </Body>
                  <Muted style={{ fontSize: 12 }} numberOfLines={1}>
                    {fileName}
                  </Muted>
                </View>
              </View>

              <Divider />

              <SummaryLine
                label="תנועות בקובץ"
                value={`${result.rows.length}`}
                testID="hb-import-count"
              />
              {parsedByKind.income > 0 ? (
                <SummaryLine
                  label="הכנסות בקובץ"
                  value={formatILS(parsedByKind.income, { decimals: true })}
                  testID="hb-import-total-income"
                />
              ) : null}
              <SummaryLine
                label={parsedByKind.income > 0 ? 'הוצאות בקובץ' : 'סכום שנקרא'}
                value={formatILS(
                  parsedByKind.income > 0 ? parsedByKind.expense : result.parsedTotal,
                  { decimals: true },
                )}
                testID="hb-import-total"
              />
              {result.statedTotal != null ? (
                <SummaryLine
                  label='סה"כ לפי הקובץ'
                  value={formatILS(result.statedTotal, { decimals: true })}
                  testID="hb-import-stated"
                />
              ) : null}

              <Button
                title="בחירת קובץ אחר"
                variant="ghost"
                size="sm"
                icon="swap-horizontal"
                onPress={onPickFile}
                testID="hb-import-replace"
                style={{ marginTop: spacing.md }}
              />
            </Card>

            {totalsMismatch ? (
              <InlineMessage tone="error">
                {`הסכום שקראנו (${formatILS(result.parsedTotal, { decimals: true })}) שונה מהסה"כ שכתוב בקובץ (${formatILS(result.statedTotal ?? 0, { decimals: true })}). כדאי לעבור על השורות לפני הייבוא.`}
              </InlineMessage>
            ) : null}

            {result.notes.map((note, i) => (
              <InlineMessage key={note} tone="info" style={{ marginBottom: spacing.sm }}>
                <Text style={{ color: colors.text }} testID={`hb-import-note-${i}`}>{note}</Text>
              </InlineMessage>
            ))}

            {duplicateCount > 0 ? (
              <InlineMessage tone="info" style={{ marginBottom: spacing.sm }}>
                <Text style={{ color: colors.text }} testID="hb-import-duplicates">
                  {duplicateCount === 1
                    ? `תנועה אחת מתוך ${rows.length} כבר קיימת אצלך בתאריך ובסכום האלה, ולכן אינה מסומנת לייבוא.`
                    : `${duplicateCount} מתוך ${rows.length} התנועות כבר קיימות אצלך בתאריך ובסכום האלה, ולכן אינן מסומנות לייבוא.`}
                </Text>
              </InlineMessage>
            ) : null}

            {refundCount > 0 ? (
              <InlineMessage tone="info" style={{ marginBottom: spacing.sm }}>
                <Text style={{ color: colors.text }} testID="hb-import-refunds">
                  {refundCount === 1
                    ? 'שורת זיכוי אחת (החזר) אינה הוצאה ולכן לא ניתן לייבא אותה.'
                    : `${refundCount} שורות זיכוי (החזר) אינן הוצאה ולכן לא ניתן לייבא אותן.`}
                </Text>
              </InlineMessage>
            ) : null}

            {recurringCount > 0 ? (
              <InlineMessage tone="info" style={{ marginBottom: spacing.sm }}>
                <Text style={{ color: colors.text }} testID="hb-import-recurring-summary">
                  {`${recurringCount === 1 ? 'שורה אחת דומה' : `${recurringCount} שורות דומות`} להוצאה קבועה שכבר רשומה אצלך באותו חודש, והן מסומנות «אולי הוצאה קבועה». הן נשארות מסומנות לייבוא — עברו עליהן והסירו סימון מכל שורה שכבר נרשמה. שימו לב: זו בדיקה חלקית, ושורה בלי סימון כזה עדיין עשויה להיות כפולה.`}
                </Text>
              </InlineMessage>
            ) : null}

            {/* בורר השיוך הגורף יושב כאן, מעל הרשימה — לא כאלמנט האחרון בגלילה */}
            {sharedAvailable ? (
              <Card style={{ marginBottom: spacing.md }}>
                <Body style={{ fontWeight: '700', marginBottom: spacing.xs }}>שיוך ההוצאות</Body>
                <Muted style={{ fontSize: 12, marginBottom: spacing.md }}>
                  {globalAssignment === undefined
                    ? 'השיוך מעורב — יש שורות עם שיוך שונה. אפשר לבחור כאן שיוך לכל השורות.'
                    : 'מדוח אשראי אי אפשר לדעת מי ביצע כל עסקה, ולכן הכול משותף כברירת מחדל. אפשר לשייך גם שורה בודדת.'}
                </Muted>
                <AssignmentChips
                  value={globalAssignment}
                  members={members}
                  labels={memberNameById}
                  onChange={assignAll}
                  accessibilityLabel="שיוך ההוצאות"
                  sharedTestID="hb-import-shared-all"
                  memberTestID={(userId) => `hb-import-assign-all-${userId}`}
                />
              </Card>
            ) : null}

            <View
              style={{
                ...rtlRow,
                justifyContent: 'space-between',
                gap: spacing.sm,
                marginBottom: spacing.sm,
              }}
            >
              <H3>שורות לייבוא</H3>
              <View style={{ ...rtlRow, gap: spacing.sm }}>
                <Button
                  title="סימון הכול"
                  variant="ghost"
                  size="sm"
                  onPress={() => setAllSelected(true)}
                  testID="hb-import-select-all"
                />
                <Button
                  title="ניקוי"
                  variant="ghost"
                  size="sm"
                  onPress={() => setAllSelected(false)}
                  testID="hb-import-select-none"
                />
              </View>
            </View>

            <Card style={{ paddingVertical: spacing.xs }}>
              {rows.map((row, i) => (
                <ImportRowItem
                  key={row.id}
                  row={row}
                  index={i}
                  first={i === 0}
                  superseded={isSuperseded(row)}
                  batchLinkage={batchLinkage}
                  category={row.categoryId ? categoryById.get(row.categoryId) ?? null : null}
                  assignment={
                    sharedAvailable
                      ? row.assignedTo === null
                        ? 'משותף'
                        : memberNameById.get(row.assignedTo) ?? 'בן בית'
                      : null
                  }
                  onToggle={(next) => toggleRow(row, next)}
                  onPickCategory={() => setPickerRowId(row.id)}
                  onPickAssignment={() => setAssignRowId(row.id)}
                />
              ))}
            </Card>
          </>
        )}
      </ScrollView>

      {result ? (
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
          {message ? <InlineMessage tone={message.tone}>{message.text}</InlineMessage> : null}
          <View
            style={{
              ...rtlRow,
              justifyContent: 'space-between',
              gap: spacing.sm,
              marginBottom: spacing.md,
            }}
          >
            <Muted testID="hb-import-selected-count">{`${selected.length} מתוך ${rows.length} מסומנות`}</Muted>
            <Body testID="hb-import-selected-total" style={{ fontWeight: '800' }}>
              {selectedByKind.income > 0
                ? `${formatILS(selectedByKind.expense, { decimals: true })} הוצאות · ${formatILS(selectedByKind.income, { decimals: true })} הכנסות`
                : formatILS(selectedTotal, { decimals: true })}
            </Body>
          </View>
          <Button
            title={
              selected.length === 0
                ? 'אין תנועות לייבוא'
                : selected.length === 1
                  ? 'ייבוא תנועה אחת'
                  : `ייבוא ${selected.length} תנועות`
            }
            icon="checkmark"
            size="lg"
            loading={busy}
            disabled={selected.length === 0}
            onPress={onImport}
            testID="hb-import-confirm"
            accessibilityLabel="ייבוא התנועות המסומנות"
          />
        </View>
      ) : null}

      <CategoryPicker
        row={pickerRow}
        categories={categories}
        onClose={() => setPickerRowId(null)}
        onSelect={(categoryId) => pickerRow && chooseCategory(pickerRow.id, categoryId)}
      />

      <AssignmentPicker
        row={assignRow_}
        members={members}
        labels={memberNameById}
        onClose={() => setAssignRowId(null)}
        onSelect={(assignedTo) => assignRow_ && assignRow(assignRow_.id, assignedTo)}
      />
    </SafeAreaView>
  );
}

// ── שורת סיכום בכרטיס העליון ────────────────────────────────────────────────
function SummaryLine({ label, value, testID }: { label: string; value: string; testID?: string }) {
  const { colors } = useTheme();
  return (
    <View style={{ ...rtlRow, justifyContent: 'space-between', gap: spacing.sm, paddingVertical: 2 }}>
      <Muted>{label}</Muted>
      <Text testID={testID} style={[font.body, rtlText, { fontWeight: '700', color: colors.text }]}>
        {value}
      </Text>
    </View>
  );
}

// ── שורה אחת במסך האישור ────────────────────────────────────────────────────
function ImportRowItem({
  row,
  index,
  first,
  superseded,
  batchLinkage,
  category,
  assignment,
  onToggle,
  onPickCategory,
  onPickAssignment,
}: {
  row: DraftRow;
  index: number;
  first: boolean;
  /** 🔴 האם דוח האשראי שמפרט את השורה כבר יובא (החלטה 20) */
  superseded: boolean;
  /** `false` ⇒ אין טבלת אצוות ⇒ אין להבטיח ביטול אוטומטי */
  batchLinkage: boolean;
  category: Category | null;
  /** תווית השיוך, או `null` כשהמסד לא תומך בהוצאות משותפות */
  assignment: string | null;
  onToggle: (next: boolean) => void;
  onPickCategory: () => void;
  onPickAssignment: () => void;
}) {
  const { colors } = useTheme();
  // ההסבר בעברית למה השורה לא מסומנת מראש — אחרת המשתמש רק רואה תיבה ריקה
  const reasons: string[] = [];
  if (row.duplicate) reasons.push('כבר קיימת אצלך תנועה זהה בתאריך ובסכום האלה');
  if (row.isRefund) reasons.push('זיכוי (החזר) אינו הוצאה ולכן לא ניתן לייבא אותו');
  if (row.isCardCharge) reasons.push(aggregateNote(superseded, batchLinkage));

  const detail = (row.detail ?? '').trim();

  return (
    <View
      testID={`hb-import-row-${index}`}
      style={{
        paddingVertical: spacing.sm,
        borderTopWidth: first ? 0 : 1,
        borderTopColor: colors.border,
      }}
    >
      <View style={{ ...rtlRow, gap: spacing.sm, justifyContent: 'space-between' }}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Checkbox
            value={row.selected}
            onValueChange={onToggle}
            label={row.description}
            hint={detail ? `${formatDate(row.date)} · ${detail}` : formatDate(row.date)}
            accessibilityLabel={`לייבא את ${row.description}`}
            testID={`hb-import-select-${index}`}
            style={{
              borderWidth: 0,
              backgroundColor: 'transparent',
              paddingHorizontal: 0,
              paddingVertical: 0,
            }}
          />
        </View>
        <Text
          testID={`hb-import-amount-${index}`}
          style={[
            font.body,
            rtlText,
            {
              fontWeight: '800',
              color: row.isRefund
                ? colors.primary
                : row.kind === 'income'
                  ? colors.income
                  : colors.text,
            },
          ]}
        >
          {row.isRefund ? '−' : row.kind === 'income' ? '+' : ''}
          {formatILS(row.amount, { decimals: true })}
        </Text>
      </View>

      <View
        style={{
          ...rtlRow,
          flexWrap: 'wrap',
          gap: spacing.sm,
          marginTop: spacing.sm,
          paddingRight: 34,
        }}
      >
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`קטגוריה עבור ${row.description}`}
          testID={`hb-import-category-${index}`}
          onPress={onPickCategory}
          style={({ pressed }) => [
            {
              ...rtlRow,
              gap: spacing.xs + 2,
              minHeight: 34,
              paddingHorizontal: spacing.md,
              paddingVertical: spacing.xs,
              borderRadius: radius.pill,
              borderWidth: 1.5,
              borderColor: category ? category.color : colors.border,
              backgroundColor: category ? `${category.color}1F` : colors.surface,
            },
            pressed && { opacity: 0.75 },
          ]}
        >
          <Ionicons
            name={(category?.icon as keyof typeof Ionicons.glyphMap) ?? 'pricetag-outline'}
            size={14}
            color={category ? category.color : colors.textMuted}
          />
          <Text style={{ fontSize: 13, fontWeight: '600', color: colors.text }}>
            {category ? category.name : 'בחירת קטגוריה'}
          </Text>
          <Ionicons name="chevron-down" size={13} color={colors.textFaint} />
        </Pressable>

        {assignment ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`שיוך עבור ${row.description}`}
            testID={`hb-import-assign-${index}`}
            onPress={onPickAssignment}
            style={({ pressed }) => [
              {
                ...rtlRow,
                gap: spacing.xs + 2,
                minHeight: 34,
                paddingHorizontal: spacing.md,
                paddingVertical: spacing.xs,
                borderRadius: radius.pill,
                borderWidth: 1.5,
                borderColor: colors.primaryDark,
                backgroundColor: `${colors.primaryDark}1F`,
              },
              pressed && { opacity: 0.75 },
            ]}
          >
            <Ionicons
              name={row.assignedTo === null ? 'people' : 'person'}
              size={14}
              color={colors.primaryDark}
            />
            <Text style={{ fontSize: 13, fontWeight: '600', color: colors.text }}>{assignment}</Text>
            <Ionicons name="chevron-down" size={13} color={colors.textFaint} />
          </Pressable>
        ) : null}

        {row.kind === 'income' ? (
          <View testID={`hb-import-income-${index}`}>
            <Badge icon="arrow-down" color={colors.income}>
              הכנסה
            </Badge>
          </View>
        ) : null}
        {row.duplicate ? (
          <Badge icon="copy" color={colors.warning}>
            כפילות
          </Badge>
        ) : null}
        {row.isRefund ? (
          <Badge icon="return-down-back" color={colors.primary}>
            זיכוי
          </Badge>
        ) : null}
        {row.isCardCharge ? (
          <View testID={`hb-import-cardcharge-${index}`}>
            <Badge icon="card" color={superseded ? colors.textMuted : colors.warning}>
              {superseded ? 'כבר יובא במפורט' : 'חיוב כרטיס — אין דוח'}
            </Badge>
          </View>
        ) : null}
        {row.recurringOverlap ? (
          <View testID={`hb-import-recurring-${index}`}>
            <Badge icon="repeat" color={colors.warning}>
              אולי הוצאה קבועה
            </Badge>
          </View>
        ) : null}
      </View>

      {row.recurringOverlap ? (
        <Muted style={{ fontSize: 12, marginTop: spacing.xs, paddingRight: 34 }}>
          {row.recurringNote
            ? `ייתכן שכבר רשומה אצלך ההוצאה הקבועה «${row.recurringNote}» באותו חודש. השורה מסומנת בכל זאת — אם היא כפולה, אפשר להסיר את הסימון.`
            : 'ייתכן שכבר רשומה אצלך הוצאה קבועה באותו חודש. השורה מסומנת בכל זאת — אם היא כפולה, אפשר להסיר את הסימון.'}
        </Muted>
      ) : null}

      {reasons.length ? (
        <Muted style={{ fontSize: 12, marginTop: spacing.xs, paddingRight: 34 }}>
          {`לא מסומנת: ${reasons.join(' · ')}`}
        </Muted>
      ) : null}
    </View>
  );
}

// ── בורר קטגוריה ────────────────────────────────────────────────────────────
function CategoryPicker({
  row,
  categories,
  onClose,
  onSelect,
}: {
  row: DraftRow | null;
  categories: Category[];
  onClose: () => void;
  onSelect: (categoryId: string | null) => void;
}) {
  const { colors } = useTheme();
  // הבורר מציג רק קטגוריות מהכיוון של השורה — אין טעם להציע קטגוריית הכנסה
  // לשורת חובה, ו-`matchCategory` ממילא לא היה מאמץ אותה.
  const options = row ? categories.filter((c) => c.kind === row.kind) : [];
  return (
    <Modal visible={row !== null} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable
        onPress={onClose}
        style={{
          flex: 1,
          backgroundColor: 'rgba(10, 26, 20, 0.45)',
          justifyContent: 'center',
          padding: spacing.lg,
        }}
      >
        <Pressable
          onPress={() => undefined}
          style={{
            backgroundColor: colors.surface,
            borderRadius: radius.lg,
            padding: spacing.lg,
            maxHeight: '80%',
          }}
        >
          <H3 style={{ marginBottom: spacing.xs }}>בחירת קטגוריה</H3>
          <Muted style={{ marginBottom: spacing.md }} numberOfLines={1}>
            {row?.description ?? ''}
          </Muted>

          <ScrollView contentContainerStyle={{ paddingBottom: spacing.sm }}>
            <View style={{ flexDirection: 'row-reverse', flexWrap: 'wrap', gap: spacing.sm }}>
              {options.map((c) => {
                const active = row?.categoryId === c.id;
                return (
                  <Pressable
                    key={c.id}
                    accessibilityRole="button"
                    accessibilityLabel={c.name}
                    accessibilityState={{ selected: active }}
                    testID={`hb-import-category-option-${c.id}`}
                    onPress={() => onSelect(c.id)}
                    style={{
                      ...rtlRow,
                      gap: spacing.xs + 2,
                      minHeight: 44,
                      paddingHorizontal: spacing.md,
                      borderRadius: radius.pill,
                      borderWidth: 1.5,
                      borderColor: active ? c.color : colors.border,
                      backgroundColor: active ? `${c.color}22` : colors.surface,
                    }}
                  >
                    <Ionicons name={c.icon as keyof typeof Ionicons.glyphMap} size={15} color={c.color} />
                    <Text style={{ fontSize: 13, fontWeight: '600', color: colors.text }}>{c.name}</Text>
                  </Pressable>
                );
              })}
            </View>
          </ScrollView>

          <View style={{ ...rtlRow, gap: spacing.sm, marginTop: spacing.md }}>
            <Button
              title="ללא קטגוריה"
              variant="ghost"
              size="sm"
              onPress={() => onSelect(null)}
              testID="hb-import-category-none"
              style={{ flex: 1 }}
            />
            <Button
              title="סגירה"
              variant="secondary"
              size="sm"
              onPress={onClose}
              testID="hb-import-category-close"
              style={{ flex: 1 }}
            />
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

// ── בורר שיוך לשורה בודדת ───────────────────────────────────────────────────
function AssignmentPicker({
  row,
  members,
  labels,
  onClose,
  onSelect,
}: {
  row: DraftRow | null;
  members: HouseholdMember[];
  /** תוויות ייחודיות לפי `user_id` — אותן תוויות כמו בבורר הגורף ובשורות */
  labels: Map<string, string>;
  onClose: () => void;
  onSelect: (assignedTo: string | null) => void;
}) {
  const { colors } = useTheme();
  return (
    <Modal visible={row !== null} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable
        onPress={onClose}
        style={{
          flex: 1,
          backgroundColor: 'rgba(10, 26, 20, 0.45)',
          justifyContent: 'center',
          padding: spacing.lg,
        }}
      >
        <Pressable
          onPress={() => undefined}
          style={{
            backgroundColor: colors.surface,
            borderRadius: radius.lg,
            padding: spacing.lg,
            maxHeight: '80%',
          }}
        >
          <H3 style={{ marginBottom: spacing.xs }}>שיוך ההוצאה</H3>
          <Muted style={{ marginBottom: spacing.md }} numberOfLines={1}>
            {row?.description ?? ''}
          </Muted>

          <ScrollView contentContainerStyle={{ paddingBottom: spacing.sm }}>
            <AssignmentChips
              value={row?.assignedTo}
              members={members}
              labels={labels}
              onChange={onSelect}
              accessibilityLabel="שיוך ההוצאה"
              sharedTestID="hb-import-assign-option-shared"
              memberTestID={(userId) => `hb-import-assign-option-${userId}`}
            />
          </ScrollView>

          <Muted style={{ fontSize: 12, marginTop: spacing.md }}>
            הוצאה משותפת לא נזקפת לאף אחד בפיצול בין בני הבית.
          </Muted>

          <Button
            title="סגירה"
            variant="secondary"
            size="sm"
            onPress={onClose}
            testID="hb-import-assign-close"
            style={{ marginTop: spacing.md }}
          />
        </Pressable>
      </Pressable>
    </Modal>
  );
}

// ── input של הדפדפן ─────────────────────────────────────────────────────────
/**
 * ב-web אנחנו לא משתמשים ב-DocumentPicker: הוא יוצר `<input>` זמני, מפזר עליו
 * אירוע לחיצה ומוחק אותו מיד — מה שהופך כל אוטומציה (וגם דיבוג) לשבירה.
 * במקום זה יש כאן input אמיתי וקבוע ב-DOM, שהכפתור פשוט לוחץ עליו.
 * ברכיבי נייטיב אין אלמנטים כאלה, ולכן הוא מרונדר רק כש-Platform.OS === 'web'.
 */
function WebFileInput({
  inputRef,
  onFile,
}: {
  inputRef: React.MutableRefObject<HTMLInputElement | null>;
  onFile: (file: File) => void;
}) {
  return (
    <input
      ref={inputRef}
      type="file"
      id="hb-import-input"
      data-testid="hb-import-input"
      aria-label="בחירת קובץ דוח אשראי"
      accept={WEB_ACCEPT}
      onChange={(event) => {
        const file = event.target.files?.[0];
        // איפוס הערך כדי שבחירה חוזרת באותו קובץ תפעיל onChange שוב
        event.target.value = '';
        if (file) onFile(file);
      }}
      style={{ position: 'absolute', width: 1, height: 1, opacity: 0, pointerEvents: 'none' }}
    />
  );
}
