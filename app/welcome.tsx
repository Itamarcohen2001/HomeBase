import React from 'react';
import { View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Body, Card, H1, Muted, Screen } from '../src/ui';
import { colors, spacing } from '../src/theme';

/** מוצג כשאין עדיין מפתחות Supabase בקובץ .env */
export default function Welcome() {
  return (
    <Screen>
      <View style={{ alignItems: 'center', marginTop: spacing.xxl, marginBottom: spacing.xl }}>
        <Ionicons name="home" size={56} color={colors.primary} />
        <H1 style={{ marginTop: spacing.md }}>HomeBase</H1>
        <Muted>מעקב הוצאות למשק בית משותף</Muted>
      </View>

      <Card>
        <Body style={{ marginBottom: spacing.md, fontWeight: '700' }}>נדרשת הגדרה אחרונה</Body>
        <Muted>
          כדי להפעיל את האפליקציה צריך לחבר אותה לפרויקט Supabase. צור קובץ בשם .env בתיקיית הפרויקט
          (אפשר להעתיק מ-.env.example) ולמלא בו:
        </Muted>
        <View style={{ backgroundColor: colors.bg, borderRadius: 12, padding: spacing.md, marginTop: spacing.md }}>
          <Muted style={{ textAlign: 'left', writingDirection: 'ltr', fontFamily: undefined }}>
            EXPO_PUBLIC_SUPABASE_URL=...{'\n'}EXPO_PUBLIC_SUPABASE_ANON_KEY=...
          </Muted>
        </View>
        <Muted style={{ marginTop: spacing.md }}>
          אחרי השמירה יש להפעיל מחדש את השרת עם: npx expo start -c
        </Muted>
      </Card>

      <Card>
        <Body style={{ fontWeight: '700', marginBottom: spacing.sm }}>ומה עוד?</Body>
        <Muted>
          יש להריץ את קבצי ה-SQL שבתיקייה supabase/migrations לפי הסדר, בעורך ה-SQL של Supabase.
        </Muted>
      </Card>
    </Screen>
  );
}
