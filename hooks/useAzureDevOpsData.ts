import { useState, useEffect } from 'react';
import { WorkItem } from '../types.ts';
import { getWorkItems } from '../services/azureDevOpsService.ts';

export const useAzureDevOpsData = () => {
  const [workItems, setWorkItems] = useState<WorkItem[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        setError(null);
        const data = await getWorkItems();
        setWorkItems(data);
      } catch (e) {
        setError(e instanceof Error ? e : new Error('An unknown error occurred'));
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  return { workItems, loading, error };
};
