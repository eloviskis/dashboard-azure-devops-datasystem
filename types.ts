
export enum WorkItemStatus {
  Novo = 'Novo',
  Ativo = 'Ativo',
  EmProgresso = 'Em Progresso',
  Resolvido = 'Resolvido',
  Concluido = 'Concluído',
  Fechado = 'Fechado',
}

export enum WorkItemType {
  Task = 'Task',
  Bug = 'Bug',
  Feature = 'Feature',
  Epic = 'Epic',
  Issue = 'Issue',
}

export interface WorkItem {
  id: number;
  title: string;
  status: WorkItemStatus;
  assignee: string;
  area: string;
  type: WorkItemType;
  createdDate: Date;
  closedDate?: Date;
  priority: number;
  complexity: number;
  squad: string;
  client: string;
  version: string;
  platform: string;
  rootCauseReason: string;
  reoccurrence: boolean;
  performanceDays: number;
  tags: string[];
  timeInStatusDays: Record<string, number>;
}

export enum PullRequestStatus {
  Ativo = 'Ativo',
  Concluido = 'Concluído',
  Abandonado = 'Abandonado',
}

export enum ReviewerVote {
  Approved = 10,
  ApprovedWithSuggestions = 5,
  NoVote = 0,
  WaitingForAuthor = -5,
  Rejected = -10,
}

export interface PullRequestReviewer {
  name: string;
  vote: ReviewerVote;
}

export interface PullRequest {
  id: number;
  title: string;
  author: string;
  repository: string;
  status: PullRequestStatus;
  reviewers: PullRequestReviewer[];
  createdDate: Date;
  closedDate?: Date;
  lifetimeHours?: number;
}

export interface WorkItemFilters {
  period: number;
  squads: string[];
  assignees: string[];
  types: string[];
  status: string[];
  clients: string[];
  tags: string[];
}

export interface PRFilters {
  period: number;
  repositories: string[];
  authors: string[];
  reviewers: string[];
  prStatus: string[];
}
