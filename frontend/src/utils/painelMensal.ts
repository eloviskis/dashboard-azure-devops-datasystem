// Painel por Time, no formato da planilha de gestão, mas com os dados da própria ferramenta.
// Trabalha com intervalos de período (semanal, quinzenal ou mensal — ver periodGrouping.ts).
// Lógica pura, sem React.
import type { WorkItem } from '../types.ts';
import { COMPLETED_STATES, getPercentile } from './metrics.ts';
import type { PeriodBucket } from './periodGrouping.ts';

export type MetricKey = 'fluxo' | 'cycle' | 'bugs' | 'retrabalho' | 'qtdP0' | 'slaP0';

export interface Faixa { min: number | null; max: number | null; }

export interface MetaMetrica extends Faixa {
  label: string;
  unidade: string;
  porTime?: Record<string, Faixa>; // override por time
}

export type MetasPainel = Record<MetricKey, MetaMetrica>;

// Faixas iniciais da planilha de gestão. Editáveis no painel (admin).
// Retrabalho: verde até 31% (decisão confirmada).
export const METAS_PADRAO: MetasPainel = {
  fluxo: { label: 'Fluxo de Eficiência', unidade: '%', min: 45, max: 50, porTime: { sustentacao: { min: 50, max: 55 } } },
  cycle: { label: 'Cycle Time (P85, dias úteis)', unidade: 'd', min: 20, max: 34, porTime: { sustentacao: { min: 10, max: 12 } } },
  bugs: { label: 'Bugs Produção', unidade: '', min: 80, max: 100 },
  retrabalho: { label: 'Índice de Retrabalho', unidade: '%', min: null, max: 31 },
  qtdP0: { label: 'Quantidade de P0', unidade: '', min: null, max: null },
  slaP0: { label: 'SLA P0 (≤7 dias)', unidade: '%', min: 60, max: 70 },
};

// Retrabalho = Bug (achado em desenvolvimento) + Issue (escapou para produção): trabalho de correção.
const TIPOS_RETRABALHO = ['Bug', 'Issue'];
const SLA_P0_DIAS = 7;

// Os 5 times da planilha de gestão. O painel mostra só estes por padrão.
export const TIMES_PLANILHA = ['Sustentacao', 'Boltz', 'Estrategico', 'Tatico', 'Wakanda'];

export const normalizarTime = (team: string) =>
  team.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().trim();

const isSustentacao = (team: string) => normalizarTime(team) === 'sustentacao';

