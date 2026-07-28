import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as db from '../lib/db';
import { monthStart } from '../lib/format';
import type { Household } from '../lib/types';
import { useAuth } from './AuthContext';

const STORAGE_KEY = 'homebase.activeHouseholdId';

type HouseholdValue = {
  households: Household[];
  household: Household | null;
  householdId: string | null;
  loading: boolean;
  error: string | null;
  /** גרסה — משתנה בכל שינוי נתונים כדי לרענן מסכים */
  version: number;
  refreshHouseholds: () => Promise<void>;
  selectHousehold: (id: string) => Promise<void>;
  createHousehold: (name: string) => Promise<void>;
  bumpVersion: () => void;
};

const HouseholdContext = createContext<HouseholdValue | null>(null);

export function HouseholdProvider({ children }: { children: React.ReactNode }) {
  const { user, configured } = useAuth();
  const [households, setHouseholds] = useState<Household[]>([]);
  const [householdId, setHouseholdId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [version, setVersion] = useState(0);

  const bumpVersion = useCallback(() => setVersion((v) => v + 1), []);

  const load = useCallback(async () => {
    if (!user || !configured) {
      setHouseholds([]);
      setHouseholdId(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const rows = await db.listMyHouseholds();
      setHouseholds(rows);
      const stored = await AsyncStorage.getItem(STORAGE_KEY);
      const next = rows.find((h) => h.id === stored)?.id ?? rows[0]?.id ?? null;
      setHouseholdId(next);
      if (next) {
        await AsyncStorage.setItem(STORAGE_KEY, next);
        // גלגול יעדים והרצת קבועות לחודש הנוכחי
        try {
          await db.rolloverBudgets(next, monthStart());
          await db.applyRecurring(next);
        } catch {
          // לא קריטי — נמשיך גם אם נכשל
        }
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'שגיאה בטעינת משק הבית');
    } finally {
      setLoading(false);
    }
  }, [user, configured]);

  useEffect(() => {
    void load();
  }, [load]);

  const selectHousehold = useCallback(async (id: string) => {
    setHouseholdId(id);
    await AsyncStorage.setItem(STORAGE_KEY, id);
    setVersion((v) => v + 1);
  }, []);

  const createHousehold = useCallback(
    async (name: string) => {
      const id = await db.createHousehold(name);
      await AsyncStorage.setItem(STORAGE_KEY, id);
      await load();
      setHouseholdId(id);
    },
    [load],
  );

  const value = useMemo<HouseholdValue>(
    () => ({
      households,
      household: households.find((h) => h.id === householdId) ?? null,
      householdId,
      loading,
      error,
      version,
      refreshHouseholds: load,
      selectHousehold,
      createHousehold,
      bumpVersion,
    }),
    [households, householdId, loading, error, version, load, selectHousehold, createHousehold, bumpVersion],
  );

  return <HouseholdContext.Provider value={value}>{children}</HouseholdContext.Provider>;
}

export function useHousehold(): HouseholdValue {
  const ctx = useContext(HouseholdContext);
  if (!ctx) throw new Error('useHousehold must be used inside HouseholdProvider');
  return ctx;
}
