import { useTheme } from '../../src/context/ThemeContext';
import React from 'react';
import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { layout, spacing } from '../../src/theme';

export default function TabsLayout() {
  const { colors } = useTheme();
  // במסך מלא (PWA באייפון / מכשירים עם נאץ') צריך להוסיף את גובה
  // מחוון הבית לגובה הסרגל, אחרת הכפתורים נחתכים.
  const insets = useSafeAreaInsets();

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textFaint,
        // react-navigation מרנדר את התווית כפריט flex בעמודה. אם האייקון והתווית
        // יחד גבוהים מהמקום הפנוי, ה-flex מכווץ דווקא את התווית (נמדד: תיבה של
        // 9px לגופן 12px) והאותיות נחתכות באמצע. flexShrink: 0 + lineHeight
        // מפורש + סרגל גבוה מספיק פותרים את זה.
        tabBarLabelStyle: { fontSize: 12, lineHeight: 16, fontWeight: '600', flexShrink: 0 },
        tabBarIconStyle: { flexShrink: 0 },
        tabBarItemStyle: { paddingTop: spacing.xs, paddingBottom: spacing.xs },
        tabBarStyle: {
          backgroundColor: colors.surface,
          borderTopColor: colors.border,
          height: layout.tabBarHeight + insets.bottom,
          paddingBottom: insets.bottom,
          paddingTop: 0,
        },
        sceneStyle: { backgroundColor: colors.bg },
      }}
    >
      {/* סדר ההצהרה הוא שמאל→ימין. בעברית "בית" צריך להיות מימין, ולכן הוא אחרון. */}
      <Tabs.Screen
        name="more"
        options={{
          title: 'עוד',
          tabBarIcon: ({ color, size }) => <Ionicons name="ellipsis-horizontal" size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="analysis"
        options={{
          title: 'ניתוח',
          tabBarIcon: ({ color, size }) => <Ionicons name="pie-chart" size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="history"
        options={{
          title: 'תנועות',
          tabBarIcon: ({ color, size }) => <Ionicons name="list" size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="index"
        options={{
          title: 'בית',
          tabBarIcon: ({ color, size }) => <Ionicons name="home" size={size} color={color} />,
        }}
      />
    </Tabs>
  );
}
