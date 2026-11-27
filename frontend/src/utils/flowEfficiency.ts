// Flow Efficiency: quanto do tempo de vida do item alguém estava de fato trabalhando nele.
// A base é o timeInStatusDays, que vem do histórico REAL de transição de estado do Azure DevOps
// (feed Analytics WorkItemRevisions — ver backend/services/stateHistory.js), não de estimativa.
import type { WorkItem } from '../types.ts';
import { COMPLETED_STATES } from './metrics.ts';

export type StatusBucket = 'active' | 'wait' | 'excluded';

// Alguém está de fato trabalhando no item. Match por substring pra cobrir variação de caixa e
// idioma que existe de verdade nos dados ('Fazendo code review', 'desenvolvendo', 'CodeReview').
const ACTIVE_WORK_STATES = [
  'active', 'ativo', 'fazendo code review', 'testando qa',
  'design', 'testing', 'codereview', 'desenvolvendo', 'ux/ui',
];

// Pós-entrega: o trabalho acabou, o que sobra é burocracia de fechamento (item que ficou em
// Finished esperando alguém mover pra Closed). Fica FORA da conta — senão o time que não fecha
// item formalmente no Azure aparece como ineficiente.
// Match EXATO de propósito: 'Pronto para Desenvolvimento' é fila de backlog, não entrega.
const POST_DELIVERY_STATES = [
  'finished', 'resolved', 'pronto', 'closed', 'fechado', 'done', 'removed',
];

export function classifyStatus(status: string): StatusBucket {
  const s = status.toLowerCase().trim();
  if (POST_DELIVERY_STATES.includes(s)) return 'excluded';
  if (ACTIVE_WORK_STATES.some(a => s.includes(a))) return 'active';
  return 'wait';
}

export interface TeamFlowEfficiency {
  team: string;
  efficiency: number;   // % — é literalmente a fatia verde da barra
  waitPct: number;      // 100 - efficiency
  activeDays: number;   // média por item
  waitDays: number;     // média por item
  topWaitStatus: string | null;
  topWaitDays: number;  // média por item do maior status de espera
  count: number;
  items: WorkItem[];
}

export interface FlowEfficiencyResult {
  teams: TeamFlowEfficiency[];
  global: { efficiency: number; activeDays: number; waitDays: number; count: number };
  completedItems: WorkItem[];
  statusesByBucket: Record<StatusBucket, string[]>;
}

const pct = (active: number, wait: number) => {
  const total = active + wait;
  return total > 0 ? Math.round((active / total) * 100) : 0;
};

const avg1 = (total: number, count: number) => Math.round((total / count) * 10) / 10;

export interface ItemFlowTime {
  activeDays: number;   // bruto, sem arredondar — quem exibe arredonda
  waitDays: number;
  efficiency: number;   // % do próprio item
  topWaitStatus: string | null;
  topWaitDays: number;
  waitByStatus: Record<string, number>;
}

// Quebra de um item só. O gráfico soma tempo, não itens: todo item concluído tem os dois lados,
// então isto responde "quanto ESTE item pesou em cada lado", não "de que lado ele está".
export function splitItemTime(item: WorkItem): ItemFlowTime {
  let activeDays = 0;
  let waitDays = 0;
  const waitByStatus: Record<string, number> = {};

  Object.entries(item.timeInStatusDays || {}).forEach(([status, days]) => {
    const bucket = classifyStatus(status);
    if (bucket === 'active') activeDays += days;
    else if (bucket === 'wait') {
      waitDays += days;
      waitByStatus[status] = (waitByStatus[status] || 0) + days;
    }
  });

  const [topWaitStatus, topWaitDays] = Object.entries(waitByStatus)
    .sort((a, b) => b[1] - a[1])[0] || [null, 0];

  return { activeDays, waitDays, efficiency: pct(activeDays, waitDays), topWaitStatus, topWaitDays, waitByStatus };
}

// minItems: time com pouquíssimo item concluído vira ruído estatístico no ranking.
export function computeFlowEfficiency(items: WorkItem[], minItems = 3): FlowEfficiencyResult {
  const completedItems = items.filter(i =>
    COMPLETED_STATES.includes(i.state) && i.timeInStatusDays
  );

  const statusesByBucket: Record<StatusBucket, string[]> = { active: [], wait: [], excluded: [] };
  const seen = new Set<string>();
  const teamMap: Record<string, {
    active: number; wait: number; count: number;
    items: WorkItem[]; waitByStatus: Record<string, number>;
  }> = {};

  completedItems.forEach(item => {
    const team = item.team || 'Sem Time';
    if (!teamMap[team]) teamMap[team] = { active: 0, wait: 0, count: 0, items: [], waitByStatus: {} };
    const t = teamMap[team];
    t.items.push(item);
    t.count++;

    Object.keys(item.timeInStatusDays || {}).forEach(status => {
      if (seen.has(status)) return;
      seen.add(status);
      statusesByBucket[classifyStatus(status)].push(status);
    });

    const split = splitItemTime(item);
    t.active += split.activeDays;
    t.wait += split.waitDays;
    Object.entries(split.waitByStatus).forEach(([status, days]) => {
      t.waitByStatus[status] = (t.waitByStatus[status] || 0) + days;
    });
  });

  const teams = Object.entries(teamMap)
    .filter(([, d]) => d.count >= minItems)
    .map(([team, d]) => {
      const [topWaitStatus, topWaitTotal] = Object.entries(d.waitByStatus)
        .sort((a, b) => b[1] - a[1])[0] || [null, 0];
      const efficiency = pct(d.active, d.wait);
      return {
        team,
        efficiency,
        waitPct: 100 - efficiency,
        activeDays: avg1(d.active, d.count),
        waitDays: avg1(d.wait, d.count),
        topWaitStatus,
        topWaitDays: avg1(topWaitTotal, d.count),
        count: d.count,
        items: d.items,
      };
    })
    .sort((a, b) => b.efficiency - a.efficiency);

  const totals = Object.values(teamMap).reduce(
    (acc, d) => ({ active: acc.active + d.active, wait: acc.wait + d.wait, count: acc.count + d.count }),
    { active: 0, wait: 0, count: 0 }
  );

  Object.values(statusesByBucket).forEach(list => list.sort((a, b) => a.localeCompare(b, 'pt-BR')));

  return {
    teams,
    global: {
      efficiency: pct(totals.active, totals.wait),
      activeDays: totals.count > 0 ? avg1(totals.active, totals.count) : 0,
      waitDays: totals.count > 0 ? avg1(totals.wait, totals.count) : 0,
      count: totals.count,
    },
    completedItems,
    statusesByBucket,
  };
}
