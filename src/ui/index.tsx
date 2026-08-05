import { useRouter } from 'expo-router';
import React from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TextInputProps,
  View,
  ViewStyle,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { font, layout, radius, rtlRow, rtlText, shadow, spacing } from '../theme';
import { useTheme } from "../context/ThemeContext";

export { DialogProvider, useDialog } from './dialog';
export { Donut } from './Donut';
export { LineChart } from './LineChart';
export { MonthNav } from './MonthNav';
export { AssignChip, AssignmentChips, memberLabel, memberLabels } from './assign';
export type { AssignableMember } from './assign';

// ── Checkbox ────────────────────────────────────────────────────────────────
/**
 * תיבת סימון עם תווית ותת-כותרת. כל השורה לחיצה (לא רק הריבוע) והגובה
 * המינימלי הוא 44px — מינימום שטח הנגיעה שאפל דורשת.
 */
export function Checkbox({
  value,
  onValueChange,
  label,
  hint,
  icon,
  testID,
  accessibilityLabel,
  style,
}: {
  value: boolean;
  onValueChange: (value: boolean) => void;
  label: string;
  hint?: string;
  icon?: keyof typeof Ionicons.glyphMap;
  testID?: string;
  accessibilityLabel?: string;
  style?: ViewStyle;
}) {
    const { colors } = useTheme();
    const s = useStyles(colors);
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ checked: value }}
      // react-native-web 0.21 לא ממפה accessibilityState.checked ל-aria-checked,
      // וקורא מסך (וכל בדיקה אוטומטית) לא יידע אם התיבה מסומנת.
      aria-checked={value}
      testID={testID}
      onPress={() => onValueChange(!value)}
      style={({ pressed }) => [
        {
          ...rtlRow,
          gap: spacing.md,
          alignItems: 'center',
          minHeight: 44,
          paddingHorizontal: spacing.md,
          paddingVertical: spacing.sm,
          borderRadius: radius.md,
          borderWidth: 1,
          borderColor: value ? colors.primary : colors.border,
          backgroundColor: value ? colors.primarySoft : colors.surface,
        },
        pressed && { opacity: 0.75 },
        style as ViewStyle,
      ]}
    >
      <View
        style={{
          width: 22,
          height: 22,
          borderRadius: 6,
          borderWidth: 2,
          borderColor: value ? colors.primary : colors.border,
          backgroundColor: value ? colors.primary : 'transparent',
          alignItems: 'center',
          justifyContent: 'center',
          flexGrow: 0,
          flexShrink: 0,
        }}
      >
        {value ? <Ionicons name="checkmark" size={15} color={colors.white} /> : null}
      </View>
      <View style={{ flexShrink: 1, minWidth: 0 }}>
        <View style={{ ...rtlRow, gap: spacing.xs + 2 }}>
          {icon ? <Ionicons name={icon} size={16} color={value ? colors.primaryDark : colors.textMuted} /> : null}
          <Text style={[font.body, rtlText, { fontWeight: '700', color: value ? colors.primaryDark : colors.text }]}>
            {label}
          </Text>
        </View>
        {hint ? <Text style={[font.small, rtlText, { fontSize: 12, marginTop: 1 }]}>{hint}</Text> : null}
      </View>
    </Pressable>
  );
}

// ── Badge (תג קטן) ──────────────────────────────────────────────────────────
export function Badge({
  children,
  color,
  icon,
}: {
  children: React.ReactNode;
  color?: string;
  icon?: keyof typeof Ionicons.glyphMap;
}) {
    const { colors } = useTheme();
  if (color === undefined) color = colors.textMuted;
    const s = useStyles(colors);
  return (
    <View
      style={{
        ...rtlRow,
        gap: 3,
        alignSelf: 'flex-start',
        flexGrow: 0,
        flexShrink: 0,
        paddingHorizontal: spacing.sm,
        paddingVertical: 2,
        borderRadius: radius.pill,
        backgroundColor: `${color}1F`,
      }}
    >
      {icon ? <Ionicons name={icon} size={11} color={color} /> : null}
      <Text style={{ fontSize: 11, fontWeight: '700', color }}>{children}</Text>
    </View>
  );
}


