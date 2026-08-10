import React, { useCallback, useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { goBack } from '../src/lib/nav';
import { useHousehold } from '../src/context/HouseholdContext';
import { useTheme } from '../src/context/ThemeContext';
import * as db from '../src/lib/db';
import * as nw from '../src/lib/networth';
import { copyToClipboard } from '../src/lib/share';
import { formatDate, formatMoney } from '../src/lib/format';
import { errorText } from '../src/lib/authErrors';
import { INSTITUTIONS, institutionLabel } from '../src/lib/institutions';
import type { BankConnection, BankSyncPending } from '../src/lib/types';
import {
  Badge,
  Body,
  Button,
  Card,
  EmptyState,
  Field,
  H3,
  IconBubble,
  InlineMessage,
  Loading,
  Muted,
  PageHeader,
  Screen,
  SectionTitle,
  useDialog,
} from '../src/ui';
import { radius, rtlRow, spacing } from '../src/theme';

export default function ConnectBank() {
  const router = useRouter();
  const { colors } = useTheme();
  const { confirm } = useDialog();
  const { householdId, bumpVersion } = useHousehold();
  const [connections, setConnections] = useState<BankConnection[]>([]);
  const [pending, setPending] = useState<BankSyncPending[]>([]);
  const [accounts, setAccounts] = useState<nw.TrackedAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<{ tone: 'error' | 'success' | 'info'; text: string } | null>(null);

  const [showAdd, setShowAdd] = useState(false);
  const [institution, setInstitution] = useState<string | null>(null);
  const [nickname, setNickname] = useState('');
  const [accountId, setAccountId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [justCreated, setJustCreated] = useState<BankConnection | null>(null);

  const [busyId, setBusyId] = useState<string | null>(null);
  const [linkingId, setLinkingId] = useState<string | null>(null);
  /** connection.id שנפתח לו כרגע בורר-חשבון לעריכה (גם כשכבר יש חשבון מקושר) */
  const [editingAccountFor, setEditingAccountFor] = useState<string | null>(null);

  const STATUS_META: Record<BankConnection['status'], { label: string; color: string; icon: keyof typeof Ionicons.glyphMap }> = {
    pending_setup: { label: 'ממתין להגדרה במחשב', color: colors.warning, icon: 'time-outline' },
    ok: { label: 'מסונכרן', color: colors.primary, icon: 'checkmark-circle' },
    error: { label: 'שגיאה בסנכרון האחרון', color: colors.danger, icon: 'alert-circle' },
  };

  const load = useCallback(async () => {
    if (!householdId) return;
    setLoading(true);
    try {
      const [conns, pend, accts] = await Promise.all([
        db.listBankConnections(householdId),
        db.listBankSyncPending(householdId),
        nw.listTrackedAccounts(householdId),
      ]);
      setConnections(conns);
      setPending(pend);
      setAccounts(accts);
      if (!accountId && accts.length > 0) setAccountId(accts[0].id);
    } catch (e) {
      setMessage({ tone: 'error', text: errorText(e, 'לא הצלחנו לטעון את החיבורים') });
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [householdId]);

  useEffect(() => {
    void load();
  }, [load]);

  function accountName(id: string | null): string | null {
    return id ? accounts.find((a) => a.id === id)?.name ?? null : null;
  }

  async function onCreate() {
    if (!householdId || !institution) {
      setMessage({ tone: 'error', text: 'יש לבחור מוסד' });
      return;
    }
    if (!accountId) {
      setMessage({ tone: 'error', text: 'יש לבחור לאיזה חשבון התנועות ייכנסו/ירדו' });
      return;
    }
    setCreating(true);
    setMessage(null);
    try {
      const conn = await db.createBankConnection(
        householdId,
        institution,
        nickname.trim() || institutionLabel(institution),
        accountId,
      );
      setJustCreated(conn);
      setShowAdd(false);
      setInstitution(null);
      setNickname('');
      await load();
    } catch (e) {
      setMessage({ tone: 'error', text: errorText(e, 'לא הצלחנו ליצור את החיבור') });
    } finally {
      setCreating(false);
    }
  }

  async function onLinkAccount(conn: BankConnection, newAccountId: string) {
    setLinkingId(conn.id);
    try {
      await db.setBankConnectionAccount(conn.id, newAccountId);
      await load();
      setEditingAccountFor(null);
      setMessage({ tone: 'success', text: 'החשבון קושר לחיבור.' });
    } catch (e) {
      setMessage({ tone: 'error', text: errorText(e, 'לא הצלחנו לקשר את החשבון') });
    } finally {
      setLinkingId(null);
    }
  }

  async function onDelete(conn: BankConnection) {
    const ok = await confirm({
      title: 'מחיקת חיבור',
      message: `להסיר את החיבור ל${conn.nickname || institutionLabel(conn.institution)}? זה לא ימחק תנועות שכבר אושרו — רק יפסיק סנכרון עתידי. אם הוגדרו פרטי התחברות במחשב המקומי, למחוק אותם בנפרד עם node setup.js remove.`,
      confirmText: 'הסרה',
      cancelText: 'ביטול',
      destructive: true,
    });
    if (!ok) return;
    setBusyId(conn.id);
    try {
      await db.deleteBankConnection(conn.id);
      await load();
    } catch (e) {
      setMessage({ tone: 'error', text: errorText(e, 'לא הצלחנו למחוק את החיבור') });
    } finally {
      setBusyId(null);
    }
  }

  async function onCopySetupCommand(conn: BankConnection) {
    const cmd = `node setup.js ${conn.id} ${conn.institution}`;
    const ok = await copyToClipboard(cmd);
    setMessage(
      ok
        ? { tone: 'success', text: 'הפקודה הועתקה. להריץ אותה בתיקיית bank-sync/ במחשב.' }
        : { tone: 'error', text: 'לא הצלחנו להעתיק — אפשר להעתיק ידנית מהכרטיס.' },
    );
  }

  async function onApprove(row: BankSyncPending) {
    setBusyId(row.id);
    try {
      await db.approveBankPending(row.id, null);
      setPending((prev) => prev.filter((p) => p.id !== row.id));
      bumpVersion(); // תנועה אמיתית נוצרה (ויתרת החשבון המקושר התעדכנה) — כמו כל נתיב יצירת תנועה אחר
    } catch (e) {
      setMessage({ tone: 'error', text: errorText(e, 'לא הצלחנו לאשר את התנועה — ודא/י שלחיבור המקורי יש חשבון מקושר') });
    } finally {
      setBusyId(null);
    }
  }

  async function onReject(row: BankSyncPending) {
    setBusyId(row.id);
    try {
      await db.rejectBankPending(row.id);
      setPending((prev) => prev.filter((p) => p.id !== row.id));
    } catch (e) {
      setMessage({ tone: 'error', text: errorText(e, 'לא הצלחנו לדחות את התנועה') });
    } finally {
      setBusyId(null);
    }
  }

  if (loading) return <Loading />;

  return (
    <Screen>
      <PageHeader title="חיבור בנקים" onBack={() => goBack(router, '/(tabs)/more')} />

      {message ? <InlineMessage tone={message.tone}>{message.text}</InlineMessage> : null}

      <InlineMessage tone="info">
        הסנכרון רץ במחשב הבית שלך, לא באתר — כך שסיסמת הבנק אף פעם לא מגיעה
        לכאן. כל תנועה שנגרדת נוחתת קודם בתור "לאישור" למטה, ואת/ה מחליט/ה
        מה נכנס להיסטוריה. תנועה מאושרת נזקפת לחשבון שקישרת לחיבור — היתרה
        שלו מתעדכנת אוטומטית.
      </InlineMessage>

      {justCreated ? (
        <Card>
          <H3 style={{ marginBottom: spacing.sm }}>
            החיבור נוצר — עכשיו ההגדרה החד-פעמית במחשב
          </H3>
          <Muted style={{ marginBottom: spacing.md }}>
            בתיקיית bank-sync/ (בפרויקט, לא באתר): להתקין פעם אחת עם npm
            install, ואז להריץ את הפקודה הזו כדי לשמור את פרטי ההתחברות
            מוצפנים במחשב:
          </Muted>
          <View
            style={{
              backgroundColor: colors.bg,
              borderRadius: radius.sm,
              padding: spacing.md,
              marginBottom: spacing.md,
            }}
          >
            <Text selectable style={{ fontFamily: 'monospace', fontSize: 13, color: colors.text, textAlign: 'left' }}>
              {`node setup.js ${justCreated.id} ${justCreated.institution}`}
            </Text>
          </View>
          <Button
            title="העתקת הפקודה"
            variant="secondary"
            icon="copy-outline"
            onPress={() => onCopySetupCommand(justCreated)}
          />
          <Muted style={{ marginTop: spacing.md, fontSize: 12 }}>
            אחר כך register-task.ps1 מגדיר הרצה יומית אוטומטית — ראו
            bank-sync/README.md.
          </Muted>
          <Button
            title="הבנתי"
            variant="ghost"
            onPress={() => setJustCreated(null)}
            style={{ marginTop: spacing.sm, marginBottom: 0 }}
          />
        </Card>
      ) : null}

      <SectionTitle
        action={
          !showAdd ? (
            <Pressable onPress={() => setShowAdd(true)} accessibilityRole="button" accessibilityLabel="הוספת בנק">
              <Ionicons name="add-circle" size={26} color={colors.primary} />
            </Pressable>
          ) : null
        }
      >
        חיבורים
      </SectionTitle>

      {showAdd ? (
        <Card>
          <Muted style={{ marginBottom: spacing.sm }}>מוסד</Muted>
          <View style={{ flexDirection: 'row-reverse', flexWrap: 'wrap', gap: spacing.sm, marginBottom: spacing.md }}>
            {INSTITUTIONS.map((inst) => {
              const active = institution === inst.id;
              return (
                <Pressable
                  key={inst.id}
                  accessibilityRole="button"
                  accessibilityState={{ selected: active }}
                  accessibilityLabel={inst.label}
                  onPress={() => setInstitution(inst.id)}
                  style={{
                    paddingVertical: spacing.sm,
                    paddingHorizontal: spacing.md,
                    borderRadius: radius.pill,
                    borderWidth: 1.5,
                    borderColor: active ? colors.primary : colors.border,
                    backgroundColor: active ? colors.primarySoft : colors.surface,
                  }}
                >
                  <Text style={{ fontSize: 13, fontWeight: '600', color: active ? colors.primaryDark : colors.text }}>
                    {inst.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          <Field
            label="כינוי (אופציונלי)"
            value={nickname}
            onChangeText={setNickname}
            placeholder={institution ? institutionLabel(institution) : 'למשל: עו״ש משותף'}
          />

          <Muted style={{ marginBottom: spacing.sm }}>
            לאיזה חשבון התנועות ייכנסו/ירדו?
          </Muted>
          {accounts.length === 0 ? (
            <InlineMessage tone="error" style={{ marginBottom: spacing.md }}>
              אין לך עדיין חשבון (עו״ש/מזומן) במסך "שווי נטו". צריך ליצור אחד
              שם קודם — לשם כך התנועות מהחיבור הזה יזקפו וממנו היתרה תתעדכן.
            </InlineMessage>
          ) : (
            <View style={{ flexDirection: 'row-reverse', flexWrap: 'wrap', gap: spacing.sm, marginBottom: spacing.md }}>
              {accounts.map((a) => {
                const active = accountId === a.id;
                return (
                  <Pressable
                    key={a.id}
                    accessibilityRole="button"
                    accessibilityState={{ selected: active }}
                    accessibilityLabel={a.name}
                    onPress={() => setAccountId(a.id)}
                    style={{
                      paddingVertical: spacing.sm,
                      paddingHorizontal: spacing.md,
                      borderRadius: radius.pill,
                      borderWidth: 1.5,
                      borderColor: active ? colors.primary : colors.border,
                      backgroundColor: active ? colors.primarySoft : colors.surface,
                    }}
                  >
                    <Text style={{ fontSize: 13, fontWeight: '600', color: active ? colors.primaryDark : colors.text }}>
                      {a.name}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          )}

          <View style={{ ...rtlRow, gap: spacing.sm }}>
            <Button
              title="יצירת חיבור"
              onPress={onCreate}
              loading={creating}
              icon="link"
              disabled={accounts.length === 0}
              style={{ flex: 1 }}
            />
            <Button title="ביטול" variant="ghost" onPress={() => setShowAdd(false)} style={{ flex: 1 }} />
          </View>
        </Card>
      ) : null}

      {connections.length === 0 && !showAdd ? (
        <Card>
          <EmptyState
            icon="business-outline"
            title="אין חיבורי בנק עדיין"
            subtitle="חיבור בנק מסנכרן תנועות אוטומטית, כל עוד יש הרצה מתוזמנת במחשב הבית."
          />
        </Card>
      ) : (
        connections.map((conn) => {
          const meta = STATUS_META[conn.status];
          const linkedName = accountName(conn.account_id);
          return (
            <Card key={conn.id}>
              <View style={{ ...rtlRow, justifyContent: 'space-between', gap: spacing.sm }}>
                <View style={{ ...rtlRow, gap: spacing.md, flexShrink: 1, minWidth: 0 }}>
                  <IconBubble icon="business" color={colors.primary} size={40} />
                  <View style={{ flexShrink: 1, minWidth: 0 }}>
                    <Body numberOfLines={1} style={{ fontWeight: '700' }}>
                      {conn.nickname || institutionLabel(conn.institution)}
                    </Body>
                    <Muted numberOfLines={1} style={{ fontSize: 12 }}>{institutionLabel(conn.institution)}</Muted>
                  </View>
                </View>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="הסרת חיבור"
                  hitSlop={8}
                  disabled={busyId === conn.id}
                  onPress={() => onDelete(conn)}
                >
                  <Ionicons name="ellipsis-horizontal" size={20} color={colors.textFaint} />
                </Pressable>
              </View>

              <View style={{ ...rtlRow, gap: spacing.sm, marginTop: spacing.md, flexWrap: 'wrap' }}>
                <Badge color={meta.color} icon={meta.icon}>{meta.label}</Badge>
                {linkedName ? (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`שינוי חשבון (כרגע ${linkedName})`}
                    onPress={() => setEditingAccountFor(editingAccountFor === conn.id ? null : conn.id)}
                    style={{ ...rtlRow, gap: 4 }}
                  >
                    <Badge color={colors.textMuted} icon="wallet-outline">{linkedName}</Badge>
                    <Ionicons name="pencil" size={13} color={colors.textFaint} />
                  </Pressable>
                ) : null}
                {conn.last_synced_at ? (
                  <Muted style={{ fontSize: 12 }}>סונכרן לאחרונה {formatDate(conn.last_synced_at)}</Muted>
                ) : null}
              </View>

              {!linkedName ? (
                <InlineMessage tone="error" style={{ marginTop: spacing.md, marginBottom: spacing.sm }}>
                  אין חשבון מקושר — תנועות מהחיבור הזה לא יאושרו עד שתקשר/י חשבון.
                </InlineMessage>
              ) : null}

              {!linkedName || editingAccountFor === conn.id ? (
                <View style={{ marginTop: linkedName ? spacing.md : 0 }}>
                  {linkedName ? (
                    <Muted style={{ marginBottom: spacing.sm, fontSize: 12 }}>לקשר לחשבון אחר:</Muted>
                  ) : null}
                  {accounts.length === 0 ? (
                    <Muted style={{ fontSize: 12 }}>ליצור חשבון קודם במסך "שווי נטו".</Muted>
                  ) : (
                    <View style={{ flexDirection: 'row-reverse', flexWrap: 'wrap', gap: spacing.sm }}>
                      {accounts.map((a) => {
                        const active = a.id === conn.account_id;
                        return (
                          <Pressable
                            key={a.id}
                            accessibilityRole="button"
                            accessibilityState={{ selected: active }}
                            accessibilityLabel={`קישור ל${a.name}`}
                            disabled={linkingId === conn.id || active}
                            onPress={() => onLinkAccount(conn, a.id)}
                            style={{
                              paddingVertical: spacing.sm,
                              paddingHorizontal: spacing.md,
                              borderRadius: radius.pill,
                              borderWidth: 1.5,
                              borderColor: active ? colors.primary : colors.border,
                              backgroundColor: active ? colors.primarySoft : colors.surface,
                            }}
                          >
                            <Text style={{ fontSize: 13, fontWeight: '600', color: active ? colors.primaryDark : colors.text }}>
                              {a.name}
                            </Text>
                          </Pressable>
                        );
                      })}
                    </View>
                  )}
                </View>
              ) : null}

              {conn.status === 'error' && conn.last_error ? (
                <InlineMessage tone="error" style={{ marginTop: spacing.md, marginBottom: 0 }}>
                  {conn.last_error}
                </InlineMessage>
              ) : null}

              {conn.status === 'pending_setup' ? (
                <Button
                  title="העתקת פקודת ההגדרה"
                  variant="secondary"
                  size="sm"
                  icon="copy-outline"
                  onPress={() => onCopySetupCommand(conn)}
                  style={{ marginTop: spacing.md, marginBottom: 0 }}
                />
              ) : null}
            </Card>
          );
        })
      )}

      <SectionTitle>תנועות לאישור {pending.length > 0 ? `(${pending.length})` : ''}</SectionTitle>

      {pending.length === 0 ? (
        <Card>
          <EmptyState icon="checkmark-done-outline" title="אין תנועות ממתינות" subtitle="כל התנועות שנגרדו כבר טופלו." />
        </Card>
      ) : (
        <Card style={{ paddingVertical: spacing.xs }}>
          {pending.map((row, i) => (
            <View
              key={row.id}
              style={{
                paddingVertical: spacing.md,
                borderTopWidth: i === 0 ? 0 : 1,
                borderTopColor: colors.border,
              }}
            >
              <View style={{ ...rtlRow, justifyContent: 'space-between', gap: spacing.sm }}>
                <View style={{ flexShrink: 1, minWidth: 0 }}>
                  <Body numberOfLines={2} style={{ fontWeight: '600' }}>{row.description || 'ללא תיאור'}</Body>
                  <Muted style={{ fontSize: 12 }}>{formatDate(row.occurred_on)}</Muted>
                </View>
                <Body style={{ fontWeight: '700', color: row.kind === 'income' ? colors.income : colors.text }}>
                  {formatMoney(row.amount_agorot)}
                </Body>
              </View>

              {row.categories ? (
                <View style={{ marginTop: spacing.xs }}>
                  <Badge color={row.categories.color} icon="pricetag-outline">{row.categories.name}</Badge>
                </View>
              ) : null}

              <View style={{ ...rtlRow, gap: spacing.sm, marginTop: spacing.sm }}>
                <Button
                  title="אישור"
                  size="sm"
                  icon="checkmark"
                  onPress={() => onApprove(row)}
                  loading={busyId === row.id}
                  style={{ flex: 1 }}
                />
                <Button
                  title="דחייה"
                  size="sm"
                  variant="ghost"
                  icon="close"
                  onPress={() => onReject(row)}
                  disabled={busyId === row.id}
                  style={{ flex: 1 }}
                />
              </View>
            </View>
          ))}
        </Card>
      )}
    </Screen>
  );
}
