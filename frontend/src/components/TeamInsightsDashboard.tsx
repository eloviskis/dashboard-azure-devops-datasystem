import React, { useState, useMemo } from 'react';
import { WorkItem } from '../types';
import { CHART_COLORS } from '../constants';
import {
  ResponsiveContainer, RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
  BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, Cell, Legend
} from 'recharts';
import { subMonths, isWithinInterval, startOfMonth, endOfMonth, format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface TeamInsightsDashboardProps {
  data: WorkItem[];
}

const COMPLETED_STATES = ['Done', 'Concluído', 'Closed', 'Fechado', 'Finished', 'Resolved', 'Pronto'];
const BUG_TYPES = ['Bug'];
const ISSUE_TYPES = ['Issue'];

type InsightPeriod = '30' | '60' | '90' | 'specific-month' | 'custom';

const TeamInsightsDashboard: React.FC<TeamInsightsDashboardProps> = ({ data }) => {
  const [selectedTeam, setSelectedTeam] = useState<string>('');
  const [periodType, setPeriodType] = useState<InsightPeriod>('90');
  const [selectedMonth, setSelectedMonth] = useState<string>('');
  const [customStart, setCustomStart] = useState<string>('');
  const [customEnd, setCustomEnd] = useState<string>('');

  const teams = useMemo(() => {
    return [...new Set(data.map(i => i.team).filter(Boolean) as string[])].sort();
  }, [data]);

  const lastMonths = useMemo(() => {
    const months: { value: string; label: string }[] = [];
    const now = new Date();
    for (let i = 0; i < 12; i++) {
      const d = subMonths(now, i);
      const val = format(d, 'yyyy-MM');
      const label = format(d, 'MMMM yyyy', { locale: ptBR });
      months.push({ value: val, label: label.charAt(0).toUpperCase() + label.slice(1) });
    }
    return months;
  }, []);

  const dateRange = useMemo(() => {
    const now = new Date();
    if (periodType === 'specific-month' && selectedMonth) {
      const [year, month] = selectedMonth.split('-').map(Number);
      return { start: startOfMonth(new Date(year, month - 1)), end: endOfMonth(new Date(year, month - 1)) };
    }
    if (periodType === 'custom' && customStart && customEnd) {
      return { start: new Date(customStart), end: new Date(customEnd) };
    }
    const days = parseInt(periodType) || 90;
    return { start: new Date(now.getTime() - days * 24 * 60 * 60 * 1000), end: now };
  }, [periodType, selectedMonth, customStart, customEnd]);

  // Compute team stats
  const teamStats = useMemo(() => {
    const stats: Record<string, {
      completed: number; total: number; bugs: number; issues: number;
      cycleTimes: number[]; leadTimes: number[];
      throughput: number; members: Set<string>;
    }> = {};

    const filteredByDate = data.filter(item => {
      const d = new Date(item.createdDate || '');
      return isWithinInterval(d, { start: dateRange.start, end: dateRange.end });
    });

    filteredByDate.forEach(item => {
      const team = item.team || 'Sem Time';
      if (!stats[team]) {
        stats[team] = { completed: 0, total: 0, bugs: 0, issues: 0, cycleTimes: [], leadTimes: [], throughput: 0, members: new Set() };
      }
      stats[team].total++;
      if (item.assignedTo) stats[team].members.add(item.assignedTo);
      if (COMPLETED_STATES.includes(item.state)) {
        stats[team].completed++;
        stats[team].throughput++;
        if (item.cycleTime != null) stats[team].cycleTimes.push(item.cycleTime as number);
        if (item.leadTime != null) stats[team].leadTimes.push(item.leadTime as number);
      }
      if (BUG_TYPES.includes(item.type)) stats[team].bugs++;
      if (ISSUE_TYPES.includes(item.type)) stats[team].issues++;
    });

    return Object.entries(stats).map(([team, s]) => {
      const avgCT = s.cycleTimes.length > 0 ? s.cycleTimes.reduce((a, b) => a + b, 0) / s.cycleTimes.length : 0;
      const avgLT = s.leadTimes.length > 0 ? s.leadTimes.reduce((a, b) => a + b, 0) / s.leadTimes.length : 0;
      const completionRate = s.total > 0 ? (s.completed / s.total) * 100 : 0;
      const bugRate = s.total > 0 ? ((s.bugs + s.issues) / s.total) * 100 : 0;
      return {
        team,
        completed: s.completed,
        total: s.total,
        avgCycleTime: Math.round(avgCT * 10) / 10,
        avgLeadTime: Math.round(avgLT * 10) / 10,
        throughput: s.throughput,
        completionRate: Math.round(completionRate * 10) / 10,
        bugRate: Math.round(bugRate * 10) / 10,
        members: s.members.size,
        bugs: s.bugs,
        issues: s.issues,
      };
    }).sort((a, b) => b.throughput - a.throughput);
  }, [data, dateRange]);

  // Global averages
  const globalAvg = useMemo(() => {
    if (teamStats.length === 0) return { avgCT: 0, throughput: 0, completionRate: 0, bugRate: 0 };
    const avgCT = teamStats.reduce((a, t) => a + t.avgCycleTime, 0) / teamStats.length;
    const throughput = teamStats.reduce((a, t) => a + t.throughput, 0) / teamStats.length;
    const completionRate = teamStats.reduce((a, t) => a + t.completionRate, 0) / teamStats.length;
    const bugRate = teamStats.reduce((a, t) => a + t.bugRate, 0) / teamStats.length;
    return { avgCT: Math.round(avgCT * 10) / 10, throughput: Math.round(throughput), completionRate: Math.round(completionRate * 10) / 10, bugRate: Math.round(bugRate * 10) / 10 };
  }, [teamStats]);

  const selectedStats = useMemo(() => teamStats.find(t => t.team === selectedTeam), [teamStats, selectedTeam]);

  // Team Score (0-100)
  const teamScore = useMemo(() => {
    if (!selectedStats || teamStats.length === 0) return null;
    
    const maxTP = Math.max(...teamStats.map(t => t.throughput), 1);
    const maxCT = Math.max(...teamStats.map(t => t.avgCycleTime), 1);
    
    const tpScore = (selectedStats.throughput / maxTP) * 100;
    const completionScore = selectedStats.completionRate;
    const ctScore = Math.max(0, 100 - (selectedStats.avgCycleTime / maxCT) * 100);
    const qualityScore = Math.max(0, 100 - selectedStats.bugRate);
    const perCapita = selectedStats.throughput / (selectedStats.members || 1);
    const maxPerCapita = Math.max(...teamStats.map(t => t.throughput / (t.members || 1)), 1);
    const velocityScore = (perCapita / maxPerCapita) * 100;
    
    const total = Math.round((tpScore * 0.25 + completionScore * 0.2 + ctScore * 0.25 + qualityScore * 0.15 + velocityScore * 0.15));
    
    const strengths: string[] = [];
    const weaknesses: string[] = [];
    
    if (tpScore >= 70) strengths.push('Throughput alto');
    else if (tpScore < 40) weaknesses.push('Throughput baixo');
    
    if (completionScore >= 70) strengths.push('Taxa de conclusão excelente');
    else if (completionScore < 40) weaknesses.push('Taxa de conclusão baixa');
    
    if (ctScore >= 70) strengths.push('Cycle Time rápido');
    else if (ctScore < 40) weaknesses.push('Cycle Time lento');
    
    if (qualityScore >= 80) strengths.push('Qualidade alta');
    else if (qualityScore < 60) weaknesses.push('Taxa de bugs elevada');
    
    if (velocityScore >= 70) strengths.push('Produtividade individual alta');
    else if (velocityScore < 40) weaknesses.push('Produtividade individual baixa');
    
    return { total, strengths, weaknesses };
  }, [selectedStats, teamStats]);

  // Radar data (normalized 0-100)
  const radarData = useMemo(() => {
    if (!selectedStats || teamStats.length === 0) return [];
    const maxValues = {
      throughput: Math.max(...teamStats.map(t => t.throughput), 1),
      completionRate: 100,
      cycleTime: Math.max(...teamStats.map(t => t.avgCycleTime), 1),
      quality: 100,
      velocity: Math.max(...teamStats.map(t => t.throughput / (t.members || 1)), 1),
    };

    const teamVelocity = selectedStats.throughput / (selectedStats.members || 1);
    const globalVelocity = globalAvg.throughput / (teamStats.reduce((a, t) => a + t.members, 0) / teamStats.length || 1);

    return [
      { metric: 'Throughput', team: Math.round((selectedStats.throughput / maxValues.throughput) * 100), global: Math.round((globalAvg.throughput / maxValues.throughput) * 100) },
      { metric: 'Conclusão', team: Math.round(selectedStats.completionRate), global: Math.round(globalAvg.completionRate) },
      { metric: 'Velocidade CT', team: Math.round(Math.max(0, 100 - (selectedStats.avgCycleTime / maxValues.cycleTime) * 100)), global: Math.round(Math.max(0, 100 - (globalAvg.avgCT / maxValues.cycleTime) * 100)) },
      { metric: 'Qualidade', team: Math.round(Math.max(0, 100 - selectedStats.bugRate)), global: Math.round(Math.max(0, 100 - globalAvg.bugRate)) },
      { metric: 'Vel. Individual', team: Math.round((teamVelocity / maxValues.velocity) * 100), global: Math.round((globalVelocity / maxValues.velocity) * 100) },
    ];
  }, [selectedStats, teamStats, globalAvg]);

  // Generate insights
  const insights = useMemo(() => {
    if (!selectedStats) return [];
    const result: { icon: string; text: string; type: 'strength' | 'improvement' | 'risk' }[] = [];

    // Throughput ranking
    const tpRank = teamStats.sort((a, b) => b.throughput - a.throughput).findIndex(t => t.team === selectedTeam) + 1;
    if (tpRank <= 3) result.push({ icon: '🏆', text: `${tpRank}º em throughput com ${selectedStats.throughput} entregas no período.`, type: 'strength' });
    else result.push({ icon: '📈', text: `${tpRank}º em throughput (${selectedStats.throughput} entregas). Busque aumentar a vazão.`, type: 'improvement' });

    // Cycle time comparison
    if (selectedStats.avgCycleTime < globalAvg.avgCT * 0.8) {
      result.push({ icon: '🚀', text: `Cycle Time ${Math.round(((globalAvg.avgCT - selectedStats.avgCycleTime) / globalAvg.avgCT) * 100)}% melhor que a média global.`, type: 'strength' });
    } else if (selectedStats.avgCycleTime > globalAvg.avgCT * 1.2) {
      result.push({ icon: '⏱️', text: `Cycle Time ${Math.round(((selectedStats.avgCycleTime - globalAvg.avgCT) / globalAvg.avgCT) * 100)}% acima da média. Revise gargalos.`, type: 'risk' });
    }

    // Bug rate
    if (selectedStats.bugRate > globalAvg.bugRate * 1.3) {
      result.push({ icon: '🐛', text: `Taxa de bugs/issues ${Math.round(selectedStats.bugRate)}% está acima da média (${globalAvg.bugRate}%). Invista em qualidade.`, type: 'risk' });
    } else if (selectedStats.bugRate < globalAvg.bugRate * 0.7) {
      result.push({ icon: '✅', text: `Baixa taxa de bugs/issues (${Math.round(selectedStats.bugRate)}%). Excelente qualidade!`, type: 'strength' });
    }

    // Completion rate
    if (selectedStats.completionRate > 70) {
      result.push({ icon: '🎯', text: `Taxa de conclusão alta: ${selectedStats.completionRate}%. Time focado na entrega.`, type: 'strength' });
    } else if (selectedStats.completionRate < 40) {
      result.push({ icon: '📋', text: `Taxa de conclusão baixa: ${selectedStats.completionRate}%. Muitos itens podem estar parados.`, type: 'improvement' });
    }

    // Team size efficiency
    if (selectedStats.members > 0) {
      const perCapita = selectedStats.throughput / selectedStats.members;
      const globalPerCapita = globalAvg.throughput / (teamStats.reduce((a, t) => a + t.members, 0) / teamStats.length || 1);
      if (perCapita > globalPerCapita * 1.2) {
        result.push({ icon: '💪', text: `Produtividade per capita acima da média (${perCapita.toFixed(1)} vs ${globalPerCapita.toFixed(1)} entregas/pessoa).`, type: 'strength' });
      }
    }

    return result;
  }, [selectedStats, selectedTeam, teamStats, globalAvg]);

  return (
    <div className="space-y-6">
      {/* Filters */}
      <div className="bg-ds-navy p-4 rounded-lg border border-ds-border">
        <div className="flex flex-wrap items-center gap-4">
          <div>
            <label className="text-ds-text text-sm mb-1 block">Time:</label>
            <select
              value={selectedTeam}
              onChange={e => setSelectedTeam(e.target.value)}
              className="bg-ds-navy border border-ds-border text-ds-light-text text-sm rounded-md p-2 min-w-[200px]"
            >
              <option value="">Selecione um Time...</option>
              {teams.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>

          <div>
            <label className="text-ds-text text-sm mb-1 block">Período:</label>
            <div className="flex gap-1">
              {[
                { value: '30', label: 'Último Mês' },
                { value: '60', label: 'Últimos 2 Meses' },
                { value: '90', label: 'Últimos 3 Meses' },
                { value: 'specific-month', label: 'Mês Específico' },
                { value: 'custom', label: 'Personalizado' },
              ].map(opt => (
                <button
                  key={opt.value}
                  onClick={() => setPeriodType(opt.value as InsightPeriod)}
                  className={`px-3 py-1.5 text-xs rounded-md font-medium transition-colors ${periodType === opt.value ? 'bg-ds-green text-ds-dark-blue' : 'bg-ds-muted/20 text-ds-text hover:bg-ds-muted/40'}`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {periodType === 'specific-month' && (
            <div>
              <label className="text-ds-text text-sm mb-1 block">Mês:</label>
              <select value={selectedMonth} onChange={e => setSelectedMonth(e.target.value)} className="bg-ds-navy border border-ds-border text-ds-light-text text-sm rounded-md p-2">
                <option value="">Selecione...</option>
                {lastMonths.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
              </select>
            </div>
          )}

          {periodType === 'custom' && (
            <div className="flex gap-2 items-end">
              <div>
                <label className="text-ds-text text-sm mb-1 block">De:</label>
                <input type="date" value={customStart} onChange={e => setCustomStart(e.target.value)} className="bg-ds-navy border border-ds-border text-ds-light-text text-sm rounded-md p-2" />
              </div>
              <div>
                <label className="text-ds-text text-sm mb-1 block">Até:</label>
                <input type="date" value={customEnd} onChange={e => setCustomEnd(e.target.value)} className="bg-ds-navy border border-ds-border text-ds-light-text text-sm rounded-md p-2" />
              </div>
            </div>
          )}
        </div>
      </div>

      {!selectedTeam ? (
        <div className="bg-ds-navy p-8 rounded-lg border border-ds-border text-center">
          <p className="text-ds-text text-lg">👆 Selecione um time acima para ver os insights</p>
          <p className="text-ds-text text-sm mt-2">O relatório será gerado com base nos dados de todas as abas do dashboard.</p>
        </div>
      ) : selectedStats ? (
        <>
          {/* Rankings */}
          {/* Team Score */}
          {teamScore && (
            <div className="bg-ds-navy p-6 rounded-lg border border-ds-border">
              <div className="flex flex-wrap items-center gap-8">
                <div className="text-center">
                  <p className="text-ds-text text-sm mb-2">Score Geral do Time</p>
                  <div className={`text-5xl font-bold ${teamScore.total >= 70 ? 'text-green-400' : teamScore.total >= 50 ? 'text-yellow-400' : 'text-red-400'}`}>
                    {teamScore.total}
                    <span className="text-lg text-ds-text"> / 100</span>
                  </div>
                  <div className="w-full bg-ds-border rounded-full h-3 mt-3">
                    <div
                      className={`h-3 rounded-full transition-all ${teamScore.total >= 70 ? 'bg-green-400' : teamScore.total >= 50 ? 'bg-yellow-400' : 'bg-red-400'}`}
                      style={{ width: `${teamScore.total}%` }}
                    />
                  </div>
                </div>
                <div className="flex-1 grid grid-cols-1 md:grid-cols-2 gap-3">
                  {teamScore.strengths.length > 0 && (
                    <div>
                      <p className="text-green-400 text-sm font-semibold mb-1">🟢 Pontos Fortes</p>
                      {teamScore.strengths.map((s, i) => (
                        <p key={i} className="text-green-300 text-xs">• {s}</p>
                      ))}
                    </div>
                  )}
                  {teamScore.weaknesses.length > 0 && (
                    <div>
                      <p className="text-red-400 text-sm font-semibold mb-1">🔴 Pontos Fracos</p>
                      {teamScore.weaknesses.map((s, i) => (
                        <p key={i} className="text-red-300 text-xs">• {s}</p>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Rankings */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[
              { label: 'Ranking Throughput', value: `${teamStats.sort((a, b) => b.throughput - a.throughput).findIndex(t => t.team === selectedTeam) + 1}º`, sub: `${selectedStats.throughput} entregas` },
              { label: 'Ranking Cycle Time', value: `${[...teamStats].sort((a, b) => a.avgCycleTime - b.avgCycleTime).findIndex(t => t.team === selectedTeam) + 1}º`, sub: `${selectedStats.avgCycleTime} dias` },
              { label: 'Ranking Qualidade', value: `${[...teamStats].sort((a, b) => a.bugRate - b.bugRate).findIndex(t => t.team === selectedTeam) + 1}º`, sub: `${selectedStats.bugRate}% bugs/issues` },
              { label: 'Membros Ativos', value: `${selectedStats.members}`, sub: `${(selectedStats.throughput / (selectedStats.members || 1)).toFixed(1)} entregas/pessoa` },
            ].map((card, i) => (
              <div key={i} className="bg-ds-navy p-4 rounded-lg border border-ds-border text-center">
                <p className="text-ds-text text-xs">{card.label}</p>
                <p className="text-2xl font-bold text-ds-green">{card.value}</p>
                <p className="text-ds-text text-xs mt-1">{card.sub}</p>
              </div>
            ))}
          </div>

          {/* Metrics comparison */}
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
            {[
              { label: 'Throughput', team: selectedStats.throughput, global: globalAvg.throughput, unit: '' },
              { label: 'Cycle Time', team: selectedStats.avgCycleTime, global: globalAvg.avgCT, unit: 'dias', inverse: true },
              { label: 'Lead Time', team: selectedStats.avgLeadTime, global: 0, unit: 'dias' },
              { label: 'Conclusão', team: selectedStats.completionRate, global: globalAvg.completionRate, unit: '%' },
              { label: 'Bugs/Issues', team: selectedStats.bugRate, global: globalAvg.bugRate, unit: '%', inverse: true },
              { label: 'Total Itens', team: selectedStats.total, global: 0, unit: '' },
            ].map((m, i) => {
              const isGood = m.inverse ? m.team < m.global : m.team > m.global;
              return (
                <div key={i} className="bg-ds-navy p-3 rounded-lg border border-ds-border text-center">
                  <p className="text-ds-text text-xs">{m.label}</p>
                  <p className={`text-xl font-bold ${m.global > 0 ? (isGood ? 'text-green-400' : 'text-red-400') : 'text-ds-light-text'}`}>
                    {m.team} <span className="text-xs font-normal">{m.unit}</span>
                  </p>
                  {m.global > 0 && (
                    <p className="text-ds-text text-xs">Média: {m.global} {m.unit}</p>
                  )}
                </div>
              );
            })}
          </div>

          {/* Radar Chart */}
          <div className="bg-ds-navy p-4 rounded-lg border border-ds-border">
            <h3 className="text-ds-light-text font-bold text-lg mb-4">📊 Comparativo com Média Global</h3>
            <ResponsiveContainer width="100%" height={350}>
              <RadarChart data={radarData}>
                <PolarGrid stroke={CHART_COLORS.grid} />
                <PolarAngleAxis dataKey="metric" tick={{ fill: CHART_COLORS.text, fontSize: 12 }} />
                <PolarRadiusAxis angle={90} domain={[0, 100]} tick={{ fill: CHART_COLORS.text, fontSize: 10 }} />
                <Radar name={selectedTeam} dataKey="team" stroke={CHART_COLORS.primary} fill={CHART_COLORS.primary} fillOpacity={0.3} />
                <Radar name="Média Global" dataKey="global" stroke="#60A5FA" fill="#60A5FA" fillOpacity={0.1} />
                <Legend />
                <Tooltip contentStyle={{ backgroundColor: CHART_COLORS.tooltipBg, border: 'none', borderRadius: '8px', color: '#E2E8F0' }} />
              </RadarChart>
            </ResponsiveContainer>
          </div>

          {/* Insights */}
          <div className="bg-ds-navy p-4 rounded-lg border border-ds-border">
            <h3 className="text-ds-light-text font-bold text-lg mb-3">💡 Insights e Recomendações</h3>
            <div className="space-y-2">
              {insights.length > 0 ? insights.map((insight, i) => (
                <div key={i} className={`p-3 rounded-lg text-sm ${insight.type === 'strength' ? 'bg-green-900/20 text-green-300' : insight.type === 'improvement' ? 'bg-yellow-900/20 text-yellow-300' : 'bg-red-900/20 text-red-300'}`}>
                  {insight.icon} {insight.text}
                </div>
              )) : (
                <p className="text-ds-text text-sm py-4 text-center">Sem insights disponíveis para o período selecionado.</p>
              )}
            </div>
          </div>

          {/* Executive Summary */}
          <div className="bg-ds-navy p-4 rounded-lg border border-ds-border">
            <h3 className="text-ds-light-text font-bold text-lg mb-3">📝 Resumo Executivo</h3>
            <p className="text-ds-text text-sm leading-relaxed">
              O time <strong className="text-ds-green">{selectedTeam}</strong> entregou <strong>{selectedStats.completed}</strong> itens
              de um total de <strong>{selectedStats.total}</strong> no período, com uma taxa de conclusão de <strong>{selectedStats.completionRate}%</strong>.
              O Cycle Time médio é de <strong>{selectedStats.avgCycleTime} dias</strong>
              {selectedStats.avgCycleTime < globalAvg.avgCT ? ` (${Math.round(((globalAvg.avgCT - selectedStats.avgCycleTime) / globalAvg.avgCT) * 100)}% melhor que a média)` : selectedStats.avgCycleTime > globalAvg.avgCT ? ` (${Math.round(((selectedStats.avgCycleTime - globalAvg.avgCT) / globalAvg.avgCT) * 100)}% acima da média)` : ' (na média global)'}.
              A taxa de bugs/issues é de <strong>{selectedStats.bugRate}%</strong> 
              {selectedStats.bugRate < globalAvg.bugRate ? ' (abaixo da média — boa qualidade)' : ' (acima da média — atenção)'}.
              O time possui <strong>{selectedStats.members} membros ativos</strong>, com uma velocidade individual de <strong>{(selectedStats.throughput / (selectedStats.members || 1)).toFixed(1)} entregas/pessoa</strong>.
            </p>
          </div>
        </>
      ) : (
        <div className="bg-ds-navy p-8 rounded-lg border border-ds-border text-center">
          <p className="text-ds-text">Nenhum dado encontrado para o time selecionado no período.</p>
        </div>
      )}
    </div>
  );
};

export default TeamInsightsDashboard;
