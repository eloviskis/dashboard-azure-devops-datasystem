import React, { useMemo, useState } from 'react';
import { WorkItem } from '../types';
import { CHART_COLORS } from '../constants';
import ChartInfoLamp from './ChartInfoLamp';
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, Legend, Cell, PieChart, Pie
} from 'recharts';

interface Props { data: WorkItem[]; }

interface ModalData {
  title: string;
  items: WorkItem[];
  color: string;
}

const AZURE_DEVOPS_BASE_URL = 'https://dev.azure.com/datasystemsoftwares/USE/_workitems/edit';

const ItemListModal: React.FC<{ data: ModalData | null; onClose: () => void }> = ({ data, onClose }) => {
  if (!data) return null;
  return (
    <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-ds-navy border border-ds-border rounded-lg shadow-2xl max-w-4xl w-full mx-4 max-h-[85vh] flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="p-4 rounded-t-lg flex justify-between items-center" style={{ backgroundColor: data.color }}>
          <h2 className="text-white font-bold text-lg">{data.title}</h2>
          <button onClick={onClose} className="text-white hover:text-gray-200 text-2xl font-bold leading-none">×</button>
        </div>
        <div className="p-4 overflow-y-auto flex-1">
          <div className="text-ds-text mb-3 text-sm">
            Total: <span className="font-bold text-white">{data.items.length}</span> itens
          </div>
          {data.items.length === 0 ? (
            <div className="text-ds-text text-center py-8">Nenhum item encontrado</div>
          ) : (
            <ul className="space-y-2">
              {data.items.map((item, idx) => (
                <li key={item.workItemId || idx} className="bg-ds-dark-blue border border-ds-border rounded-lg p-3 hover:border-ds-green transition-colors">
                  <div className="flex items-start gap-3">
                    <span className="text-xs font-mono px-2 py-1 rounded shrink-0 text-white" style={{ backgroundColor: data.color }}>
                      #{item.workItemId}
                    </span>
                    <div className="flex-1 min-w-0">
                      <a href={item.url || `${AZURE_DEVOPS_BASE_URL}/${item.workItemId}`} target="_blank" rel="noopener noreferrer" className="text-white hover:text-ds-green font-medium block truncate mb-1" title={item.title}>
                        {item.title}
                      </a>
                      <div className="grid grid-cols-2 gap-1 text-xs text-ds-text">
                        <div>👤 {item.assignedTo || 'Não atribuído'}</div>
                        <div>👥 {item.team || 'Sem time'}</div>
                        <div>🏷️ {item.type}</div>
                        <div>📊 {item.state}</div>
                      </div>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="p-4 border-t border-ds-border">
          <button onClick={onClose} className="w-full bg-ds-border hover:bg-ds-green text-white py-2 px-4 rounded-lg transition-colors">Fechar</button>
        </div>
      </div>
    </div>
  );
};
const COMPLETED_STATES = ['Done', 'Concluído', 'Closed', 'Fechado', 'Finished', 'Resolved', 'Pronto'];
const OUTRAS = 'outras';
const PRIORITY_COLORS: Record<string, string> = { '0': '#C53030', '1': '#F56565', '2': '#F6E05E', '3': '#47C5FB', [OUTRAS]: '#8892B0' };
const PRIORITY_LABELS: Record<string, string> = { '0': 'Urgente', '1': 'Crítica', '2': 'Alta', '3': 'Média', [OUTRAS]: 'Demais Tarefas/Prioridades' };

// P0 aqui é só prioridade 0 EXPLÍCITA, diferente do Root Cause/Painel por Time (lá, vazio também é P0 — faz
// sentido pra Sustentação, onde vazio é parte do processo de P0). Nesta tela, que cobre todos os times,
// prioridade vazia quase sempre é só "ninguém classificou", não "é urgente" — medido ao vivo, são 14 mil
// itens vazios contra 632 com 0 de verdade. Juntar os dois faria o cartão de P0 engolir o painel inteiro.
// Vazio, "4" e qualquer valor fora de 0-3 caem em "Demais Tarefas/Prioridades".
const priorityKeyFor = (item: WorkItem): string => {
  const p = item.priority;
  if (p === null || p === undefined || p === '') return OUTRAS;
  const n = Number.parseFloat(String(p));
  if (Number.isNaN(n)) return OUTRAS;
  const key = String(Math.floor(n));
  return key === '0' || key === '1' || key === '2' || key === '3' ? key : OUTRAS;
};
// Título do cartão/modal: prioridade numerada leva "P" na frente; o balde de sobra não (não é P-nenhum).
const priorityHeading = (key: string) => (key === OUTRAS ? PRIORITY_LABELS[key] : `P${key} - ${PRIORITY_LABELS[key]}`);

const SLATrackingDashboard: React.FC<Props> = ({ data }) => {
  const [slaTarget, setSlaTarget] = useState<number>(7); // days
  const [modalData, setModalData] = useState<ModalData | null>(null);

  // SLA analysis per priority
  const slaByPriority = useMemo(() => {
    const priorities = ['0', '1', '2', '3', OUTRAS];
    return priorities.map(p => {
      const items = data.filter(i => priorityKeyFor(i) === p && COMPLETED_STATES.includes(i.state) && i.cycleTime != null);
      if (items.length === 0) return { priority: p, label: PRIORITY_LABELS[p] || `P${p}`, avg: 0, p85: 0, withinSLA: 0, total: 0, pctSLA: 0, items };
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
        items,
      };
    });
  }, [data, slaTarget]);

  // SLA by Team
  const slaByTeam = useMemo(() => {
    const teams: Record<string, { within: number; total: number; cts: number[]; items: WorkItem[] }> = {};
    data.filter(i => COMPLETED_STATES.includes(i.state) && i.cycleTime != null).forEach(item => {
      const team = item.team || 'Sem Time';
      if (!teams[team]) teams[team] = { within: 0, total: 0, cts: [], items: [] };
      teams[team].total++;
      teams[team].cts.push(item.cycleTime as number);
      teams[team].items.push(item);
      if ((item.cycleTime as number) <= slaTarget) teams[team].within++;
    });
    return Object.entries(teams).map(([team, d]) => ({
      team,
      pctSLA: Math.round((d.within / d.total) * 1000) / 10,
      avg: Math.round((d.cts.reduce((a, b) => a + b, 0) / d.cts.length) * 10) / 10,
      within: d.within,
      total: d.total,
      breached: d.total - d.within,
      items: d.items,
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
      const ageDays = Math.ceil((Date.now() - startDate.getTime()) / (1000 * 60 * 60 * 24));
      return { ...item, ageDays };
    }).sort((a, b) => b.ageDays - a.ageDays).slice(0, 20);
  }, [data, slaTarget]);

  // Overall SLA compliance
  const overallSLA = useMemo(() => {
    const completed = data.filter(i => COMPLETED_STATES.includes(i.state) && i.cycleTime != null);
    const withinItems = completed.filter(i => (i.cycleTime as number) <= slaTarget);
    const breachedItemsList = completed.filter(i => (i.cycleTime as number) > slaTarget);
    return {
      total: completed.length,
      within: withinItems.length,
      breached: breachedItemsList.length,
      pct: completed.length > 0 ? Math.round((withinItems.length / completed.length) * 1000) / 10 : 0,
      withinItems,
      breachedItemsList,
    };
  }, [data, slaTarget]);

  const pieData = [
    { name: 'Dentro do SLA', value: overallSLA.within, color: '#64FFDA', items: overallSLA.withinItems },
    { name: 'Fora do SLA', value: overallSLA.breached, color: '#F56565', items: overallSLA.breachedItemsList },
  ];

  return (
    <div className="space-y-6">
      <ItemListModal data={modalData} onClose={() => setModalData(null)} />
      {/* SLA Config */}
      <div className="bg-ds-navy p-4 rounded-lg border border-ds-border flex items-center gap-4 flex-wrap">
        <label htmlFor="sla-target" className="text-ds-text text-sm">Meta de SLA (Cycle Time máximo):</label>
        <select id="sla-target" value={slaTarget} onChange={e => setSlaTarget(Number(e.target.value))}
          className="bg-ds-navy border border-ds-border text-ds-light-text text-sm rounded-md p-2">
          {[3, 5, 7, 10, 14, 21, 30].map(d => <option key={d} value={d}>{d} dias</option>)}
        </select>
        <div className="ml-auto flex items-center gap-4">
          <div
            className="text-center cursor-pointer hover:opacity-80 transition-opacity"
            onClick={() => setModalData({ title: 'Itens Dentro do SLA', items: overallSLA.withinItems, color: '#64FFDA' })}
          >
            <p className="text-xs text-ds-text">Compliance Geral</p>
            <p className={`text-2xl font-bold ${overallSLA.pct >= 80 ? 'text-green-400' : overallSLA.pct >= 60 ? 'text-yellow-400' : 'text-red-400'}`}>
              {overallSLA.pct}%
            </p>
          </div>
          <div
            className={`text-center ${breachedItems.length > 0 ? 'cursor-pointer hover:opacity-80 transition-opacity' : ''}`}
            onClick={() => breachedItems.length > 0 && setModalData({ title: 'Em Risco Agora (fora do SLA, ainda em progresso)', items: breachedItems, color: '#F97316' })}
          >
            <p className="text-xs text-ds-text">Em Risco Agora</p>
            <p className="text-2xl font-bold text-orange-400">{breachedItems.length}</p>
          </div>
        </div>
      </div>

      {/* KPI Row */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        {slaByPriority.map((p, i) => (
          <div
            key={i}
            className={`bg-ds-navy p-4 rounded-lg border border-ds-border ${p.items.length > 0 ? 'cursor-pointer hover:border-ds-green transition-colors' : ''}`}
            onClick={() => p.items.length > 0 && setModalData({ title: priorityHeading(p.priority), items: p.items, color: PRIORITY_COLORS[p.priority] })}
          >
            <div className="flex items-center gap-2 mb-2">
              <span className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: PRIORITY_COLORS[p.priority] }}></span>
              <p className="text-ds-light-text text-sm font-semibold">{priorityHeading(p.priority)}</p>
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
            <BarChart data={slaByTeam} layout="vertical" margin={{ left: 120, right: 65 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={CHART_COLORS.grid} />
              <XAxis type="number" domain={[0, 100]} unit="%" stroke={CHART_COLORS.text} />
              <YAxis type="category" dataKey="team" tick={{ fill: '#CCD6F6', fontSize: 11 }} width={120} />
              <Tooltip contentStyle={{ backgroundColor: '#0a192f', border: '1px solid #64ffda', borderRadius: '8px', color: '#e6f1ff', padding: '10px 14px' }} labelStyle={{ color: '#64ffda', fontWeight: 'bold' }} itemStyle={{ color: '#e6f1ff' }}
                formatter={(value: number) => [`${value}%`]} />
              <Bar
                dataKey="pctSLA"
                name="% dentro SLA"
                cursor="pointer"
                onClick={(d: any) => setModalData({ title: `Itens concluídos — ${d.team}`, items: d.items, color: '#47C5FB' })}
                label={{ position: 'right', fill: '#D8EBF5', fontSize: 11, fontWeight: 'bold', formatter: (v: number) => `${v}%` }}
              >
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
                cursor="pointer"
                onClick={(entry: any) => setModalData({ title: entry.name, items: entry.items, color: entry.color })}
                label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}>
                {pieData.map((entry, i) => <Cell key={i} fill={entry.color} />)}
              </Pie>
              <Tooltip contentStyle={{ backgroundColor: '#0a192f', border: '1px solid #64ffda', borderRadius: '8px', color: '#e6f1ff', padding: '10px 14px' }} labelStyle={{ color: '#64ffda', fontWeight: 'bold' }} itemStyle={{ color: '#e6f1ff' }} />
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
                    <td className="px-3 py-2 text-ds-light-text max-w-62.5 truncate">{item.title}</td>
                    <td className="px-3 py-2">{item.type}</td>
                    <td className="px-3 py-2">{item.team}</td>
                    <td className="px-3 py-2">{item.assignedTo || '-'}</td>
                    <td className="px-3 py-2">{item.state}</td>
                    <td className="px-3 py-2"><span className="text-red-400 font-bold">{item.ageDays}d</span></td>
                    <td className="px-3 py-2"><span style={{ color: PRIORITY_COLORS[priorityKeyFor(item)] }}>{priorityKeyFor(item) === OUTRAS ? 'Outras' : `P${priorityKeyFor(item)}`}</span></td>
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
