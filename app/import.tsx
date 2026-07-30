import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Modal, Platform, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as DocumentPicker from 'expo-document-picker';
import { goBack } from '../src/lib/nav';
import { useAuth } from '../src/context/AuthContext';
import { useHousehold } from '../src/context/HouseholdContext';
import * as db from '../src/lib/db';
import { formatDate, formatILS } from '../src/lib/format';
import { parseFile } from '../src/lib/import/parse';
import { IMPORT_KIND, type ParseResult } from '../src/lib/import/shared';
import {
  buildDraft,
  noteFor,
  rulesToLearn,
  toAgorot,
  type DraftRow,
  type ImportRule,
} from '../src/lib/import/draft';
import type { Category } from '../src/lib/types';
import {
  Badge,
  Body,
  Button,
  Card,
  Checkbox,
  Divider,
  H3,
  IconBubble,
  InlineMessage,
  Muted,
  PageHeader,
  useDialog,
} from '../src/ui';
import { colors, font, layout, radius, rtlRow, rtlText, spacing } from '../src/theme';
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

export default function Import() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { householdId, bumpVersion } = useHousehold();
  const { confirm, notify } = useDialog();

  const [fileName, setFileName] = useState<string | null>(null);
  const [result, setResult] = useState<ParseResult | null>(null);
  const [rows, setRows] = useState<DraftRow[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [sharedAvailable, setSharedAvailable] = useState(false);
  const [sharedAll, setSharedAll] = useState(false);
  const [pickerRowId, setPickerRowId] = useState<string | null>(null);
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

  const selected = useMemo(() => rows.filter((r) => r.selected && !r.isRefund), [rows]);
  const selectedTotal = useMemo(
    () => selected.reduce((sum, r) => sum + toAgorot(r.amount), 0) / 100,
    [selected],
  );

  const totalsMismatch =
    result?.statedTotal != null && Math.abs(result.statedTotal - result.parsedTotal) > TOTAL_EPSILON;

  const duplicateCount = useMemo(() => rows.filter((r) => r.duplicate).length, [rows]);
  const refundCount = useMemo(() => rows.filter((r) => r.isRefund).length, [rows]);

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
        const [allCategories, existing, rules] = await Promise.all([
          db.listCategories(householdId),
          db.listTransactionsInRange(householdId, dates[0], dates[dates.length - 1]),
          db.listImportRules(householdId).catch(() => [] as ImportRule[]),
        ]);
        // דוחות אשראי הם הוצאות בלבד — הבורר מציג רק קטגוריות הוצאה
        const expenseCategories = allCategories.filter((c) => c.kind === IMPORT_KIND);
        knownRules.current = rules;
        setCategories(expenseCategories);
        setResult(parsed);
        setRows(buildDraft(parsed.rows, { categories: expenseCategories, existing, rules }));
        setFileName(name);
        setSharedAll(false);
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
    setRows((rs) =>
      rs.map((r) => (r.id === row.id ? { ...r, selected: next, shared: next && sharedAll } : r)),
    );
  }

  function setAllSelected(next: boolean) {
    setRows((rs) =>
      rs.map((r) => {
        const isSelected = next ? !r.isRefund : false;
        return { ...r, selected: isSelected, shared: isSelected && sharedAll };
      }),
    );
    setMessage(
      next && rows.some((r) => r.isRefund)
        ? { tone: 'info', text: 'שורות זיכוי לא נכללו בסימון — לא ניתן לייבא החזר כהוצאה.' }
        : null,
    );
  }

  function toggleSharedAll(next: boolean) {
    setSharedAll(next);
    setRows((rs) => rs.map((r) => ({ ...r, shared: next && r.selected && !r.isRefund })));
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
    setSharedAll(false);
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
        message: `ל-${missingCategory} תנועות עדיין לא נבחרה קטגוריה. אפשר לייבא כך ולסדר אחר כך במסך התנועות.`,
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
          userId: user.id,
          categoryId: r.categoryId,
          kind: IMPORT_KIND,
          amountAgorot: toAgorot(r.amount),
          occurredOn: r.date,
          note: noteFor(r),
          isShared: sharedAvailable && r.shared,
        })),
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
      router.replace('/(tabs)/history');
      void notify({
        title: 'הייבוא הושלם',
        message: `יובאו ${count} תנועות מהקובץ.`,
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
              <SummaryLine
                label="סכום שנקרא"
                value={formatILS(result.parsedTotal, { decimals: true })}
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
                <Text testID={`hb-import-note-${i}`}>{note}</Text>
              </InlineMessage>
            ))}

            {duplicateCount > 0 ? (
              <InlineMessage tone="info" style={{ marginBottom: spacing.sm }}>
                <Text testID="hb-import-duplicates">
                  {`${duplicateCount} מתוך ${rows.length} התנועות כבר קיימות אצלך בתאריך ובסכום האלה, ולכן אינן מסומנות לייבוא.`}
                </Text>
              </InlineMessage>
            ) : null}

            {refundCount > 0 ? (
              <InlineMessage tone="info" style={{ marginBottom: spacing.sm }}>
                <Text testID="hb-import-refunds">
                  {`${refundCount} שורות זיכוי (החזר) אינן הוצאה ולכן לא ניתן לייבא אותן.`}
                </Text>
              </InlineMessage>
            ) : null}

            {/* הצ'קבוקס הגורף יושב כאן, מעל הרשימה — לא כאלמנט האחרון בגלילה */}
            {sharedAvailable ? (
              <Checkbox
                testID="hb-import-shared-all"
                value={sharedAll}
                onValueChange={toggleSharedAll}
                icon="people"
                label="סימון הכול כהוצאה משותפת"
                hint="ההוצאות המסומנות לא ייזקפו לאף אחד בפיצול בין בני הבית"
                accessibilityLabel="הוצאה משותפת"
                style={{ marginBottom: spacing.md }}
              />
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
                  category={row.categoryId ? categoryById.get(row.categoryId) ?? null : null}
                  onToggle={(next) => toggleRow(row, next)}
                  onPickCategory={() => setPickerRowId(row.id)}
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
              {formatILS(selectedTotal, { decimals: true })}
            </Body>
          </View>
          <Button
            title={`ייבוא ${selected.length} תנועות`}
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
    </SafeAreaView>
  );
}

