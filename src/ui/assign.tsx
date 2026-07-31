import React from 'react';
import { Pressable, Text, View, ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, radius, rtlRow, spacing } from '../theme';

/**
 * בורר השיוך המשותף למסך הייבוא ולמסך עריכת התנועה.
 *
 * המודל: `null` = הוצאה משותפת (ברירת המחדל), אחרת `user_id` של בן משק הבית
 * שההוצאה נזקפת לו. שלושה מצבים אפשריים — משותף / אני / בן בית אחר — ולא
 * ניתן לבטא "משותף וגם נזקף למישהו", מצב שאין לו משמעות.
 */

/** כל מה שצריך כדי להציג בן משק בית בבורר. מבנה מינימלי בכוונה, כדי שיתאים גם
 *  ל-`HouseholdMember` וגם ל-`Transaction.profiles` (שהוא `Pick` צר יותר),
 *  ושאפשר יהיה להוסיף גם מי שכבר אינו חבר אבל תנועה עדיין נזקפת לו. */
export type AssignableMember = {
  user_id: string;
  profiles?: { full_name?: string | null; email?: string | null } | null;
};

export function memberLabel(member: AssignableMember, meId: string | undefined): string {
  const name = member.profiles?.full_name ?? member.profiles?.email ?? 'בן בית';
  return member.user_id === meId ? `${name} (אני)` : name;
}

/**
 * תוויות ייחודיות לבני משק הבית, לפי `user_id`.
 * שני חברים יכולים לקבל אותה תווית — אותו `full_name`, או נפילה משותפת
 * ל"בן בית" כשחסר פרופיל. בבורר זה נראה כשתי אפשרויות זהות שאי אפשר לבחור
 * ביניהן, ולכן מוסיפים סיומת מזהה — אבל רק למי שבאמת מתנגש.
 */
export function memberLabels(
  members: AssignableMember[],
  meId: string | undefined,
): Map<string, string> {
  const base = members.map((m) => memberLabel(m, meId));
  const counts = new Map<string, number>();
  for (const label of base) counts.set(label, (counts.get(label) ?? 0) + 1);
  return new Map(
    members.map((m, i) => [
      m.user_id,
      (counts.get(base[i]) ?? 0) > 1 ? `${base[i]} · ${m.user_id.slice(0, 4)}` : base[i],
    ]),
  );
}

// ── שבב שיוך ────────────────────────────────────────────────────────────────
export function AssignChip({
  label,
  icon,
  active,
  onPress,
  testID,
}: {
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  active: boolean;
  onPress: () => void;
  testID: string;
}) {
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityLabel={label}
      accessibilityState={{ checked: active }}
      // react-native-web 0.21 לא ממפה accessibilityState ל-aria, ובלי זה אי אפשר
      // לדעת — לא בקורא מסך ולא בבדיקה — איזו אפשרות נבחרה.
      aria-checked={active}
      testID={testID}
      onPress={onPress}
      style={({ pressed }) => [
        {
          ...rtlRow,
          gap: spacing.xs + 2,
          minHeight: 44,
          paddingHorizontal: spacing.md,
          borderRadius: radius.pill,
          borderWidth: 1.5,
          borderColor: active ? colors.primaryDark : colors.border,
          backgroundColor: active ? `${colors.primaryDark}22` : colors.surface,
        },
        pressed && { opacity: 0.75 },
      ]}
    >
      <Ionicons name={icon} size={15} color={active ? colors.primaryDark : colors.textMuted} />
      <Text style={{ fontSize: 13, fontWeight: '600', color: colors.text }}>{label}</Text>
    </Pressable>
  );
}

// ── קבוצת השבבים ────────────────────────────────────────────────────────────
export function AssignmentChips({
  value,
  members,
  labels,
  onChange,
  accessibilityLabel,
  sharedTestID,
  memberTestID,
  style,
}: {
  /** `null` = משותף */
  value: string | null | undefined;
  members: AssignableMember[];
  /** תוויות ייחודיות לפי `user_id` — מקור אמת יחיד לכל מקומות התצוגה */
  labels: Map<string, string>;
  onChange: (assignedTo: string | null) => void;
  accessibilityLabel: string;
  sharedTestID: string;
  memberTestID: (userId: string) => string;
  style?: ViewStyle;
}) {
  return (
    <View
      accessibilityRole="radiogroup"
      accessibilityLabel={accessibilityLabel}
      style={{ ...rtlRow, flexWrap: 'wrap', gap: spacing.sm, ...style }}
    >
      <AssignChip
        label="משותף"
        icon="people"
        active={value === null}
        onPress={() => onChange(null)}
        testID={sharedTestID}
      />
      {members.map((m) => (
        <AssignChip
          key={m.user_id}
          label={labels.get(m.user_id) ?? 'בן בית'}
          icon="person"
          active={value === m.user_id}
          onPress={() => onChange(m.user_id)}
          testID={memberTestID(m.user_id)}
        />
      ))}
    </View>
  );
}
