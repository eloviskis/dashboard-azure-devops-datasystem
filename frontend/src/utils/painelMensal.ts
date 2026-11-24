// Painel por Time, no formato da planilha de gestão, mas com os dados da própria ferramenta.
// Trabalha com intervalos de período (semanal, quinzenal ou mensal — ver periodGrouping.ts).
// Lógica pura, sem React.
import type { WorkItem } from '../types.ts';
import { COMPLETED_STATES, getPercentile } from './metrics.ts';
import type { PeriodBucket } from './periodGrouping.ts';

export type MetricKey = 'fluxo' | 'cycle' | 'bugs' | 'bugsVersao' | 'bugsSemVersao' | 'retrabalho' | 'qtdP0' | 'slaP0';

export interface Faixa { min: number | null; max: number | null; }

export interface MetaMetrica extends Faixa {
  label: string;
  unidade: string;
  porTime?: Record<string, Faixa>; // override por time
}

export type MetasPainel = Record<MetricKey, MetaMetrica>;

// Faixas iniciais da planilha de gestão. Editáveis no painel (admin).
// Retrabalho: contagem de bugs internos, sem meta até a gestão definir uma (2026-11-24; antes era % ≤ 31).
export const METAS_PADRAO: MetasPainel = {
  fluxo: { label: 'Fluxo de Eficiência', unidade: '%', min: 45, max: 50, porTime: { sustentacao: { min: 50, max: 55 } } },
  cycle: { label: 'Cycle Time (P85, dias corridos)', unidade: 'd', min: 20, max: 34, porTime: { sustentacao: { min: 10, max: 12 } } },
  // Sem meta: a faixa 80–100 da planilha era do total da empresa colado em cada time (decisão de 2026-11-24)
  bugs: { label: 'Bugs Produção', unidade: '', min: null, max: null },
  bugsVersao: { label: 'Bugs Produção com versão', unidade: '', min: null, max: null },
  bugsSemVersao: { label: 'Bugs Produção sem versão', unidade: '', min: null, max: null },
  retrabalho: { label: 'Índice de Retrabalho', unidade: '', min: null, max: null },
  qtdP0: { label: 'Quantidade de P0', unidade: '', min: null, max: null },
  // Só a Sustentação acompanha SLA P0 (ver PERFIS_TIME) — o geral fica igual ao override só pra não aparecer
  // "sem meta" no cabeçalho da seção; nenhum outro time chega a usar esse valor geral.
  slaP0: { label: 'SLA P0 (≤7 dias)', unidade: '%', min: 60, max: 70, porTime: { sustentacao: { min: 60, max: 70 } } },
};

// Issue = bug que chegou em produção (Bugs Produção). Bug = bug interno, o que o QA pega antes de produção,
// sem versão publicada (Índice de Retrabalho) — definição da gestão em 2026-11-24.
const SLA_P0_DIAS = 7;

// Times da planilha de gestão com escopo de tipos confirmado contra o CSV da GetNaves (ver TIPOS_GETNAVES
// abaixo). Não inclui Franquia/CTC de propósito — ver TIMES_PADRAO_PAINEL. Estratégico tirado da lista a
// pedido do usuário (2026-10-29).
export const TIMES_PLANILHA = ['Sustentacao', 'Boltz', 'Tatico', 'Wakanda'];

// Times marcados por padrão ao abrir a tela. Inclui Franquia/CTC (tem bloco próprio na planilha), mas ela NÃO
// entra em TIMES_PLANILHA: colocá-la lá também mudaria o escopo de tipos dela pra TIPOS_GETNAVES (só Issue/User
// Story/Eventuality), que exclui Bug — e a Franquia tem Bugs reais (126 no banco) que entram no Índice de
// Retrabalho. Sem validar isso contra um CSV real da GetNaves (como foi feito pros 5 times originais), ela fica
// com o fallback de "todos os tipos" que já existe pra time novo (ver noEscopo).
export const TIMES_PADRAO_PAINEL = [...TIMES_PLANILHA, 'Franquia'];

export const normalizarTime = (team: string) =>
  team.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().trim();

const isSustentacao = (team: string) => normalizarTime(team) === 'sustentacao';

