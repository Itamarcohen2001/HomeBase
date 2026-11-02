import React, { useCallback, useEffect, useState } from "react";
import { View } from "react-native";
import { useAuth } from "../context/AuthContext";
import { useHousehold } from "../context/HouseholdContext";
import * as db from "../lib/db";
import { errorText } from "../lib/authErrors";
import type { PendingInvite } from "../lib/types";
import { spacing } from "../theme";
import { Body, Button, Card, H3, InlineMessage, Muted } from "./index";

/** הזמנות שממתינות למשתמש המחובר — גם אם כבר יש לו משק בית משלו. */
export function PendingInvites() {
  const { user } = useAuth();
  const { householdId, joinHousehold } = useHousehold();
  const [invites, setInvites] = useState<PendingInvite[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!user) return setInvites([]);
    try {
      setInvites(await db.myPendingInvites());
    } catch {
      setInvites([]);
    }
  }, [user]);

  useEffect(() => {
    void load();
  }, [load, householdId]);

  async function onAccept(invite: PendingInvite) {
    setBusyId(invite.invite_id);
    setError(null);
    try {
      await joinHousehold(invite.invite_id);
      await load();
    } catch (e) {
      setError(errorText(e, "לא הצלחנו להצטרף למשק הבית"));
    } finally {
      setBusyId(null);
    }
  }

  if (invites.length === 0 && !error) return null;

  return (
    <Card>
      <H3 style={{ marginBottom: spacing.sm }}>הזמנות שממתינות לך</H3>
      {error ? <InlineMessage tone="error">{error}</InlineMessage> : null}
      {invites.map((inv) => (
        <View key={inv.invite_id} style={{ marginBottom: spacing.md }}>
          <Body style={{ fontWeight: "700" }}>{inv.household_name}</Body>
          <Muted style={{ marginBottom: spacing.sm }}>
            {inv.invited_by_name
              ? `הוזמנת על ידי ${inv.invited_by_name}`
              : "הוזמנת להצטרף"}
            {householdId
              ? " · משק הבית הנוכחי שלך יישמר ותוכל/י לעבור ביניהם בהגדרות"
              : ""}
          </Muted>
          <Button
            title="הצטרפות"
            icon="enter-outline"
            onPress={() => onAccept(inv)}
            loading={busyId === inv.invite_id}
            disabled={busyId !== null}
          />
        </View>
      ))}
    </Card>
  );
}
