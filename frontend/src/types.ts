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
  causaRaiz?: string | null;           // Custom.Raizdoproblema (campo novo)
  rootCauseLegacy?: string | null;     // Microsoft.VSTS.CMMI.RootCause (campo antigo)
  createdBy?: string | null;
  po?: string | null;
  readyDate?: string | Date | null;
  doneDate?: string | Date | null;
  // Novos campos de Root Cause Analysis
  rootCauseTask?: string | null;    // ID da tarefa que causou o bug
  rootCauseTeam?: string | null;    // Time que causou o bug
  rootCauseVersion?: string | null; // Versão onde o bug foi introduzido
  dev?: string | null;              // Desenvolvedor responsável
  platform?: string | null;         // Plataforma (WPF, Web, etc)
  application?: string | null;      // Aplicação
  branchBase?: string | null;       // Branch base
  deliveredVersion?: string | null; // Versão entregue
  baseVersion?: string | null;      // Versão base
  // Campos de Identificação e Falha do Processo
  identificacao?: string | null;    // Custom.7ac99842... - Quem identificou (Cliente, Interno, etc)
  falhaDoProcesso?: string | null;  // Custom.Falhadoprocesso - Por que o problema ocorreu
  // Campos de estimativa de tempo (Tasks)
  originalEstimate?: number | null; // Estimativa original em horas
  remainingWork?: number | null;    // Trabalho restante em horas
  completedWork?: number | null;    // Trabalho completado em horas
  parentId?: number | null;         // ID do item pai (User Story/Issue)
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
  priorities: string[];
  periodMode?: 'preset' | 'specific-month' | 'custom';
  specificMonth?: string;
  customStartDate?: string;
  customEndDate?: string;
}

// Pull Request
export interface PullRequestReviewer {
  name: string;
  vote: number; // 10=approved, 5=approved with suggestions, 0=no vote, -5=waiting, -10=rejected
  isRequired?: boolean;
}

export interface PullRequest {
  pullRequestId: number;
  title: string;
  description?: string;
  status: 'active' | 'completed' | 'abandoned';
  createdBy: string;
  createdDate: string;
  closedDate?: string | null;
  sourceRefName: string;
  targetRefName: string;
  repositoryId: string;
  repositoryName: string;
  labels: string[];
  reviewers: PullRequestReviewer[];
  votes: { name: string; vote: number }[];
  hasValidaCRLabel: boolean;
  lifetimeDays: number | null;
  url: string;
}
