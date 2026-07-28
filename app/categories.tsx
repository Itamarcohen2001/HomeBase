import React, { useCallback, useEffect, useState } from 'react';
import { Alert, Modal, Pressable, ScrollView, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useHousehold } from '../src/context/HouseholdContext';
import * as db from '../src/lib/db';
import type { Category, Kind } from '../src/lib/types';
import { Body, Button, Card, Field, H3, IconBubble, Loading, Muted, PageHeader, Screen } from '../src/ui';
import { colors, radius, rtlRow, spacing } from '../src/theme';

const ICONS = [
  'cart', 'restaurant', 'home', 'flash', 'car', 'medkit', 'happy', 'shirt',
  'game-controller', 'phone-portrait', 'shield-checkmark', 'gift', 'paw',
  'trending-up', 'briefcase', 'business', 'wallet', 'airplane', 'book',
  'barbell', 'cafe', 'construct', 'school', 'ellipsis-horizontal',
];

const COLORS = [
  '#2E9E6B', '#E4894F', '#4F7FE4', '#F2C14E', '#5BC0BE', '#E4646C',
  '#9B6BDF', '#DE7AA8', '#3FA7D6', '#7A8B99', '#6B8E7B', '#C2557A',
];

export default function Categories() {
  const router = useRouter();
  const { householdId, bumpVersion } = useHousehold();
  const [items, setItems] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Category | null>(null);
  const [creating, setCreating] = useState<Kind | null>(null);

  const load = useCallback(async () => {
    if (!householdId) return;
    setLoading(true);
    try {
      setItems(await db.listCategories(householdId));
    } catch (e) {
      Alert.alert('שגיאה', e instanceof Error ? e.message : 'לא הצלחנו לטעון קטגוריות');
    } finally {
      setLoading(false);
    }
  }, [householdId]);

  useEffect(() => {
    void load();
  }, [load]);

  function confirmDelete(c: Category) {
    Alert.alert('מחיקת קטגוריה', `למחוק את "${c.name}"? התנועות שלה יישארו ללא קטגוריה.`, [
      { text: 'ביטול', style: 'cancel' },
      {
        text: 'מחיקה',
        style: 'destructive',
        onPress: async () => {
          try {
            await db.deleteCategory(c.id);
            bumpVersion();
            await load();
          } catch (e) {
            Alert.alert('שגיאה', e instanceof Error ? e.message : 'לא הצלחנו למחוק');
          }
        },
      },
    ]);
  }

  const groups: [Kind, string][] = [
    ['expense', 'קטגוריות הוצאה'],
    ['income', 'קטגוריות הכנסה'],
  ];

  if (loading) return <Loading />;

  return (
    <Screen>
      <PageHeader title="קטגוריות" onBack={() => router.back()} />

      {groups.map(([kind, label]) => (
        <View key={kind}>
          <View style={{ ...rtlRow, justifyContent: 'space-between', marginBottom: spacing.sm }}>
            <H3>{label}</H3>
            <Pressable onPress={() => setCreating(kind)} hitSlop={8} style={rtlRow}>
              <Ionicons name="add-circle" size={20} color={colors.primary} />
              <Muted style={{ color: colors.primary, fontWeight: '700', marginRight: 4 }}>הוספה</Muted>
            </Pressable>
          </View>
          <Card>
            {items.filter((c) => c.kind === kind).length === 0 ? (
              <Muted>אין קטגוריות עדיין</Muted>
            ) : (
              items
                .filter((c) => c.kind === kind)
                .map((c, i) => (
                  <View
                    key={c.id}
                    style={{
                      ...rtlRow,
                      justifyContent: 'space-between',
                      paddingVertical: spacing.md,
                      borderTopWidth: i === 0 ? 0 : 1,
                      borderTopColor: colors.border,
                    }}
                  >
                    <View style={rtlRow}>
                      <IconBubble icon={c.icon} color={c.color} size={36} />
                      <Body style={{ marginRight: spacing.md, fontWeight: '600' }}>{c.name}</Body>
                    </View>
                    <View style={rtlRow}>
                      <Pressable onPress={() => setEditing(c)} hitSlop={8} style={{ marginLeft: spacing.lg }}>
                        <Ionicons name="create-outline" size={20} color={colors.textMuted} />
                      </Pressable>
                      <Pressable onPress={() => confirmDelete(c)} hitSlop={8}>
                        <Ionicons name="trash-outline" size={20} color={colors.danger} />
                      </Pressable>
                    </View>
                  </View>
                ))
            )}
          </Card>
        </View>
      ))}

      <CategoryEditor
        visible={Boolean(editing) || Boolean(creating)}
        category={editing}
        kind={editing?.kind ?? creating ?? 'expense'}
        onClose={() => {
          setEditing(null);
          setCreating(null);
        }}
        onSaved={async () => {
          setEditing(null);
          setCreating(null);
          bumpVersion();
          await load();
        }}
        householdId={householdId}
      />
    </Screen>
  );
}