// ── Screen ──────────────────────────────────────────────────────────────────
export function Screen({
  children,
  scroll = true,
  padded = true,
  refreshControl,
  /** האם המסך יושב מתחת לכפתור הצף — מוסיף מקום בתחתית הגלילה */
  floatingAction = false,
}: {
  children: React.ReactNode;
  scroll?: boolean;
  padded?: boolean;
  refreshControl?: React.ReactElement<any>;
  floatingAction?: boolean;
}) {
    const { colors } = useTheme();
    const s = useStyles(colors);
  const insets = useSafeAreaInsets();
  // התוכן חייב להסתיים מעל הכפתור הצף, אחרת הוא מכסה את השורה האחרונה
  const bottomGap = floatingAction
    ? layout.fabBottom + layout.fabHeight + spacing.lg + insets.bottom
    : spacing.xxl + insets.bottom;
  const inner = padded
    ? { padding: spacing.lg, paddingBottom: bottomGap }
    : { paddingBottom: bottomGap };

  return (
    <SafeAreaView style={s.screen} edges={['top', 'left', 'right']}>
      {scroll ? (
        <ScrollView
          contentContainerStyle={inner}
          keyboardShouldPersistTaps="handled"
          refreshControl={refreshControl}
        >
          {children}
        </ScrollView>
      ) : (
        <View style={[{ flex: 1 }, inner]}>{children}</View>
      )}
    </SafeAreaView>
  );
}

// ── Page header (למסכים פנימיים) ────────────────────────────────────────────
export function PageHeader({
  title,
  onBack,
  action,
}: {
  title: string;
  onBack: () => void;
  action?: React.ReactNode;
}) {
    const { colors } = useTheme();
    const s = useStyles(colors);
  return (
    <View style={{ ...rtlRow, justifyContent: 'space-between', marginBottom: spacing.lg }}>
      <View style={{ ...rtlRow, gap: spacing.md, flexShrink: 1, minWidth: 0 }}>
        <Pressable accessibilityRole="button" accessibilityLabel="חזרה" onPress={onBack} hitSlop={12}>
          <Ionicons name="arrow-forward" size={24} color={colors.text} />
        </Pressable>
        <Text style={[font.h2, rtlText, { flexShrink: 1, color: colors.text }]}>{title}</Text>
      </View>
      <View style={{ flexDirection: 'row-reverse', gap: 12, alignItems: 'center' }}>{action}<GlobalHeaderActions /></View>
    </View>
  );
}

// ── Card ────────────────────────────────────────────────────────────────────
export function Card({
  children,
  style,
  onPress,
  accessibilityLabel,
  testID,
}: {
  children: React.ReactNode;
  style?: ViewStyle | ViewStyle[];
  onPress?: () => void;
  accessibilityLabel?: string;
  testID?: string;
}) {
    const { colors } = useTheme();
    const s = useStyles(colors);
  if (onPress) {
    return (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
        testID={testID}
        onPress={onPress}
        style={({ pressed }) => [s.card, style as ViewStyle, pressed && { opacity: 0.7 }]}
      >
        {children}
      </Pressable>
    );
  }
  return (
    <View testID={testID} style={[s.card, style as ViewStyle]}>
      {children}
    </View>
  );
}

// ── Text helpers ────────────────────────────────────────────────────────────
type TextProps = { children: React.ReactNode; style?: any; numberOfLines?: number; testID?: string };

export const H1 = (p: TextProps) => {
  const { colors } = useTheme();
  return (
    <Text testID={p.testID} numberOfLines={p.numberOfLines} style={[font.h1, { color: colors.text }, rtlText, p.style]}>
    {p.children}
  </Text>
  );
};
export const H2 = (p: TextProps) => {
  const { colors } = useTheme();
  return (
    <Text testID={p.testID} numberOfLines={p.numberOfLines} style={[font.h2, { color: colors.text }, rtlText, p.style]}>
    {p.children}
  </Text>
  );
};
export const H3 = (p: TextProps) => {
  const { colors } = useTheme();
  return (
    <Text testID={p.testID} numberOfLines={p.numberOfLines} style={[font.h3, { color: colors.text }, rtlText, p.style]}>
    {p.children}
  </Text>
  );
};
export const Body = (p: TextProps) => {
  const { colors } = useTheme();
  return (
    <Text testID={p.testID} numberOfLines={p.numberOfLines} style={[font.body, { color: colors.text }, rtlText, p.style]}>
    {p.children}
  </Text>
  );
};
export const Muted = (p: TextProps) => {
  const { colors } = useTheme();
  return (
    <Text testID={p.testID} numberOfLines={p.numberOfLines} style={[font.small, { color: colors.textMuted }, rtlText, p.style]}>
    {p.children}
  </Text>
  );
};

