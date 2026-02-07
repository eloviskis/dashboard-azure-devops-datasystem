import React, { useMemo } from 'react';
import { WorkItem } from '../types';
import { CHART_COLORS } from '../constants';
import { getPercentile } from '../utils/metrics';
import {
  ResponsiveContainer, BarChart, Bar, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid, Legend, ReferenceLine, Cell
} from 'recharts';
import { format, subDays, eachWeekOfInterval, endOfWeek } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface Props { data: WorkItem[]; }
const COMPLETED_STATES = ['Done', 'Concluído', 'Closed', 'Fechado', 'Finished', 'Resolved', 'Pronto'];
const BUG_TYPES = ['Bug', 'Issue'];

const DORAMetricsDashboard: React.FC<Props> = ({ data }) => {
  // Deployment Frequency: items completed per week
  const deployFrequency = useMemo(() => {
    const now = new Date();
    const start = subDays(now, 90);
    const weeks = eachWeekOfInterval({ start, end: now }, { weekStartsOn: 1 });
    return weeks.map(weekStart => {
      const wEnd = endOfWeek(weekStart, { weekStartsOn: 1 });
      const completedInWeek = data.filter(item => {
        if (!COMPLETED_STATES.includes(item.state)) return false;
        const closed = item.closedDate ? new Date(item.closedDate as string) : null;
        return closed && closed >= weekStart && closed <= wEnd;
      });
      return {
        week: format(weekStart, 'dd/MM', { locale: ptBR }),
        deployments: completedInWeek.length,
        pbi: completedInWeek.filter(i => i.type === 'Product Backlog Item' || i.type === 'User Story').length,
        bugs: completedInWeek.filter(i => i.type === 'Bug').length,
      };
    });
  }, [data]);

  // Lead Time for Changes: cycle time of completed non-bug items
  const leadTimeData = useMemo(() => {
    const completed = data.filter(i => COMPLETED_STATES.includes(i.state) && i.cycleTime != null && !BUG_TYPES.includes(i.type));
    const byTeam: Record<string, number[]> = {};
    completed.forEach(item => {
      const team = item.team || 'Sem Time';
      if (!byTeam[team]) byTeam[team] = [];
      byTeam[team].push(item.cycleTime as number);
    });
    return Object.entries(byTeam).map(([team, times]) => {
      const sorted = [...times].sort((a, b) => a - b);
      const avg = times.reduce((a, b) => a + b, 0) / times.length;
      const p50 = getPercentile(sorted, 0.50);
      const p85 = getPercentile(sorted, 0.85);
      return { team, avg: Math.round(avg * 10) / 10, p50: Math.round(p50 * 10) / 10, p85: Math.round(p85 * 10) / 10, count: times.length };
    }).sort((a, b) => a.avg - b.avg);
  }, [data]);

  // Change Failure Rate: bugs / total completed items
  const failureRate = useMemo(() => {
    const now = new Date();
    const start = subDays(now, 90);
    const weeks = eachWeekOfInterval({ start, end: now }, { weekStartsOn: 1 });
    return weeks.map(weekStart => {
      const wEnd = endOfWeek(weekStart, { weekStartsOn: 1 });
      const completedInWeek = data.filter(item => {
        if (!COMPLETED_STATES.includes(item.state)) return false;
        const closed = item.closedDate ? new Date(item.closedDate as string) : null;
        return closed && closed >= weekStart && closed <= wEnd;
      });
      const bugsInWeek = completedInWeek.filter(i => i.type === 'Bug').length;
      const total = completedInWeek.length;
      return {
        week: format(weekStart, 'dd/MM', { locale: ptBR }),
        rate: total > 0 ? Math.round((bugsInWeek / total) * 1000) / 10 : 0,
        bugs: bugsInWeek,
        total,
      };
    });
  }, [data]);

  // MTTR: Mean Time to Restore (avg cycle time of bugs)
  const mttr = useMemo(() => {
    const bugs = data.filter(i => i.type === 'Bug' && COMPLETED_STATES.includes(i.state) && i.cycleTime != null);
    const byTeam: Record<string, number[]> = {};
    bugs.forEach(item => {
      const team = item.team || 'Sem Time';
      if (!byTeam[team]) byTeam[team] = [];
      byTeam[team].push(item.cycleTime as number);
    });
    return Object.entries(byTeam).map(([team, times]) => ({
      team,
      mttr: Math.round((times.reduce((a, b) => a + b, 0) / times.length) * 10) / 10,
      count: times.length,
    })).sort((a, b) => a.mttr - b.mttr);
  }, [data]);

  // DORA KPIs
  const doraKPIs = useMemo(() => {
    const avgDeployFreq = deployFrequency.length > 0 ? deployFrequency.reduce((s, w) => s + w.deployments, 0) / deployFrequency.length : 0;
    const allLeadTimes = data.filter(i => COMPLETED_STATES.includes(i.state) && i.cycleTime != null && !BUG_TYPES.includes(i.type)).map(i => i.cycleTime as number);
    const avgLT = allLeadTimes.length > 0 ? allLeadTimes.reduce((a, b) => a + b, 0) / allLeadTimes.length : 0;
    const allBugsCompleted = data.filter(i => i.type === 'Bug' && COMPLETED_STATES.includes(i.state));
    const totalCompleted = data.filter(i => COMPLETED_STATES.includes(i.state)).length;
    const cfr = totalCompleted > 0 ? (allBugsCompleted.length / totalCompleted) * 100 : 0;
    const bugCTs = allBugsCompleted.filter(i => i.cycleTime != null).map(i => i.cycleTime as number);
    const avgMTTR = bugCTs.length > 0 ? bugCTs.reduce((a, b) => a + b, 0) / bugCTs.length : 0;
    
    const classify = (metric: string, value: number): { level: string; color: string } => {
      if (metric === 'df') return value >= 10 ? { level: 'Elite', color: 'text-green-400' } : value >= 5 ? { level: 'Alta', color: 'text-blue-400' } : value >= 2 ? { level: 'Média', color: 'text-yellow-400' } : { level: 'Baixa', color: 'text-red-400' };
      if (metric === 'lt') return value <= 3 ? { level: 'Elite', color: 'text-green-400' } : value <= 7 ? { level: 'Alta', color: 'text-blue-400' } : value <= 14 ? { level: 'Média', color: 'text-yellow-400' } : { level: 'Baixa', color: 'text-red-400' };
      if (metric === 'cfr') return value <= 5 ? { level: 'Elite', color: 'text-green-400' } : value <= 15 ? { level: 'Alta', color: 'text-blue-400' } : value <= 30 ? { level: 'Média', color: 'text-yellow-400' } : { level: 'Baixa', color: 'text-red-400' };
      if (metric === 'mttr') return value <= 1 ? { level: 'Elite', color: 'text-green-400' } : value <= 3 ? { level: 'Alta', color: 'text-blue-400' } : value <= 7 ? { level: 'Média', color: 'text-yellow-400' } : { level: 'Baixa', color: 'text-red-400' };
      return { level: '-', color: 'text-ds-text' };
    };

    return {
      deployFreq: { value: Math.round(avgDeployFreq * 10) / 10, ...classify('df', avgDeployFreq) },
      leadTime: { value: Math.round(avgLT * 10) / 10, ...classify('lt', avgLT) },
      cfr: { value: Math.round(cfr * 10) / 10, ...classify('cfr', cfr) },
      mttr: { value: Math.round(avgMTTR * 10) / 10, ...classify('mttr', avgMTTR) },
    };
  }, [data, deployFrequency]);

  return (
    <div className="space-y-6">
      {/* DORA KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: 'Deployment Frequency', value: `${doraKPIs.deployFreq.value}`, unit: 'itens/semana', ...doraKPIs.deployFreq },
          { label: 'Lead Time for Changes', value: `${doraKPIs.leadTime.value}`, unit: 'dias', ...doraKPIs.leadTime },
          { label: 'Change Failure Rate', value: `${doraKPIs.cfr.value}%`, unit: '', ...doraKPIs.cfr },
          { label: 'MTTR', value: `${doraKPIs.mttr.value}`, unit: 'dias', ...doraKPIs.mttr },
        ].map((kpi, i) => (
          <div key={i} className="bg-ds-navy p-5 rounded-lg border border-ds-border text-center">
            <p className="text-ds-text text-xs mb-1">{kpi.label}</p>
            <p className={`text-3xl font-bold ${kpi.color}`}>{kpi.value}</p>
            {kpi.unit && <p className="text-ds-text text-xs">{kpi.unit}</p>}
            <span className={`inline-block mt-2 px-2 py-0.5 rounded-full text-xs font-semibold ${kpi.color} bg-ds-muted/30`}>{kpi.level}</span>
          </div>
        ))}
      </div>

      {/* DORA Classification Guide */}
      <div className="bg-ds-navy/50 p-3 rounded-lg border border-ds-border/50">
        <p className="text-ds-text text-xs">
          <strong className="text-ds-light-text">Classificação DORA:</strong>{' '}
          <span className="text-green-400">Elite</span> · <span className="text-blue-400">Alta</span> · <span className="text-yellow-400">Média</span> · <span className="text-red-400">Baixa</span>
          {' '}— Baseado no relatório <em>"Accelerate - State of DevOps"</em> adaptado para o contexto do time.
        </p>
      </div>

      {/* Deployment Frequency Trend */}
      <div className="bg-ds-navy p-4 rounded-lg border border-ds-border">
        <h3 className="text-ds-light-text font-bold text-lg mb-4">📦 Deployment Frequency (Itens Entregues/Semana)</h3>
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={deployFrequency}>
            <CartesianGrid strokeDasharray="3 3" stroke={CHART_COLORS.grid} />
            <XAxis dataKey="week" stroke={CHART_COLORS.text} tick={{ fontSize: 10 }} />
            <YAxis stroke={CHART_COLORS.text} />
            <Tooltip contentStyle={{ backgroundColor: CHART_COLORS.tooltipBg, border: 'none', borderRadius: '8px', color: '#E2E8F0' }} />
            <Legend />
            <Bar dataKey="pbi" name="Features/PBI" stackId="a" fill="#64FFDA" />
            <Bar dataKey="bugs" name="Bugs" stackId="a" fill="#F56565" />
            <ReferenceLine y={doraKPIs.deployFreq.value} stroke="#FFB86C" strokeDasharray="5 5" label={{ value: `Média: ${doraKPIs.deployFreq.value}`, position: 'insideTopRight', fill: '#FFB86C', fontSize: 11 }} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Lead Time by Team */}
      <div className="bg-ds-navy p-4 rounded-lg border border-ds-border">
        <h3 className="text-ds-light-text font-bold text-lg mb-4">⏱️ Lead Time for Changes por Time</h3>
        <ResponsiveContainer width="100%" height={Math.max(250, leadTimeData.length * 40)}>
          <BarChart data={leadTimeData} layout="vertical" margin={{ left: 120 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={CHART_COLORS.grid} />
            <XAxis type="number" stroke={CHART_COLORS.text} />
            <YAxis type="category" dataKey="team" tick={{ fill: '#CCD6F6', fontSize: 11 }} width={120} />
            <Tooltip contentStyle={{ backgroundColor: CHART_COLORS.tooltipBg, border: 'none', borderRadius: '8px', color: '#E2E8F0' }}
              formatter={(value: number, name: string) => [`${value} dias`, name]} />
            <Legend />
            <Bar dataKey="avg" name="Média" fill="#47C5FB" />
            <Bar dataKey="p50" name="P50" fill="#64FFDA" />
            <Bar dataKey="p85" name="P85" fill="#FFB86C" />
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Change Failure Rate Trend */}
        <div className="bg-ds-navy p-4 rounded-lg border border-ds-border">
          <h3 className="text-ds-light-text font-bold text-lg mb-4">🐛 Change Failure Rate (Semanal)</h3>
          <ResponsiveContainer width="100%" height={280}>
            <LineChart data={failureRate}>
              <CartesianGrid strokeDasharray="3 3" stroke={CHART_COLORS.grid} />
              <XAxis dataKey="week" stroke={CHART_COLORS.text} tick={{ fontSize: 10 }} />
              <YAxis stroke={CHART_COLORS.text} unit="%" />
              <Tooltip contentStyle={{ backgroundColor: CHART_COLORS.tooltipBg, border: 'none', borderRadius: '8px', color: '#E2E8F0' }}
                formatter={(value: number) => [`${value}%`]} />
              <Line type="monotone" dataKey="rate" name="Failure Rate %" stroke="#F56565" strokeWidth={2} dot={{ r: 3 }} />
              <ReferenceLine y={15} stroke="#FFB86C" strokeDasharray="5 5" label={{ value: '15% (Alta)', fill: '#FFB86C', fontSize: 10 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>

        {/* MTTR by Team */}
        <div className="bg-ds-navy p-4 rounded-lg border border-ds-border">
          <h3 className="text-ds-light-text font-bold text-lg mb-4">🔧 MTTR por Time (dias)</h3>
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={mttr}>
              <CartesianGrid strokeDasharray="3 3" stroke={CHART_COLORS.grid} />
              <XAxis dataKey="team" stroke={CHART_COLORS.text} tick={{ fontSize: 10 }} angle={-20} textAnchor="end" height={60} />
              <YAxis stroke={CHART_COLORS.text} />
              <Tooltip contentStyle={{ backgroundColor: CHART_COLORS.tooltipBg, border: 'none', borderRadius: '8px', color: '#E2E8F0' }}
                formatter={(value: number) => [`${value} dias`]} />
              <Bar dataKey="mttr" name="MTTR (dias)" fill="#F6E05E">
                {mttr.map((entry, i) => (
                  <Cell key={i} fill={entry.mttr <= 3 ? '#64FFDA' : entry.mttr <= 7 ? '#F6E05E' : '#F56565'} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Glossary */}
      <div className="bg-ds-navy/50 p-4 rounded-lg border border-ds-border/50">
        <h4 className="text-ds-light-text font-semibold mb-2">📚 Glossário — Indicadores Adaptados</h4>
        <div className="bg-yellow-900/20 border border-yellow-700/40 rounded-lg p-3 mb-3">
          <p className="text-yellow-300 text-xs">
            ⚠️ <strong>Aviso:</strong> Estes indicadores são <strong>adaptações conceituais</strong> das métricas DORA para o contexto de Work Items do Azure DevOps.
            As métricas DORA originais dependem de dados de pipeline CI/CD (deploys, releases, incidentes), que não estão disponíveis nesta integração.
            Os valores abaixo usam <strong>dados reais da API</strong>, mas com definições adaptadas.
          </p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-xs text-ds-text">
          <p><strong className="text-ds-green">Deployment Frequency:</strong> Throughput semanal — itens concluídos por semana (<em>DORA real: deploys para produção</em>).</p>
          <p><strong className="text-blue-400">Lead Time for Changes:</strong> Cycle time médio de PBIs/User Stories (<em>DORA real: commit → produção</em>).</p>
          <p><strong className="text-red-400">Change Failure Rate:</strong> % de Bugs sobre total entregue (<em>DORA real: % deploys que causam falha</em>).</p>
          <p><strong className="text-yellow-400">MTTR:</strong> Cycle time médio de Bugs (<em>DORA real: tempo de indisponibilidade até restauração</em>).</p>
        </div>
      </div>
    </div>
  );
};

export default DORAMetricsDashboard;
