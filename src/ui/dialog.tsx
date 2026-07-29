import React, { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';
import { Modal, Pressable, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, font, radius, rtlRow, rtlText, shadow, spacing } from '../theme';

/**
 * Alert.alert של react-native הוא no-op מוחלט ב-react-native-web:
 * הוא לא מרנדר כלום, לא זורק שגיאה ולא מחזיר ערך — ולכן כל אישור או הודעת
 * שגיאה שהסתמכו עליו פשוט נעלמו בגרסת הוובי. הרכיב הזה מחליף אותו בדיאלוג
 * אמיתי מבוסס Modal, שעובד זהה בוובי ובנייטיב.
 */

type ConfirmOptions = {
  title: string;
  message?: string;
  confirmText?: string;
  cancelText?: string;
  destructive?: boolean;
};

type NotifyOptions = {
  title: string;
  message?: string;
  tone?: 'info' | 'success' | 'error';
};

type DialogValue = {
  /** מציג דיאלוג אישור ומחזיר true אם המשתמש אישר */
  confirm: (options: ConfirmOptions) => Promise<boolean>;
  /** מציג הודעה עם כפתור סגירה אחד */
  notify: (options: NotifyOptions) => Promise<void>;
};

const DialogContext = createContext<DialogValue | null>(null);

type DialogState =
  | ({ kind: 'confirm' } & ConfirmOptions)
  | ({ kind: 'notify' } & NotifyOptions)
  | null;

const TONE_ICON: Record<NonNullable<NotifyOptions['tone']>, { icon: keyof typeof Ionicons.glyphMap; color: string }> = {
  info: { icon: 'information-circle', color: colors.primary },
  success: { icon: 'checkmark-circle', color: colors.primary },
  error: { icon: 'alert-circle', color: colors.danger },
};

export function DialogProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<DialogState>(null);
  const resolver = useRef<((value: boolean) => void) | null>(null);

  const settle = useCallback((value: boolean) => {
    const resolve = resolver.current;
    resolver.current = null;
    setState(null);
    resolve?.(value);
  }, []);

  const confirm = useCallback((options: ConfirmOptions) => {
    // אם כבר פתוח דיאלוג — סוגרים אותו כדי לא להשאיר Promise תלוי
    resolver.current?.(false);
    return new Promise<boolean>((resolve) => {
      resolver.current = resolve;
      setState({ kind: 'confirm', ...options });
    });
  }, []);

  const notify = useCallback((options: NotifyOptions) => {
    resolver.current?.(false);
    return new Promise<void>((resolve) => {
      resolver.current = () => resolve();
      setState({ kind: 'notify', ...options });
    });
  }, []);

  const value = useMemo<DialogValue>(() => ({ confirm, notify }), [confirm, notify]);

  const tone = state?.kind === 'notify' ? TONE_ICON[state.tone ?? 'info'] : null;
  const destructive = state?.kind === 'confirm' && state.destructive;

  return (
    <DialogContext.Provider value={value}>
      {children}
      <Modal
        visible={state !== null}
        transparent
        animationType="fade"
        onRequestClose={() => settle(false)}
      >
        <Pressable
          style={{
            flex: 1,
            backgroundColor: 'rgba(10, 26, 20, 0.45)',
            alignItems: 'center',
            justifyContent: 'center',
            padding: spacing.xl,
          }}
          onPress={() => settle(false)}
        >
          {/* עצירת ההתפשטות — לחיצה בתוך הכרטיס לא סוגרת אותו */}
          <Pressable
            style={{
              width: '100%',
              maxWidth: 360,
              backgroundColor: colors.surface,
              borderRadius: radius.lg,
              padding: spacing.xl,
              ...shadow.floating,
            }}
            onPress={() => undefined}
          >
            {state ? (
              <>
                <View style={{ ...rtlRow, gap: spacing.sm, marginBottom: spacing.sm }}>
                  <Ionicons
                    name={tone?.icon ?? (destructive ? 'alert-circle' : 'help-circle')}
                    size={22}
                    color={tone?.color ?? (destructive ? colors.danger : colors.primary)}
                  />
                  <Text style={[font.h3, rtlText, { flexShrink: 1 }]}>{state.title}</Text>
                </View>
                {state.message ? (
                  <Text style={[font.body, rtlText, { color: colors.textMuted, marginBottom: spacing.xl }]}>
                    {state.message}
                  </Text>
                ) : (
                  <View style={{ height: spacing.md }} />
                )}
                <View style={{ ...rtlRow, gap: spacing.md }}>
                  <DialogButton
                    testID="hb-dialog-confirm"
                    label={state.kind === 'confirm' ? state.confirmText ?? 'אישור' : 'הבנתי'}
                    onPress={() => settle(true)}
                    background={destructive ? colors.danger : colors.primary}
                    color={colors.white}
                  />
                  {state.kind === 'confirm' ? (
                    <DialogButton
                      testID="hb-dialog-cancel"
                      label={state.cancelText ?? 'ביטול'}
                      onPress={() => settle(false)}
                      background={colors.bg}
                      color={colors.textMuted}
                    />
                  ) : null}
                </View>
              </>
            ) : null}
          </Pressable>
        </Pressable>
      </Modal>
    </DialogContext.Provider>
  );
}

function DialogButton({
  label,
  onPress,
  background,
  color,
  testID,
}: {
  label: string;
  onPress: () => void;
  background: string;
  color: string;
  testID?: string;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      testID={testID}
      onPress={onPress}
      style={({ pressed }) => [
        {
          flex: 1,
          minWidth: 0,
          paddingVertical: spacing.md,
          borderRadius: radius.md,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: background,
        },
        pressed && { opacity: 0.75 },
      ]}
    >
      <Text style={[font.body, rtlText, { color, fontWeight: '700', textAlign: 'center' }]}>{label}</Text>
    </Pressable>
  );
}

export function useDialog(): DialogValue {
  const ctx = useContext(DialogContext);
  if (!ctx) throw new Error('useDialog must be used inside DialogProvider');
  return ctx;
}
