import { useTheme } from "../src/context/ThemeContext";
import React, { useState } from "react";
import { View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "../src/context/AuthContext";
import { useHousehold } from "../src/context/HouseholdContext";
import {
  Button,
  Card,
  Field,
  H1,
  H3,
  InlineMessage,
  Muted,
  Screen,
} from "../src/ui";
import { PendingInvites } from "../src/ui/PendingInvites";
import { rtlRow, spacing } from "../src/theme";
import { errorText } from "../src/lib/authErrors";

export default function Setup() {
  const { colors } = useTheme();
  const { user, signOut } = useAuth();
  const { createHousehold } = useHousehold();
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onCreate() {
    setBusy(true);
    setError(null);
    try {
      await createHousehold(name.trim() || "משק הבית שלי");
    } catch (e) {
      setError(errorText(e, "לא הצלחנו ליצור משק בית"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen>
      <View
        style={{
          alignItems: "center",
          marginTop: spacing.xl,
          marginBottom: spacing.lg,
        }}
      >
        <Ionicons name="home" size={48} color={colors.primary} />
        <H1 style={{ marginTop: spacing.sm }}>ברוך הבא</H1>
        <Muted>{user?.email}</Muted>
      </View>

      {error ? <InlineMessage tone="error">{error}</InlineMessage> : null}

      <PendingInvites />

      <Card>
        <H3 style={{ marginBottom: spacing.sm }}>יצירת משק בית חדש</H3>
        <Muted style={{ marginBottom: spacing.lg }}>
          כל ההוצאות של בני הבית ייכנסו לקופה משותפת אחת, עם תווית של מי רשם כל
          תנועה.
        </Muted>
        <Field
          label="שם משק הבית"
          value={name}
          onChangeText={setName}
          placeholder="למשל: משפחת כהן"
        />
        <Button
          title="יצירה והתחלה"
          onPress={onCreate}
          loading={busy}
          size="lg"
          icon="add-circle"
        />
      </Card>

      <View style={{ ...rtlRow, justifyContent: "center" }}>
        <Button
          title="התנתקות"
          variant="ghost"
          onPress={() => void signOut()}
        />
      </View>
    </Screen>
  );
}