// ── Section title ───────────────────────────────────────────────────────────
/** כותרת ביניים עם מרווח אחיד — מונע פערים אקראיים בין המסכים */
export function SectionTitle({ children, action }: { children: React.ReactNode; action?: React.ReactNode }) {
    const { colors } = useTheme();
  return (
    <View
      style={{
        ...rtlRow,
        justifyContent: 'space-between',
        marginTop: spacing.lg,
        marginBottom: spacing.sm,
      }}
    >
      <H3>{children}</H3>
      {action}
    </View>
  );
}

// ── Icon + text row ─────────────────────────────────────────────────────────
/**
 * כל צמד "אייקון + טקסט" עובר דרך כאן.
 * gap מבטיח רווח קבוע בין האייקון לטקסט, במקום marginRight/marginLeft ידני
 * שנוטה לנחות בצד הלא נכון וגורם לאייקון להידבק למילה.
 */
export function IconText({
  icon,
  color,
  size = 18,
  gap = spacing.sm,
  children,
  style,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  color?: string;
  size?: number;
  gap?: number;
  children: React.ReactNode;
  style?: ViewStyle;
}) {
    const { colors } = useTheme();
    const s = useStyles(colors);
  return (
    <View style={[{ ...rtlRow, gap }, style]}>
      <Ionicons name={icon} size={size} color={color ?? colors.textMuted} />
      <View style={{ flexShrink: 1, minWidth: 0 }}>{children}</View>
    </View>
  );
}

// ── Button ──────────────────────────────────────────────────────────────────
export function Button({
  title,
  onPress,
  variant = 'primary',
  icon,
  loading,
  disabled,
  style,
  size = 'md',
  testID,
  accessibilityLabel,
}: {
  title: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  icon?: keyof typeof Ionicons.glyphMap;
  loading?: boolean;
  disabled?: boolean;
  style?: ViewStyle;
  size?: 'sm' | 'md' | 'lg';
  testID?: string;
  /** ברירת מחדל: הכותרת. שימושי כשיש כמה כפתורים זהים ברשימה */
  accessibilityLabel?: string;
}) {
    const { colors } = useTheme();
    const s = useStyles(colors);
  const isDisabled = disabled || loading;
  const palette = {
    primary: { bg: colors.primary, fg: colors.white, border: colors.primary },
    secondary: { bg: colors.primarySoft, fg: colors.primaryDark, border: colors.primarySoft },
    ghost: { bg: 'transparent', fg: colors.textMuted, border: colors.border },
    danger: { bg: colors.dangerSoft, fg: colors.danger, border: colors.dangerSoft },
  }[variant];

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? title}
      accessibilityState={{ disabled: Boolean(isDisabled), busy: Boolean(loading) }}
      testID={testID}
      onPress={onPress}
      disabled={isDisabled}
      style={({ pressed }) => [
        s.button,
        size === 'lg' && { paddingVertical: 18, borderRadius: radius.lg },
        // 44px הוא מינימום שטח הנגיעה שאפל דורשת — גם בגרסה ה"קטנה"
        size === 'sm' && { paddingVertical: spacing.sm, minHeight: 44 },
        { backgroundColor: palette.bg, borderColor: palette.border },
        isDisabled && { opacity: 0.5 },
        pressed && { opacity: 0.75 },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={palette.fg} />
      ) : (
        <View style={{ ...rtlRow, gap: spacing.sm }}>
          {icon ? <Ionicons name={icon} size={size === 'lg' ? 22 : 18} color={palette.fg} /> : null}
          <Text style={{ color: palette.fg, fontWeight: '700', fontSize: size === 'lg' ? 18 : 16 }}>
            {title}
          </Text>
        </View>
      )}
    </Pressable>
  );
}

// ── Text link (קישור, לא כפתור) ─────────────────────────────────────────────
export function TextLink({
  title,
  onPress,
  style,
  color,
}: {
  title: string;
  onPress: () => void;
  style?: ViewStyle;
  color?: string;
}) {
    const { colors } = useTheme();
  if (color === undefined) color = colors.primary;
  return (
    <Pressable
      accessibilityRole="link"
      accessibilityLabel={title}
      onPress={onPress}
      hitSlop={10}
      style={({ pressed }) => [{ alignSelf: 'center' }, pressed && { opacity: 0.6 }, style]}
    >
      <Text style={[font.small, rtlText, { color, fontWeight: '700' }]}>{title}</Text>
    </Pressable>
  );
}

