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

const ROOT = import.meta.env.VITE_API_URL || '';
const API = ROOT + '/api/retro';

// path relativo a /api/retro; um path que já começa com /api/ (ex.: /api/retro-boards) vai direto.
async function req<T>(method: string, path: string, body?: unknown): Promise<T> {
  const token = localStorage.getItem('auth_token');
  const res = await fetch((path.startsWith('/api/') ? ROOT : API) + path, {
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
  azdoTeams: () => req<{ key: string; items: number }[]>('GET', '/azdo-teams'),
  saveTeams: (teams: RetroTeam[]) => req<RetroTeam[]>('PUT', '/teams', { teams }),
  teamFeedback: (key: string) => req<TeamSummary['feedback']>('POST', `/teams/${encodeURIComponent(key)}/feedback`),
  // Retrô ao vivo (facilitador, logado)
  boards: () => req<BoardSummary[]>('GET', '/api/retro-boards'),
  boardTemplates: () => req<BoardTemplate[]>('GET', '/api/retro-boards/templates'),
  createBoard: (data: { teamKey: string; title: string; date: string | null; columns: BoardColumn[]; settings: Partial<BoardSettings> }) =>
    req<BoardSummary>('POST', '/api/retro-boards', data),
  updateBoard: (id: string, data: { revealed?: true; settings?: Partial<BoardSettings>; timer?: { minutes: number } | null }) =>
    req('PATCH', `/api/retro-boards/${encodeURIComponent(id)}`, data),
  finishBoard: (id: string) => req<{ retroId: string }>('POST', `/api/retro-boards/${encodeURIComponent(id)}/finish`),
  deleteBoard: (id: string) => req('DELETE', `/api/retro-boards/${encodeURIComponent(id)}`),
};

// ---------------------------------------------------------------- Retrô ao vivo: quadro (participante, sem login)
export interface BoardColumn { name: string; description: string }
export interface BoardSettings { anonymous: boolean; hideUntilReveal: boolean; votesPerPerson: number; votingOpen: boolean }
export interface BoardTemplate { id: string; name: string; columns: BoardColumn[]; group?: string; description?: string; source?: string }
export interface BoardSummary {
  id: string; teamKey: string; title: string; date: string | null; token: string; status: 'aberta' | 'encerrada'; retroId: string | null;
  settings: BoardSettings; revealed: boolean; columns: BoardColumn[]; createdByName: string | null; createdAt: string;
  cards: number; participants: number; canManage: boolean;
}
export interface BoardItem { id: number; text: string; images: string[]; author: string | null; mine: boolean }
export interface BoardComment { id: number; text: string; author: string | null; mine: boolean }
export interface BoardCard { id: number; col: number; hidden: boolean; items?: BoardItem[]; votes?: number; myVote?: boolean; comments?: BoardComment[] }
export interface BoardState {
  v: number; unchanged?: boolean; title: string; teamLabel: string; date: string | null; status: string;
  columns: BoardColumn[]; settings: BoardSettings; revealed: boolean; timerEndsAt: string | null; serverNow: string;
  participants: number; gifProvider: 'klipy' | 'giphy' | null; cards: BoardCard[];
  me: { id: number; name: string; votesUsed: number; votesLeft: number | null };
}
export interface Gif { src: string; preview: string; title: string }
export type BoardError = Error & { status?: number };

// Imagem enviada pro DSMetrics vem como /api/retro-board/img/<id>; GIF da GIPHY já vem com URL completa.
export const boardImg = (src: string) => (src.startsWith('/') ? ROOT + src : src);

// Credencial do participante ("<id>.<segredo>") por quadro, no navegador. Pode faltar (aba anônima, bloqueio): aí entra de novo.
export const boardCred = {
  get: (token: string): string | null => { try { return localStorage.getItem(`retroBoard:${token}`); } catch { return null; } },
  set: (token: string, v: string) => { try { localStorage.setItem(`retroBoard:${token}`, v); } catch { /* sem storage */ } },
  clear: (token: string) => { try { localStorage.removeItem(`retroBoard:${token}`); } catch { /* sem storage */ } },
  lastName: (name?: string): string => {
    try { if (name !== undefined) localStorage.setItem('retroBoard:name', name); return localStorage.getItem('retroBoard:name') || ''; } catch { return name || ''; }
  },
};

export function boardApi(token: string) {
  const base = `${ROOT}/api/retro-board/${encodeURIComponent(token)}`;
  const call = async <T>(method: string, path: string, body?: unknown, file?: File): Promise<T> => {
    const cred = boardCred.get(token);
    const res = await fetch(base + path, {
      method,
      headers: {
        ...(file ? { 'Content-Type': file.type || 'application/octet-stream' } : body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...(cred ? { 'X-Retro-Participant': cred } : {}),
      },
      body: file || (body === undefined ? undefined : JSON.stringify(body)),
    });
    const data = await res.json().catch(() => null);
    if (!res.ok) throw Object.assign(new Error(data?.error || `Erro ${res.status}`), { status: res.status });
    return data as T;
  };
  return {
    info: () => call<{ title: string; teamLabel: string; date: string | null; anonymous: boolean }>('GET', ''),
    join: (name: string) => call<{ participant: string; name: string }>('POST', '/join', { name }),
    state: (v: number) => call<BoardState>('GET', `/state?v=${v}`),
    addCard: (col: number, text: string, images: string[]) => call<{ id: number }>('POST', '/cards', { col, text, images }),
    editCard: (id: number, text: string, images: string[]) => call('PATCH', `/cards/${id}`, { text, images }),
    deleteCard: (id: number) => call('DELETE', `/cards/${id}`),
    vote: (id: number) => call('POST', `/cards/${id}/vote`),
    unvote: (id: number) => call('DELETE', `/cards/${id}/vote`),
    comment: (id: number, text: string) => call('POST', `/cards/${id}/comments`, { text }),
    deleteComment: (id: number) => call('DELETE', `/comments/${id}`),
    group: (id: number, into: number) => call('POST', `/cards/${id}/group`, { into }),
    ungroup: (id: number) => call('POST', `/cards/${id}/ungroup`),
    upload: (file: File) => call<{ src: string }>('POST', '/images', undefined, file),
    gifs: (q: string, page = 1) => call<{ items: Gif[]; hasNext: boolean; provider: string }>('GET', `/gifs?q=${encodeURIComponent(q)}&page=${page}`),
  };
}
export type BoardApi = ReturnType<typeof boardApi>;
