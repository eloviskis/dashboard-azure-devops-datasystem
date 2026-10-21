import React, { useMemo, useState } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { WorkItem } from '../types.ts';
import { CHART_COLORS } from '../constants.ts';
import { EmptyState } from './ChartStates.tsx';
import { getWeek, getYear } from 'date-fns';
import { COMPLETED_STATES } from '../utils/metrics.ts';

interface ThroughputHistogramProps {
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

const ThroughputHistogram: React.FC<ThroughputHistogramProps> = ({ data }) => {
  const [modalData, setModalData] = useState<ModalData | null>(null);

  const chartData = useMemo(() => {
    const completedItems = data.filter(item => COMPLETED_STATES.includes(item.state) && item.closedDate);

    if (completedItems.length === 0) {
      return [];
    }

    const itemsByWeek: Record<string, WorkItem[]> = {};
    completedItems.forEach(item => {
      const weekKey = `${getYear(item.closedDate!)}-W${getWeek(item.closedDate!, { weekStartsOn: 1 })}`;
      if (!itemsByWeek[weekKey]) itemsByWeek[weekKey] = [];
      itemsByWeek[weekKey].push(item);
    });

    const bins: Record<string, { frequency: number; items: WorkItem[] }> = {
        '1-5': { frequency: 0, items: [] },
        '6-10': { frequency: 0, items: [] },
        '11-15': { frequency: 0, items: [] },
        '16-20': { frequency: 0, items: [] },
        '21+': { frequency: 0, items: [] },
    };

    Object.values(itemsByWeek).forEach((weekItems) => {
        const count = weekItems.length;
        const bin = count <= 5 ? '1-5' : count <= 10 ? '6-10' : count <= 15 ? '11-15' : count <= 20 ? '16-20' : '21+';
        if (count > 0) {
          bins[bin].frequency++;
          bins[bin].items.push(...weekItems);
        }
    });

    return Object.entries(bins).map(([range, { frequency, items }]) => ({
      range,
      'Semanas': frequency,
      items,
    }));

  }, [data]);

  if (chartData.every(d => d['Semanas'] === 0)) {
    return <EmptyState message="Nenhum item concluído para exibir o histograma de vazão." />;
  }

  return (
    <>
    <ItemListModal data={modalData} onClose={() => setModalData(null)} />
    <ResponsiveContainer width="100%" height={300}>
      <BarChart data={chartData} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke={CHART_COLORS.grid} />
        <XAxis dataKey="range" name="Itens por semana" stroke={CHART_COLORS.text} />
        <YAxis dataKey="Semanas" name="Nº de Semanas" stroke={CHART_COLORS.text} allowDecimals={false} />
          <Tooltip
            cursor={{ stroke: CHART_COLORS.primary, strokeWidth: 1 }}
            contentStyle={{ backgroundColor: '#0a192f', border: '1px solid #64ffda', borderRadius: '8px', color: '#e6f1ff', padding: '10px 14px' }}
            labelStyle={{ color: '#64ffda', fontWeight: 'bold' }}
            itemStyle={{ color: '#e6f1ff' }}
          />
          <Legend />
        <Bar
          dataKey="Semanas"
          fill={CHART_COLORS.secondary}
          cursor="pointer"
          onClick={(d: any) => setModalData({ title: `Itens concluídos — semanas com ${d.range} entregas`, items: d.items || [], color: CHART_COLORS.secondary })}
          label={{ position: 'top', fill: CHART_COLORS.secondary, fontSize: 11, fontWeight: 'bold' }}
        />
      </BarChart>
    </ResponsiveContainer>
    </>
  );
};

export default ThroughputHistogram;
