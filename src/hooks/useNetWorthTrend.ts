import { useEffect, useState } from 'react';
import { getNetWorthTrend, NetWorthTrendPoint } from '../lib/networth';
import { useAuth } from '../context/AuthContext';
import { useHousehold } from '../context/HouseholdContext';

export function useNetWorthTrend() {
  const { session } = useAuth();
  const { householdId } = useHousehold();
  const [data, setData] = useState<NetWorthTrendPoint[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchTrend = async () => {
    if (!session || !householdId) {
      setData([]);
      setLoading(false);
      return;
    }
    
    setLoading(true);
    try {
      const trend = await getNetWorthTrend(householdId);
      setData(trend);
    } catch (e) {
      console.error('Failed to fetch net worth trend:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTrend();
  }, [householdId, session]);

  return { data, loading, reload: fetchTrend };
}
