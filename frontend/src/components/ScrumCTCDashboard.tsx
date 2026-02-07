import React, { useState, useMemo } from 'react';
import { WorkItem } from '../types';
import { CHART_COLORS } from '../constants';
import ChartInfoLamp from './ChartInfoLamp';
import {
  ResponsiveContainer, BarChart, Bar, LineChart, Line, PieChart, Pie, Cell,
  XAxis, YAxis, Tooltip, CartesianGrid, Legend, ReferenceLine, AreaChart, Area
} from 'recharts';
import { format, subMonths, startOfMonth, endOfMonth, isWithinInterval, eachMonthOfInterval, differenceInDays, addDays } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface ScrumCTCDashboardProps {
  data: WorkItem[];
}

const COMPLETED_STATES = ['Done', 'Concluído', 'Closed', 'Fechado', 'Finished', 'Resolved', 'Pronto'];
const IN_PROGRESS_STATES = ['Active', 'Ativo', 'Em Progresso', 'Para Desenvolver', 'Aguardando Code Review', 'Fazendo Code Review', 'Aguardando QA', 'Testando QA'];

const TYPE_COLORS: Record<string, string> = {
  'Product Backlog Item': '#64FFDA',
  'Bug': '#F56565',
  'Task': '#47C5FB',
  'User Story': '#B794F4',
  'Feature': '#F6E05E',
  'Eventuality': '#ED8936',
};

