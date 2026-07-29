import React, { useCallback, useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../src/context/AuthContext';
import { useHousehold } from '../src/context/HouseholdContext';
import * as db from '../src/lib/db';
import { appOrigin, shareOrCopy } from '../src/lib/share';
import type { HouseholdMember, Invite } from '../src/lib/types';
import {
  Body,
  Button,
  Card,
  Field,
  H3,
  IconBubble,
  InlineMessage,
  Loading,
  Muted,
  PageHeader,
  Screen,
  useDialog,
} from '../src/ui';
import { colors, rtlRow, spacing } from '../src/theme';
import { errorText } from '../src/lib/authErrors';

export default function Members() {
  const router = useRouter();
  const { user } = useAuth();
  const { confirm } = useDialog();
  const { household, householdId, refreshHouseholds } = useHousehold();
  const [members, setMembers] = useState<HouseholdMember[]>([]);
  const [invites, setInvites] = useState<Invite[]>([]);
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: 'error' | 'success' | 'info'; text: string } | null>(null);

  const load = useCallback(async () => {
    if (!householdId) return;
    setLoading(true);
    try {
      const [m, i] = await Promise.all([db.listMembers(householdId), db.listInvites(householdId)]);
      setMembers(m);
      setInvites(i.filter((x) => x.status === 'pending'));
    } catch (e) {
      setMessage({ tone: 'error', text: errorText(e, 'לא הצלחנו לטעון את בני הבית') });
    } finally {
      setLoading(false);
    }
  }, [householdId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function onInvite() {
    if (!householdId || !email.includes('@')) {
      setMessage({ tone: 'error', text: 'יש להזין כתובת מייל תקינה' });
      return;
    }
    setBusy(true);
    setMessage(null);
    try {
      await db.inviteMember(householdId, email.trim());
      setEmail('');
      await load();
      setMessage({
        tone: 'success',
        text: 'ההזמנה מוכנה. שלח/י את הקישור לבן/בת הזוג — ברגע שייכנסו עם אותה כתובת מייל הם יצטרפו אוטומטית.',
      });
    } catch (e) {
      setMessage({ tone: 'error', text: errorText(e, 'לא הצלחנו ליצור את ההזמנה') });
    } finally {
      setBusy(false);
    }
  }

  async function shareInvite(invite: Invite) {
    const where = household?.name ? ` למשק הבית "${household.name}"` : '';
    const text =
      `הוזמנת${where} ב-HomeBase — ניהול תקציב משק הבית.\n` +
      `היכנס/י ל-${appOrigin()} והירשם/י עם הכתובת ${invite.email} כדי להצטרף.`;
    const result = await shareOrCopy(text, 'הזמנה ל-HomeBase');
    if (result === 'copied') {
      setMessage({ tone: 'success', text: 'הקישור הועתק — אפשר להדביק בוואטסאפ' });
    } else if (result === 'failed') {
      setMessage({ tone: 'error', text: 'לא הצלחנו לשתף. נסה שוב, או העתק את הכתובת מהדפדפן.' });
    }
  }

  async function onRevoke(invite: Invite) {
    const ok = await confirm({
      title: 'ביטול ההזמנה',
      message: `לבטל את ההזמנה ל-${invite.email}? אפשר יהיה ליצור אותה מחדש בכל רגע.`,
      confirmText: 'ביטול ההזמנה',
      cancelText: 'השארה',
      destructive: true,
    });
    if (!ok) return;
    try {
      await db.revokeInvite(invite.id);
      await load();
      setMessage({ tone: 'success', text: 'ההזמנה בוטלה' });
    } catch (e) {
      setMessage({ tone: 'error', text: errorText(e, 'לא הצלחנו לבטל את ההזמנה') });
    }
  }

  async function onRemoveMember(m: HouseholdMember) {
    const isMe = m.user_id === user?.id;
    const ok = await confirm({
      title: isMe ? 'יציאה ממשק הבית' : 'הסרת בן בית',
      message: isMe ? 'לצאת ממשק הבית הזה?' : `להסיר את ${m.profiles?.full_name ?? m.profiles?.email}?`,
      confirmText: isMe ? 'יציאה' : 'הסרה',
      cancelText: 'ביטול',
      destructive: true,
    });
    if (!ok) return;
    try {
      await db.leaveHousehold(m.household_id, m.user_id);
      await refreshHouseholds();
      if (isMe) router.replace('/setup');
      else await load();
    } catch (e) {
      setMessage({ tone: 'error', text: errorText(e, 'לא הצלחנו לעדכן') });
    }
  }

  if (loading) return <Loading />;

  return (
    <Screen>
      <PageHeader title="בני הבית" onBack={() => router.back()} />

      {message ? <InlineMessage tone={message.tone}>{message.text}</InlineMessage> : null}

      <Card>
        <H3 style={{ marginBottom: spacing.sm }}>הזמנת בן/בת זוג</H3>
        <Muted style={{ marginBottom: spacing.lg }}>
          הזן כתובת מייל וקבל קישור לשיתוף. מי שנרשם עם אותה כתובת מצטרף אוטומטית.
        </Muted>
        <Field
          label="כתובת מייל"
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          keyboardType="email-address"
          placeholder="partner@example.com"
        />
        <Button title="יצירת הזמנה" onPress={onInvite} loading={busy} icon="person-add" />
      </Card>

      {invites.length > 0 ? (
        <>
          <H3 style={{ marginBottom: spacing.sm }}>הזמנות ממתינות</H3>
          <Card>
            {invites.map((inv, i) => (
              <View
                key={inv.id}
                style={{
                  paddingVertical: spacing.md,
                  borderTopWidth: i === 0 ? 0 : 1,
                  borderTopColor: colors.border,
                }}
              >
                <View style={{ ...rtlRow, gap: spacing.sm, justifyContent: 'space-between' }}>
                  <View style={{ ...rtlRow, gap: spacing.md, flexShrink: 1, minWidth: 0 }}>
                    <IconBubble icon="mail-unread" color={colors.warning} size={36} />
                    <Body numberOfLines={1} style={{ flexShrink: 1 }}>
                      {inv.email}
                    </Body>
                  </View>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`ביטול ההזמנה ל-${inv.email}`}
                    hitSlop={12}
                    onPress={() => onRevoke(inv)}
                    style={{ minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' }}
                  >
                    <Ionicons name="close-circle" size={22} color={colors.danger} />
                  </Pressable>
                </View>
                <Button
                  title="שיתוף ההזמנה"
                  accessibilityLabel={`שיתוף הזמנה ל-${inv.email}`}
                  variant="secondary"
                  size="sm"
                  icon="share-outline"
                  onPress={() => shareInvite(inv)}
                  testID={`hb-share-invite-${inv.id}`}
                  style={{ marginTop: spacing.sm, marginBottom: 0 }}
                />
              </View>
            ))}
          </Card>
        </>
      ) : null}

      <H3 style={{ marginBottom: spacing.sm }}>חברי משק הבית</H3>
      <Card>
        {members.map((m, i) => (
          <View
            key={m.id}
            style={{
              ...rtlRow,
              gap: spacing.sm,
              justifyContent: 'space-between',
              paddingVertical: spacing.md,
              borderTopWidth: i === 0 ? 0 : 1,
              borderTopColor: colors.border,
            }}
          >
            <View style={{ ...rtlRow, gap: spacing.md, flexShrink: 1, minWidth: 0 }}>
              <IconBubble icon="person" color={colors.primary} size={38} />
              <View style={{ flexShrink: 1, minWidth: 0 }}>
                <Body numberOfLines={1} style={{ fontWeight: '600' }}>
                  {m.profiles?.full_name ?? m.profiles?.email ?? 'בן בית'}
                  {m.user_id === user?.id ? ' (אני)' : ''}
                </Body>
                <Muted style={{ fontSize: 12 }}>{m.role === 'owner' ? 'מנהל משק הבית' : 'חבר'}</Muted>
              </View>
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={m.user_id === user?.id ? 'יציאה ממשק הבית' : 'הסרת בן בית'}
              hitSlop={8}
              onPress={() => onRemoveMember(m)}
            >
              <Ionicons name="ellipsis-horizontal" size={20} color={colors.textFaint} />
            </Pressable>
          </View>
        ))}
      </Card>
    </Screen>
  );
}
