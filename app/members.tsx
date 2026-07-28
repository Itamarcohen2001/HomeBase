import React, { useCallback, useEffect, useState } from 'react';
import { Alert, Share, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../src/context/AuthContext';
import { useHousehold } from '../src/context/HouseholdContext';
import * as db from '../src/lib/db';
import { supabase } from '../src/lib/supabase';
import type { HouseholdMember, Invite } from '../src/lib/types';
import { Body, Button, Card, Field, H3, IconBubble, Loading, Muted, PageHeader, Screen } from '../src/ui';
import { colors, rtlRow, spacing } from '../src/theme';

export default function Members() {
  const router = useRouter();
  const { user } = useAuth();
  const { household, householdId, refreshHouseholds } = useHousehold();
  const [members, setMembers] = useState<HouseholdMember[]>([]);
  const [invites, setInvites] = useState<Invite[]>([]);
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!householdId) return;
    setLoading(true);
    try {
      const [m, i] = await Promise.all([db.listMembers(householdId), db.listInvites(householdId)]);
      setMembers(m);
      setInvites(i.filter((x) => x.status === 'pending'));
    } catch (e) {
      Alert.alert('שגיאה', e instanceof Error ? e.message : 'לא הצלחנו לטעון');
    } finally {
      setLoading(false);
    }
  }, [householdId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function onInvite() {
    if (!householdId || !email.includes('@')) {
      Alert.alert('כתובת לא תקינה', 'יש להזין כתובת מייל תקינה');
      return;
    }
    setBusy(true);
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
        Alert.alert(
          'ההזמנה נשמרה',
          'שליחת המייל האוטומטית עדיין לא מוגדרת. אפשר לשתף את ההזמנה ידנית.',
          [
            { text: 'סגירה', style: 'cancel' },
            { text: 'שיתוף', onPress: () => shareInvite(invite, household?.name ?? '') },
          ],
        );
      } else {
        Alert.alert('נשלח', `שלחנו הזמנה למייל ${invite.email}`);
      }
    } catch (e) {
      Alert.alert('שגיאה', e instanceof Error ? e.message : 'לא הצלחנו להזמין');
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

  function onRemoveMember(m: HouseholdMember) {
    const isMe = m.user_id === user?.id;
    Alert.alert(
      isMe ? 'יציאה ממשק הבית' : 'הסרת בן בית',
      isMe ? 'לצאת ממשק הבית הזה?' : `להסיר את ${m.profiles?.full_name ?? m.profiles?.email}?`,
      [
        { text: 'ביטול', style: 'cancel' },
        {
          text: isMe ? 'יציאה' : 'הסרה',
          style: 'destructive',
          onPress: async () => {
            try {
              await db.leaveHousehold(m.household_id, m.user_id);
              await refreshHouseholds();
              if (isMe) router.replace('/setup');
              else await load();
            } catch (e) {
              Alert.alert('שגיאה', e instanceof Error ? e.message : 'לא הצלחנו לעדכן');
            }
          },
        },
      ],
    );
  }

  if (loading) return <Loading />;

  return (
    <Screen>
      <PageHeader title="בני הבית" onBack={() => router.back()} />

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
                  justifyContent: 'space-between',
                  paddingVertical: spacing.md,
                  borderTopWidth: i === 0 ? 0 : 1,
                  borderTopColor: colors.border,
                }}
              >
                <View style={rtlRow}>
                  <IconBubble icon="mail-unread" color={colors.warning} size={36} />
                  <Body style={{ marginRight: spacing.md }}>{inv.email}</Body>
                </View>
                <View style={rtlRow}>
                  <Ionicons
                    name="share-outline"
                    size={20}
                    color={colors.textMuted}
                    onPress={() => shareInvite(inv, household?.name ?? '')}
                    style={{ marginLeft: spacing.lg }}
                  />
                  <Ionicons name="close-circle" size={20} color={colors.danger} onPress={() => onRevoke(inv)} />
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
              justifyContent: 'space-between',
              paddingVertical: spacing.md,
              borderTopWidth: i === 0 ? 0 : 1,
              borderTopColor: colors.border,
            }}
          >
            <View style={rtlRow}>
              <IconBubble icon="person" color={colors.primary} size={38} />
              <View style={{ marginRight: spacing.md }}>
                <Body style={{ fontWeight: '600' }}>
                  {m.profiles?.full_name ?? m.profiles?.email ?? 'בן בית'}
                  {m.user_id === user?.id ? ' (אני)' : ''}
                </Body>
                <Muted style={{ fontSize: 12 }}>{m.role === 'owner' ? 'מנהל משק הבית' : 'חבר'}</Muted>
              </View>
            </View>
            <Ionicons name="ellipsis-horizontal" size={20} color={colors.textFaint} onPress={() => onRemoveMember(m)} />
          </View>
        ))}
      </Card>
    </Screen>
  );
}