// ── Inline message (הודעות שגיאה/הצלחה בתוך המסך) ───────────────────────────
export function InlineMessage({
  tone = 'error',
  children,
  style,
  testID,
}: {
  tone?: 'error' | 'success' | 'info';
  children: React.ReactNode;
  style?: ViewStyle;
  testID?: string;
}) {
    const { colors } = useTheme();
    const s = useStyles(colors);
  const palette = {
    error: { bg: colors.dangerSoft, fg: colors.danger, icon: 'alert-circle' as const },
    success: { bg: colors.primarySoft, fg: colors.primaryDark, icon: 'checkmark-circle' as const },
    info: { bg: colors.bg, fg: colors.textMuted, icon: 'information-circle' as const },
  }[tone];

  return (
    <View
      accessibilityLiveRegion="polite"
      testID={testID}
      style={[
        {
          ...rtlRow,
          gap: spacing.sm,
          alignItems: 'flex-start',
          backgroundColor: palette.bg,
          borderRadius: radius.sm,
          padding: spacing.md,
          marginBottom: spacing.md,
        },
        style,
      ]}
    >
      <Ionicons name={palette.icon} size={18} color={palette.fg} style={{ marginTop: 1 }} />
      <Text style={[font.small, rtlText, { color: palette.fg, flexShrink: 1, minWidth: 0 }]}>{children}</Text>
    </View>
  );
}

// ── Input ───────────────────────────────────────────────────────────────────
export function Field({
  label,
  hint,
  error,
  ...props
}: TextInputProps & { label?: string; hint?: string; error?: string | null }) {
    const { colors } = useTheme();
    const s = useStyles(colors);
  const [focused, setFocused] = React.useState(false);
  const borderColor = error ? colors.danger : focused ? colors.primary : colors.border;

  return (
    <View style={{ marginBottom: spacing.lg }}>
      {label ? <Muted style={{ marginBottom: spacing.xs }}>{label}</Muted> : null}
      <TextInput
        placeholderTextColor={colors.textFaint}
        {...props}
        onFocus={(e) => {
          setFocused(true);
          props.onFocus?.(e);
        }}
        onBlur={(e) => {
          setFocused(false);
          props.onBlur?.(e);
        }}
        style={[s.input, rtlText, { borderColor }, props.style]}
      />
      {error ? (
        <Muted style={{ marginTop: spacing.xs, fontSize: 12, color: colors.danger }}>{error}</Muted>
      ) : hint ? (
        <Muted style={{ marginTop: spacing.xs, fontSize: 12 }}>{hint}</Muted>
      ) : null}
    </View>
  );
}

// ── Amount input (₪) ────────────────────────────────────────────────────────
/**
 * שדה סכום עם סימן ₪.
 * ב-react-native-web שדה <input> מקבל רוחב מינימלי מובנה מהדפדפן, ולכן flex:1
 * לבדו לא מספיק — בלי minWidth:0 הוא מסרב להצטמצם והשורה גולשת אל מחוץ למסך.
 * כאן זה מטופל פעם אחת עבור כל המסכים.
 */
export function AmountInput({
  value,
  onChangeText,
  size = 'md',
  align = 'stretch',
  autoFocus,
  placeholder = '0',
  accessibilityLabel = 'סכום בשקלים',
}: {
  value: string;
  onChangeText: (value: string) => void;
  size?: 'md' | 'lg' | 'xl';
  /** stretch — תופס את כל הרוחב הפנוי; compact — רוחב קבוע לשורות ברשימה */
  align?: 'stretch' | 'compact';
  autoFocus?: boolean;
  placeholder?: string;
  accessibilityLabel?: string;
}) {
    const { colors } = useTheme();
    const s = useStyles(colors);
  const [focused, setFocused] = React.useState(false);

  return (
    <View
      style={{
        ...rtlRow,
        gap: spacing.xs,
        borderWidth: 1,
        borderColor: focused ? colors.primary : colors.border,
        borderRadius: radius.sm,
        backgroundColor: colors.surface,
        paddingHorizontal: spacing.md,
        ...(align === 'compact'
          ? { width: 116, flexGrow: 0, flexShrink: 0 }
          : { flex: 1, minWidth: 0 }),
      }}
    >
      <Text style={{ fontSize: size === 'xl' ? 28 : size === 'lg' ? 22 : 14, fontWeight: '700', color: colors.textFaint }}>
        ₪
      </Text>
      <TextInput
        value={value}
        onChangeText={(t) => onChangeText(t.replace(/[^\d.]/g, ''))}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        keyboardType="decimal-pad"
        inputMode="decimal"
        autoFocus={autoFocus}
        placeholder={placeholder}
        placeholderTextColor={colors.textFaint}
        accessibilityLabel={accessibilityLabel}
        style={{
          ...rtlText,
          flex: 1,
          // בלי זה הדפדפן שומר על רוחב מינימלי מובנה והשדה גולש מהמסך
          minWidth: 0,
          width: '100%',
          paddingVertical: size === 'md' ? spacing.sm : spacing.md,
          fontSize: size === 'xl' ? 36 : size === 'lg' ? 30 : 16,
          fontWeight: '800',
          color: colors.text,
        }}
      />
    </View>
  );
}

