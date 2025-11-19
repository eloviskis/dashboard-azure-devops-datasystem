import { useState, useEffect } from 'react';
import { WorkItem } from '../types.ts';
import { getWorkItems, getLastSyncStatus } from '../services/azureDevOpsService.ts';

export interface SyncStatus {
    syncTime: string;
    status: 'success' | 'error' | 'No sync yet';
}


export const useAzureDevOpsData = () => {
  const [workItems, setWorkItems] = useState<WorkItem[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<Error | null>(null);
  const [lastSyncStatus, setLastSyncStatus] = useState<SyncStatus | null>(null);

  useEffect(() => {
    const fetchData = async () => {
      try {
        // Apenas mostra o loading na primeira carga
        if(loading) setError(null);
        
        const [data, syncStatus] = await Promise.all([
            getWorkItems(),
            getLastSyncStatus()
        ]);
        setWorkItems(data);
        setLastSyncStatus(syncStatus);

      } catch (e) {
        setError(e instanceof Error ? e : new Error('An unknown error occurred'));
      } finally {
        if(loading) setLoading(false);
      }
    };

    // Carga inicial
    fetchData();
    // Recarrega os dados a cada 5 minutos
    const interval = setInterval(fetchData, 5 * 60 * 1000); 

    return () => clearInterval(interval);
  }, []);

  return { workItems, loading, error, lastSyncStatus };
};
