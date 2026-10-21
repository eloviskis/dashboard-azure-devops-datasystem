
import React, { useMemo, useState } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { WorkItem } from '../types.ts';
import { CHART_COLORS } from '../constants.ts';
import { EmptyState } from './ChartStates.tsx';
import { COMPLETED_STATES } from '../utils/metrics.ts';

interface LeadVsCycleTimeChartProps {
  data: WorkItem[];
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
                        <div>👥 {item.team || 'Sem time'}</div>
                        <div>⏱️ Lead: {item.leadTime}d</div>
                        <div>🔄 Cycle: {item.cycleTime}d</div>
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

const LeadVsCycleTimeChart: React.FC<LeadVsCycleTimeChartProps> = ({ data }) => {
  const [modalData, setModalData] = useState<ModalData | null>(null);

  const chartData = useMemo(() => {
    const completedItems = data.filter(item =>
      COMPLETED_STATES.includes(item.state) &&
      item.leadTime !== null &&
      item.cycleTime !== null
    );

    if (completedItems.length === 0) {
      return [];
    }

    const timeByTeam: Record<string, { leadTimeSum: number, cycleTimeSum: number, count: number, items: WorkItem[] }> = {};

    completedItems.forEach(item => {
        const team = item.team || 'Sem Time';
        if (!timeByTeam[team]) {
            timeByTeam[team] = { leadTimeSum: 0, cycleTimeSum: 0, count: 0, items: [] };
        }
        timeByTeam[team].leadTimeSum += item.leadTime!;
        timeByTeam[team].cycleTimeSum += item.cycleTime!;
        timeByTeam[team].count++;
        timeByTeam[team].items.push(item);
    });

    return Object.entries(timeByTeam).map(([team, values]) => ({
      name: team,
      'Lead Time': parseFloat((values.leadTimeSum / values.count).toFixed(1)),
      'Cycle Time': parseFloat((values.cycleTimeSum / values.count).toFixed(1)),
      items: values.items,
    }));

  }, [data]);

  const handleClick = (d: any) => {
    if (d?.items?.length) setModalData({ title: `Itens concluídos — ${d.name}`, items: d.items, color: CHART_COLORS.primary });
  };

  if (chartData.length === 0) {
    return <EmptyState message="Nenhum item concluído com dados de tempo para exibir." />;
  }

  return (
    <>
      <ItemListModal data={modalData} onClose={() => setModalData(null)} />
      <ResponsiveContainer width="100%" height={300}>
        <BarChart data={chartData} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={CHART_COLORS.grid} />
          <XAxis dataKey="name" stroke={CHART_COLORS.text} />
          <YAxis stroke={CHART_COLORS.text} />
          <Tooltip
            cursor={{ fill: 'rgba(100, 255, 218, 0.1)' }}
            contentStyle={{ backgroundColor: '#0a192f', border: '1px solid #64ffda', borderRadius: '8px', color: '#e6f1ff', padding: '10px 14px' }}
            labelStyle={{ color: '#64ffda', fontWeight: 'bold' }}
            itemStyle={{ color: '#e6f1ff' }}
            formatter={(value: number, name: string) => [`${value} dias`, `${name} (clique para ver)`]}
          />
          <Legend wrapperStyle={{ color: CHART_COLORS.text }} />
          <Bar dataKey="Lead Time" fill={CHART_COLORS.secondary} cursor="pointer" onClick={handleClick} label={{ position: 'top', fill: '#47C5FB', fontSize: 9 }} />
          <Bar dataKey="Cycle Time" fill={CHART_COLORS.primary} cursor="pointer" onClick={handleClick} label={{ position: 'top', fill: '#64FFDA', fontSize: 9 }} />
        </BarChart>
      </ResponsiveContainer>
    </>
  );
};

export default LeadVsCycleTimeChart;