// Quais métricas cada time acompanha, igual aos blocos da planilha de gestão. qtdP0 não está em nenhum bloco da
// planilha (é só da ferramenta), por isso entra nos 3 perfis sem distinção.
const METRICAS_SUSTENTACAO: MetricKey[] = ['fluxo', 'cycle', 'slaP0', 'retrabalho', 'qtdP0'];
const METRICAS_FRANQUIA: MetricKey[] = ['bugs', 'bugsVersao', 'retrabalho', 'qtdP0'];
const METRICAS_PADRAO_TIME: MetricKey[] = ['fluxo', 'cycle', 'bugs', 'bugsVersao', 'retrabalho', 'qtdP0'];
const PERFIS_TIME: Record<string, MetricKey[]> = { sustentacao: METRICAS_SUSTENTACAO, franquia: METRICAS_FRANQUIA };
export function metricasDoTime(team: string): MetricKey[] {
  return PERFIS_TIME[normalizarTime(team)] ?? METRICAS_PADRAO_TIME;
}
// "Sem versão" é o filtro da seção "com versão" na tela (não é bloco próprio): vale pros mesmos times.
export const acompanha = (team: string, key: MetricKey) =>
  metricasDoTime(team).includes(key === 'bugsSemVersao' ? 'bugsVersao' : key);

// Escopo por tipo, igual ao export da GetNaves: Issue, User Story e Eventuality. Confirmado com o CSV real de
// cada um dos 5 times da planilha (Bug, QA, Task e os demais tipos ficam de fora).
// ponytail: só estes 5 times têm a configuração confirmada; um time novo entra com todos os tipos até termos a dele.
// Estratégico saiu da lista padrão (TIMES_PLANILHA) em 2026-10-29, mas não do escopo: sem ele, Feature/Epic/Task
// antigas fechadas em lote entravam no Cycle Time do time (P85 de 955 d em ago/26).
const TIPOS_GETNAVES: Record<string, string[]> = Object.fromEntries(
  [...TIMES_PLANILHA, 'Estrategico'].map(t => [normalizarTime(t), ['Issue', 'User Story', 'Eventuality']])
);
const noEscopo = (item: WorkItem) => {
  const tipos = TIPOS_GETNAVES[normalizarTime(item.team ?? '')];
  return !tipos || tipos.includes(item.type);
};

// P0 = prioridade vazia ou 0 (mesma regra de RootCauseDashboard). Prioridade "1" (Crítica) NÃO entra.
const isP0 = (item: WorkItem) => {
  const p = item.priority;
  if (p === null || p === undefined || p === '') return true;
  const n = Number.parseFloat(String(p));
  return Number.isNaN(n) ? true : Math.floor(n) === 0;
};

// Bug em produção = Issue. "Com versão" = número de versão (ex.: 3.71.0.5) em Base Version, Delivered Version,
// root cause version ou numa tag. Em nov/2026 nenhum item do tipo Bug tinha versão no Azure DevOps, só Issues.
// Exige 3 partes porque o Delivered Version às vezes traz texto ("ANALISE", "PR Completo").
const VERSAO = /\d+\.\d+\.\d+/;
const temVersao = (item: WorkItem) =>
  [item.baseVersion, item.deliveredVersion, item.rootCauseVersion, [item.tags ?? ''].flat().join(';')]
    .some(v => VERSAO.test(v ?? ''));

const dentroDoPeriodo =(data: string | Date | null | undefined, b: PeriodBucket) => {
  if (!data) return false;
  const t = new Date(data).getTime();
  return !Number.isNaN(t) && t >= b.start.getTime() && t <= b.end.getTime();
};

const media = (valores: number[]): number | null =>
  valores.length === 0 ? null : Math.round((valores.reduce((s, v) => s + v, 0) / valores.length) * 10) / 10;

// P85 (nearest-rank, mesmo método do resto da ferramenta). Igual ao cabeçalho "85% Percentil" da planilha.
// Sensível a fechamentos em massa: itens antigos fechados de uma vez entram no P85 do mês.
const p85 = (valores: number[]): number | null => {
  if (valores.length === 0) return null;
  const s = [...valores].sort((a, b) => a - b);
  return Math.round(getPercentile(s, 0.85) * 10) / 10;
};

