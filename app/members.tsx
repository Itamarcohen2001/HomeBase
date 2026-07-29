import React, { useCallback, useEffect, useState } from 'react';
import { Pressable, Share, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../src/context/AuthContext';
import { useHousehold } from '../src/context/HouseholdContext';
import * as db from '../src/lib/db';
import { supabase } from '../src/lib/supabase';
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
      setMessage({ tone: 'error', text: e instanceof Error ? e.message : 'לא הצלחנו לטעון את בני הבית' });
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
      const invite = await db.inviteMember(householdId, email.trim());
      setEmail('');
      await load();

      // ניסיון לשליחת מייל דרך Edge Function (אם הוגדרה בפרויקט)
      const { error } = await supabase.functions.invoke('send-invite', {
        body: {
          invite_id: invite.id,
          email: invite.email,
          household_name: household?.name ?? '',
          inviter_name: user?.user_metadata?.full_name ?? user?.email ?? '',
        },
      });

      if (error) {
        setMessage({
          tone: 'info',
          text: 'ההזמנה נשמרה. שליחת המייל האוטומטית עדיין לא מוגדרת — אפשר לשתף את ההזמנה ידנית מהרשימה למטה.',
        });
      } else {
        setMessage({ tone: 'success', text: `שלחנו הזמנה למייל ${invite.email}` });
      }
    } catch (e) {
      setMessage({ tone: 'error', text: e instanceof Error ? e.message : 'לא הצלחנו לשלוח את ההזמנה' });
    } finally {
      setBusy(false);
    }
  }

  async function shareInvite(invite: Invite, name: string) {
    await Share.share({
      message: `הוזמנת להצטרף למשק הבית "${name}" באפליקציית HomeBase.\nהורד את האפליקציה, הירשם עם הכתובת ${invite.email} וההזמנה תחכה לך במסך הפתיחה.`,
    });
  }

  async function onRevoke(invite: Invite) {
    await db.revokeInvite(invite.id);
    await load();
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
      setMessage({ tone: 'error', text: e instanceof Error ? e.message : 'לא הצלחנו לעדכן' });
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
          הזן כתובת מייל — ההזמנה תמתין למשתמש כשיתחבר עם אותה כתובת.
        </Muted>
        <Field
          label="כתובת מייל"
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          keyboardType="email-address"
          placeholder="partner@example.com"
        />
        <Button title="שליחת הזמנה" onPress={onInvite} loading={busy} icon="mail" />
      </Card>

      {invites.length > 0 ? (
        <>
          <H3 style={{ marginBottom: spacing.sm }}>הזמנות ממתינות</H3>
          <Card>
            {invites.map((inv, i) => (
              <View
                key={inv.id}
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
                  <IconBubble icon="mail-unread" color={colors.warning} size={36} />
                  <Body numberOfLines={1} style={{ flexShrink: 1 }}>
                    {inv.email}
                  </Body>
                </View>
                <View style={{ ...rtlRow, gap: spacing.lg }}>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="שיתוף ההזמנה"
                    hitSlop={8}
                    onPress={() => shareInvite(inv, household?.name ?? '')}
                  >
                    <Ionicons name="share-outline" size={20} color={colors.textMuted} />
                  </Pressable>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="ביטול ההזמנה"
                    hitSlop={8}
                    onPress={() => onRevoke(inv)}
                  >
                    <Ionicons name="close-circle" size={20} color={colors.danger} />
                  </Pressable>
                </View>
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
