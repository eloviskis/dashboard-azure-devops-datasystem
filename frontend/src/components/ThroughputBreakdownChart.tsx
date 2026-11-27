import React, { useMemo, useState } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { WorkItem } from '../types.ts';
import { CHART_COLORS } from '../constants.ts';
import { EmptyState } from './ChartStates.tsx';
import { COMPLETED_STATES } from '../utils/metrics.ts';

interface ThroughputBreakdownChartProps {
  data: WorkItem[];
  groupBy: 'assignedTo' | 'type';
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

const ThroughputBreakdownChart: React.FC<ThroughputBreakdownChartProps> = ({ data, groupBy }) => {
  const [modalData, setModalData] = useState<ModalData | null>(null);

  const chartData = useMemo(() => {
    const completed = data.filter(item => COMPLETED_STATES.includes(item.state) && item[groupBy]);

    const itemsByKey = completed.reduce((acc, item) => {
      const key = item[groupBy]!;
      if (!acc[key]) acc[key] = [];
      acc[key].push(item);
      return acc;
    }, {} as Record<string, WorkItem[]>);

    return Object.entries(itemsByKey)
      .map(([name, items]) => ({ name, value: items.length, items }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 10);
  }, [data, groupBy]);

  const color = groupBy === 'assignedTo' ? CHART_COLORS.primary : CHART_COLORS.secondary;

  if (chartData.length === 0) {
    return <EmptyState message={`Nenhum item concluído para detalhar a vazão por ${groupBy === 'assignedTo' ? 'responsável' : 'tipo'}.`} />;
  }

  return (
    <>
      <ItemListModal data={modalData} onClose={() => setModalData(null)} />
      <ResponsiveContainer width="100%" height={350}>
        <BarChart data={chartData} layout="vertical" margin={{ top: 5, right: 70, left: 20, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={CHART_COLORS.grid} />
          <XAxis type="number" stroke={CHART_COLORS.text} />
          <YAxis type="category" dataKey="name" stroke={CHART_COLORS.text} width={100} fontSize={12} />
          <Tooltip
            cursor={{ fill: 'rgba(100, 255, 218, 0.1)' }}
            contentStyle={{ backgroundColor: '#0a192f', border: '1px solid #64ffda', borderRadius: '8px', color: '#e6f1ff', padding: '10px 14px' }}
            labelStyle={{ color: '#64ffda', fontWeight: 'bold' }}
            itemStyle={{ color: '#e6f1ff' }}
            formatter={(value: number) => [value, 'Itens Concluídos (clique para ver)']}
          />
          <Bar
            dataKey="value"
            name="Itens Concluídos"
            fill={color}
            cursor="pointer"
            onClick={(d: any) => setModalData({ title: `Itens concluídos — ${d.name}`, items: d.items, color })}
            label={{ position: 'right', fill: color, fontSize: 11, fontWeight: 'bold' }}
          />
        </BarChart>
      </ResponsiveContainer>
    </>
  );
};

export default ThroughputBreakdownChart;
