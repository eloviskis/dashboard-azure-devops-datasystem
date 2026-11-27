import { WorkItem } from '../types.ts';
import { PullRequest } from '../types.ts';
import { SyncStatus } from '../hooks/useAzureDevOpsData.ts';

// Permite usar URL pública do backend via variável de ambiente
const API_BASE_URL = import.meta.env.VITE_API_URL || '';

// Helper: retorna headers com token JWT de autenticação
const getAuthHeaders = (): HeadersInit => {
  const token = localStorage.getItem('auth_token');
  return token ? { 'Authorization': `Bearer ${token}` } : {};
};

// Função para transformar os dados brutos da API no tipo WorkItem
const transformApiDataToWorkItem = (apiItem: any): WorkItem => {
  return {
    ...apiItem,
    createdDate: new Date(apiItem.createdDate),
    changedDate: new Date(apiItem.changedDate),
    closedDate: apiItem.closedDate ? new Date(apiItem.closedDate) : null,
    tags: apiItem.tags ? apiItem.tags.split(',').map((t: string) => t.trim()) : [],
    // timeInStatusDays vem pronto da API (histórico real de transição de status), não é mais estimado aqui.
    timeInStatusDays: apiItem.timeInStatusDays || undefined,
    codeReviewLevel1: apiItem.codeReviewLevel1 || null,
    codeReviewLevel2: apiItem.codeReviewLevel2 || null,
  };
};


// Dispara evento global quando o token expirou (401 na API)
const handleUnauthorized = () => {
  localStorage.removeItem('auth_token');
  localStorage.removeItem('auth_user');
  window.dispatchEvent(new CustomEvent('auth:expired'));
};

export const getWorkItems = async (): Promise<WorkItem[]> => {
  try {
    const response = await fetch(`${API_BASE_URL}/api/items`, { headers: getAuthHeaders() });
    if (response.status === 401) {
      handleUnauthorized();
      return [];
    }
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
        const response = await fetch(`${API_BASE_URL}/api/sync/status`, { headers: getAuthHeaders() });
        if (response.status === 401) {
            handleUnauthorized();
            return { syncTime: new Date().toISOString(), status: 'error' };
        }
        if (!response.ok) {
            throw new Error('Failed to fetch sync status');
        }
        const data = await response.json();
        // Backend retorna snake_case (sync_time), frontend espera camelCase (syncTime)
        return {
            syncTime: data.syncTime || data.sync_time || new Date().toISOString(),
            status: data.status || 'error',
            work_items: data.work_items || data.items_count || undefined,
        };
    } catch (error) {
        console.error("Error fetching sync status:", error);
        return { syncTime: new Date().toISOString(), status: 'error' };
    }
};

export const getPullRequests = async (): Promise<PullRequest[]> => {
  try {
    const response = await fetch(`${API_BASE_URL}/api/pull-requests`, { headers: getAuthHeaders() });
    if (response.status === 401) {
      handleUnauthorized();
      return [];
    }
    if (!response.ok) {
      throw new Error(`Failed to fetch pull requests: ${response.status}`);
    }
    return await response.json();
  } catch (error) {
    console.error("Error fetching pull requests:", error);
    return [];
  }
};

export const getPullRequestFiles = async (pullRequestId: number): Promise<{ path: string; changeType: string }[]> => {
  try {
    const response = await fetch(`${API_BASE_URL}/api/pull-requests/${pullRequestId}/files`, { headers: getAuthHeaders() });
    if (response.status === 401) {
      handleUnauthorized();
      return [];
    }
    if (!response.ok) {
      throw new Error(`Failed to fetch pull request files: ${response.status}`);
    }
    return await response.json();
  } catch (error) {
    console.error("Error fetching pull request files:", error);
    return [];
  }
};

export const triggerFullSync = async (): Promise<any> => {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 55000); // 55s timeout
  try {
    const response = await fetch(`${API_BASE_URL}/api/sync`, { method: 'POST', headers: getAuthHeaders(), signal: controller.signal });
    clearTimeout(timeoutId);
    if (!response.ok) throw new Error('Failed to trigger sync');
    return await response.json();
  } catch (error: any) {
    clearTimeout(timeoutId);
    // AbortError = timeout (sync continua no backend)
    if (error?.name === 'AbortError') {
      console.log('Sync request timed out. Data is being processed.');
      return { status: 'processing' };
    }
    console.error("Error triggering full sync:", error);
    return null;
  }
};

export const syncPullRequests = async (): Promise<any> => {
  try {
    const response = await fetch(`${API_BASE_URL}/api/sync/pull-requests`, { method: 'POST', headers: getAuthHeaders() });
    if (!response.ok) throw new Error('Failed to sync PRs');
    return await response.json();
  } catch (error) {
    console.error("Error syncing pull requests:", error);
    return { status: 'error', message: (error as Error).message };
  }
};
