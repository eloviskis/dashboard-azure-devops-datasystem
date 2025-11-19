import { useState, useEffect } from 'react';
// import { PullRequest } from '../types.ts';
// import { getPullRequests } from '../services/azureDevOpsService.ts';

// NOTE: This hook is currently disabled as the backend does not provide PR data.
// It is kept for future reference.

export const useAzureDevOpsPRData = () => {
  const [pullRequests, setPullRequests] = useState<any[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    const fetchData = async () => {
      /*
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
      */
     setLoading(false); // Immediately set loading to false
    };

    fetchData();
  }, []);

  return { pullRequests, loading, error };
};
