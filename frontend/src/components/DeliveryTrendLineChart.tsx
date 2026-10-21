
import React, { useMemo, useState } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { WorkItem } from '../types.ts';
import { CHART_COLORS } from '../constants.ts';
import { EmptyState } from './ChartStates.tsx';
// Fix: Import date-fns functions from their respective submodules for v2 compatibility.
import { format, subDays, eachDayOfInterval } from 'date-fns';
import { COMPLETED_STATES } from '../utils/metrics.ts';

interface DeliveryTrendLineChartProps {
  data: WorkItem[];
  period: number;
}

interface ModalData {
  title: string;
  items: WorkItem[];
  color: string;
}

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
                      {item.url ? (
                        <a href={item.url} target="_blank" rel="noopener noreferrer" className="text-white hover:text-ds-green font-medium block truncate mb-1" title={item.title}>
                          {item.title}
                        </a>
                      ) : (
                        <p className="text-white font-medium truncate mb-1">{item.title}</p>
                      )}
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

const DeliveryTrendLineChart: React.FC<DeliveryTrendLineChartProps> = ({ data, period }) => {
  const [modalData, setModalData] = useState<ModalData | null>(null);

  const chartData = useMemo(() => {
    const endDate = new Date();
    const startDate = subDays(endDate, period - 1);
    const dateRange = eachDayOfInterval({ start: startDate, end: endDate });

    const deliveriesByDay = data
      .filter(item => COMPLETED_STATES.includes(item.state) && item.closedDate)
      .reduce((acc, item) => {
        const dateStr = format(item.closedDate!, 'yyyy-MM-dd');
        if (!acc[dateStr]) acc[dateStr] = [];
        acc[dateStr].push(item);
        return acc;
      }, {} as Record<string, WorkItem[]>);

    return dateRange.map(date => {
      const dateStr = format(date, 'yyyy-MM-dd');
      const formattedDate = format(date, 'dd/MM');
      const items = deliveriesByDay[dateStr] || [];
      return {
        date: formattedDate,
        entregas: items.length,
        items,
      };
    });
  }, [data, period]);

  if (data.length === 0) {
    return <EmptyState message="Nenhum dado de entregas para exibir." />;
  }

  return (
    <>
      <ItemListModal data={modalData} onClose={() => setModalData(null)} />
      <ResponsiveContainer width="100%" height={300}>
        <LineChart
          data={chartData}
          margin={{ top: 5, right: 30, left: 20, bottom: 5 }}
          className="cursor-pointer"
          onClick={(e: any) => {
            const p = e?.activePayload?.[0]?.payload;
            if (p?.items?.length) setModalData({ title: `Entregas — ${p.date}`, items: p.items, color: CHART_COLORS.primary });
          }}
        >
          <CartesianGrid strokeDasharray="3 3" stroke={CHART_COLORS.grid} />
          <XAxis dataKey="date" stroke={CHART_COLORS.text} />
          <YAxis stroke={CHART_COLORS.text} />
            <Tooltip
              cursor={{ stroke: CHART_COLORS.primary, strokeWidth: 1 }}
              contentStyle={{ backgroundColor: '#0a192f', border: '1px solid #64ffda', borderRadius: '8px', color: '#e6f1ff', padding: '10px 14px' }}
              labelStyle={{ color: '#64ffda', fontWeight: 'bold' }}
              itemStyle={{ color: '#e6f1ff' }}
              formatter={(value: number) => [value, 'Entregas']}
            />
            <Legend />
          <Line type="monotone" dataKey="entregas" name="Entregas" stroke={CHART_COLORS.primary} strokeWidth={2} dot={{ r: 4 }} activeDot={{ r: 8 }} />
        </LineChart>
      </ResponsiveContainer>
    </>
  );
};

export default DeliveryTrendLineChart;
