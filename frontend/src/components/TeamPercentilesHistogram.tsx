import React, { useMemo, useState } from 'react';
import { WorkItem } from '../types';
import { CHART_COLORS } from '../constants';
import ChartInfoLamp from './ChartInfoLamp';
import {
  ResponsiveContainer, BarChart, Bar,
  XAxis, YAxis, Tooltip, CartesianGrid, Legend
} from 'recharts';

interface TeamPercentilesHistogramProps {
  data: WorkItem[];
  dateRange: { start: Date; end: Date };
}

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
                      <a href={`${AZURE_DEVOPS_BASE_URL}/${item.workItemId}`} target="_blank" rel="noopener noreferrer" className="text-white hover:text-ds-green font-medium block truncate mb-1" title={item.title}>
                        {item.title}
                      </a>
                      <div className="grid grid-cols-2 gap-1 text-xs text-ds-text">
                        <div>👤 {item.assignedTo || 'Não atribuído'}</div>
                        <div>🏷️ {item.type}</div>
                        {item.cycleTime != null && <div>⏱️ {item.cycleTime.toFixed(1)}d</div>}
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

const TeamPercentilesHistogram: React.FC<TeamPercentilesHistogramProps> = ({ data, dateRange }) => {
  const [modalData, setModalData] = useState<ModalData | null>(null);

  const percentile = (arr: number[], p: number): number => {
    if (arr.length === 0) return 0;
    const sorted = [...arr].sort((a, b) => a - b);
    const idx = Math.ceil(sorted.length * (p / 100)) - 1;
    return sorted[Math.max(0, idx)] || 0;
  };

  const teamData = useMemo(() => {
    const teamMap: Record<string, WorkItem[]> = {};

    data.forEach(item => {
      if (!COMPLETED_STATES.includes(item.state)) return;
      if (!item.closedDate || item.cycleTime == null) return;
      const team = item.team || 'Sem Time';

      const closedDate = new Date(item.closedDate);
      if (closedDate < dateRange.start || closedDate > dateRange.end) return;

      if (!teamMap[team]) teamMap[team] = [];
      teamMap[team].push(item);
    });

    return Object.entries(teamMap)
      .filter(([_, items]) => items.length >= 3)
      .map(([team, items]) => {
        const times = items.map(i => i.cycleTime as number);
        return {
          team,
          p50: Math.round(percentile(times, 50) * 10) / 10,
          p85: Math.round(percentile(times, 85) * 10) / 10,
          p95: Math.round(percentile(times, 95) * 10) / 10,
          count: items.length,
          items,
        };
      })
      .sort((a, b) => a.p85 - b.p85);
  }, [data, dateRange]);

  if (teamData.length === 0) {
    return (
      <div className="bg-ds-navy p-4 rounded-lg border border-ds-border">
        <h3 className="text-ds-light-text font-bold text-lg mb-2">📊 Histograma de Percentis: P50, P85 e P95 por Time</h3>
        <p className="text-ds-text text-center py-8">Sem dados suficientes (mínimo 3 itens por time).</p>
      </div>
    );
  }

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (!active || !payload || !payload.length) return null;
    const d = payload[0]?.payload;
    return (
      <div className="bg-ds-dark-blue border border-ds-border rounded-lg p-3 shadow-lg">
        <p className="text-ds-light-text font-bold mb-2">{label}</p>
        <div className="space-y-1 text-sm">
          <p className="text-cyan-400"><strong>P50 - Mediana:</strong> {d.p50} dias</p>
          <p className="text-yellow-400"><strong>P85:</strong> {d.p85} dias</p>
          <p className="text-red-400"><strong>P95:</strong> {d.p95} dias</p>
          <p className="text-ds-text"><strong>Itens:</strong> {d.count}</p>
        </div>
      </div>
    );
  };

  const handleTeamClick = (entry: any) => {
    setModalData({ title: `Itens concluídos — ${entry.team}`, items: entry.items, color: '#47C5FB' });
  };

  return (
    <div className="bg-ds-navy p-4 rounded-lg border border-ds-border">
      <ItemListModal data={modalData} onClose={() => setModalData(null)} />
      <div className="mb-4">
        <h3 className="text-ds-light-text font-bold text-lg mb-1">📊 Histograma de Percentis: P50, P85 e P95 por Time</h3>
        <ChartInfoLamp info="Comparação dos percentis P50 (mediana), P85 e P95 de Cycle Time por time. P85 é a métrica recomendada para SLAs. Times com mínimo de 3 itens. Clique numa barra ou linha da tabela pra ver os itens do time." />
      </div>

      <ResponsiveContainer width="100%" height={400}>
        <BarChart data={teamData} margin={{ top: 5, right: 30, left: 0, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={CHART_COLORS.grid} />
          <XAxis
            dataKey="team"
            stroke={CHART_COLORS.text}
            tick={{ fontSize: 10 }}
            angle={-35}
            textAnchor="end"
            height={80}
            interval={0}
          />
          <YAxis
            stroke={CHART_COLORS.text}
            tick={{ fontSize: 11 }}
            label={{ value: 'Dias', angle: -90, position: 'insideLeft', style: { fill: CHART_COLORS.text } }}
          />
          <Tooltip content={<CustomTooltip />} />
          <Legend wrapperStyle={{ paddingTop: '10px' }} />
          <Bar dataKey="p50" name="P50 - Mediana (50%)" fill="#47C5FB" radius={[4, 4, 0, 0]} cursor="pointer" onClick={handleTeamClick} />
          <Bar dataKey="p85" name="P85 (85%)" fill="#FFB86C" radius={[4, 4, 0, 0]} cursor="pointer" onClick={handleTeamClick} />
          <Bar dataKey="p95" name="P95 (95%)" fill="#F56565" radius={[4, 4, 0, 0]} cursor="pointer" onClick={handleTeamClick} />
        </BarChart>
      </ResponsiveContainer>

      {/* Summary table below chart */}
      <div className="mt-4 overflow-x-auto">
        <table className="w-full text-xs text-left">
          <thead className="text-ds-light-text border-b border-ds-border">
            <tr>
              <th className="px-3 py-2">Time</th>
              <th className="px-3 py-2 text-right">P50 (dias)</th>
              <th className="px-3 py-2 text-right">P85 (dias)</th>
              <th className="px-3 py-2 text-right">P95 (dias)</th>
              <th className="px-3 py-2 text-right">Itens</th>
            </tr>
          </thead>
          <tbody className="text-ds-text">
            {teamData.map((row, idx) => (
              <tr key={idx} className="border-b border-ds-border/50 hover:bg-ds-bg/50 cursor-pointer" onClick={() => handleTeamClick(row)}>
                <td className="px-3 py-2 font-medium text-ds-light-text">{row.team}</td>
                <td className="px-3 py-2 text-right text-cyan-400">{row.p50}</td>
                <td className="px-3 py-2 text-right text-yellow-400 font-semibold">{row.p85}</td>
                <td className="px-3 py-2 text-right text-red-400">{row.p95}</td>
                <td className="px-3 py-2 text-right">{row.count}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default TeamPercentilesHistogram;
