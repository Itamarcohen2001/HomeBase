import { useTheme } from '../context/ThemeContext';
import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { addMonths, monthLabel, monthStart } from '../lib/format';
import { font, rtlRow, rtlText, spacing } from '../theme';

/**
 * ניווט בין חודשים — רכיב אחד לכל המסכים (תנועות, ניתוח).
 * ב-RTL "החודש הקודם" יושב בימין ו"החודש הבא" בשמאל, ולכן החצים הפוכים
 * ביחס למה שנראה נכון ב-LTR: chevron-forward מצביע ימינה.
 */
export function MonthNav({
  month,
  onChange,
  children,
}: {
  month: string;
  onChange: (month: string) => void;
  /** שורה נוספת מתחת לבורר (סיכומים וכדומה) */
  children?: React.ReactNode;
}) {
  const { colors } = useTheme();
  const isCurrentMonth = month === monthStart();

  return (
    <View>
      <View style={{ ...rtlRow, gap: spacing.sm, justifyContent: 'space-between' }}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="החודש הקודם"
          onPress={() => onChange(addMonths(month, -1))}
          hitSlop={12}
          style={{ minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' }}
        >
          <Ionicons name="chevron-forward" size={22} color={colors.primary} />
        </Pressable>
        <Text style={[font.body, rtlText, { fontWeight: '700', color: colors.text }]}>{monthLabel(month)}</Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="החודש הבא"
          accessibilityState={{ disabled: isCurrentMonth }}
          onPress={() => !isCurrentMonth && onChange(addMonths(month, 1))}
          hitSlop={12}
          disabled={isCurrentMonth}
          style={{ minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' }}
        >
          <Ionicons name="chevron-back" size={22} color={isCurrentMonth ? colors.border : colors.primary} />
        </Pressable>
      </View>
      {children}
    </View>
  );
}
