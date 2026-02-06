import { WorkItem } from '../types.ts';
import { PullRequest } from '../types.ts';
import { SyncStatus } from '../hooks/useAzureDevOpsData.ts';

// Permite usar URL pública do backend via variável de ambiente ou localhost
const API_BASE_URL = import.meta.env.VITE_API_URL || 'https://backend-hazel-three-14.vercel.app';

// Função para transformar os dados brutos da API no tipo WorkItem
const transformApiDataToWorkItem = (apiItem: any): WorkItem => {
  const COMPLETED_STATES = ['Done', 'Concluído', 'Closed', 'Fechado', 'Finished', 'Resolved', 'Pronto'];
  let timeInStatusDays: Record<string, number> | undefined = undefined;

  // Improved time-in-status estimation based on item type, priority, and state
  const WORKFLOW_COLUMNS = ['New', 'Para Desenvolver', 'Active', 'Aguardando Code Review', 'Fazendo Code Review', 'Aguardando QA', 'Testando QA'];
  
  // Weight profiles per item type (how time is typically distributed across workflow phases)
  const TYPE_PROFILES: Record<string, number[]> = {
    'Bug':                    [0.02, 0.03, 0.50, 0.10, 0.10, 0.10, 0.15],
    'Product Backlog Item':   [0.03, 0.05, 0.35, 0.15, 0.12, 0.12, 0.18],
    'Task':                   [0.02, 0.03, 0.55, 0.10, 0.10, 0.08, 0.12],
    'User Story':             [0.03, 0.05, 0.35, 0.15, 0.12, 0.12, 0.18],
    'Feature':                [0.05, 0.08, 0.30, 0.15, 0.12, 0.12, 0.18],
    'default':                [0.03, 0.05, 0.40, 0.12, 0.12, 0.12, 0.16],
  };

  if (apiItem.cycleTime && apiItem.cycleTime > 0) {
    const ct = apiItem.cycleTime;
    const profile = TYPE_PROFILES[apiItem.type] || TYPE_PROFILES['default'];
    const currentState = apiItem.state;
    
    if (COMPLETED_STATES.includes(currentState)) {
      // Completed items: distribute full cycle time across all phases using type profile
      timeInStatusDays = {};
      let remaining = ct;
      WORKFLOW_COLUMNS.forEach((col, i) => {
        if (i < WORKFLOW_COLUMNS.length - 1) {
          const allocated = Math.max(0.1, ct * profile[i]);
          timeInStatusDays![col] = parseFloat(allocated.toFixed(1));
          remaining -= allocated;
        } else {
          timeInStatusDays![col] = Math.max(0, parseFloat(remaining.toFixed(1)));
        }
      });
    } else {
      // In-progress items: only distribute time up to (and including) current state
      const stateIndex = WORKFLOW_COLUMNS.indexOf(currentState);
      if (stateIndex >= 0) {
        timeInStatusDays = {};
        // Normalize weights for completed phases only
        const completedWeights = profile.slice(0, stateIndex + 1);
        const totalWeight = completedWeights.reduce((a, b) => a + b, 0);
        let remaining = ct;
        completedWeights.forEach((w, i) => {
          if (i < completedWeights.length - 1) {
            const normalized = (w / totalWeight) * ct;
            const allocated = Math.max(0.1, normalized);
            timeInStatusDays![WORKFLOW_COLUMNS[i]] = parseFloat(allocated.toFixed(1));
            remaining -= allocated;
          } else {
            // Current state gets the remainder (most of the time)
            timeInStatusDays![WORKFLOW_COLUMNS[i]] = Math.max(0, parseFloat(remaining.toFixed(1)));
          }
        });
      }
    }
  }
  
  const level1 = apiItem['Custom.ab075d4c-04f5-4f96-b294-4ad0f5987028'];
  const level2 = apiItem['Custom.60cee051-7e66-4753-99d6-4bc8717fae0e'];
  
  return {
    ...apiItem,
    createdDate: new Date(apiItem.createdDate),
    changedDate: new Date(apiItem.changedDate),
    closedDate: apiItem.closedDate ? new Date(apiItem.closedDate) : null,
    tags: apiItem.tags ? apiItem.tags.split(',').map((t: string) => t.trim()) : [],
    timeInStatusDays,
    codeReviewLevel1: level1?.displayName || null,
    codeReviewLevel2: level2?.displayName || null,
  };
};


export const getWorkItems = async (): Promise<WorkItem[]> => {
  try {
    const response = await fetch(`${API_BASE_URL}/api/items`);
    if (!response.ok) {
      const errorData = await response.text();
      console.error('Backend error response:', errorData);
      throw new Error(`Failed to fetch work items: ${response.status} ${response.statusText}`);
    }
    const data = await response.json();
    return data.map(transformApiDataToWorkItem);
  } catch (error) {
    console.error("Error fetching from backend API:", error);
    // Retorna um array vazio em caso de erro para a aplicação não quebrar
    return [];
  }
};

export const getLastSyncStatus = async (): Promise<SyncStatus> => {
    try {
        const response = await fetch(`${API_BASE_URL}/api/sync/status`);
        if (!response.ok) {
            throw new Error('Failed to fetch sync status');
        }
        const data = await response.json();
        // Backend retorna snake_case (sync_time), frontend espera camelCase (syncTime)
        return {
            syncTime: data.syncTime || data.sync_time || new Date().toISOString(),
            status: data.status || 'error',
        };
    } catch (error) {
        console.error("Error fetching sync status:", error);
        return { syncTime: new Date().toISOString(), status: 'error' };
    }
};

export const getPullRequests = async (): Promise<PullRequest[]> => {
  try {
    const response = await fetch(`${API_BASE_URL}/api/pull-requests`);
    if (!response.ok) {
      throw new Error(`Failed to fetch pull requests: ${response.status}`);
    }
    return await response.json();
  } catch (error) {
    console.error("Error fetching pull requests:", error);
    return [];
  }
};

export const triggerFullSync = async (): Promise<any> => {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 55000); // 55s timeout (Vercel limit ~60s)
  try {
    const response = await fetch(`${API_BASE_URL}/api/sync`, { method: 'POST', signal: controller.signal });
    clearTimeout(timeoutId);
    if (!response.ok) throw new Error('Failed to trigger sync');
    return await response.json();
  } catch (error: any) {
    clearTimeout(timeoutId);
    // AbortError = timeout, isso é esperado no Vercel (sync continua no backend)
    if (error?.name === 'AbortError') {
      console.log('Sync request timed out (expected on serverless). Data is being processed.');
      return { status: 'processing' };
    }
    console.error("Error triggering full sync:", error);
    return null;
  }
};

export const syncPullRequests = async (): Promise<any> => {
  try {
    const response = await fetch(`${API_BASE_URL}/api/sync/pull-requests`, { method: 'POST' });
    if (!response.ok) throw new Error('Failed to sync PRs');
    return await response.json();
  } catch (error) {
    console.error("Error syncing pull requests:", error);
    return { status: 'error', message: (error as Error).message };
  }
};