const pct = (parte: number, total: number): number | null =>
  total === 0 ? null : Math.round((parte / total) * 1000) / 10;

// Fluxo de Eficiência e Cycle Time na configuração da GetNaves (aba "conf e Filtros Tatico" da planilha; decisão
// do usuário em 2026-11-24, que reduziu o erro contra o histórico jan–out de 10 para 4 pontos no Fluxo do Tático):
// - só Issue e User Story;
// - Fluxo = ativo ÷ (ativo + fila) em cada item, depois a média. Ativo = Desenvolvendo (Active) e Testando QA;
//   fila = Aguardando/Fazendo code review e Aguardando QA. "Para Desenvolver" é To Do na GetNaves: fica fora;
// - Cycle Time = dias corridos do início do Doing até a conclusão (cicloDias, vem de /api/painel-time/ciclo).
// Estados em minúsculo para casar com timeInStatusDays. Itens sem tempo nesses estados não entram no Fluxo.
// "Testing"/"CodeReview" (sem espaço) são nomes de coluna que Boltz/Tático/Estratégico usam e Sustentação
// não — mesmo sentido de "Testando QA"/code review, só com grafia diferente (confirmado no banco em 2026-10-28).
const TIPOS_FLUXO_CT = ['Issue', 'User Story'];
const ESTADOS_ATIVOS = ['active', 'testando qa', 'testing'];
const ESTADOS_FILA = ['aguardando code review', 'fazendo code review', 'aguardando qa', 'codereview'];
const diasEm = (item: WorkItem, estados: string[]) =>
  Object.entries(item.timeInStatusDays ?? {})
    .filter(([estado]) => estados.includes(estado.toLowerCase()))
    .reduce((soma, [, dias]) => soma + dias, 0);
const eficienciaItem = (item: WorkItem): number | null => {
  const ativo = diasEm(item, ESTADOS_ATIVOS);
  const fila = diasEm(item, ESTADOS_FILA);
  return ativo + fila === 0 ? null : (ativo / (ativo + fila)) * 100;
};

export interface PainelMensal {
  labels: string[];                                             // um rótulo por período (coluna)
  times: string[];
  porTime: Record<MetricKey, Record<string, (number | null)[]>>; // uma posição por período
  mediaTodos: Record<MetricKey, (number | null)[]>;             // média dos valores dos times
  mediaSemSustentacao: Record<MetricKey, (number | null)[]>;
}