// ── Progress bar ────────────────────────────────────────────────────────────
export function ProgressBar({ ratio, color }: { ratio: number; color?: string }) {
    const { colors } = useTheme();
    const s = useStyles(colors);
  const clamped = Math.max(0, Math.min(1, isFinite(ratio) ? ratio : 0));
  const over = ratio > 1;
  return (
    <View style={s.track}>
      <View
        style={[
          s.fill,
          { width: `${clamped * 100}%`, backgroundColor: over ? colors.danger : color ?? colors.primary },
        ]}
      />
    </View>
  );
}

// ── Icon bubble ─────────────────────────────────────────────────────────────
export function IconBubble({
  icon,
  color,
  size = 40,
}: {
  icon: string;
  color: string;
  size?: number;
}) {
    const { colors } = useTheme();
    const s = useStyles(colors);
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: `${color}1F`,
        alignItems: 'center',
        justifyContent: 'center',
        flexGrow: 0,
        flexShrink: 0,
      }}
    >
      <Ionicons name={icon as keyof typeof Ionicons.glyphMap} size={size * 0.5} color={color} />
    </View>
  );
}

// ── Empty state ─────────────────────────────────────────────────────────────
export function EmptyState({
  icon = 'file-tray-outline',
  title,
  subtitle,
}: {
  icon?: keyof typeof Ionicons.glyphMap;
  title: string;
  subtitle?: string;
}) {
    const { colors } = useTheme();
    const s = useStyles(colors);
  return (
    <View style={{ alignItems: 'center', paddingVertical: spacing.lg }}>
      <Ionicons name={icon} size={36} color={colors.textFaint} />
      <H3 style={{ marginTop: spacing.sm, textAlign: 'center' }}>{title}</H3>
      {subtitle ? <Muted style={{ marginTop: spacing.xs, textAlign: 'center' }}>{subtitle}</Muted> : null}
    </View>
  );
}

export function Loading({ label = 'טוען…' }: { label?: string }) {
    const { colors } = useTheme();
    const s = useStyles(colors);
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl }}>
      <ActivityIndicator color={colors.primary} size="large" />
      <Muted style={{ marginTop: spacing.md }}>{label}</Muted>
    </View>
  );
}

export function Divider() {
    const { colors } = useTheme();
    const s = useStyles(colors);
  return <View style={{ height: 1, backgroundColor: colors.border, marginVertical: spacing.md }} />;
}

const useStyles = (colors: any) => StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.lg,
    marginBottom: spacing.md,
    ...shadow.card,
  },
  button: {
    borderRadius: radius.md,
    paddingVertical: 14,
    paddingHorizontal: spacing.lg,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  input: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: 14,
    fontSize: 16,
    color: colors.text,
    // ראה AmountInput — בלי זה שדות בתוך שורת flex גולשים מהמסך
    minWidth: 0,
    width: '100%',
  },
  track: {
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.border,
    overflow: 'hidden',
    flexDirection: 'row-reverse',
  },
  fill: { height: 8, borderRadius: 4 },
});


export function GlobalHeaderActions() {
  const { colors, toggleTheme, isDark } = useTheme();
  const router = useRouter();
  
  return (
    <View style={{ flexDirection: 'row-reverse', gap: spacing.md }}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="החלף עיצוב"
        onPress={toggleTheme}
        hitSlop={10}
      >
        <View style={{ width: 38, height: 38, borderRadius: 19, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' }}>
          <Ionicons name={isDark ? 'sunny' : 'moon'} size={20} color={colors.primary} />
        </View>
      </Pressable>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="החשבון שלי"
        onPress={() => router.push('/(tabs)/more')}
        hitSlop={10}
      >
        <View style={{ width: 38, height: 38, borderRadius: 19, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' }}>
          <Ionicons name="person" size={20} color={colors.primary} />
        </View>
      </Pressable>
    </View>
  );
}
