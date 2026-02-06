import { WorkItem } from '../types.ts';
import { SyncStatus } from '../hooks/useAzureDevOpsData.ts';

// Permite usar URL pública do backend via variável de ambiente ou backend em produção
const API_BASE_URL = import.meta.env.VITE_API_URL || 'https://backend-hazel-three-14.vercel.app';

// Função para transformar os dados brutos da API no tipo WorkItem
const transformApiDataToWorkItem = (apiItem: any): WorkItem => {
  const COMPLETED_STATES = ['Done', 'Concluído', 'Closed', 'Fechado', 'Finished', 'Resolved', 'Pronto'];
  let timeInStatusDays: Record<string, number> | undefined = undefined;

  // Simula o tempo em cada status para itens concluídos, distribuindo o cycleTime
  // de forma mais alinhada com o fluxo Kanban descrito, já que o backend não fornece essa info.
  if (apiItem.cycleTime && COMPLETED_STATES.includes(apiItem.state) && apiItem.cycleTime > 0) {
      let remainingDays = apiItem.cycleTime;
      timeInStatusDays = {};

      const distributeTime = (percentage: number, minDays: number = 0.1) => {
          if (remainingDays <= 0) return 0;
          const allocatedTime = Math.max(minDays, remainingDays * percentage);
          remainingDays -= allocatedTime;
          return parseFloat(allocatedTime.toFixed(1));
      };
      
      // Distribuição de tempo simulada
      timeInStatusDays['Para Desenvolver'] = distributeTime(0.05); // 5%
      timeInStatusDays['Active'] = distributeTime(0.40); // 40% do restante
      timeInStatusDays['Aguardando Code Review'] = distributeTime(0.20); // 20% do restante
      timeInStatusDays['Fazendo Code Review'] = distributeTime(0.15); // 15% do restante
      timeInStatusDays['Aguardando QA'] = distributeTime(0.20); // 20% do restante
      timeInStatusDays['Testando QA'] = Math.max(0, parseFloat(remainingDays.toFixed(1))); // O que sobrar
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
        return await response.json();
    } catch (error) {
        console.error("Error fetching sync status:", error);
        return { syncTime: new Date().toISOString(), status: 'error' };
    }
};