const ScrumCTCDashboard: React.FC<ScrumCTCDashboardProps> = ({ data }) => {
  const [sprintDuration, setSprintDuration] = useState<number>(2); // weeks
  const [sprintHistory, setSprintHistory] = useState<number>(8);
  const [filterMember, setFilterMember] = useState<string>('all');
  const [filterType, setFilterType] = useState<string>('all');
  const [selectedScrumTeam, setSelectedScrumTeam] = useState<string>('__ctc__');

  // Available teams
  const availableTeams = useMemo(() => {
    return [...new Set(data.map(i => i.team).filter(Boolean) as string[])].sort();
  }, [data]);

  // Filter by selected team
  const franquiaItems = useMemo(() => {
    if (selectedScrumTeam === '__ctc__') {
      return data.filter(item => {
        const team = (item.team || '').toLowerCase();
        return team.includes('franquia') || team.includes('ctc');
      });
    }
    if (selectedScrumTeam === '__all__') return data;
    return data.filter(item => item.team === selectedScrumTeam);
  }, [data, selectedScrumTeam]);

  // Get iterations/sprints from iterationPath
  const sprintData = useMemo(() => {
    const now = new Date();
    const sprintDays = sprintDuration * 7;
    const sprints: { name: string; start: Date; end: Date }[] = [];

    // Generate sprints based on sprint duration going back in time
    for (let i = sprintHistory - 1; i >= 0; i--) {
      const end = new Date(now.getTime() - i * sprintDays * 24 * 60 * 60 * 1000);
      const start = new Date(end.getTime() - sprintDays * 24 * 60 * 60 * 1000);
      sprints.push({
        name: `Sprint ${sprintHistory - i}`,
        start,
        end,
      });
    }

    // Also try to extract sprint names from iterationPath
    const iterationSprints: Record<string, { items: WorkItem[]; name: string }> = {};
    franquiaItems.forEach(item => {
      if (item.iterationPath) {
        const parts = (item.iterationPath as string).split('\\');
        const sprintName = parts[parts.length - 1] || item.iterationPath;
        if (!iterationSprints[sprintName]) {
          iterationSprints[sprintName] = { items: [], name: sprintName };
        }
        iterationSprints[sprintName].items.push(item);
      }
    });

    // If we have real iteration data, use that instead
    const hasRealSprints = Object.keys(iterationSprints).length > 2;

    if (hasRealSprints) {
      return Object.values(iterationSprints)
        .map(s => {
          const items = s.items;
          const closedDates = items.filter(i => i.closedDate).map(i => new Date(i.closedDate!).getTime());
          const createdDates = items.map(i => new Date(i.createdDate || '').getTime()).filter(d => !isNaN(d));
          const minDate = createdDates.length > 0 ? new Date(Math.min(...createdDates)) : new Date();
          const maxDate = closedDates.length > 0 ? new Date(Math.max(...closedDates)) : new Date();

          return {
            name: s.name,
            start: minDate,
            end: maxDate,
            items,
          };
        })
        .sort((a, b) => a.start.getTime() - b.start.getTime())
        .slice(-sprintHistory);
    }

    // Otherwise use generated sprints  
    return sprints.map(sprint => ({
      ...sprint,
      items: franquiaItems.filter(item => {
        const itemDate = new Date(item.changedDate || item.createdDate || '');
        return isWithinInterval(itemDate, { start: sprint.start, end: sprint.end });
      }),
    }));
  }, [franquiaItems, sprintDuration, sprintHistory]);

  // Apply member/type filters
  const filteredSprintData = useMemo(() => {
    return sprintData.map(sprint => ({
      ...sprint,
      items: sprint.items.filter(item => {
        if (filterMember !== 'all' && item.assignedTo !== filterMember) return false;
        if (filterType !== 'all' && item.type !== filterType) return false;
        return true;
      }),
    }));
  }, [sprintData, filterMember, filterType]);

  // Members and types
  const members = useMemo(() => [...new Set(franquiaItems.map(i => i.assignedTo).filter(Boolean) as string[])].sort(), [franquiaItems]);
  const types = useMemo(() => [...new Set(franquiaItems.map(i => i.type).filter(Boolean))].sort(), [franquiaItems]);

  // Velocity data (committed vs delivered per sprint)
  const velocityData = useMemo(() => {
    return filteredSprintData.map(sprint => {
      const committed = sprint.items.length;
      const delivered = sprint.items.filter(i => COMPLETED_STATES.includes(i.state)).length;
      const storyPointsCommitted = sprint.items.reduce((sum, i) => sum + (i.storyPoints || 0), 0);
      const storyPointsDelivered = sprint.items.filter(i => COMPLETED_STATES.includes(i.state)).reduce((sum, i) => sum + (i.storyPoints || 0), 0);
      return {
        sprint: sprint.name,
        committed,
        delivered,
        spCommitted: Math.round(storyPointsCommitted * 10) / 10,
        spDelivered: Math.round(storyPointsDelivered * 10) / 10,
      };
    });
  }, [filteredSprintData]);

  // KPIs
  const kpis = useMemo(() => {
    const velocities = velocityData.map(v => v.delivered).filter(v => v > 0);
    const spVelocities = velocityData.map(v => v.spDelivered).filter(v => v > 0);
    const avgVelocity = velocities.length > 0 ? velocities.reduce((a, b) => a + b, 0) / velocities.length : 0;
    const avgSPVelocity = spVelocities.length > 0 ? spVelocities.reduce((a, b) => a + b, 0) / spVelocities.length : 0;

    const totalCommitted = velocityData.reduce((s, v) => s + v.committed, 0);
    const totalDelivered = velocityData.reduce((s, v) => s + v.delivered, 0);
    const reliability = totalCommitted > 0 ? (totalDelivered / totalCommitted) * 100 : 0;

    // Variability
    const avg = avgVelocity;
    const variance = velocities.length > 1
      ? Math.sqrt(velocities.reduce((sum, v) => sum + Math.pow(v - avg, 2), 0) / (velocities.length - 1))
      : 0;

    // Cycle Time
    const completedItems = franquiaItems.filter(i => COMPLETED_STATES.includes(i.state) && i.cycleTime != null);
    const avgCT = completedItems.length > 0
      ? completedItems.reduce((sum, i) => sum + (i.cycleTime as number), 0) / completedItems.length
      : 0;

    // WIP
    const wipItems = franquiaItems.filter(i => IN_PROGRESS_STATES.includes(i.state));

    return {
      avgVelocity: Math.round(avgVelocity * 10) / 10,
      avgSPVelocity: Math.round(avgSPVelocity * 10) / 10,
      reliability: Math.round(reliability * 10) / 10,
      variability: Math.round(variance * 10) / 10,
      avgCycleTime: Math.round(avgCT * 10) / 10,
      wip: wipItems.length,
      totalMembers: members.length,
    };
  }, [velocityData, franquiaItems, members]);

  // Story Points by member
  const spByMember = useMemo(() => {
    const map: Record<string, { delivered: number; total: number }> = {};
    franquiaItems.forEach(item => {
      const name = item.assignedTo || 'Não atribuído';
      if (!map[name]) map[name] = { delivered: 0, total: 0 };
      map[name].total += item.storyPoints || 0;
      if (COMPLETED_STATES.includes(item.state)) {
        map[name].delivered += item.storyPoints || 0;
      }
    });
    return Object.entries(map)
      .map(([name, v]) => ({ name, ...v }))
      .sort((a, b) => b.delivered - a.delivered)
      .slice(0, 15);
  }, [franquiaItems]);

  // Type distribution
  const typeDistribution = useMemo(() => {
    const map: Record<string, number> = {};
    franquiaItems.forEach(item => {
      map[item.type] = (map[item.type] || 0) + 1;
    });
    return Object.entries(map)
      .map(([type, count]) => ({ type, count, color: TYPE_COLORS[type] || '#8892B0' }))
      .sort((a, b) => b.count - a.count);
  }, [franquiaItems]);

  // Velocity trend line
  const velocityTrend = useMemo(() => {
    return velocityData.map((v, i) => ({
      ...v,
      trend: kpis.avgVelocity,
    }));
  }, [velocityData, kpis]);

  // Sprint history table with carry-over analysis
  const sprintHistory2 = useMemo(() => {
    return filteredSprintData.map((sprint, idx) => {
      const items = sprint.items;
      const committed = items.length;
      const delivered = items.filter(i => COMPLETED_STATES.includes(i.state)).length;
      const bugs = items.filter(i => i.type === 'Bug').length;
      const sp = items.reduce((sum, i) => sum + (i.storyPoints || 0), 0);
      const spDelivered = items.filter(i => COMPLETED_STATES.includes(i.state)).reduce((sum, i) => sum + (i.storyPoints || 0), 0);
      // Carry-over: items not completed from this sprint
      const notDone = items.filter(i => !COMPLETED_STATES.includes(i.state) && i.state !== 'Removed');
      const carryOver = notDone.length;
      const carryOverSP = Math.round(notDone.reduce((sum, i) => sum + (i.storyPoints || 0), 0) * 10) / 10;
      return {
        name: sprint.name,
        committed,
        delivered,
        reliability: committed > 0 ? Math.round((delivered / committed) * 100) : 0,
        bugs,
        sp: Math.round(sp * 10) / 10,
        spDelivered: Math.round(spDelivered * 10) / 10,
        carryOver,
        carryOverSP,
      };
    });
  }, [filteredSprintData]);

  // Detect current sprint (most recent sprint with active items) - MUST be before burndownData
  const currentSprint = useMemo(() => {
    const activeItems = franquiaItems.filter(i => 
      !COMPLETED_STATES.includes(i.state) && i.state !== 'Removed' && i.iterationPath
    );
    const iterCounts: Record<string, number> = {};
    activeItems.forEach(item => {
      const iter = item.iterationPath as string;
      if (iter && iter !== 'USE') {
        iterCounts[iter] = (iterCounts[iter] || 0) + 1;
      }
    });
    if (Object.keys(iterCounts).length === 0) return null;
    const sprints = Object.keys(iterCounts).map(path => {
      const parts = path.split('\\');
      const name = parts[parts.length - 1];
      const match = name.match(/SPRINT[_\s]*(\d+)/i);
      return { path, name, number: match ? parseInt(match[1]) : 0, count: iterCounts[path] };
    }).filter(s => s.number > 0);
    if (sprints.length === 0) return null;
    sprints.sort((a, b) => b.number - a.number);
    return sprints[0];
  }, [franquiaItems]);

  // Burndown data for current sprint
  const burndownData = useMemo(() => {
    if (!currentSprint) return [];
    // Get items from current sprint
    const currentSprintData = sprintData.find(s => s.name.includes(currentSprint.name.replace(/.*\\/, '')));
    if (!currentSprintData) return [];
    const items = currentSprintData.items;
    if (items.length === 0) return [];
    
    const totalItems = items.length;
    const totalSP = items.reduce((s, i) => s + (i.storyPoints || 0), 0);
    
    // Determine sprint date range
    const createdDates = items.map(i => new Date(i.createdDate || '').getTime()).filter(d => !isNaN(d));
    const sprintStart = createdDates.length > 0 ? new Date(Math.min(...createdDates)) : new Date();
    const sprintEnd = addDays(sprintStart, sprintDuration * 7);
    const totalDays = differenceInDays(sprintEnd, sprintStart) || 1;
    
    // Build daily burndown
    const data: { day: string; remaining: number; spRemaining: number; ideal: number; idealSP: number }[] = [];
    for (let d = 0; d <= totalDays; d++) {
      const date = addDays(sprintStart, d);
      const dateStr = format(date, 'dd/MM');
      const completedByDate = items.filter(i => {
        if (!i.closedDate) return false;
        return new Date(i.closedDate as string) <= date && COMPLETED_STATES.includes(i.state);
      });
      const completedItems = completedByDate.length;
      const completedSP = completedByDate.reduce((s, i) => s + (i.storyPoints || 0), 0);
      
      data.push({
        day: dateStr,
        remaining: totalItems - completedItems,
        spRemaining: Math.round((totalSP - completedSP) * 10) / 10,
        ideal: Math.round((totalItems * (1 - d / totalDays)) * 10) / 10,
        idealSP: Math.round((totalSP * (1 - d / totalDays)) * 10) / 10,
      });
    }
    return data;
  }, [currentSprint, sprintData, sprintDuration]);

  // Scrum insights
  const scrumInsights = useMemo(() => {
    const insights: { icon: string; text: string; type: 'good' | 'warning' | 'bad' }[] = [];

    if (kpis.reliability >= 80) {
      insights.push({ icon: '🎯', text: `Confiabilidade de ${kpis.reliability}% — o time entrega o que planeja. Excelente!`, type: 'good' });
    } else if (kpis.reliability >= 60) {
      insights.push({ icon: '⚠️', text: `Confiabilidade de ${kpis.reliability}% — margem para melhoria no planejamento.`, type: 'warning' });
    } else {
      insights.push({ icon: '🔴', text: `Confiabilidade de ${kpis.reliability}% — o time erra muito na previsão. Revisar planning.`, type: 'bad' });
    }

    if (kpis.variability > kpis.avgVelocity * 0.3) {
      insights.push({ icon: '📊', text: `Variabilidade alta (σ=${kpis.variability}). Velocidade oscilando demais entre sprints.`, type: 'warning' });
    } else {
      insights.push({ icon: '✅', text: `Variabilidade controlada (σ=${kpis.variability}). Velocidade previsível.`, type: 'good' });
    }

    if (kpis.wip > kpis.totalMembers * 2) {
      insights.push({ icon: '🚧', text: `WIP alto (${kpis.wip} itens para ${kpis.totalMembers} membros). Pode estar havendo multitasking excessivo.`, type: 'warning' });
    } else {
      insights.push({ icon: '✅', text: `WIP saudável: ${kpis.wip} itens em progresso para ${kpis.totalMembers} membros.`, type: 'good' });
    }

    if (kpis.avgCycleTime > 15) {
      insights.push({ icon: '⏱️', text: `Cycle Time médio de ${kpis.avgCycleTime} dias — itens levam muito para fechar. Investigar gargalos.`, type: 'bad' });
    } else if (kpis.avgCycleTime > 7) {
      insights.push({ icon: '⏱️', text: `Cycle Time médio de ${kpis.avgCycleTime} dias — razoável, mas pode melhorar.`, type: 'warning' });
    } else if (kpis.avgCycleTime > 0) {
      insights.push({ icon: '🚀', text: `Cycle Time excelente: ${kpis.avgCycleTime} dias em média.`, type: 'good' });
    }

    const lastSprints = velocityData.slice(-3);
    if (lastSprints.length >= 3) {
      const trend = lastSprints[2].delivered - lastSprints[0].delivered;
      if (trend > 2) {
        insights.push({ icon: '📈', text: 'Velocidade em tendência de alta nos últimos 3 sprints.', type: 'good' });
      } else if (trend < -2) {
        insights.push({ icon: '📉', text: 'Velocidade em queda nos últimos 3 sprints. Investigar causas.', type: 'bad' });
      }
    }

    return insights;
  }, [kpis, velocityData]);

  if (franquiaItems.length === 0) {
    return (
      <div className="bg-ds-navy p-8 rounded-lg border border-ds-border text-center">
        <p className="text-ds-text text-lg">Nenhum dado encontrado para o time selecionado.</p>
        <p className="text-ds-text text-sm mt-2">Verifique se os dados foram sincronizados e selecione um time com itens no Azure DevOps.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Scrum Filters */}
      <div className="bg-ds-navy p-4 rounded-lg border border-ds-border">
        <div className="flex flex-wrap items-end gap-4">
          <div>
            <label className="text-ds-text text-sm mb-1 block">Time Scrum:</label>
            <select value={selectedScrumTeam} onChange={e => setSelectedScrumTeam(e.target.value)}
              className="bg-ds-navy border border-ds-border text-ds-light-text text-sm rounded-md p-2">
              <option value="__ctc__">CTC (Franquia)</option>
              <option value="__all__">Todos os Times</option>
              {availableTeams.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          <div>
            <label className="text-ds-text text-sm mb-1 block">Duração do Sprint:</label>
            <select value={sprintDuration} onChange={e => setSprintDuration(Number(e.target.value))}
              className="bg-ds-navy border border-ds-border text-ds-light-text text-sm rounded-md p-2">
              <option value={1}>1 semana</option>
              <option value={2}>2 semanas</option>
              <option value={3}>3 semanas</option>
              <option value={4}>4 semanas</option>
            </select>
          </div>
          <div>
            <label className="text-ds-text text-sm mb-1 block">Histórico (sprints):</label>
            <select value={sprintHistory} onChange={e => setSprintHistory(Number(e.target.value))}
              className="bg-ds-navy border border-ds-border text-ds-light-text text-sm rounded-md p-2">
              {[4, 5, 6, 7, 8, 9, 10, 11, 12].map(n => (
                <option key={n} value={n}>{n} sprints</option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-ds-text text-sm mb-1 block">Membro:</label>
            <select value={filterMember} onChange={e => setFilterMember(e.target.value)}
              className="bg-ds-navy border border-ds-border text-ds-light-text text-sm rounded-md p-2">
              <option value="all">Todos</option>
              {members.map(m => <option key={m} value={m}>{m}</option>)}
            </select>
          </div>
          <div>
            <label className="text-ds-text text-sm mb-1 block">Tipo de Item:</label>
            <select value={filterType} onChange={e => setFilterType(e.target.value)}
              className="bg-ds-navy border border-ds-border text-ds-light-text text-sm rounded-md p-2">
              <option value="all">Todos</option>
              {types.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          <div className="text-ds-green text-xs flex items-center gap-2">
            <span>🏷️</span> Time: <strong>{selectedScrumTeam === '__ctc__' ? 'CTC (Franquia)' : selectedScrumTeam === '__all__' ? 'Todos' : selectedScrumTeam}</strong> — {franquiaItems.length} itens totais
            {currentSprint && (
              <span className="ml-2 px-2 py-1 rounded-full bg-ds-green/20 text-ds-green font-bold text-xs border border-ds-green/40">
                🏃 Sprint Atual: {currentSprint.name} ({currentSprint.count} itens ativos)
              </span>
            )}
          </div>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-4">
        {[
          { label: 'Velocity Média', value: kpis.avgVelocity, unit: 'itens/sprint', color: 'text-ds-green' },
          { label: 'SP Velocity', value: kpis.avgSPVelocity, unit: 'SP/sprint', color: 'text-blue-400' },
          { label: 'Confiabilidade', value: `${kpis.reliability}%`, unit: '', color: kpis.reliability >= 80 ? 'text-ds-green' : kpis.reliability >= 60 ? 'text-yellow-400' : 'text-red-400' },
          { label: 'Variabilidade', value: `σ ${kpis.variability}`, unit: '', color: 'text-ds-light-text' },
          { label: 'Cycle Time', value: kpis.avgCycleTime, unit: 'dias', color: 'text-yellow-400' },
          { label: 'WIP', value: kpis.wip, unit: 'itens', color: 'text-orange-400' },
          { label: 'Membros', value: kpis.totalMembers, unit: 'ativos', color: 'text-ds-light-text' },
        ].map((kpi, i) => (
          <div key={i} className="bg-ds-navy p-4 rounded-lg border border-ds-border text-center">
            <p className="text-ds-text text-xs">{kpi.label}</p>
            <p className={`text-2xl font-bold ${kpi.color}`}>{kpi.value}</p>
            {kpi.unit && <p className="text-ds-text text-xs">{kpi.unit}</p>}
          </div>
        ))}
      </div>

      {/* Burndown Chart */}
      {burndownData.length > 0 && (
        <div className="bg-ds-navy p-4 rounded-lg border border-ds-border">
          <h3 className="text-ds-light-text font-bold text-lg mb-4">🔥 Sprint Burndown — {currentSprint?.name}</h3>
          <ChartInfoLamp info="Burndown da sprint atual: itens e SP restantes vs. linha ideal. Se a curva real estiver acima da ideal, a sprint está atrasada." />
          <ResponsiveContainer width="100%" height={350}>
            <AreaChart data={burndownData}>
              <CartesianGrid strokeDasharray="3 3" stroke={CHART_COLORS.grid} />
              <XAxis dataKey="day" stroke={CHART_COLORS.text} tick={{ fontSize: 11 }} />
              <YAxis stroke={CHART_COLORS.text} />
              <Tooltip contentStyle={{ backgroundColor: CHART_COLORS.tooltipBg, border: 'none', borderRadius: '8px', color: '#E2E8F0' }} />
              <Legend />
              <Area type="monotone" dataKey="remaining" name="Itens Restantes" stroke="#F56565" fill="#F56565" fillOpacity={0.15} strokeWidth={2} />
              <Area type="monotone" dataKey="spRemaining" name="SP Restantes" stroke="#47C5FB" fill="#47C5FB" fillOpacity={0.1} strokeWidth={2} />
              <Line type="monotone" dataKey="ideal" name="Ideal (Itens)" stroke="#FFB86C" strokeDasharray="5 5" strokeWidth={1.5} dot={false} />
              <Line type="monotone" dataKey="idealSP" name="Ideal (SP)" stroke="#64FFDA" strokeDasharray="5 5" strokeWidth={1.5} dot={false} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Velocity Chart */}
      <div className="bg-ds-navy p-4 rounded-lg border border-ds-border">
        <h3 className="text-ds-light-text font-bold text-lg mb-4">📊 Velocity por Sprint (Comprometido vs Entregue)</h3>
        <ChartInfoLamp info="Histórico de velocity: comparação entre itens comprometidos e itens efetivamente entregues em cada sprint. A diferença indica a confiabilidade do planejamento." />
        <ResponsiveContainer width="100%" height={350}>
          <BarChart data={velocityTrend}>
            <CartesianGrid strokeDasharray="3 3" stroke={CHART_COLORS.grid} />
            <XAxis dataKey="sprint" stroke={CHART_COLORS.text} tick={{ fontSize: 11 }} />
            <YAxis stroke={CHART_COLORS.text} />
            <Tooltip contentStyle={{ backgroundColor: CHART_COLORS.tooltipBg, border: 'none', borderRadius: '8px', color: '#E2E8F0' }} />
            <Legend />
            <Bar dataKey="committed" name="Comprometido" fill="#47C5FB" opacity={0.6} />
            <Bar dataKey="delivered" name="Entregue" fill="#64FFDA" />
            <ReferenceLine y={kpis.avgVelocity} stroke="#FFB86C" strokeDasharray="5 5" label={{ value: `Média: ${kpis.avgVelocity}`, position: 'insideTopRight', fill: '#FFB86C', fontSize: 11 }} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Velocity Trend */}
      <div className="bg-ds-navy p-4 rounded-lg border border-ds-border">
        <h3 className="text-ds-light-text font-bold text-lg mb-4">📈 Tendência de Velocity</h3>
        <ChartInfoLamp info="Evolução da velocity (itens e SP) ao longo das sprints, com linha de média. Ajuda a prever a capacidade futura do time." />
        <ResponsiveContainer width="100%" height={300}>
          <LineChart data={velocityTrend}>
            <CartesianGrid strokeDasharray="3 3" stroke={CHART_COLORS.grid} />
            <XAxis dataKey="sprint" stroke={CHART_COLORS.text} tick={{ fontSize: 11 }} />
            <YAxis stroke={CHART_COLORS.text} />
            <Tooltip contentStyle={{ backgroundColor: CHART_COLORS.tooltipBg, border: 'none', borderRadius: '8px', color: '#E2E8F0' }} />
            <Legend />
            <Line type="monotone" dataKey="delivered" name="Velocity (itens)" stroke="#64FFDA" strokeWidth={2} dot={{ r: 4 }} />
            <Line type="monotone" dataKey="spDelivered" name="Velocity (SP)" stroke="#47C5FB" strokeWidth={2} dot={{ r: 4 }} />
            <ReferenceLine y={kpis.avgVelocity} stroke="#FFB86C" strokeDasharray="5 5" />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Story Points by Member */}
        <div className="bg-ds-navy p-4 rounded-lg border border-ds-border">
          <h3 className="text-ds-light-text font-bold text-lg mb-4">👤 Story Points por Membro</h3>
          <ChartInfoLamp info="Distribuição de story points por membro do time: entregues vs. total atribuído. Ajuda a identificar distribuição de carga." />
          <ResponsiveContainer width="100%" height={Math.max(300, spByMember.length * 35)}>
            <BarChart data={spByMember} layout="vertical" margin={{ left: 100 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={CHART_COLORS.grid} />
              <XAxis type="number" stroke={CHART_COLORS.text} />
              <YAxis type="category" dataKey="name" tick={{ fill: '#CCD6F6', fontSize: 11 }} width={100} />
              <Tooltip contentStyle={{ backgroundColor: CHART_COLORS.tooltipBg, border: 'none', borderRadius: '8px', color: '#E2E8F0' }} />
              <Legend />
              <Bar dataKey="delivered" name="Entregues" fill="#64FFDA" />
              <Bar dataKey="total" name="Total" fill="#47C5FB" opacity={0.4} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Type Distribution */}
        <div className="bg-ds-navy p-4 rounded-lg border border-ds-border">
          <h3 className="text-ds-light-text font-bold text-lg mb-4">📦 Distribuição por Tipo</h3>
          <ChartInfoLamp info="Distribuição dos itens da sprint por tipo de work item (PBI, Bug, Task, etc.). Mostra o perfil do trabalho do time." />
          <ResponsiveContainer width="100%" height={300}>
            <PieChart>
              <Pie data={typeDistribution} dataKey="count" nameKey="type" cx="50%" cy="50%" outerRadius={100}
                label={({ type, percent }) => `${type} ${(percent * 100).toFixed(0)}%`}>
                {typeDistribution.map((entry, i) => <Cell key={i} fill={entry.color} />)}
              </Pie>
              <Tooltip contentStyle={{ backgroundColor: CHART_COLORS.tooltipBg, border: 'none', borderRadius: '8px', color: '#E2E8F0' }} />
              <Legend />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Sprint History Table */}
      <div className="bg-ds-navy p-4 rounded-lg border border-ds-border">
        <h3 className="text-ds-light-text font-bold text-lg mb-4">📋 Histórico de Sprints</h3>
        <ChartInfoLamp info="Tabela com histórico de sprints: comprometido vs. entregue, confiabilidade, carry-over (itens não finalizados que passam para a próxima sprint) e bugs." />
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left text-ds-text">
            <thead className="text-xs text-ds-light-text uppercase bg-ds-navy/50">
              <tr>
                <th className="px-4 py-3">Sprint</th>
                <th className="px-4 py-3">Comprometido</th>
                <th className="px-4 py-3">Entregue</th>
                <th className="px-4 py-3">Confiabilidade</th>
                <th className="px-4 py-3">SP Comprom.</th>
                <th className="px-4 py-3">SP Entregues</th>
                <th className="px-4 py-3">Carry-over</th>
                <th className="px-4 py-3">Carry SP</th>
                <th className="px-4 py-3">Bugs</th>
              </tr>
            </thead>
            <tbody>
              {sprintHistory2.map((sprint, idx) => (
                <tr key={idx} className="border-b border-ds-border hover:bg-ds-muted/20">
                  <td className="px-4 py-3 font-medium text-ds-light-text">{sprint.name}</td>
                  <td className="px-4 py-3">{sprint.committed}</td>
                  <td className="px-4 py-3 text-ds-green font-semibold">{sprint.delivered}</td>
                  <td className="px-4 py-3">
                    <span className={`font-semibold ${sprint.reliability >= 80 ? 'text-green-400' : sprint.reliability >= 60 ? 'text-yellow-400' : 'text-red-400'}`}>
                      {sprint.reliability}%
                    </span>
                  </td>
                  <td className="px-4 py-3">{sprint.sp}</td>
                  <td className="px-4 py-3 text-blue-400">{sprint.spDelivered}</td>
                  <td className="px-4 py-3">{sprint.carryOver > 0 ? <span className="text-orange-400 font-semibold">{sprint.carryOver}</span> : '0'}</td>
                  <td className="px-4 py-3">{sprint.carryOverSP > 0 ? <span className="text-orange-400">{sprint.carryOverSP}</span> : '0'}</td>
                  <td className="px-4 py-3">{sprint.bugs > 0 ? <span className="text-red-400">{sprint.bugs}</span> : '0'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Insights */}
      <div className="bg-ds-navy p-4 rounded-lg border border-ds-border">
        <h3 className="text-ds-light-text font-bold text-lg mb-3">💡 Insights Scrum Automáticos</h3>
        <ChartInfoLamp info="Insights automáticos sobre saúde Scrum: alertas de confiabilidade, variabilidade, WIP, cycle time e tendência de velocity." />
        <div className="space-y-2">
          {scrumInsights.map((insight, i) => (
            <div key={i} className={`p-3 rounded-lg text-sm ${insight.type === 'good' ? 'bg-green-900/20 text-green-300' : insight.type === 'warning' ? 'bg-yellow-900/20 text-yellow-300' : 'bg-red-900/20 text-red-300'}`}>
              {insight.icon} {insight.text}
            </div>
          ))}
        </div>
      </div>

      {/* Glossary */}
      <div className="bg-ds-navy/50 p-4 rounded-lg border border-ds-border/50">
        <h4 className="text-ds-light-text font-semibold mb-2">📚 Glossário Scrum</h4>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-xs text-ds-text">
          <p><strong className="text-ds-green">Velocity:</strong> Quantidade de itens (ou SP) entregues por sprint.</p>
          <p><strong className="text-blue-400">Confiabilidade:</strong> % de itens comprometidos que foram entregues.</p>
          <p><strong className="text-yellow-400">Variabilidade (σ):</strong> Desvio padrão da velocity — quanto menor, mais previsível.</p>
          <p><strong className="text-orange-400">WIP:</strong> Work In Progress — itens simultaneamente em andamento.</p>
        </div>
      </div>
    </div>
  );
};

export default ScrumCTCDashboard;