// ── שורת סיכום בכרטיס העליון ────────────────────────────────────────────────
function SummaryLine({ label, value, testID }: { label: string; value: string; testID?: string }) {
  return (
    <View style={{ ...rtlRow, justifyContent: 'space-between', gap: spacing.sm, paddingVertical: 2 }}>
      <Muted>{label}</Muted>
      <Text testID={testID} style={[font.body, rtlText, { fontWeight: '700' }]}>
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
  category,
  onToggle,
  onPickCategory,
}: {
  row: DraftRow;
  index: number;
  first: boolean;
  category: Category | null;
  onToggle: (next: boolean) => void;
  onPickCategory: () => void;
}) {
  // ההסבר בעברית למה השורה לא מסומנת מראש — אחרת המשתמש רק רואה תיבה ריקה
  const reasons: string[] = [];
  if (row.duplicate) reasons.push('כבר קיימת אצלך תנועה זהה בתאריך ובסכום האלה');
  if (row.isRefund) reasons.push('זיכוי (החזר) אינו הוצאה ולכן לא ניתן לייבא אותו');
  if (row.isCardCharge) reasons.push('שורת ריכוז של חיוב כרטיס — הסכום כבר מופיע בשורות הפירוט');

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
          style={[font.body, rtlText, { fontWeight: '800', color: row.isRefund ? colors.primary : colors.text }]}
        >
          {row.isRefund ? '−' : ''}
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
          <Badge icon="card" color={colors.textMuted}>
            חיוב כרטיס
          </Badge>
        ) : null}
        {row.shared ? (
          <Badge icon="people" color={colors.primaryDark}>
            משותף
          </Badge>
        ) : null}
      </View>

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
              {categories.map((c) => {
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
