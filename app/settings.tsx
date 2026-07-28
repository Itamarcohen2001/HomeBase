import React, { useEffect, useState } from 'react';
import { Alert, Pressable, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../src/context/AuthContext';
import { useHousehold } from '../src/context/HouseholdContext';
import * as db from '../src/lib/db';
import { Body, Button, Card, Field, H3, IconBubble, Muted, PageHeader, Screen } from '../src/ui';
import { colors, rtlRow, spacing } from '../src/theme';

export default function Settings() {
  const router = useRouter();
  const { user, signOut } = useAuth();
  const { household, households, householdId, selectHousehold, refreshHouseholds } = useHousehold();
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setName(household?.name ?? '');
  }, [household?.name]);

  async function onRename() {
    if (!householdId || !name.trim()) return;
    setBusy(true);
    try {
      await db.renameHousehold(householdId, name.trim());
      await refreshHouseholds();
      Alert.alert('נשמר', 'שם משק הבית עודכן');
    } catch (e) {
      Alert.alert('שגיאה', e instanceof Error ? e.message : 'לא הצלחנו לשמור');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen>
      <PageHeader title="הגדרות" onBack={() => router.back()} />

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
              onPress={() => selectHousehold(h.id)}
              style={{
                ...rtlRow,
                justifyContent: 'space-between',
                paddingVertical: spacing.md,
                borderTopWidth: i === 0 ? 0 : 1,
                borderTopColor: colors.border,
              }}
            >
              <View style={rtlRow}>
                <IconBubble icon="home" color={colors.primary} size={34} />
                <Body style={{ marginRight: spacing.md }}>{h.name}</Body>
              </View>
              {h.id === householdId ? <Ionicons name="checkmark-circle" size={20} color={colors.primary} /> : null}
            </Pressable>
          ))}
        </Card>
      ) : null}

      <Card>
        <H3 style={{ marginBottom: spacing.sm }}>החשבון שלי</H3>
        <View style={rtlRow}>
          <IconBubble icon="person" color={colors.primary} size={40} />
          <View style={{ marginRight: spacing.md }}>
            <Body style={{ fontWeight: '600' }}>
              {(user?.user_metadata?.full_name as string | undefined) ?? 'משתמש'}
            </Body>
            <Muted>{user?.email}</Muted>
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
          title="התנתקות"
          variant="danger"
          icon="log-out-outline"
          onPress={() => void signOut()}
          style={{ marginTop: spacing.md }}
        />
      </Card>

      <Muted style={{ textAlign: 'center', marginTop: spacing.md }}>HomeBase · גרסה 1.0.0</Muted>
    </Screen>
  );
}
