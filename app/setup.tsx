import React, { useCallback, useEffect, useState } from 'react';
import { Alert, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../src/context/AuthContext';
import { useHousehold } from '../src/context/HouseholdContext';
import * as db from '../src/lib/db';
import type { PendingInvite } from '../src/lib/types';
import { Body, Button, Card, Field, H1, H3, Muted, Screen } from '../src/ui';
import { colors, rtlRow, spacing } from '../src/theme';

export default function Setup() {
  const { user, signOut } = useAuth();
  const { createHousehold, refreshHouseholds } = useHousehold();
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [invites, setInvites] = useState<PendingInvite[]>([]);

  const loadInvites = useCallback(async () => {
    try {
      setInvites(await db.myPendingInvites());
    } catch {
      setInvites([]);
    }
  }, []);

  useEffect(() => {
    void loadInvites();
  }, [loadInvites]);

  async function onCreate() {
    setBusy(true);
    try {
      await createHousehold(name.trim() || 'משק הבית שלי');
    } catch (e) {
      Alert.alert('לא הצלחנו ליצור משק בית', e instanceof Error ? e.message : 'שגיאה לא ידועה');
    } finally {
      setBusy(false);
    }
  }

  async function onAccept(invite: PendingInvite) {
    setBusy(true);
    try {
      await db.acceptInvite(invite.invite_id);
      await refreshHouseholds();
    } catch (e) {
      Alert.alert('לא הצלחנו להצטרף', e instanceof Error ? e.message : 'שגיאה לא ידועה');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen>
      <View style={{ alignItems: 'center', marginTop: spacing.xl, marginBottom: spacing.lg }}>
        <Ionicons name="home" size={48} color={colors.primary} />
        <H1 style={{ marginTop: spacing.sm }}>ברוך הבא</H1>
        <Muted>{user?.email}</Muted>
      </View>

      {invites.length > 0 ? (
        <Card>
          <H3 style={{ marginBottom: spacing.sm }}>הזמנות שממתינות לך</H3>
          {invites.map((inv) => (
            <View key={inv.invite_id} style={{ marginBottom: spacing.md }}>
              <Body style={{ fontWeight: '700' }}>{inv.household_name}</Body>
              <Muted style={{ marginBottom: spacing.sm }}>
                {inv.invited_by_name ? `הוזמנת על ידי ${inv.invited_by_name}` : 'הוזמנת להצטרף'}
              </Muted>
              <Button title="הצטרפות" onPress={() => onAccept(inv)} loading={busy} />
            </View>
          ))}
        </Card>
      ) : null}

      <Card>
        <H3 style={{ marginBottom: spacing.sm }}>יצירת משק בית חדש</H3>
        <Muted style={{ marginBottom: spacing.lg }}>
          כל ההוצאות של בני הבית ייכנסו לקופה משותפת אחת, עם תווית של מי רשם כל תנועה.
        </Muted>
        <Field label="שם משק הבית" value={name} onChangeText={setName} placeholder="למשל: משפחת כהן" />
        <Button title="יצירה והתחלה" onPress={onCreate} loading={busy} size="lg" icon="add-circle" />
      </Card>

      <View style={{ ...rtlRow, justifyContent: 'center' }}>
        <Button title="התנתקות" variant="ghost" onPress={() => void signOut()} />
      </View>
    </Screen>
  );
}
