import { useCallback, useEffect, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import * as db from '../lib/db';
import { monthStart } from '../lib/format';
import type { Budget, Category, MonthSummary, Transaction } from '../lib/types';
import { useHousehold } from '../context/HouseholdContext';
import { errorText } from '../lib/authErrors';

type State = {
  categories: Category[];
  budgets: Budget[];
  transactions: Transaction[];
  summary: MonthSummary | null;
  loading: boolean;
  error: string | null;
};

const EMPTY: State = {
  categories: [],
  budgets: [],
  transactions: [],
  summary: null,
  loading: true,
  error: null,
};

export function useMonthData(month: string = monthStart()) {
  const { householdId, version } = useHousehold();
  const [state, setState] = useState<State>(EMPTY);

  const reload = useCallback(async () => {
    if (!householdId) {
      setState({ ...EMPTY, loading: false });
      return;
    }
    setState((s) => ({ ...s, loading: true, error: null }));
    try {
      const data = await db.loadMonth(householdId, month);
      setState({ ...data, loading: false, error: null });
    } catch (e) {
      setState((s) => ({
        ...s,
        loading: false,
        error: errorText(e, 'שגיאה בטעינת הנתונים'),
      }));
    }
  }, [householdId, month]);

  useEffect(() => {
    void reload();
  }, [reload, version]);

  useFocusEffect(
    useCallback(() => {
      void reload();
    }, [reload]),
  );

  return { ...state, reload };
}