// Escopo por tipo, igual ao export da GetNaves: Issue, User Story e Eventuality. Confirmado com o CSV real de
// cada um dos 5 times da planilha (Bug, QA, Task e os demais tipos ficam de fora).
// ponytail: só estes 5 times têm a configuração confirmada; um time novo entra com todos os tipos até termos a dele.
const TIPOS_GETNAVES: Record<string, string[]> = Object.fromEntries(
  TIMES_PLANILHA.map(t => [normalizarTime(t), ['Issue', 'User Story', 'Eventuality']])
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

const dentroDoPeriodo = (data: string | Date | null | undefined, b: PeriodBucket) => {
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

// Fluxo de Eficiência como a GetNaves: ativo ÷ (ativo + fila) em cada item, depois a média dos itens.
// Estados em minúsculo para casar com timeInStatusDays. Itens sem tempo nesses estados não entram.
const ESTADOS_ATIVOS = ['active', 'testando qa'];
const ESTADOS_FILA = ['aguardando code review', 'fazendo code review', 'aguardando qa'];
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

  const porTime = { fluxo: {}, cycle: {}, bugs: {}, retrabalho: {}, qtdP0: {}, slaP0: {} } as PainelMensal['porTime'];

  for (const team of times) {
    const doTime = validos.filter(i => i.team === team);
    const concluidosTime = doTime.filter(i => COMPLETED_STATES.includes(i.state));
    const issuesTime = doTime.filter(i => i.type === 'Issue');

    const fluxo: (number | null)[] = [];
    const cycle: (number | null)[] = [];
    const bugs: (number | null)[] = [];
    const retrabalho: (number | null)[] = [];
    const qtdP0: (number | null)[] = [];
    const slaP0: (number | null)[] = [];

    for (const b of buckets) {
      // Itens concluídos cuja data de fechamento cai no período
      const noPeriodo = concluidosTime.filter(i => dentroDoPeriodo(i.closedDate, b));

      // Fluxo de Eficiência: média, item a item, como na GetNaves
      fluxo.push(media(noPeriodo.map(eficienciaItem).filter((v): v is number => v !== null)));

      // Cycle Time em dias úteis (P85)
      cycle.push(p85(noPeriodo.map(i => i.cycleTimeBusinessDays).filter((v): v is number => typeof v === 'number')));

      // Bugs Produção: Issues criadas no período (mesmo critério da série de Qualidade)
      bugs.push(issuesTime.filter(i => dentroDoPeriodo(i.createdDate, b)).length);

      // Índice de Retrabalho: % das entregas concluídas no período que são Bug ou Issue
      retrabalho.push(pct(noPeriodo.filter(i => TIPOS_RETRABALHO.includes(i.type)).length, noPeriodo.length));

      // P0 concluídos do período com Cycle Time preenchido: base da Quantidade de P0 e do SLA P0 (dentro de 7 dias)
      const p0 = noPeriodo.filter(isP0).filter(i => typeof i.cycleTime === 'number');
      qtdP0.push(p0.length);
      slaP0.push(pct(p0.filter(i => (i.cycleTime as number) <= SLA_P0_DIAS).length, p0.length));
    }

    porTime.fluxo[team] = fluxo;
    porTime.cycle[team] = cycle;
    porTime.bugs[team] = bugs;
    porTime.retrabalho[team] = retrabalho;
    porTime.qtdP0[team] = qtdP0;
    porTime.slaP0[team] = slaP0;
  }

  // Médias consolidadas: média dos VALORES dos times, por período e por métrica
  const consolidar = (filtro: (t: string) => boolean) => {
    const out = {} as Record<MetricKey, (number | null)[]>;
    for (const key of Object.keys(porTime) as MetricKey[]) {
      out[key] = buckets.map((_, idx) => media(
        times.filter(filtro).map(t => porTime[key][t][idx]).filter((v): v is number => typeof v === 'number')
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

// Itens do time dentro do escopo (mesmo filtro que buildPainelMensal usa antes de separar por período).
export const itensDoTime = (items: WorkItem[], team: string): WorkItem[] =>
  items.filter(i => i.team === team && noEscopo(i));

// Itens que compõem o número de uma métrica, para o time e período dados — usado pelo gráfico de barras
// (clique na barra abre o modal com esta lista). Reaproveita os mesmos predicados de buildPainelMensal, então
// a lista nunca diverge do número mostrado. Nas métricas em % (retrabalho, slaP0), devolve o numerador — os
// itens que contam a favor —, não todos os concluídos do período.
export function itensDaMetrica(doTime: WorkItem[], bucket: PeriodBucket, key: MetricKey): WorkItem[] {
  if (key === 'bugs') return doTime.filter(i => i.type === 'Issue' && dentroDoPeriodo(i.createdDate, bucket));
  const concluidos = doTime.filter(i => COMPLETED_STATES.includes(i.state) && dentroDoPeriodo(i.closedDate, bucket));
  if (key === 'fluxo') return concluidos.filter(i => eficienciaItem(i) !== null);
  if (key === 'cycle') return concluidos.filter(i => typeof i.cycleTimeBusinessDays === 'number');
  if (key === 'retrabalho') return concluidos.filter(i => TIPOS_RETRABALHO.includes(i.type));
  const p0 = concluidos.filter(isP0).filter(i => typeof i.cycleTime === 'number');
  if (key === 'qtdP0') return p0;
  return p0.filter(i => (i.cycleTime as number) <= SLA_P0_DIAS); // slaP0
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
