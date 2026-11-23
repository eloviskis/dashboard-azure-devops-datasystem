// Cliente da API /api/retro/* (mesmo contrato no backend Node e no port .NET).
import type { RetroColumn } from '../../utils/retroParser.ts';

export type ActionState = 'sugerida' | 'aberta' | 'andamento' | 'validacao' | 'concluida' | 'descartada';
export type Priority = 'alta' | 'media' | 'baixa';
export type Tone = 'positivo' | 'atencao' | 'critico';

export interface RetroTeam { key: string; label: string; aliases?: string[] }
export interface ActionType { id: string; name: string; hue: number; sort_order?: number }
export interface Person { id: number; name: string; active: boolean }
export interface Insights { resumo: string; temas: { tema: string; tom: Tone; detalhe: string }[]; elogios: string[]; gerado_em?: string; gerado_por?: string }

export interface RetroSummary {
  id: string; teamKey: string; title: string; date: string | null; sourceFile: string | null;
  stats: { cards: number; votes: number; comments: number }; insights: Insights | null;
  createdAt: string; createdByName: string | null; actionsCount?: number;
}
export interface RetroDetail extends RetroSummary { columns: RetroColumn[]; actions: RetroAction[] }

export interface RetroAction {
  id: string; retroId: string | null; retroTitle: string | null; retroDate: string | null; teamKey: string;
  title: string; detail: string; origin: string[]; priority: Priority;
  ownerId: number | null; ownerName: string | null; ownerNameFallback: string | null;
  dueDate: string | null; recurring: boolean; state: ActionState; source: 'ia' | 'manual'; typeIds: string[];
  createdAt: string; createdByName: string | null; approvedAt: string | null; approvedByName: string | null;
  stateChangedAt: string | null; closedAt: string | null; closedByName: string | null;
  late: boolean; updatesCount: number;
  azdo: { workItemId: number | null; url: string | null; status: 'pendente' | 'enviando' | 'ok' | 'erro' | 'simulado' | null; error: string | null; syncedAt: string | null };
  updates?: { id: number; text: string; createdAt: string; authorName: string | null }[];
}

export interface TeamSummary extends RetroTeam {
  retros: number; lastRetroDate: string | null;
  counts: { aberta: number; andamento: number; validacao: number; concluida: number; atrasadas: number; sugeridas: number };
  closedPct: number; temas: { tema: string; tom: Tone; count: number }[];
  typeCounts: { typeId: string; count: number }[]; elogios: string[];
  feedback: { mensagem: string; manter: string[]; melhorar: string[]; proximo_passo: string; generatedAt: string; generatedByName: string | null } | null;
}

export interface RetroConfig {
  teams: RetroTeam[]; isLeader: boolean; aiAvailable: boolean;
  azdo: { writeEnabled: boolean; workItemType: string; team: string };
}

export type ActionEdits = Partial<Pick<RetroAction, 'title' | 'detail' | 'priority' | 'ownerId' | 'ownerNameFallback' | 'dueDate' | 'recurring' | 'typeIds' | 'teamKey' | 'origin'>>;

const API = (import.meta.env.VITE_API_URL || '') + '/api/retro';

async function req<T>(method: string, path: string, body?: unknown): Promise<T> {
  const token = localStorage.getItem('auth_token');
  const res = await fetch(API + path, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (res.status === 401) window.dispatchEvent(new Event('auth:expired'));
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error(data?.error || `Erro ${res.status}`);
  return data as T;
}

export const retroApi = {
  config: () => req<RetroConfig>('GET', '/config'),
  types: () => req<ActionType[]>('GET', '/types'),
  saveTypes: (types: Partial<ActionType>[]) => req<ActionType[]>('PUT', '/types', { types }),
  people: () => req<{ people: Person[]; byTeam: Record<string, number[]> }>('GET', '/people'),
  retros: () => req<RetroSummary[]>('GET', '/retros'),
  retro: (id: string) => req<RetroDetail>('GET', `/retros/${encodeURIComponent(id)}`),
  importRetros: (retros: { teamKey: string; title: string; date: string | null; sourceFile: string; columns: RetroColumn[] }[]) =>
    req<{ created: { id: string; teamKey: string; title: string; date: string | null }[] }>('POST', '/retros', { retros }),
  updateRetro: (id: string, data: { teamKey?: string; title?: string; date?: string | null }) => req('PATCH', `/retros/${encodeURIComponent(id)}`, data),
  deleteRetro: (id: string) => req<{ suggestionsDeleted: number }>('DELETE', `/retros/${encodeURIComponent(id)}`),
  analyze: (id: string) => req<{ insights: Insights; created: number }>('POST', `/retros/${encodeURIComponent(id)}/analyze`),
  structurePdf: (text: string) => req<unknown>('POST', '/ai/structure-pdf', { text }),
  actions: () => req<RetroAction[]>('GET', '/actions'),
  action: (id: string) => req<RetroAction>('GET', `/actions/${encodeURIComponent(id)}`),
  createAction: (data: ActionEdits & { teamKey: string; title: string; retroId?: string | null }) => req<RetroAction>('POST', '/actions', data),
  updateAction: (id: string, data: ActionEdits) => req<RetroAction>('PATCH', `/actions/${encodeURIComponent(id)}`, data),
  approve: (id: string, data: ActionEdits) => req<RetroAction>('POST', `/actions/${encodeURIComponent(id)}/approve`, data),
  discard: (id: string) => req<RetroAction>('POST', `/actions/${encodeURIComponent(id)}/discard`),
  restore: (id: string) => req<RetroAction>('POST', `/actions/${encodeURIComponent(id)}/restore`),
  move: (id: string, state: ActionState) => req<RetroAction>('POST', `/actions/${encodeURIComponent(id)}/move`, { state }),
  deleteAction: (id: string) => req('DELETE', `/actions/${encodeURIComponent(id)}`),
  addUpdate: (id: string, text: string) => req('POST', `/actions/${encodeURIComponent(id)}/updates`, { text }),
  azdoRetry: (id: string) => req('POST', `/actions/${encodeURIComponent(id)}/azdo-retry`),
  teams: () => req<TeamSummary[]>('GET', '/teams'),
  teamFeedback: (key: string) => req<TeamSummary['feedback']>('POST', `/teams/${encodeURIComponent(key)}/feedback`),
};
