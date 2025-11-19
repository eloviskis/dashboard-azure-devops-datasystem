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
  state: WorkItemState;
  type: WorkItemType;
  assignedTo: string | null;
  team: string;
  areaPath: string | null;
  iterationPath: string | null;
  createdDate: Date;
  changedDate: Date;
  closedDate: Date | null;
  storyPoints: number | null;
  tags: string[];
  url: string;
  cycleTime: number | null;
  leadTime: number | null;
  age: number;
  // Campos customizados e outros
  tipoCliente: string | null;
  codeReviewLevel1: string | null;
  codeReviewLevel2: string | null;
  // Campo simulado no frontend para análise de gargalos
  timeInStatusDays?: Record<string, number>;
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
}
