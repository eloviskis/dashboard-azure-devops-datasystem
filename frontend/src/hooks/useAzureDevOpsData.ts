import { useState, useEffect, useCallback } from 'react';
import { WorkItem } from '../types.ts';
import { getWorkItems, getLastSyncStatus, triggerFullSync } from '../services/azureDevOpsService.ts';

export interface SyncStatus {
    syncTime: string;
    status: 'success' | 'error' | 'No sync yet';
}


export const useAzureDevOpsData = () => {
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
      setWorkItems(data);
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
      // Aguarda um pouco para o backend processar
      await new Promise(resolve => setTimeout(resolve, 3000));
      await fetchData();
    } catch (e) {
      console.error('Sync error:', e);
    } finally {
      setSyncing(false);
    }
  }, [fetchData]);

  useEffect(() => {
    fetchData(true);
    const interval = setInterval(() => fetchData(), 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, [fetchData]);

  return { workItems, loading, error, lastSyncStatus, syncing, handleSync };
};