export function buildPainelMensal(items: WorkItem[], buckets: PeriodBucket[], timesFiltro?: string[]): PainelMensal {
  const filtroNorm = timesFiltro?.map(normalizarTime);
  const validos = items.filter(i =>
    i.team && i.team !== 'Sem Time' && noEscopo(i) && (!filtroNorm || filtroNorm.includes(normalizarTime(i.team)))
  );
  const times = [...new Set(validos.map(i => i.team as string))].sort((a, b) => a.localeCompare(b, 'pt-BR'));

  const porTime = { fluxo: {}, cycle: {}, bugs: {}, bugsVersao: {}, bugsSemVersao: {}, retrabalho: {}, qtdP0: {}, slaP0: {} } as PainelMensal['porTime'];

  for (const team of times) {
    const doTime = validos.filter(i => i.team === team);
    const concluidosTime = doTime.filter(i => COMPLETED_STATES.includes(i.state));
    const issuesTime = doTime.filter(i => i.type === 'Issue');
    // Bugs internos vêm de items, não de validos: o escopo da GetNaves (Issue/User Story/Eventuality) tira Bug
    const bugsInternos = items.filter(i => i.team === team && i.type === 'Bug');

    const fluxo: (number | null)[] = [];
    const cycle: (number | null)[] = [];
    const bugs: (number | null)[] = [];
    const bugsVersao: (number | null)[] = [];
    const bugsSemVersao: (number | null)[] = [];
    const retrabalho: (number | null)[] = [];
    const qtdP0: (number | null)[] = [];
    const slaP0: (number | null)[] = [];

    for (const b of buckets) {
      // Itens concluídos cuja data de fechamento cai no período
      const noPeriodo = concluidosTime.filter(i => dentroDoPeriodo(i.closedDate, b));

      // Fluxo de Eficiência (média, item a item) e Cycle Time (P85, dias corridos desde o Doing): só Issue e User Story
      const fluxoCt = noPeriodo.filter(i => TIPOS_FLUXO_CT.includes(i.type));
      fluxo.push(media(fluxoCt.map(eficienciaItem).filter((v): v is number => v !== null)));
      cycle.push(p85(fluxoCt.map(i => i.cicloDias).filter((v): v is number => typeof v === 'number')));

      // Bugs Produção: Issues criadas no período (mesmo critério da série de Qualidade)
      const issuesPeriodo = issuesTime.filter(i => dentroDoPeriodo(i.createdDate, b));
      bugs.push(issuesPeriodo.length);
      const comVersao = issuesPeriodo.filter(temVersao).length;
      bugsVersao.push(comVersao);
      bugsSemVersao.push(issuesPeriodo.length - comVersao);

      // Índice de Retrabalho: bugs internos abertos no período (quando o QA pegou)
      retrabalho.push(bugsInternos.filter(i => dentroDoPeriodo(i.createdDate, b)).length);

      // P0 concluídos do período com Cycle Time preenchido: base da Quantidade de P0 e do SLA P0 (dentro de 7 dias)
      const p0 = noPeriodo.filter(isP0).filter(i => typeof i.cycleTime === 'number');
      qtdP0.push(p0.length);
      slaP0.push(pct(p0.filter(i => (i.cycleTime as number) <= SLA_P0_DIAS).length, p0.length));
    }

    porTime.fluxo[team] = fluxo;
    porTime.cycle[team] = cycle;
    porTime.bugs[team] = bugs;
    porTime.bugsVersao[team] = bugsVersao;
    porTime.bugsSemVersao[team] = bugsSemVersao;
    porTime.retrabalho[team] = retrabalho;
    porTime.qtdP0[team] = qtdP0;
    porTime.slaP0[team] = slaP0;
  }

  // Médias consolidadas: média dos VALORES dos times, por período e por métrica
  const consolidar = (filtro: (t: string) => boolean) => {
    const out = {} as Record<MetricKey, (number | null)[]>;
    for (const key of Object.keys(porTime) as MetricKey[]) {
      const timesDaMetrica = times.filter(t => filtro(t) && acompanha(t, key));
      out[key] = buckets.map((_, idx) => media(
        timesDaMetrica.map(t => porTime[key][t][idx]).filter((v): v is number => typeof v === 'number')
      ));
    }
    return out;
  };

  return {
    labels: buckets.map(b => b.label),
    times,
    porTime,
    mediaTodos: consolidar(() => true),
    mediaSemSustentacao: consolidar(t => !isSustentacao(t)),
  };
}

// Todos os itens do time. O escopo da GetNaves é aplicado em itensDaMetrica, que sabe que o retrabalho não usa.
export const itensDoTime = (items: WorkItem[], team: string): WorkItem[] =>
  items.filter(i => i.team === team);

// Itens que compõem o número de uma métrica, para o time e período dados — usado pelo gráfico de barras
// (clique na barra abre o modal com esta lista). Reaproveita os mesmos predicados de buildPainelMensal, então
// a lista nunca diverge do número mostrado. No SLA P0 (em %), devolve o numerador — os itens que contam a
// favor —, não todos os concluídos do período.
export function itensDaMetrica(doTime: WorkItem[], bucket: PeriodBucket, key: MetricKey): WorkItem[] {
  if (key === 'retrabalho') return doTime.filter(i => i.type === 'Bug' && dentroDoPeriodo(i.createdDate, bucket));
  const doEscopo = doTime.filter(noEscopo);
  if (key === 'bugs') return doEscopo.filter(i => i.type === 'Issue' && dentroDoPeriodo(i.createdDate, bucket));
  if (key === 'bugsVersao') return itensDaMetrica(doTime, bucket, 'bugs').filter(temVersao);
  if (key === 'bugsSemVersao') return itensDaMetrica(doTime, bucket, 'bugs').filter(i => !temVersao(i));
  const concluidos = doEscopo.filter(i => COMPLETED_STATES.includes(i.state) && dentroDoPeriodo(i.closedDate, bucket));
  if (key === 'fluxo') return concluidos.filter(i => TIPOS_FLUXO_CT.includes(i.type) && eficienciaItem(i) !== null);
  if (key === 'cycle') return concluidos.filter(i => TIPOS_FLUXO_CT.includes(i.type) && typeof i.cicloDias === 'number');
  const p0 = concluidos.filter(isP0).filter(i => typeof i.cycleTime === 'number');
  if (key === 'qtdP0') return p0;
  return p0.filter(i => (i.cycleTime as number) <= SLA_P0_DIAS); // slaP0
}

