import React, { useCallback, useMemo, useState } from 'react';
import { Modal, Pressable, ScrollView, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import * as DocumentPicker from 'expo-document-picker';
import { Ionicons } from '@expo/vector-icons';
import { goBack } from '../src/lib/nav';
import { useAuth } from '../src/context/AuthContext';
import { useHousehold } from '../src/context/HouseholdContext';
import * as db from '../src/lib/db';
import { formatDate, formatMoney } from '../src/lib/format';
import { errorText } from '../src/lib/authErrors';
import type { Category } from '../src/lib/types';
import { ImportError, type ParseResult, parseFile } from '../src/lib/import/parse';
import { type DraftRow, buildDraft, noteFor, rulesToLearn, toAgorot } from '../src/lib/import/draft';
import {
  Badge,
  Body,
  Button,
  Card,
  Checkbox,
  H3,
  IconBubble,
  InlineMessage,
  Muted,
  PageHeader,
  Screen,
} from '../src/ui';
import { colors, radius, rtlRow, spacing } from '../src/theme';

const ACCEPTED = [
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'text/csv',
  'text/comma-separated-values',
  'application/csv',
  // חלק מהדפדפנים לא מזהים את ה-MIME של קבצי הבנק, ולכן גם הסיומות עצמן
  '.xls',
  '.xlsx',
  '.csv',
];

/** במסך הייבוא הסכומים מוצגים עם אגורות, כדי שאפשר יהיה להשוות מול הדוח של הבנק. */
const money = (agorot: number) => formatMoney(agorot, { decimals: true });

/** ממיר את מה ש-DocumentPicker מחזיר לבייטים, גם בוובי וגם בנייטיב. */
async function readAsset(asset: DocumentPicker.DocumentPickerAsset): Promise<Uint8Array> {
  const file = (asset as unknown as { file?: File }).file;
  if (file && typeof file.arrayBuffer === 'function') {
    return new Uint8Array(await file.arrayBuffer());
  }
  const res = await fetch(asset.uri);
  return new Uint8Array(await res.arrayBuffer());
}

export default function ImportScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const { householdId, bumpVersion } = useHousehold();

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [result, setResult] = useState<ParseResult | null>(null);
  const [rows, setRows] = useState<DraftRow[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [picker, setPicker] = useState<string | null>(null);

  const selected = useMemo(() => rows.filter((r) => r.selected), [rows]);
  const selectedTotal = useMemo(() => selected.reduce((a, r) => a + toAgorot(r.amount), 0), [selected]);
  const missingCategory = useMemo(() => selected.filter((r) => !r.categoryId).length, [selected]);
  const duplicates = useMemo(() => rows.filter((r) => r.duplicate).length, [rows]);

  const patch = useCallback((id: string, next: Partial<DraftRow>) => {
    setRows((rs) => rs.map((r) => (r.id === id ? { ...r, ...next } : r)));
  }, []);

  async function onPick() {
    setError(null);
    setDone(null);
    if (!householdId) return;
    setBusy(true);
    try {
      const picked = await DocumentPicker.getDocumentAsync({ type: ACCEPTED, copyToCacheDirectory: true });
      if (picked.canceled || !picked.assets?.length) return;
      const asset = picked.assets[0];
      const data = await readAsset(asset);
      const parsed = await parseFile({ name: asset.name ?? 'file.xlsx', data });

      const [cats, rules] = await Promise.all([db.listCategories(householdId), db.listImportRules(householdId)]);
      const dates = parsed.rows.map((r) => r.date).sort();
      const existing = dates.length
        ? await db.listTransactionsInRange(householdId, dates[0], dates[dates.length - 1])
        : [];

      setCategories(cats);
      setResult(parsed);
      setRows(buildDraft(parsed.rows, { categories: cats, existing, rules }));
    } catch (e) {
      setResult(null);
      setRows([]);
      setError(e instanceof ImportError ? e.message : errorText(e, 'לא הצלחנו לקרוא את הקובץ'));
    } finally {
      setBusy(false);
    }
  }

  async function onImport() {
    if (!householdId || !user || !selected.length) return;
    setBusy(true);
    setError(null);
    try {
      const count = await db.addTransactionsBulk(
        selected.map((r) => ({
          householdId,
          userId: user.id,
          categoryId: r.categoryId,
          kind: 'expense' as const,
          amountAgorot: toAgorot(r.amount),
          occurredOn: r.date,
          note: noteFor(r),
          isShared: r.shared,
        })),
      );
      const learn = rulesToLearn(selected, []);
      if (learn.length) await db.saveImportRules(householdId, learn);
      bumpVersion();
      setResult(null);
      setRows([]);
      setDone(`יובאו ${count} תנועות. אפשר לראות אותן במסך התנועות.`);
    } catch (e) {
      setError(errorText(e, 'לא הצלחנו לייבא'));
    } finally {
      setBusy(false);
    }
  }

  const totalMismatch =
    result?.statedTotal != null && Math.abs(result.statedTotal - result.parsedTotal) > 0.009;

  return (
    <Screen>
      <PageHeader title="ייבוא מהבנק" onBack={() => goBack(router, '/(tabs)/more')} />

      {error ? <InlineMessage tone="error">{error}</InlineMessage> : null}
      {done ? <InlineMessage tone="success">{done}</InlineMessage> : null}

      {!result ? (
        <Card>
          <View style={{ alignItems: 'center', paddingVertical: spacing.md }}>
            <IconBubble icon="cloud-upload" color={colors.primary} size={56} />
            <H3 style={{ marginTop: spacing.md }}>ייבוא דוח כרטיס אשראי</H3>
            <Muted style={{ textAlign: 'center', marginTop: spacing.sm }}>
              בוחרים את קובץ הדוח שהורדתם מהבנק, עוברים על הרשימה, ורק מה שתאשרו ייכנס לתקציב.
            </Muted>
          </View>
          <Muted style={{ marginTop: spacing.lg, marginBottom: spacing.xs }}>קבצים נתמכים</Muted>
          <Body>Excel‏ (xlsx‏, xls) ו-CSV מבנק הפועלים ומאוצר החייל.</Body>
          <Button
            title="בחירת קובץ"
            icon="document-attach"
            onPress={onPick}
            loading={busy}
            size="lg"
            style={{ marginTop: spacing.lg }}
          />
        </Card>
      ) : (
        <>
          <Card>
            <View style={{ ...rtlRow, justifyContent: 'space-between', alignItems: 'center', gap: spacing.sm }}>
              <View style={{ flexShrink: 1, minWidth: 0 }}>
                <Body style={{ fontWeight: '700' }} numberOfLines={1}>
                  {result.source}
                </Body>
                <Muted style={{ fontSize: 12 }}>
                  {result.rows.length} תנועות בקובץ · סה״כ {money(toAgorot(result.parsedTotal))}
                </Muted>
              </View>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="בחירת קובץ אחר"
                onPress={onPick}
                style={{ minHeight: 44, minWidth: 44, alignItems: 'center', justifyContent: 'center' }}
              >
                <Ionicons name="refresh" size={22} color={colors.primary} />
              </Pressable>
            </View>

            {totalMismatch ? (
              <InlineMessage tone="error">
                {`הסכום שחישבנו (${money(toAgorot(result.parsedTotal))}) לא תואם לסכום שכתוב בקובץ ` +
                  `(${money(toAgorot(result.statedTotal ?? 0))}). כדאי לבדוק את הרשימה לפני ייבוא.`}
              </InlineMessage>
            ) : null}
            {result.notes.map((n) => (
              <Muted key={n} style={{ fontSize: 12, marginTop: spacing.sm }}>
                {n}
              </Muted>
            ))}
            {duplicates > 0 ? (
              <Muted style={{ fontSize: 12, marginTop: spacing.sm }}>
                {duplicates} תנועות כבר קיימות במערכת ולכן לא מסומנות לייבוא.
              </Muted>
            ) : null}
          </Card>

          <Card>
            <Muted style={{ marginBottom: spacing.sm }}>פעולות מהירות</Muted>
            <View style={{ ...rtlRow, flexWrap: 'wrap', gap: spacing.sm }}>
              <BulkButton
                label="סימון הכול"
                icon="checkbox"
                onPress={() => setRows((rs) => rs.map((r) => ({ ...r, selected: true })))}
              />
              <BulkButton
                label="ניקוי הבחירה"
                icon="square-outline"
                onPress={() => setRows((rs) => rs.map((r) => ({ ...r, selected: false })))}
              />
              <BulkButton
                label="הכול משותף"
                icon="people"
                onPress={() => setRows((rs) => rs.map((r) => (r.selected ? { ...r, shared: true } : r)))}
              />
              <BulkButton
                label="ביטול משותף"
                icon="person"
                onPress={() => setRows((rs) => rs.map((r) => ({ ...r, shared: false })))}
              />
            </View>
          </Card>

          {rows.map((row) => (
            <DraftCard
              key={row.id}
              row={row}
              categories={categories}
              onToggle={() => patch(row.id, { selected: !row.selected })}
              onShare={() => patch(row.id, { shared: !row.shared })}
              onPickCategory={() => setPicker(row.id)}
            />
          ))}

          <Card>
            <View style={{ ...rtlRow, justifyContent: 'space-between', marginBottom: spacing.sm }}>
              <Muted>נבחרו לייבוא</Muted>
              <Body style={{ fontWeight: '700' }}>
                {selected.length} · {money(selectedTotal)}
              </Body>
            </View>
            {missingCategory > 0 ? (
              <Muted style={{ fontSize: 12, marginBottom: spacing.sm }}>
                {missingCategory} תנועות בלי קטגוריה — הן ייובאו ללא קטגוריה, אפשר לבחור עכשיו.
              </Muted>
            ) : null}
            <Button
              title={selected.length ? `ייבוא ${selected.length} תנועות` : 'לא נבחרו תנועות'}
              icon="download"
              size="lg"
              onPress={onImport}
              loading={busy}
              disabled={!selected.length}
            />
          </Card>
        </>
      )}

      <CategoryPicker
        visible={picker !== null}
        categories={categories}
        onClose={() => setPicker(null)}
        onSelect={(id, source) => {
          if (picker) patch(picker, { categoryId: id, categorySource: source });
          setPicker(null);
        }}
      />
    </Screen>
  );
}

function BulkButton({
  label,
  icon,
  onPress,
}: {
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={{
        ...rtlRow,
        gap: spacing.xs + 2,
        minHeight: 44,
        paddingHorizontal: spacing.md,
        alignItems: 'center',
        borderRadius: radius.pill,
        borderWidth: 1.5,
        borderColor: colors.border,
        backgroundColor: colors.surface,
      }}
    >
      <Ionicons name={icon} size={16} color={colors.primary} />
      <Text style={{ fontSize: 13, fontWeight: '600', color: colors.text }}>{label}</Text>
    </Pressable>
  );
}

function DraftCard({
  row,
  categories,
  onToggle,
  onShare,
  onPickCategory,
}: {
  row: DraftRow;
  categories: Category[];
  onToggle: () => void;
  onShare: () => void;
  onPickCategory: () => void;
}) {
  const category = categories.find((c) => c.id === row.categoryId) ?? null;
  const dim = !row.selected;

  return (
    <Card style={{ opacity: dim ? 0.6 : 1 }}>
      <View style={{ ...rtlRow, gap: spacing.md, alignItems: 'flex-start' }}>
        <Pressable
          accessibilityRole="checkbox"
          accessibilityLabel={`ייבוא ${row.description}`}
          aria-checked={row.selected}
          onPress={onToggle}
          style={{ minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' }}
        >
          <Ionicons
            name={row.selected ? 'checkbox' : 'square-outline'}
            size={24}
            color={row.selected ? colors.primary : colors.textFaint}
          />
        </Pressable>

        <View style={{ flex: 1, minWidth: 0 }}>
          <Body numberOfLines={2} style={{ fontWeight: '600' }}>
            {row.description}
          </Body>
          <Muted style={{ fontSize: 12, marginTop: 2 }}>
            {formatDate(row.date)} · {money(toAgorot(row.amount))}
          </Muted>

          <View style={{ ...rtlRow, flexWrap: 'wrap', gap: spacing.xs, marginTop: spacing.sm }}>
            {row.duplicate ? (
              <Badge icon="copy" color={colors.warning}>
                כבר קיים במערכת
              </Badge>
            ) : null}
            {row.isCardCharge ? (
              <Badge icon="card" color={colors.warning}>
                ריכוז חיוב אשראי
              </Badge>
            ) : null}
            {row.isRefund ? (
              <Badge icon="return-down-back" color={colors.warning}>
                זיכוי
              </Badge>
            ) : null}
            {row.shared ? (
              <Badge icon="people" color={colors.primary}>
                משותף
              </Badge>
            ) : null}
          </View>

          <View style={{ ...rtlRow, gap: spacing.sm, marginTop: spacing.sm, flexWrap: 'wrap' }}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`בחירת קטגוריה ל${row.description}`}
              onPress={onPickCategory}
              style={{
                ...rtlRow,
                gap: spacing.xs + 2,
                minHeight: 44,
                paddingHorizontal: spacing.md,
                alignItems: 'center',
                borderRadius: radius.pill,
                borderWidth: 1.5,
                borderColor: category ? category.color : colors.border,
                backgroundColor: category ? `${category.color}22` : colors.surface,
                flexShrink: 1,
                minWidth: 0,
              }}
            >
              <Ionicons
                name={(category?.icon as keyof typeof Ionicons.glyphMap) ?? 'pricetag-outline'}
                size={15}
                color={category ? category.color : colors.textMuted}
              />
              <Text numberOfLines={1} style={{ fontSize: 13, fontWeight: '600', color: colors.text }}>
                {category ? category.name : 'בחירת קטגוריה'}
              </Text>
            </Pressable>

            <Pressable
              accessibilityRole="checkbox"
              accessibilityLabel={`סימון ${row.description} כהוצאה משותפת`}
              aria-checked={row.shared}
              onPress={onShare}
              style={{
                ...rtlRow,
                gap: spacing.xs + 2,
                minHeight: 44,
                paddingHorizontal: spacing.md,
                alignItems: 'center',
                borderRadius: radius.pill,
                borderWidth: 1.5,
                borderColor: row.shared ? colors.primary : colors.border,
                backgroundColor: row.shared ? colors.primarySoft : colors.surface,
              }}
            >
              <Ionicons name="people" size={15} color={row.shared ? colors.primary : colors.textMuted} />
              <Text style={{ fontSize: 13, fontWeight: '600', color: colors.text }}>משותף</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Card>
  );
}

function CategoryPicker({
  visible,
  categories,
  onClose,
  onSelect,
}: {
  visible: boolean;
  categories: Category[];
  onClose: () => void;
  onSelect: (id: string | null, source: DraftRow['categorySource']) => void;
}) {
  const expense = categories.filter((c) => c.kind === 'expense');
  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: colors.bg, padding: spacing.lg, paddingTop: spacing.xl }}>
        <PageHeader title="בחירת קטגוריה" onBack={onClose} />
        <ScrollView contentContainerStyle={{ paddingBottom: spacing.xxl }}>
          <Card>
            {expense.map((c, i) => (
              <Pressable
                key={c.id}
                accessibilityRole="button"
                accessibilityLabel={c.name}
                onPress={() => onSelect(c.id, 'user')}
                style={{
                  ...rtlRow,
                  gap: spacing.md,
                  alignItems: 'center',
                  minHeight: 52,
                  borderTopWidth: i === 0 ? 0 : 1,
                  borderTopColor: colors.border,
                }}
              >
                <IconBubble icon={c.icon} color={c.color} size={36} />
                <Body style={{ fontWeight: '600' }}>{c.name}</Body>
              </Pressable>
            ))}
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="ללא קטגוריה"
              onPress={() => onSelect(null, 'none')}
              style={{
                ...rtlRow,
                gap: spacing.md,
                alignItems: 'center',
                minHeight: 52,
                borderTopWidth: 1,
                borderTopColor: colors.border,
              }}
            >
              <IconBubble icon="close-circle-outline" color={colors.textMuted} size={36} />
              <Body style={{ fontWeight: '600' }}>ללא קטגוריה</Body>
            </Pressable>
          </Card>
        </ScrollView>
      </View>
    </Modal>
  );
}
