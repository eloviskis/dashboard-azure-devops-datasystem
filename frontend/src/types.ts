// Mapeia os estados dos Work Items, incluindo os do fluxo Kanban e outros comuns do Azure DevOps
export const WorkItemStates = [
  'New', 'Para Desenvolver', 'Active', 'Aguardando Code Review', 'Fazendo Code Review', 'Aguardando QA', 'Testando QA',
  'Finished', 'Resolved', 'Pronto', 'Closed', 'Removed', 'Done',
  'Novo', 'Ativo', 'Resolvido', 'Fechado', 'Removido', 'Concluído'
] as const;

export type WorkItemState = typeof WorkItemStates[number];

// Mapeia os tipos de Work Items
export const WorkItemTypes = [
  'Product Backlog Item', 'Bug', 'Task', 'Feature', 'Epic', 'Issue', 'Impediment',
  'User Story', 'Eventuality'
] as const;

export type WorkItemType = typeof WorkItemTypes[number];

// Estrutura principal do Work Item, alinhada com o backend
export interface WorkItem {
  workItemId: number;
  title: string;
  state: string;
  type: string;
  assignedTo?: string | null;
  team?: string;
  areaPath?: string | null;
  iterationPath?: string | null;
  createdDate?: string | Date;
  changedDate?: string | Date;
  closedDate?: string | Date | null;
  storyPoints?: number | null;
  tags?: string | string[];
  url?: string;
  cycleTime?: number | null;
  leadTime?: number | null;
  age?: number;
  // Campos customizados e outros
  tipoCliente?: string | null;
  codeReviewLevel1?: string | null;
  codeReviewLevel2?: string | null;
  // Campo simulado no frontend para análise de gargalos
  timeInStatusDays?: Record<string, number>;
  // Campos para análise de causa raiz em Issues (nomes corretos do Azure DevOps)
  priority?: number | string | null;
  customType?: string | null;
  rootCauseStatus?: string | null;
  squad?: string | null;
  area?: string | null;
  complexity?: string | null;
  reincidencia?: number | string | null;
  performanceDays?: number | string | null;
  qa?: string | null;
  causaRaiz?: string | null;
  createdBy?: string | null;
  po?: string | null;
  readyDate?: string | Date | null;
  doneDate?: string | Date | null;
  [key: string]: any;
}

// Filtros para Work Items
export interface WorkItemFilters {
  period: number;
  teams: string[];
  assignedTos: string[];
  types: string[];
  states: string[];
  clients: string[];
  tags: string[];
  periodMode?: 'preset' | 'specific-month' | 'custom';
  specificMonth?: string;
  customStartDate?: string;
  customEndDate?: string;
}