function CategoryEditor({
  visible,
  category,
  kind,
  householdId,
  onClose,
  onSaved,
}: {
  visible: boolean;
  category: Category | null;
  kind: Kind;
  householdId: string | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState('');
  const [icon, setIcon] = useState(ICONS[0]);
  const [color, setColor] = useState(COLORS[0]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!visible) return;
    setName(category?.name ?? '');
    setIcon(category?.icon ?? ICONS[0]);
    setColor(category?.color ?? COLORS[0]);
  }, [visible, category]);

  async function onSave() {
    if (!householdId || !name.trim()) {
      Alert.alert('חסר שם', 'יש להזין שם לקטגוריה');
      return;
    }
    setBusy(true);
    try {
      if (category) {
        await db.updateCategory(category.id, { name: name.trim(), icon, color });
      } else {
        await db.createCategory(householdId, { name: name.trim(), icon, color, kind });
      }
      onSaved();
    } catch (e) {
      Alert.alert('שגיאה', e instanceof Error ? e.message : 'לא הצלחנו לשמור');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: colors.bg, padding: spacing.lg, paddingTop: spacing.xl }}>
        <PageHeader title={category ? 'עריכת קטגוריה' : 'קטגוריה חדשה'} onBack={onClose} />
        <ScrollView keyboardShouldPersistTaps="handled">
          <Card>
            <Field label="שם" value={name} onChangeText={setName} placeholder="למשל: קניות לבית" />

            <Muted style={{ marginBottom: spacing.sm }}>צבע</Muted>
            <View style={{ flexDirection: 'row-reverse', flexWrap: 'wrap', gap: spacing.sm, marginBottom: spacing.lg }}>
              {COLORS.map((c) => (
                <Pressable
                  key={c}
                  onPress={() => setColor(c)}
                  style={{
                    width: 38,
                    height: 38,
                    borderRadius: 19,
                    backgroundColor: c,
                    borderWidth: color === c ? 3 : 0,
                    borderColor: colors.text,
                  }}
                />
              ))}
            </View>

            <Muted style={{ marginBottom: spacing.sm }}>אייקון</Muted>
            <View style={{ flexDirection: 'row-reverse', flexWrap: 'wrap', gap: spacing.sm }}>
              {ICONS.map((ic) => (
                <Pressable
                  key={ic}
                  onPress={() => setIcon(ic)}
                  style={{
                    width: 46,
                    height: 46,
                    borderRadius: radius.sm,
                    alignItems: 'center',
                    justifyContent: 'center',
                    backgroundColor: icon === ic ? `${color}22` : colors.bg,
                    borderWidth: 1.5,
                    borderColor: icon === ic ? color : colors.border,
                  }}
                >
                  <Ionicons name={ic as keyof typeof Ionicons.glyphMap} size={22} color={color} />
                </Pressable>
              ))}
            </View>
          </Card>

          <View style={{ ...rtlRow, marginTop: spacing.md }}>
            <IconBubble icon={icon} color={color} size={44} />
            <Text style={{ marginRight: spacing.md, fontSize: 16, fontWeight: '700', color: colors.text }}>
              {name || 'תצוגה מקדימה'}
            </Text>
          </View>

          <Button title="שמירה" onPress={onSave} loading={busy} size="lg" style={{ marginTop: spacing.lg }} />
        </ScrollView>
      </View>
    </Modal>
  );
}
