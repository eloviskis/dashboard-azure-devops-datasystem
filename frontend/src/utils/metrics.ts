import { WorkItem, WorkItemType } from '../types.ts';

export const COMPLETED_STATES = ['Done', 'Concluído', 'Closed', 'Fechado', 'Finished', 'Resolved', 'Pronto'];
export const IN_PROGRESS_STATES = ['Active', 'Ativo', 'Em Progresso', 'Para Desenvolver', 'Aguardando Code Review', 'Fazendo Code Review', 'Aguardando QA', 'Testando QA'];

/**
 * Calcula o percentil de um array SORTED de números.
 * Fórmula: nearest-rank method. Ex: getPercentile(sorted, 0.85) = P85
 */
export const getPercentile = (sorted: number[], p: number): number => {
  if (sorted.length === 0) return 0;
  const idx = Math.ceil(sorted.length * p) - 1;
  return sorted[Math.max(0, idx)];
};

export const calculatePerformanceMetrics = (workItems: WorkItem[]) => {
  const completed = workItems.filter(item => COMPLETED_STATES.includes(item.state));
  const inProgress = workItems.filter(item => IN_PROGRESS_STATES.includes(item.state));

  const totalCycleTime = completed.reduce((acc, item) => {
    return acc + (item.cycleTime || 0);
  }, 0);

  const avgCycleTime = completed.length > 0 ? (totalCycleTime / completed.length).toFixed(1) : '0';

  return {
    total: workItems.length,
    completed: completed.length,
    inProgress: inProgress.length,
    avgCycleTime,
  };
};

export const calculateQualityMetrics = (workItems: WorkItem[]) => {
    const qualityItems = workItems.filter(item => item.type === 'Bug' || item.type === 'Issue');
    
    const openBugs = qualityItems.filter(item => item.type === 'Bug' && !COMPLETED_STATES.includes(item.state)).length;
    const openIssues = qualityItems.filter(item => item.type === 'Issue' && !COMPLETED_STATES.includes(item.state)).length;

    const resolvedQualityItems = qualityItems.filter(item => COMPLETED_STATES.includes(item.state) && item.cycleTime !== null);
    
    const totalResolutionTime = resolvedQualityItems.reduce((acc, item) => {
        return acc + (item.cycleTime || 0);
    }, 0);

    const avgResolutionTime = resolvedQualityItems.length > 0 ? (totalResolutionTime / resolvedQualityItems.length).toFixed(1) : '0';

    return {
        openBugs,
        openIssues,
        avgResolutionTime,
    };
};
