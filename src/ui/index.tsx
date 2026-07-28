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
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { colors, font, radius, rtlRow, rtlText, shadow, spacing } from '../theme';

// ── Screen ──────────────────────────────────────────────────────────────────
export function Screen({
  children,
  scroll = true,
  padded = true,
  refreshControl,
}: {
  children: React.ReactNode;
  scroll?: boolean;
  padded?: boolean;
  refreshControl?: React.ReactElement<any>;
}) {
  const inner = padded ? { padding: spacing.lg, paddingBottom: spacing.xxl * 2 } : undefined;
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
  return (
    <View style={{ ...rtlRow, justifyContent: 'space-between', marginBottom: spacing.lg }}>
      <View style={rtlRow}>
        <Pressable onPress={onBack} hitSlop={12} style={{ marginLeft: spacing.md }}>
          <Ionicons name="arrow-forward" size={24} color={colors.text} />
        </Pressable>
        <Text style={[font.h2, rtlText]}>{title}</Text>
      </View>
      {action}
    </View>
  );
}

// ── Card ────────────────────────────────────────────────────────────────────
export function Card({
  children,
  style,
  onPress,
}: {
  children: React.ReactNode;
  style?: ViewStyle | ViewStyle[];
  onPress?: () => void;
}) {
  if (onPress) {
    return (
      <Pressable
        onPress={onPress}
        style={({ pressed }) => [s.card, style as ViewStyle, pressed && { opacity: 0.7 }]}
      >
        {children}
      </Pressable>
    );
  }
  return <View style={[s.card, style as ViewStyle]}>{children}</View>;
}

// ── Text helpers ────────────────────────────────────────────────────────────
export const H1 = (p: { children: React.ReactNode; style?: any }) => (
  <Text style={[font.h1, rtlText, p.style]}>{p.children}</Text>
);
export const H2 = (p: { children: React.ReactNode; style?: any }) => (
  <Text style={[font.h2, rtlText, p.style]}>{p.children}</Text>
);
export const H3 = (p: { children: React.ReactNode; style?: any }) => (
  <Text style={[font.h3, rtlText, p.style]}>{p.children}</Text>
);
export const Body = (p: { children: React.ReactNode; style?: any; numberOfLines?: number }) => (
  <Text numberOfLines={p.numberOfLines} style={[font.body, rtlText, p.style]}>
    {p.children}
  </Text>
);
export const Muted = (p: { children: React.ReactNode; style?: any; numberOfLines?: number }) => (
  <Text numberOfLines={p.numberOfLines} style={[font.small, rtlText, p.style]}>
    {p.children}
  </Text>
);

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
}: {
  title: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  icon?: keyof typeof Ionicons.glyphMap;
  loading?: boolean;
  disabled?: boolean;
  style?: ViewStyle;
  size?: 'md' | 'lg';
}) {
  const isDisabled = disabled || loading;
  const palette = {
    primary: { bg: colors.primary, fg: colors.white, border: colors.primary },
    secondary: { bg: colors.primarySoft, fg: colors.primaryDark, border: colors.primarySoft },
    ghost: { bg: 'transparent', fg: colors.textMuted, border: colors.border },
    danger: { bg: colors.dangerSoft, fg: colors.danger, border: colors.dangerSoft },
  }[variant];

  return (
    <Pressable
      onPress={onPress}
      disabled={isDisabled}
      style={({ pressed }) => [
        s.button,
        size === 'lg' && { paddingVertical: 18, borderRadius: radius.lg },
        { backgroundColor: palette.bg, borderColor: palette.border },
        isDisabled && { opacity: 0.5 },
        pressed && { opacity: 0.75 },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={palette.fg} />
      ) : (
        <View style={rtlRow}>
          {icon ? (
            <Ionicons name={icon} size={size === 'lg' ? 22 : 18} color={palette.fg} style={{ marginLeft: 8 }} />
          ) : null}
          <Text style={{ color: palette.fg, fontWeight: '700', fontSize: size === 'lg' ? 18 : 16 }}>
            {title}
          </Text>
        </View>
      )}
    </Pressable>
  );
}

// ── Input ───────────────────────────────────────────────────────────────────
export function Field({
  label,
  hint,
  ...props
}: TextInputProps & { label?: string; hint?: string }) {
  return (
    <View style={{ marginBottom: spacing.lg }}>
      {label ? <Muted style={{ marginBottom: 6 }}>{label}</Muted> : null}
      <TextInput
        placeholderTextColor={colors.textFaint}
        {...props}
        style={[s.input, rtlText, props.style]}
      />
      {hint ? <Muted style={{ marginTop: 6, fontSize: 12 }}>{hint}</Muted> : null}
    </View>
  );
}

// ── Progress bar ────────────────────────────────────────────────────────────
export function ProgressBar({ ratio, color }: { ratio: number; color?: string }) {
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
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: `${color}1F`,
        alignItems: 'center',
        justifyContent: 'center',
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
  return (
    <View style={{ alignItems: 'center', paddingVertical: spacing.xxl }}>
      <Ionicons name={icon} size={44} color={colors.textFaint} />
      <H3 style={{ marginTop: spacing.md, textAlign: 'center' }}>{title}</H3>
      {subtitle ? <Muted style={{ marginTop: 4, textAlign: 'center' }}>{subtitle}</Muted> : null}
    </View>
  );
}

export function Loading({ label = 'טוען…' }: { label?: string }) {
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl }}>
      <ActivityIndicator color={colors.primary} size="large" />
      <Muted style={{ marginTop: spacing.md }}>{label}</Muted>
    </View>
  );
}

export function Divider() {
  return <View style={{ height: 1, backgroundColor: colors.border, marginVertical: spacing.md }} />;
}

const s = StyleSheet.create({
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
