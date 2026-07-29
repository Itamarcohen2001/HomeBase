import React, { useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../src/context/AuthContext';
import { useHousehold } from '../src/context/HouseholdContext';
import * as db from '../src/lib/db';
import {
  Body,
  Button,
  Card,
  Field,
  H3,
  IconBubble,
  InlineMessage,
  Muted,
  PageHeader,
  Screen,
  useDialog,
} from '../src/ui';
import { colors, rtlRow, spacing } from '../src/theme';
import { errorText } from '../src/lib/authErrors';

export default function Settings() {
  const router = useRouter();
  const { user, signOut } = useAuth();
  const { confirm } = useDialog();
  const { household, households, householdId, selectHousehold, refreshHouseholds } = useHousehold();
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [message, setMessage] = useState<{ tone: 'error' | 'success'; text: string } | null>(null);

  useEffect(() => {
    setName(household?.name ?? '');
  }, [household?.name]);

  async function onRename() {
    if (!householdId || !name.trim()) return;
    setBusy(true);
    setMessage(null);
    try {
      await db.renameHousehold(householdId, name.trim());
      await refreshHouseholds();
      setMessage({ tone: 'success', text: 'שם משק הבית עודכן' });
    } catch (e) {
      setMessage({ tone: 'error', text: errorText(e, 'לא הצלחנו לשמור') });
    } finally {
      setBusy(false);
    }
  }

  async function onSignOut() {
    const ok = await confirm({
      title: 'התנתקות',
      message: 'להתנתק מהחשבון? תוכל להתחבר שוב בכל רגע.',
      confirmText: 'התנתקות',
      cancelText: 'ביטול',
      destructive: true,
    });
    if (!ok) return;
    setSigningOut(true);
    setMessage(null);
    try {
      await signOut();
    } catch (e) {
      setMessage({ tone: 'error', text: errorText(e, 'ההתנתקות נכשלה') });
    } finally {
      setSigningOut(false);
    }
  }

  return (
    <Screen>
      <PageHeader title="הגדרות" onBack={() => router.back()} />

      {message ? <InlineMessage tone={message.tone}>{message.text}</InlineMessage> : null}

      <Card>
        <H3 style={{ marginBottom: spacing.md }}>משק הבית</H3>
        <Field label="שם" value={name} onChangeText={setName} placeholder="משפחת כהן" />
        <Button title="שמירה" onPress={onRename} loading={busy} />
      </Card>

      {households.length > 1 ? (
        <Card>
          <H3 style={{ marginBottom: spacing.sm }}>מעבר בין משקי בית</H3>
          {households.map((h, i) => (
            <Pressable
              key={h.id}
              accessibilityRole="button"
              accessibilityLabel={`מעבר אל ${h.name}`}
              accessibilityState={{ selected: h.id === householdId }}
              onPress={() => selectHousehold(h.id)}
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
                <IconBubble icon="home" color={colors.primary} size={34} />
                <Body numberOfLines={1} style={{ flexShrink: 1 }}>
                  {h.name}
                </Body>
              </View>
              {h.id === householdId ? <Ionicons name="checkmark-circle" size={20} color={colors.primary} /> : null}
            </Pressable>
          ))}
        </Card>
      ) : null}

      <Card>
        <H3 style={{ marginBottom: spacing.sm }}>החשבון שלי</H3>
        <View style={{ ...rtlRow, gap: spacing.md }}>
          <IconBubble icon="person" color={colors.primary} size={40} />
          <View style={{ flexShrink: 1, minWidth: 0 }}>
            <Body style={{ fontWeight: '600' }}>
              {(user?.user_metadata?.full_name as string | undefined) ?? 'משתמש'}
            </Body>
            <Muted numberOfLines={1}>{user?.email}</Muted>
          </View>
        </View>
        <Button
          title="יצירת משק בית נוסף"
          variant="secondary"
          icon="add-circle"
          onPress={() => router.push('/setup')}
          style={{ marginTop: spacing.lg }}
        />
        <Button
          title={signingOut ? 'מתנתק…' : 'התנתקות'}
          variant="danger"
          icon="log-out-outline"
          loading={signingOut}
          onPress={onSignOut}
          style={{ marginTop: spacing.md }}
        />
      </Card>

      <Muted style={{ textAlign: 'center', marginTop: spacing.md }}>HomeBase · גרסה 1.0.0</Muted>
    </Screen>
  );
}
