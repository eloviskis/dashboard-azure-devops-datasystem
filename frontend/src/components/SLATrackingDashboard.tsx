import React, { useMemo, useState } from 'react';
import { WorkItem } from '../types';
import { CHART_COLORS } from '../constants';
import ChartInfoLamp from './ChartInfoLamp';
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, Legend, Cell, PieChart, Pie
} from 'recharts';

interface Props { data: WorkItem[]; }
const COMPLETED_STATES = ['Done', 'Concluído', 'Closed', 'Fechado', 'Finished', 'Resolved', 'Pronto'];
const PRIORITY_COLORS: Record<string, string> = { '1': '#F56565', '2': '#F6E05E', '3': '#47C5FB', '4': '#8892B0' };
const PRIORITY_LABELS: Record<string, string> = { '1': 'Crítica', '2': 'Alta', '3': 'Média', '4': 'Baixa' };

const SLATrackingDashboard: React.FC<Props> = ({ data }) => {
  const [slaTarget, setSlaTarget] = useState<number>(7); // days

  // SLA analysis per priority
  const slaByPriority = useMemo(() => {
    const priorities = ['1', '2', '3', '4'];
    return priorities.map(p => {
      const items = data.filter(i => String(i.priority || '4') === p && COMPLETED_STATES.includes(i.state) && i.cycleTime != null);
      if (items.length === 0) return { priority: p, label: PRIORITY_LABELS[p] || `P${p}`, avg: 0, p85: 0, withinSLA: 0, total: 0, pctSLA: 0 };
      const cts = items.map(i => i.cycleTime as number).sort((a, b) => a - b);
      const avg = cts.reduce((a, b) => a + b, 0) / cts.length;
      const p85 = cts[Math.floor(cts.length * 0.85)] || 0;
      const withinSLA = items.filter(i => (i.cycleTime as number) <= slaTarget).length;
      return {
        priority: p,
        label: PRIORITY_LABELS[p] || `P${p}`,
        avg: Math.round(avg * 10) / 10,
        p85: Math.round(p85 * 10) / 10,
        withinSLA,
        total: items.length,
        pctSLA: Math.round((withinSLA / items.length) * 1000) / 10,
      };
    });
  }, [data, slaTarget]);

  // SLA by Team
  const slaByTeam = useMemo(() => {
    const teams: Record<string, { within: number; total: number; cts: number[] }> = {};
    data.filter(i => COMPLETED_STATES.includes(i.state) && i.cycleTime != null).forEach(item => {
      const team = item.team || 'Sem Time';
      if (!teams[team]) teams[team] = { within: 0, total: 0, cts: [] };
      teams[team].total++;
      teams[team].cts.push(item.cycleTime as number);
      if ((item.cycleTime as number) <= slaTarget) teams[team].within++;
    });
    return Object.entries(teams).map(([team, d]) => ({
      team,
      pctSLA: Math.round((d.within / d.total) * 1000) / 10,
      avg: Math.round((d.cts.reduce((a, b) => a + b, 0) / d.cts.length) * 10) / 10,
      within: d.within,
      total: d.total,
      breached: d.total - d.within,
    })).sort((a, b) => b.pctSLA - a.pctSLA);
  }, [data, slaTarget]);

  // Items currently breaching SLA (in progress with age > slaTarget)
  const breachedItems = useMemo(() => {
    const inProgress = data.filter(i => !COMPLETED_STATES.includes(i.state) && i.state !== 'Removed' && i.state !== 'New');
    return inProgress.filter(item => {
      if (!item.createdDate) return false;
      const startDate = new Date(item.changedDate || item.createdDate);
      if (isNaN(startDate.getTime())) return false;
      const ageDays = (Date.now() - startDate.getTime()) / (1000 * 60 * 60 * 24);
      return ageDays > slaTarget;
    }).map(item => {
      const startDate = new Date(item.changedDate || item.createdDate!);
      const ageDays = Math.round((Date.now() - startDate.getTime()) / (1000 * 60 * 60 * 24));
      return { ...item, ageDays };
    }).sort((a, b) => b.ageDays - a.ageDays).slice(0, 20);
  }, [data, slaTarget]);

  // Overall SLA compliance
  const overallSLA = useMemo(() => {
    const completed = data.filter(i => COMPLETED_STATES.includes(i.state) && i.cycleTime != null);
    const within = completed.filter(i => (i.cycleTime as number) <= slaTarget).length;
    return {
      total: completed.length,
      within,
      breached: completed.length - within,
      pct: completed.length > 0 ? Math.round((within / completed.length) * 1000) / 10 : 0,
    };
  }, [data, slaTarget]);

  const pieData = [
    { name: 'Dentro do SLA', value: overallSLA.within, color: '#64FFDA' },
    { name: 'Fora do SLA', value: overallSLA.breached, color: '#F56565' },
  ];

  return (
    <div className="space-y-6">
      {/* SLA Config */}
      <div className="bg-ds-navy p-4 rounded-lg border border-ds-border flex items-center gap-4 flex-wrap">
        <label className="text-ds-text text-sm">Meta de SLA (Cycle Time máximo):</label>
        <select value={slaTarget} onChange={e => setSlaTarget(Number(e.target.value))}
          className="bg-ds-navy border border-ds-border text-ds-light-text text-sm rounded-md p-2">
          {[3, 5, 7, 10, 14, 21, 30].map(d => <option key={d} value={d}>{d} dias</option>)}
        </select>
        <div className="ml-auto flex items-center gap-4">
          <div className="text-center">
            <p className="text-xs text-ds-text">Compliance Geral</p>
            <p className={`text-2xl font-bold ${overallSLA.pct >= 80 ? 'text-green-400' : overallSLA.pct >= 60 ? 'text-yellow-400' : 'text-red-400'}`}>
              {overallSLA.pct}%
            </p>
          </div>
          <div className="text-center">
            <p className="text-xs text-ds-text">Em Risco Agora</p>
            <p className="text-2xl font-bold text-orange-400">{breachedItems.length}</p>
          </div>
        </div>
      </div>

      {/* KPI Row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {slaByPriority.map((p, i) => (
          <div key={i} className="bg-ds-navy p-4 rounded-lg border border-ds-border">
            <div className="flex items-center gap-2 mb-2">
              <span className="w-3 h-3 rounded-full" style={{ backgroundColor: PRIORITY_COLORS[p.priority] }}></span>
              <p className="text-ds-light-text text-sm font-semibold">P{p.priority} - {p.label}</p>
            </div>
            <p className={`text-xl font-bold ${p.pctSLA >= 80 ? 'text-green-400' : p.pctSLA >= 60 ? 'text-yellow-400' : 'text-red-400'}`}>
              {p.pctSLA}% <span className="text-xs text-ds-text font-normal">dentro SLA</span>
            </p>
            <p className="text-ds-text text-xs mt-1">Média: {p.avg}d · P85: {p.p85}d · {p.total} itens</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* SLA Compliance by Team */}
        <div className="bg-ds-navy p-4 rounded-lg border border-ds-border">
          <h3 className="text-ds-light-text font-bold text-lg mb-4">📊 SLA Compliance por Time</h3>
          <ChartInfoLamp info="Percentual de itens que foram concluídos dentro da meta SLA por time. Verde ≥80%, amarelo ≥60%, vermelho <60%." />
          <ResponsiveContainer width="100%" height={Math.max(250, slaByTeam.length * 40)}>
            <BarChart data={slaByTeam} layout="vertical" margin={{ left: 120 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={CHART_COLORS.grid} />
              <XAxis type="number" domain={[0, 100]} unit="%" stroke={CHART_COLORS.text} />
              <YAxis type="category" dataKey="team" tick={{ fill: '#CCD6F6', fontSize: 11 }} width={120} />
              <Tooltip contentStyle={{ backgroundColor: CHART_COLORS.tooltipBg, border: 'none', borderRadius: '8px', color: '#E2E8F0' }}
                formatter={(value: number) => [`${value}%`]} />
              <Bar dataKey="pctSLA" name="% dentro SLA">
                {slaByTeam.map((entry, i) => (
                  <Cell key={i} fill={entry.pctSLA >= 80 ? '#64FFDA' : entry.pctSLA >= 60 ? '#F6E05E' : '#F56565'} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* SLA Pie */}
        <div className="bg-ds-navy p-4 rounded-lg border border-ds-border">
          <h3 className="text-ds-light-text font-bold text-lg mb-4">🎯 Distribuição SLA Geral</h3>
          <ChartInfoLamp info="Distribuição dos itens concluídos entre 'Dentro do SLA' e 'Fora do SLA', baseada na meta de cycle time definida acima." />
          <ResponsiveContainer width="100%" height={280}>
            <PieChart>
              <Pie data={pieData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={100}
                label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}>
                {pieData.map((entry, i) => <Cell key={i} fill={entry.color} />)}
              </Pie>
              <Tooltip contentStyle={{ backgroundColor: CHART_COLORS.tooltipBg, border: 'none', borderRadius: '8px', color: '#E2E8F0' }} />
              <Legend />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Breached Items Table */}
      {breachedItems.length > 0 && (
        <div className="bg-ds-navy p-4 rounded-lg border border-ds-border">
          <h3 className="text-ds-light-text font-bold text-lg mb-4">🚨 Itens Em Progresso Fora do SLA ({breachedItems.length})</h3>
          <ChartInfoLamp info="Itens atualmente em progresso que já ultrapassaram a meta de SLA. Requerem atenção imediata para evitar atrasos maiores." />
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left text-ds-text">
              <thead className="text-xs text-ds-light-text uppercase bg-ds-navy/50">
                <tr>
                  <th className="px-3 py-2">ID</th>
                  <th className="px-3 py-2">Título</th>
                  <th className="px-3 py-2">Tipo</th>
                  <th className="px-3 py-2">Time</th>
                  <th className="px-3 py-2">Responsável</th>
                  <th className="px-3 py-2">Estado</th>
                  <th className="px-3 py-2">Idade (dias)</th>
                  <th className="px-3 py-2">Prioridade</th>
                </tr>
              </thead>
              <tbody>
                {breachedItems.map((item, idx) => (
                  <tr key={idx} className="border-b border-ds-border hover:bg-ds-muted/20">
                    <td className="px-3 py-2">
                      <a href={`https://dev.azure.com/datasystemsoftwares/USE/_workitems/edit/${item.workItemId}`} target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:underline">
                        #{item.workItemId}
                      </a>
                    </td>
                    <td className="px-3 py-2 text-ds-light-text max-w-[250px] truncate">{item.title}</td>
                    <td className="px-3 py-2">{item.type}</td>
                    <td className="px-3 py-2">{item.team}</td>
                    <td className="px-3 py-2">{item.assignedTo || '-'}</td>
                    <td className="px-3 py-2">{item.state}</td>
                    <td className="px-3 py-2"><span className="text-red-400 font-bold">{item.ageDays}d</span></td>
                    <td className="px-3 py-2"><span style={{ color: PRIORITY_COLORS[String(item.priority || '4')] }}>P{item.priority || '4'}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Glossary */}
      <div className="bg-ds-navy/50 p-4 rounded-lg border border-ds-border/50">
        <h4 className="text-ds-light-text font-semibold mb-2">📚 Glossário SLA</h4>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-xs text-ds-text">
          <p><strong className="text-ds-green">SLA Compliance:</strong> % de itens concluídos dentro da meta de Cycle Time.</p>
          <p><strong className="text-red-400">Breached (Fora SLA):</strong> Itens em progresso com idade maior que a meta.</p>
          <p><strong className="text-yellow-400">P85:</strong> Percentil 85 — 85% dos itens são concluídos em até esse tempo.</p>
          <p><strong className="text-blue-400">MTTR:</strong> Tempo médio para resolver itens (Mean Time To Resolve).</p>
        </div>
      </div>
    </div>
  );
};

export default SLATrackingDashboard;
