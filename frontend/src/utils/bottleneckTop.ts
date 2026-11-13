// Top N status de gargalo por time: média de dias por item (soma dos dias no status ÷ itens concluídos do
// time), entre os status que não são pós-entrega. Denominador é o total de concluídos do time — o mesmo do
// gráfico Gargalos — pra os números baterem entre as abas.
import type { WorkItem } from '../types.ts';
import { COMPLETED_STATES } from './metrics.ts';
import { classifyStatus } from './flowEfficiency.ts';

export interface TopBottleneck {
  status: string;
  avgDays: number;
}

export interface TeamBottlenecks {
  team: string;
  count: number;
  top: TopBottleneck[];
  items: WorkItem[];
}

export function computeTopBottlenecksByTeam(items: WorkItem[], topN = 3, minItems = 3): TeamBottlenecks[] {
  const completed = items.filter(i =>
    COMPLETED_STATES.includes(i.state) && i.timeInStatusDays && i.team && i.team !== 'Sem Time'
  );

  const byTeam = new Map<string, { count: number; totals: Map<string, number>; items: WorkItem[] }>();
  for (const item of completed) {
    const team = item.team as string;
    if (!byTeam.has(team)) byTeam.set(team, { count: 0, totals: new Map(), items: [] });
    const entry = byTeam.get(team)!;
    entry.count += 1;
    entry.items.push(item);
    for (const [status, days] of Object.entries(item.timeInStatusDays || {})) {
      if (classifyStatus(status) === 'excluded') continue;
      entry.totals.set(status, (entry.totals.get(status) || 0) + days);
    }
  }

  const result: TeamBottlenecks[] = [];
  for (const [team, { count, totals, items: teamItems }] of byTeam) {
    if (count < minItems) continue;
    const top = [...totals.entries()]
      .map(([status, total]) => ({ status, avgDays: Math.round((total / count) * 10) / 10 }))
      .sort((a, b) => b.avgDays - a.avgDays)
      .slice(0, topN);
    result.push({ team, count, top, items: teamItems });
  }

  return result.sort((a, b) => (b.top[0]?.avgDays ?? 0) - (a.top[0]?.avgDays ?? 0));
}
