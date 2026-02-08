import { useState, useEffect, useCallback } from 'react';
import { WorkItem } from '../types.ts';
import { getWorkItems, getLastSyncStatus, triggerFullSync } from '../services/azureDevOpsService.ts';

export interface SyncStatus {
    syncTime: string;
    status: 'success' | 'error' | 'No sync yet';
}


export const useAzureDevOpsData = (isAuthenticated: boolean = true) => {
  const [workItems, setWorkItems] = useState<WorkItem[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<Error | null>(null);
  const [lastSyncStatus, setLastSyncStatus] = useState<SyncStatus | null>(null);
  const [syncing, setSyncing] = useState(false);

  const fetchData = useCallback(async (isInitial = false) => {
    try {
      if (isInitial) setError(null);
      
      const [data, syncStatus] = await Promise.all([
          getWorkItems(),
          getLastSyncStatus()
      ]);

      // Enriquece dados: calcula cycleTime e leadTime quando o backend retorna null
      const enrichedData = data.map((item: WorkItem) => {
        let { cycleTime, leadTime } = item;
        if ((cycleTime === null || cycleTime === undefined) && item.closedDate && item.createdDate) {
          const closed = new Date(item.closedDate as string);
          const created = new Date(item.createdDate as string);
          cycleTime = Math.round((closed.getTime() - created.getTime()) / (1000 * 60 * 60 * 24));
        }
        if ((leadTime === null || leadTime === undefined) && item.closedDate && item.createdDate) {
          const closed = new Date(item.closedDate as string);
          const created = new Date(item.createdDate as string);
          leadTime = Math.round((closed.getTime() - created.getTime()) / (1000 * 60 * 60 * 24));
        }
        return { ...item, cycleTime, leadTime };
      });

      setWorkItems(enrichedData);
      setLastSyncStatus(syncStatus);

    } catch (e) {
      setError(e instanceof Error ? e : new Error('An unknown error occurred'));
    } finally {
      if (isInitial) setLoading(false);
    }
  }, []);

  const handleSync = useCallback(async () => {
    setSyncing(true);
    try {
      await triggerFullSync();
      // Aguarda para o backend processar os dados
      await new Promise(resolve => setTimeout(resolve, 5000));
      await fetchData();
    } catch (e) {
      console.error('Sync error:', e);
    } finally {
      setSyncing(false);
    }
  }, [fetchData]);

  useEffect(() => {
    if (!isAuthenticated) {
      setLoading(false);
      return;
    }
    fetchData(true);
    const interval = setInterval(() => fetchData(), 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, [fetchData, isAuthenticated]);

  return { workItems, loading, error, lastSyncStatus, syncing, handleSync };
};
