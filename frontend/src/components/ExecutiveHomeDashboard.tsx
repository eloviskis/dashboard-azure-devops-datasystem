import React, { useMemo } from 'react';
import { WorkItem } from '../types';
import { CHART_COLORS } from '../constants';
import ChartInfoLamp from './ChartInfoLamp';
import {
  ResponsiveContainer, BarChart, Bar, LineChart, Line, PieChart, Pie, Cell,
  XAxis, YAxis, Tooltip, CartesianGrid, Legend, RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis
} from 'recharts';
import { format, subDays, eachWeekOfInterval, endOfWeek } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface Props { data: WorkItem[]; }
const COMPLETED_STATES = ['Done', 'Concluído', 'Closed', 'Fechado', 'Finished', 'Resolved', 'Pronto'];
const IN_PROGRESS_STATES = ['Active', 'Ativo', 'Em Progresso', 'Para Desenvolver', 'Aguardando Code Review', 'Fazendo Code Review', 'Aguardando QA', 'Testando QA'];

const TEAM_COLORS = ['#64FFDA', '#47C5FB', '#F6E05E', '#B794F4', '#F56565', '#ED8936', '#68D391', '#FC8181', '#63B3ED', '#D6BCFA'];

const ExecutiveHomeDashboard: React.FC<Props> = ({ data }) => {
  // Health Score per team
  const teamHealth = useMemo(() => {
    const teams: Record<string, WorkItem[]> = {};
    data.forEach(item => {
      const team = item.team || 'Sem Time';
      if (!teams[team]) teams[team] = [];
      teams[team].push(item);
    });

    return Object.entries(teams).map(([team, items]) => {
      const completed = items.filter(i => COMPLETED_STATES.includes(i.state));
      const inProg = items.filter(i => IN_PROGRESS_STATES.includes(i.state));
      const bugs = items.filter(i => i.type === 'Bug');
      const withCT = completed.filter(i => i.cycleTime != null);
      const avgCT = withCT.length > 0 ? withCT.reduce((s, i) => s + (i.cycleTime as number), 0) / withCT.length : 0;
      const throughput = completed.length;
      const wip = inProg.length;
      const bugRate = items.length > 0 ? (bugs.length / items.length) * 100 : 0;
      const completionRate = items.length > 0 ? (completed.length / items.length) * 100 : 0;

      // Health score: throughput (25%) + low CT (25%) + low bug rate (25%) + completion rate (25%)
      const ctScore = avgCT <= 3 ? 100 : avgCT <= 7 ? 80 : avgCT <= 14 ? 50 : 20;
      const bugScore = bugRate <= 5 ? 100 : bugRate <= 15 ? 70 : bugRate <= 30 ? 40 : 10;
      const completionScore = completionRate >= 80 ? 100 : completionRate >= 60 ? 70 : completionRate >= 40 ? 40 : 10;
      const throughputScore = throughput >= 20 ? 100 : throughput >= 10 ? 70 : throughput >= 5 ? 40 : 10;
      const healthScore = Math.round((ctScore + bugScore + completionScore + throughputScore) / 4);

      return {
        team,
        throughput,
        wip,
        avgCT: Math.round(avgCT * 10) / 10,
        bugRate: Math.round(bugRate * 10) / 10,
        completionRate: Math.round(completionRate * 10) / 10,
        healthScore,
        total: items.length,
      };
    }).sort((a, b) => b.healthScore - a.healthScore);
  }, [data]);

  // Overall KPIs
  const kpis = useMemo(() => {
    const total = data.length;
    const completed = data.filter(i => COMPLETED_STATES.includes(i.state)).length;
    const wip = data.filter(i => IN_PROGRESS_STATES.includes(i.state)).length;
    const bugs = data.filter(i => i.type === 'Bug').length;
    const withCT = data.filter(i => COMPLETED_STATES.includes(i.state) && i.cycleTime != null);
    const avgCT = withCT.length > 0 ? withCT.reduce((s, i) => s + (i.cycleTime as number), 0) / withCT.length : 0;
    const teams = new Set(data.map(i => i.team)).size;
    return {
      total, completed, wip, bugs,
      avgCT: Math.round(avgCT * 10) / 10,
      completionRate: total > 0 ? Math.round((completed / total) * 1000) / 10 : 0,
      bugRate: total > 0 ? Math.round((bugs / total) * 1000) / 10 : 0,
      teams,
    };
  }, [data]);

  // Throughput trend (weekly, last 8 weeks)
  const weeklyTrend = useMemo(() => {
    const now = new Date();
    const start = subDays(now, 56);
    const weeks = eachWeekOfInterval({ start, end: now }, { weekStartsOn: 1 });
    return weeks.map(weekStart => {
      const wEnd = endOfWeek(weekStart, { weekStartsOn: 1 });
      const completedInWeek = data.filter(item => {
        if (!COMPLETED_STATES.includes(item.state)) return false;
        const closed = item.closedDate ? new Date(item.closedDate as string) : null;
        return closed && closed >= weekStart && closed <= wEnd;
      }).length;
      return { week: format(weekStart, 'dd/MM', { locale: ptBR }), throughput: completedInWeek };
    });
  }, [data]);

  // Type distribution
  const typeDistribution = useMemo(() => {
    const map: Record<string, number> = {};
    data.forEach(item => { map[item.type] = (map[item.type] || 0) + 1; });
    const colors: Record<string, string> = {
      'Product Backlog Item': '#64FFDA', Bug: '#F56565', Task: '#47C5FB',
      'User Story': '#B794F4', Feature: '#F6E05E', Eventuality: '#ED8936', Issue: '#FC8181',
    };
    return Object.entries(map).map(([type, count]) => ({ type, count, color: colors[type] || '#8892B0' })).sort((a, b) => b.count - a.count);
  }, [data]);

  // Radar data for top 5 teams
  const radarData = useMemo(() => {
    const top5 = teamHealth.slice(0, 5);
    const metrics = ['Health Score', 'Throughput', 'Cycle Time', 'Bug Rate', 'Completion %'];
    return metrics.map(metric => {
      const entry: Record<string, any> = { metric };
      top5.forEach(t => {
        if (metric === 'Health Score') entry[t.team] = t.healthScore;
        else if (metric === 'Throughput') entry[t.team] = Math.min(t.throughput, 100);
        else if (metric === 'Cycle Time') entry[t.team] = Math.max(0, 100 - t.avgCT * 5);
        else if (metric === 'Bug Rate') entry[t.team] = Math.max(0, 100 - t.bugRate * 2);
        else if (metric === 'Completion %') entry[t.team] = t.completionRate;
      });
      return entry;
    });
  }, [teamHealth]);

  const top5Teams = teamHealth.slice(0, 5);

  return (
    <div className="space-y-6">
      {/* Executive KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-4">
        {[
          { label: 'Total de Itens', value: kpis.total, color: 'text-ds-light-text' },
          { label: 'Concluídos', value: kpis.completed, color: 'text-ds-green' },
          { label: 'Em Progresso', value: kpis.wip, color: 'text-blue-400' },
          { label: 'Bugs', value: kpis.bugs, color: 'text-red-400' },
          { label: 'Cycle Time', value: `${kpis.avgCT}d`, color: 'text-yellow-400' },
          { label: 'Conclusão', value: `${kpis.completionRate}%`, color: kpis.completionRate >= 60 ? 'text-green-400' : 'text-orange-400' },
          { label: 'Bug Rate', value: `${kpis.bugRate}%`, color: kpis.bugRate <= 15 ? 'text-green-400' : 'text-red-400' },
          { label: 'Times', value: kpis.teams, color: 'text-ds-light-text' },
        ].map((kpi, i) => (
          <div key={i} className="bg-ds-navy p-3 rounded-lg border border-ds-border text-center">
            <p className="text-ds-text text-xs">{kpi.label}</p>
            <p className={`text-xl font-bold ${kpi.color}`}>{kpi.value}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Weekly Throughput Trend */}
        <div className="bg-ds-navy p-4 rounded-lg border border-ds-border">
          <h3 className="text-ds-light-text font-bold text-lg mb-4">📈 Throughput Semanal (últimas 8 semanas)</h3>
          <ChartInfoLamp info="Tendência semanal de itens concluídos nas últimas 8 semanas. Permite identificar aceleração ou desaceleração das entregas." />
          <ResponsiveContainer width="100%" height={250}>
            <LineChart data={weeklyTrend}>
              <CartesianGrid strokeDasharray="3 3" stroke={CHART_COLORS.grid} />
              <XAxis dataKey="week" stroke={CHART_COLORS.text} tick={{ fontSize: 11 }} />
              <YAxis stroke={CHART_COLORS.text} />
              <Tooltip contentStyle={{ backgroundColor: CHART_COLORS.tooltipBg, border: 'none', borderRadius: '8px', color: '#E2E8F0' }} />
              <Line type="monotone" dataKey="throughput" name="Itens Concluídos" stroke="#64FFDA" strokeWidth={2} dot={{ r: 4 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>

        {/* Type Distribution */}
        <div className="bg-ds-navy p-4 rounded-lg border border-ds-border">
          <h3 className="text-ds-light-text font-bold text-lg mb-4">📦 Distribuição por Tipo</h3>
          <ChartInfoLamp info="Distribuição dos work items por tipo (PBI, Bug, Issue, Task, etc.). Mostra o perfil das demandas do período." />
          <ResponsiveContainer width="100%" height={250}>
            <PieChart>
              <Pie data={typeDistribution} dataKey="count" nameKey="type" cx="50%" cy="50%" outerRadius={90}
                label={({ type, percent }) => `${type} ${(percent * 100).toFixed(0)}%`}>
                {typeDistribution.map((entry, i) => <Cell key={i} fill={entry.color} />)}
              </Pie>
              <Tooltip contentStyle={{ backgroundColor: CHART_COLORS.tooltipBg, border: 'none', borderRadius: '8px', color: '#E2E8F0' }} />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Radar Chart - Top 5 Teams */}
      {top5Teams.length > 1 && (
        <div className="bg-ds-navy p-4 rounded-lg border border-ds-border">
          <h3 className="text-ds-light-text font-bold text-lg mb-4">🎯 Radar de Saúde − Top {top5Teams.length} Times</h3>
          <ChartInfoLamp info="Radar comparativo dos melhores times em 5 dimensões: Health Score, Throughput, Cycle Time, Bug Rate e Conclusão. Permite comparar forças e fraquezas." />
          <ResponsiveContainer width="100%" height={400}>
            <RadarChart data={radarData}>
              <PolarGrid stroke={CHART_COLORS.grid} />
              <PolarAngleAxis dataKey="metric" tick={{ fill: '#CCD6F6', fontSize: 11 }} />
              <PolarRadiusAxis tick={{ fill: '#8892B0', fontSize: 10 }} domain={[0, 100]} />
              <Tooltip contentStyle={{ backgroundColor: CHART_COLORS.tooltipBg, border: 'none', borderRadius: '8px', color: '#E2E8F0' }} />
              <Legend />
              {top5Teams.map((team, i) => (
                <Radar key={team.team} name={team.team} dataKey={team.team} stroke={TEAM_COLORS[i]} fill={TEAM_COLORS[i]} fillOpacity={0.15} />
              ))}
            </RadarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Team Health Table */}
      <div className="bg-ds-navy p-4 rounded-lg border border-ds-border">
        <h3 className="text-ds-light-text font-bold text-lg mb-4">🏥 Health Score por Time</h3>
        <ChartInfoLamp info="Health Score é composto por 4 indicadores (25% cada): throughput, cycle time, bug rate e taxa de conclusão. Quanto maior, mais saudável o time." />
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left text-ds-text">
            <thead className="text-xs text-ds-light-text uppercase bg-ds-navy/50">
              <tr>
                <th className="px-4 py-3">Time</th>
                <th className="px-4 py-3">Health</th>
                <th className="px-4 py-3">Throughput</th>
                <th className="px-4 py-3">WIP</th>
                <th className="px-4 py-3">CT Médio</th>
                <th className="px-4 py-3">Bug Rate</th>
                <th className="px-4 py-3">Conclusão</th>
                <th className="px-4 py-3">Total</th>
              </tr>
            </thead>
            <tbody>
              {teamHealth.map((team, idx) => (
                <tr key={idx} className="border-b border-ds-border hover:bg-ds-muted/20">
                  <td className="px-4 py-3 font-medium text-ds-light-text">{team.team}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <div className="w-16 h-2 bg-ds-border rounded-full overflow-hidden">
                        <div className="h-full rounded-full" style={{
                          width: `${team.healthScore}%`,
                          backgroundColor: team.healthScore >= 70 ? '#64FFDA' : team.healthScore >= 45 ? '#F6E05E' : '#F56565',
                        }}></div>
                      </div>
                      <span className={`text-xs font-bold ${team.healthScore >= 70 ? 'text-green-400' : team.healthScore >= 45 ? 'text-yellow-400' : 'text-red-400'}`}>
                        {team.healthScore}
                      </span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-ds-green font-semibold">{team.throughput}</td>
                  <td className="px-4 py-3">{team.wip}</td>
                  <td className="px-4 py-3">{team.avgCT}d</td>
                  <td className="px-4 py-3"><span className={team.bugRate <= 15 ? 'text-green-400' : 'text-red-400'}>{team.bugRate}%</span></td>
                  <td className="px-4 py-3"><span className={team.completionRate >= 60 ? 'text-green-400' : 'text-orange-400'}>{team.completionRate}%</span></td>
                  <td className="px-4 py-3">{team.total}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default ExecutiveHomeDashboard;