// Bugs internos por desenvolvedor: mesma regra da query BUGS_DEV_2026_AVD do Azure DevOps (referência da gestão;
// conferida em 2026-11-24, 649 itens lá e aqui). Bug fechado (Closed), com responsável, área sob USE menos as de fora,
// sem a tag [ANALISE]/analise e sem "análise" no título. Não depende dos times escolhidos no painel, igual à query.
const AREAS_FORA_AVD = ['USE\\UX - UI', 'USE\\Freelance', 'USE\\Arquitetura', 'USE\\Diretoria', 'USE\\Inovacao_novo', 'USE\\Bateria']
  .map(a => a.toLowerCase());
const tagsDe = (i: WorkItem) => [i.tags ?? []].flat().flatMap(t => String(t).split(';')).map(t => t.trim().toLowerCase());
const contaNaAvd = (i: WorkItem) => {
  const area = (i.areaPath ?? '').toLowerCase();
  const titulo = (i.title ?? '').toLowerCase();
  return i.type === 'Bug' && i.state === 'Closed' && !!i.assignedTo?.trim()
    && (area === 'use' || area.startsWith('use\\')) && !AREAS_FORA_AVD.includes(area)
    && !tagsDe(i).some(t => t === '[analise]' || t === 'analise')
    && !titulo.includes('análise') && !titulo.includes('analise');
};

// Agrupa pelo responsável do Bug (Assigned To), no período em que foi aberto. Devolve as listas, não só a contagem,
// para o modal da tela.
export interface BugsDoDev { dev: string; porPeriodo: WorkItem[][]; total: number }
export function bugsPorDesenvolvedor(items: WorkItem[], buckets: PeriodBucket[]): BugsDoDev[] {
  const porDev = new Map<string, WorkItem[][]>();
  for (const i of items) {
    if (!contaNaAvd(i)) continue;
    const idx = buckets.findIndex(b => dentroDoPeriodo(i.createdDate, b));
    if (idx < 0) continue;
    const dev = (i.assignedTo as string).trim();
    if (!porDev.has(dev)) porDev.set(dev, buckets.map(() => []));
    porDev.get(dev)![idx].push(i);
  }
  return [...porDev]
    .map(([dev, porPeriodo]) => ({ dev, porPeriodo, total: porPeriodo.reduce((s, l) => s + l.length, 0) }))
    .sort((a, b) => b.total - a.total || a.dev.localeCompare(b.dev, 'pt-BR'));
}

// Faixa aplicável a um time (override por time quando existir).
export function faixaDoTime(meta: MetaMetrica, team: string): Faixa {
  const override = meta.porTime
    ? Object.entries(meta.porTime).find(([k]) => normalizarTime(k) === normalizarTime(team))?.[1]
    : undefined;
  return override ?? { min: meta.min, max: meta.max };
}

// Texto da meta, como aparece no painel e na exportação.
export function textoFaixa(f: Faixa, unidade: string): string {
  if (f.min === null && f.max === null) return 'sem meta';
  if (f.min === null) return `≤ ${f.max}${unidade}`;
  if (f.max === null) return `≥ ${f.min}${unidade}`;
  return `entre ${f.min} e ${f.max}${unidade}`;
}

// Dentro da faixa? min/max null = sem limite naquele lado. Sem dado = null (nem verde nem vermelho).
export function dentroDaFaixa(valor: number | null, faixa: Faixa): boolean | null {
  if (valor === null) return null;
  if (faixa.min !== null && valor < faixa.min) return false;
  if (faixa.max !== null && valor > faixa.max) return false;
  return true;
}
