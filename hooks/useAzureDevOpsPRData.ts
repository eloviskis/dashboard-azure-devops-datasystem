import { useState, useEffect } from 'react';
import { PullRequest } from '../types.ts';
import { getPullRequests } from '../services/azureDevOpsService.ts';

export const useAzureDevOpsPRData = () => {
  const [pullRequests, setPullRequests] = useState<PullRequest[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        setError(null);
        const data = await getPullRequests();
        setPullRequests(data);
      } catch (e) {
        setError(e instanceof Error ? e : new Error('An unknown error occurred'));
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  return { pullRequests, loading, error };
};
