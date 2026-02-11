import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { WorkItem } from '../types';
import { CHART_COLORS } from '../constants';
import ChartInfoLamp from './ChartInfoLamp';
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid, ReferenceLine,
  RadialBarChart, RadialBar, Legend
} from 'recharts';
import { format, subDays, eachWeekOfInterval, startOfWeek, endOfWeek, differenceInDays } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface MetasDashboardProps {
  data: WorkItem[];
  periodDays: number;
}

interface TeamTargets {
  throughput: number; // itens/semana - higher is better
  cycleTime: number;  // dias - lower is better
  leadTime: number;   // dias - lower is better
  bugRate: number;    // % - lower is better
}

type TargetsStore = Record<string, TeamTargets>;

const COMPLETED_STATES = ['Done', 'Concluído', 'Closed', 'Fechado', 'Finished', 'Resolved', 'Pronto'];

const DEFAULT_TARGETS: TeamTargets = {
  throughput: 10,
  cycleTime: 7,
  leadTime: 14,
  bugRate: 15,
};

const STORAGE_KEY = 'ds-metas-targets-v1';

function loadTargets(): TargetsStore {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch { return {}; }
}

function saveTargets(targets: TargetsStore) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(targets));
}

const MetasDashboard: React.FC<MetasDashboardProps> = ({ data, periodDays }) => {
  const [selectedTeam, setSelectedTeam] = useState<string>('__all__');
  const [targets, setTargets] = useState<TargetsStore>(loadTargets);
  const [editingTargets, setEditingTargets] = useState(false);
  const [tempTargets, setTempTargets] = useState<TeamTargets>(DEFAULT_TARGETS);

  const teams = useMemo(() => {
    return ['__all__', ...[...new Set(data.map(i => i.team).filter(Boolean) as string[])].sort()];
  }, [data]);

  const teamLabel = selectedTeam === '__all__' ? 'Todos os Times' : selectedTeam;

  const currentTargets = useMemo(() => {
    return targets[selectedTeam] || DEFAULT_TARGETS;
  }, [targets, selectedTeam]);

  useEffect(() => {
    setTempTargets({ ...currentTargets });
  }, [selectedTeam, currentTargets]);

  const handleSaveTargets = useCallback(() => {
    const updated = { ...targets, [selectedTeam]: { ...tempTargets } };
    setTargets(updated);
    saveTargets(updated);
    setEditingTargets(false);
  }, [targets, selectedTeam, tempTargets]);

  // Filter data by team
  const teamData = useMemo(() => {
    if (selectedTeam === '__all__') return data;
    return data.filter(i => i.team === selectedTeam);
  }, [data, selectedTeam]);

  // Weekly metrics (last 12 weeks)
  const weeklyMetrics = useMemo(() => {
    const now = new Date();
    const start = subDays(now, 84); // 12 weeks
    const weeks = eachWeekOfInterval({ start, end: now }, { weekStartsOn: 1 });

    return weeks.map(weekStart => {
      const wEnd = endOfWeek(weekStart, { weekStartsOn: 1 });
      const completedInWeek = teamData.filter(item => {
        if (!COMPLETED_STATES.includes(item.state)) return false;
        const closed = item.closedDate ? new Date(item.closedDate as string) : null;
        return closed && closed >= weekStart && closed <= wEnd;
      });

      const throughput = completedInWeek.length;
      const cycleTimes = completedInWeek
        .filter(i => i.cycleTime != null && (i.cycleTime as number) > 0)
        .map(i => i.cycleTime as number);
      const leadTimes = completedInWeek
        .filter(i => i.leadTime != null && (i.leadTime as number) > 0)
        .map(i => i.leadTime as number);
      const bugs = completedInWeek.filter(i => i.type === 'Bug').length;

      const avgCT = cycleTimes.length > 0 ? cycleTimes.reduce((a, b) => a + b, 0) / cycleTimes.length : 0;
      const avgLT = leadTimes.length > 0 ? leadTimes.reduce((a, b) => a + b, 0) / leadTimes.length : 0;
      const bugRate = throughput > 0 ? (bugs / throughput) * 100 : 0;

      return {
        week: format(weekStart, 'dd/MM', { locale: ptBR }),
        weekDate: weekStart,
        throughput,
        cycleTime: Math.round(avgCT * 10) / 10,
        leadTime: Math.round(avgLT * 10) / 10,
        bugRate: Math.round(bugRate * 10) / 10,
      };
    });
  }, [teamData]);

  // Current period metrics (whole filtered period)
  const currentMetrics = useMemo(() => {
    const completed = teamData.filter(i => COMPLETED_STATES.includes(i.state));
    const totalCompleted = completed.length;
    const cycleTimes = completed.filter(i => i.cycleTime != null && (i.cycleTime as number) > 0).map(i => i.cycleTime as number);
    const leadTimes = completed.filter(i => i.leadTime != null && (i.leadTime as number) > 0).map(i => i.leadTime as number);
    const bugs = completed.filter(i => i.type === 'Bug').length;

    const weeks = Math.max(periodDays / 7, 1);
    const throughputPerWeek = Math.round((totalCompleted / weeks) * 10) / 10;
    const avgCT = cycleTimes.length > 0 ? Math.round((cycleTimes.reduce((a, b) => a + b, 0) / cycleTimes.length) * 10) / 10 : 0;
    const avgLT = leadTimes.length > 0 ? Math.round((leadTimes.reduce((a, b) => a + b, 0) / leadTimes.length) * 10) / 10 : 0;
    const bugRate = totalCompleted > 0 ? Math.round((bugs / totalCompleted) * 1000) / 10 : 0;

    return { throughput: throughputPerWeek, cycleTime: avgCT, leadTime: avgLT, bugRate };
  }, [teamData, periodDays]);

  // Trend (last 4 weeks vs previous 4 weeks)
  const trend = useMemo(() => {
    if (weeklyMetrics.length < 8) return null;
    const recent = weeklyMetrics.slice(-4);
    const previous = weeklyMetrics.slice(-8, -4);

    const avg = (arr: number[]) => arr.length > 0 ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;

    return {
      throughput: avg(recent.map(w => w.throughput)) - avg(previous.map(w => w.throughput)),
      cycleTime: avg(recent.map(w => w.cycleTime)) - avg(previous.map(w => w.cycleTime)),
      leadTime: avg(recent.map(w => w.leadTime)) - avg(previous.map(w => w.leadTime)),
      bugRate: avg(recent.map(w => w.bugRate)) - avg(previous.map(w => w.bugRate)),
    };
  }, [weeklyMetrics]);

  // Calculate progress for each metric
  const calcProgress = (current: number, target: number, lowerIsBetter: boolean): { pct: number; gap: string; color: string; status: string } => {
    if (target === 0) return { pct: 0, gap: 'Meta não definida', color: 'text-ds-text', status: '-' };

    let pct: number;
    if (lowerIsBetter) {
      // Ex: CT=5 dias, meta=7 dias → 7/5 = 140% (melhor que a meta)
      // Ex: CT=10 dias, meta=7 dias → 7/10 = 70%
      pct = current > 0 ? Math.round((target / current) * 100) : 100;
    } else {
      // Ex: throughput=8, meta=10 → 8/10 = 80%
      pct = Math.round((current / target) * 100);
    }

    pct = Math.min(pct, 150); // cap at 150%

    let gap: string;
    if (lowerIsBetter) {
      const diff = current - target;
      gap = diff <= 0 ? `✅ ${Math.abs(diff).toFixed(1)} abaixo da meta` : `⚠️ ${diff.toFixed(1)} acima da meta`;
    } else {
      const diff = target - current;
      gap = diff <= 0 ? `✅ ${Math.abs(diff).toFixed(1)} acima da meta` : `⚠️ Faltam ${diff.toFixed(1)} para a meta`;
    }

    const color = pct >= 100 ? 'text-green-400' : pct >= 70 ? 'text-yellow-400' : 'text-red-400';
    const status = pct >= 100 ? 'Atingida' : pct >= 70 ? 'Próximo' : 'Distante';

    return { pct, gap, color, status };
  };

  const metrics = [
    {
      key: 'throughput' as const,
      label: 'Throughput',
      unit: 'itens/semana',
      icon: '📦',
      current: currentMetrics.throughput,
      target: currentTargets.throughput,
      lowerIsBetter: false,
      description: 'Quantidade de itens entregues por semana',
    },
    {
      key: 'cycleTime' as const,
      label: 'Cycle Time',
      unit: 'dias',
      icon: '⏱️',
      current: currentMetrics.cycleTime,
      target: currentTargets.cycleTime,
      lowerIsBetter: true,
      description: 'Tempo médio entre início e conclusão',
    },
    {
      key: 'leadTime' as const,
      label: 'Lead Time',
      unit: 'dias',
      icon: '📅',
      current: currentMetrics.leadTime,
      target: currentTargets.leadTime,
      lowerIsBetter: true,
      description: 'Tempo médio entre criação e conclusão',
    },
    {
      key: 'bugRate' as const,
      label: 'Taxa de Defeito',
      unit: '%',
      icon: '🐛',
      current: currentMetrics.bugRate,
      target: currentTargets.bugRate,
      lowerIsBetter: true,
      description: '% de bugs sobre total de entregas',
    },
  ];

  // Projection: at current weekly rate, what will be the total at end of period
  const projection = useMemo(() => {
    if (weeklyMetrics.length < 4) return null;
    const last4 = weeklyMetrics.slice(-4);
    const avgThroughput = last4.reduce((s, w) => s + w.throughput, 0) / 4;
    const remainingWeeks = Math.max((periodDays - 84) / 7, 0); // weeks left beyond 12 already measured
    const projectedTotal = Math.round(weeklyMetrics.reduce((s, w) => s + w.throughput, 0) + avgThroughput * remainingWeeks);
    return {
      weeklyRate: Math.round(avgThroughput * 10) / 10,
      projectedTotal,
      weeksLeft: Math.round(remainingWeeks),
    };
  }, [weeklyMetrics, periodDays]);

  return (
    <div className="space-y-6">
      {/* Header: Team selector + Edit targets */}
      <div className="flex flex-wrap items-center gap-4">
        <div>
          <label className="text-ds-text text-xs block mb-1">Time</label>
          <select
            value={selectedTeam}
            onChange={(e) => setSelectedTeam(e.target.value)}
            className="bg-ds-navy border border-ds-border rounded-lg px-3 py-2 text-sm text-ds-light-text focus:border-ds-green focus:outline-none"
          >
            {teams.map(t => (
              <option key={t} value={t}>{t === '__all__' ? 'Todos os Times' : t}</option>
            ))}
          </select>
        </div>
        <button
          onClick={() => setEditingTargets(!editingTargets)}
          className={`mt-5 px-4 py-2 text-sm rounded-lg transition-colors ${editingTargets ? 'bg-red-600/30 text-red-300 border border-red-600' : 'bg-ds-green/20 text-ds-green border border-ds-green/40 hover:bg-ds-green/30'}`}
        >
          {editingTargets ? '✕ Cancelar' : '🎯 Configurar Metas'}
        </button>
        {editingTargets && (
          <button
            onClick={handleSaveTargets}
            className="mt-5 px-4 py-2 text-sm rounded-lg bg-ds-green text-ds-bg font-semibold hover:bg-ds-green/80 transition-colors"
          >
            💾 Salvar Metas
          </button>
        )}
        <div className="mt-5 text-xs text-ds-text ml-auto">
          Metas para: <strong className="text-ds-light-text">{teamLabel}</strong> · Período: <strong className="text-ds-light-text">{periodDays} dias</strong>
        </div>
      </div>

      {/* Target editing panel */}
      {editingTargets && (
        <div className="bg-ds-navy p-4 rounded-lg border-2 border-ds-green/40 animate-pulse-once">
          <h3 className="text-ds-light-text font-bold text-sm mb-3">🎯 Definir Metas para {teamLabel}</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {metrics.map(m => (
              <div key={m.key}>
                <label className="text-ds-text text-xs block mb-1">{m.icon} {m.label} ({m.unit})</label>
                <input
                  type="number"
                  step="0.1"
                  min="0"
                  value={tempTargets[m.key]}
                  onChange={(e) => setTempTargets(prev => ({ ...prev, [m.key]: parseFloat(e.target.value) || 0 }))}
                  className="w-full bg-ds-bg border border-ds-border rounded px-3 py-2 text-sm text-ds-light-text focus:border-ds-green focus:outline-none"
                />
                <p className="text-ds-text text-xs mt-1">{m.lowerIsBetter ? '↓ Quanto menor, melhor' : '↑ Quanto maior, melhor'}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Metric Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {metrics.map(m => {
          const progress = calcProgress(m.current, m.target, m.lowerIsBetter);
          const trendVal = trend ? trend[m.key] : 0;
          const trendIsGood = m.lowerIsBetter ? trendVal < 0 : trendVal > 0;
          const trendText = trendVal === 0 ? 'Estável' :
            `${trendVal > 0 ? '▲' : '▼'} ${Math.abs(trendVal).toFixed(1)} ${m.unit}`;

          return (
            <div key={m.key} className="bg-ds-navy p-5 rounded-lg border border-ds-border relative overflow-hidden">
              {/* Background progress indicator */}
              <div
                className={`absolute bottom-0 left-0 h-1 transition-all duration-500 ${progress.pct >= 100 ? 'bg-green-500' : progress.pct >= 70 ? 'bg-yellow-500' : 'bg-red-500'}`}
                style={{ width: `${Math.min(progress.pct, 100)}%` }}
              />

              <div className="flex items-start justify-between mb-2">
                <div>
                  <p className="text-ds-text text-xs">{m.icon} {m.label}</p>
                  <p className={`text-3xl font-bold ${progress.color}`}>
                    {m.current}
                    <span className="text-sm font-normal text-ds-text ml-1">{m.unit}</span>
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-ds-text text-xs">Meta</p>
                  <p className="text-lg font-semibold text-ds-light-text">{m.target} <span className="text-xs font-normal">{m.unit}</span></p>
                </div>
              </div>

              {/* Progress bar */}
              <div className="w-full bg-ds-bg rounded-full h-2.5 mb-2">
                <div
                  className={`h-2.5 rounded-full transition-all duration-500 ${progress.pct >= 100 ? 'bg-green-500' : progress.pct >= 70 ? 'bg-yellow-500' : 'bg-red-500'}`}
                  style={{ width: `${Math.min(progress.pct, 100)}%` }}
                />
              </div>

              <div className="flex items-center justify-between text-xs">
                <span className={progress.color}>{progress.pct}% · {progress.status}</span>
                {trend && (
                  <span className={trendIsGood ? 'text-green-400' : trendVal === 0 ? 'text-ds-text' : 'text-red-400'}>
                    {trendText}
                  </span>
                )}
              </div>
              <p className="text-ds-text text-xs mt-1">{progress.gap}</p>
            </div>
          );
        })}
      </div>

      {/* Weekly Trends */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {metrics.map(m => (
          <div key={m.key} className="bg-ds-navy p-4 rounded-lg border border-ds-border">
            <h3 className="text-ds-light-text font-bold text-sm mb-3">
              {m.icon} {m.label} — Tendência Semanal
            </h3>
            <ResponsiveContainer width="100%" height={200}>
              <LineChart data={weeklyMetrics}>
                <CartesianGrid strokeDasharray="3 3" stroke={CHART_COLORS.grid} />
                <XAxis dataKey="week" stroke={CHART_COLORS.text} tick={{ fontSize: 10 }} />
                <YAxis stroke={CHART_COLORS.text} tick={{ fontSize: 10 }} />
                <Tooltip
                  contentStyle={{ backgroundColor: CHART_COLORS.tooltipBg, border: 'none', borderRadius: '8px', color: '#E2E8F0' }}
                  formatter={(value: number) => [
                    `${value} ${m.unit}`,
                    m.label
                  ]}
                />
                <Line
                  type="monotone"
                  dataKey={m.key}
                  stroke={m.lowerIsBetter ? '#47C5FB' : '#64FFDA'}
                  strokeWidth={2}
                  dot={{ r: 3 }}
                  activeDot={{ r: 5 }}
                />
                <ReferenceLine
                  y={currentTargets[m.key]}
                  stroke="#FFB86C"
                  strokeDasharray="5 5"
                  label={{ value: `Meta: ${currentTargets[m.key]}`, position: 'insideTopRight', fill: '#FFB86C', fontSize: 10 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        ))}
      </div>

      {/* Projection Card */}
      {projection && (
        <div className="bg-ds-navy p-4 rounded-lg border border-ds-border">
          <h3 className="text-ds-light-text font-bold text-lg mb-3">🔮 Projeção de Entregas</h3>
          <ChartInfoLamp info="Projeção baseada no ritmo das últimas 4 semanas: indica se o time atingirá a meta de throughput no período restante." />
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="text-center p-4 bg-ds-bg rounded-lg">
              <p className="text-ds-text text-xs">Ritmo Atual</p>
              <p className="text-2xl font-bold text-ds-green">{projection.weeklyRate}</p>
              <p className="text-ds-text text-xs">itens/semana (últ. 4 sem)</p>
            </div>
            <div className="text-center p-4 bg-ds-bg rounded-lg">
              <p className="text-ds-text text-xs">Meta Semanal</p>
              <p className="text-2xl font-bold text-ds-light-text">{currentTargets.throughput}</p>
              <p className="text-ds-text text-xs">itens/semana</p>
            </div>
            <div className="text-center p-4 bg-ds-bg rounded-lg">
              <p className="text-ds-text text-xs">Para atingir a meta</p>
              <p className={`text-2xl font-bold ${projection.weeklyRate >= currentTargets.throughput ? 'text-green-400' : 'text-red-400'}`}>
                {projection.weeklyRate >= currentTargets.throughput
                  ? '✅ No ritmo!'
                  : `+${(currentTargets.throughput - projection.weeklyRate).toFixed(1)}/sem`
                }
              </p>
              <p className="text-ds-text text-xs">
                {projection.weeklyRate >= currentTargets.throughput
                  ? 'O time está entregando acima da meta'
                  : `Precisa de mais ${(currentTargets.throughput - projection.weeklyRate).toFixed(1)} itens/semana`
                }
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Summary Table: All teams comparison */}
      {selectedTeam === '__all__' && (() => {
        const teamNames = [...new Set(data.map(i => i.team).filter(Boolean) as string[])].sort();
        const teamComparison = teamNames.map(team => {
          const items = data.filter(i => i.team === team);
          const completed = items.filter(i => COMPLETED_STATES.includes(i.state));
          const weeks = Math.max(periodDays / 7, 1);
          const tp = Math.round((completed.length / weeks) * 10) / 10;
          const cts = completed.filter(i => i.cycleTime != null && (i.cycleTime as number) > 0).map(i => i.cycleTime as number);
          const lts = completed.filter(i => i.leadTime != null && (i.leadTime as number) > 0).map(i => i.leadTime as number);
          const bugs = completed.filter(i => i.type === 'Bug').length;
          const ct = cts.length > 0 ? Math.round((cts.reduce((a, b) => a + b, 0) / cts.length) * 10) / 10 : 0;
          const lt = lts.length > 0 ? Math.round((lts.reduce((a, b) => a + b, 0) / lts.length) * 10) / 10 : 0;
          const br = completed.length > 0 ? Math.round((bugs / completed.length) * 1000) / 10 : 0;
          const teamTarget = targets[team] || DEFAULT_TARGETS;
          return { team, throughput: tp, cycleTime: ct, leadTime: lt, bugRate: br, targets: teamTarget, total: completed.length };
        });

        return (
          <div className="bg-ds-navy p-4 rounded-lg border border-ds-border">
            <h3 className="text-ds-light-text font-bold text-lg mb-3">📊 Comparativo de Metas por Time</h3>
            <ChartInfoLamp info="Tabela comparativa de todas as métricas vs. metas por time, com score geral. Verde = meta atingida, vermelho = abaixo da meta." />
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-ds-text">
                <thead>
                  <tr className="border-b border-ds-border text-left">
                    <th className="px-3 py-2 text-ds-light-text">Time</th>
                    <th className="px-3 py-2 text-center">Throughput</th>
                    <th className="px-3 py-2 text-center">Cycle Time</th>
                    <th className="px-3 py-2 text-center">Lead Time</th>
                    <th className="px-3 py-2 text-center">Bug Rate</th>
                    <th className="px-3 py-2 text-center">Score Geral</th>
                  </tr>
                </thead>
                <tbody>
                  {teamComparison.map(tc => {
                    const pTP = calcProgress(tc.throughput, tc.targets.throughput, false);
                    const pCT = calcProgress(tc.cycleTime, tc.targets.cycleTime, true);
                    const pLT = calcProgress(tc.leadTime, tc.targets.leadTime, true);
                    const pBR = calcProgress(tc.bugRate, tc.targets.bugRate, true);
                    const score = Math.round((pTP.pct + pCT.pct + pLT.pct + pBR.pct) / 4);
                    const scoreColor = score >= 100 ? 'text-green-400' : score >= 70 ? 'text-yellow-400' : 'text-red-400';

                    const renderCell = (current: number, target: number, pct: number, color: string, unit: string) => (
                      <td className="px-3 py-2 text-center">
                        <span className={color + ' font-semibold'}>{current}</span>
                        <span className="text-ds-text text-xs"> / {target} {unit}</span>
                        <div className="w-full bg-ds-bg rounded-full h-1.5 mt-1">
                          <div className={`h-1.5 rounded-full ${pct >= 100 ? 'bg-green-500' : pct >= 70 ? 'bg-yellow-500' : 'bg-red-500'}`}
                            style={{ width: `${Math.min(pct, 100)}%` }} />
                        </div>
                      </td>
                    );

                    return (
                      <tr key={tc.team} className="border-b border-ds-border/50 hover:bg-ds-muted/20">
                        <td className="px-3 py-2 text-ds-light-text font-medium">{tc.team} <span className="text-ds-text text-xs">({tc.total})</span></td>
                        {renderCell(tc.throughput, tc.targets.throughput, pTP.pct, pTP.color, '/sem')}
                        {renderCell(tc.cycleTime, tc.targets.cycleTime, pCT.pct, pCT.color, 'd')}
                        {renderCell(tc.leadTime, tc.targets.leadTime, pLT.pct, pLT.color, 'd')}
                        {renderCell(tc.bugRate, tc.targets.bugRate, pBR.pct, pBR.color, '%')}
                        <td className="px-3 py-2 text-center">
                          <span className={`${scoreColor} font-bold text-lg`}>{score}%</span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        );
      })()}

      {/* Info */}
      <div className="bg-ds-navy/50 p-4 rounded-lg border border-ds-border/50">
        <h4 className="text-ds-light-text font-semibold mb-2">📚 Como funciona</h4>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-xs text-ds-text">
          <p><strong className="text-ds-green">Throughput:</strong> Itens concluídos/semana no período. Meta = piso mínimo desejado.</p>
          <p><strong className="text-blue-400">Cycle Time:</strong> Tempo médio de conclusão (início→done). Meta = teto máximo aceitável.</p>
          <p><strong className="text-blue-400">Lead Time:</strong> Tempo desde criação até conclusão. Meta = teto máximo aceitável.</p>
          <p><strong className="text-red-400">Taxa de Defeito:</strong> % de bugs sobre total entregue. Meta = teto máximo tolerado.</p>
          <p className="md:col-span-2"><strong className="text-yellow-400">Projeção:</strong> Baseada nas últimas 4 semanas de throughput real. As metas são salvas por time no navegador (localStorage).</p>
        </div>
      </div>
    </div>
  );
};

export default MetasDashboard;
