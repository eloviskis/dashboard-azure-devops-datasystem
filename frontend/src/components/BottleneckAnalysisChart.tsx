import React, { useMemo, useState } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { WorkItem } from '../types.ts';
import { CHART_COLORS } from '../constants.ts';
import { EmptyState } from './ChartStates.tsx';
import { COMPLETED_STATES } from '../utils/metrics.ts';

interface BottleneckAnalysisChartProps {
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
        <div className="p-3 bg-ds-navy border-b border-ds-border">
          <p className="text-ds-text text-xs">ℹ️ Esta lista mostra os itens concluídos do time (não é possível filtrar com precisão por status individual a partir da barra).</p>
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

const BottleneckAnalysisChart: React.FC<BottleneckAnalysisChartProps> = ({ data }) => {
  const [modalData, setModalData] = useState<ModalData | null>(null);

  const { chartData, statusOrder, itemsByTeam } = useMemo(() => {
    const completedItems = data.filter(item => COMPLETED_STATES.includes(item.state) && item.timeInStatusDays);

    if (completedItems.length === 0) {
      return { chartData: [], statusOrder: [], itemsByTeam: {} as Record<string, WorkItem[]> };
    }

    const totalTimeByTeam: Record<string, { count: number, statuses: Record<string, number> }> = {};
    const itemsByTeam: Record<string, WorkItem[]> = {};
    const allStatuses = new Set<string>();

    completedItems.forEach(item => {
      const team = item.team || 'Sem Time';
      if (!totalTimeByTeam[team]) {
        totalTimeByTeam[team] = { count: 0, statuses: {} };
        itemsByTeam[team] = [];
      }
      totalTimeByTeam[team].count++;
      itemsByTeam[team].push(item);
      Object.entries(item.timeInStatusDays!).forEach(([status, days]) => {
        totalTimeByTeam[team].statuses[status] = (totalTimeByTeam[team].statuses[status] || 0) + (days as number);
        allStatuses.add(status);
      });
    });

    const chartData = Object.entries(totalTimeByTeam).map(([team, data]) => {
      const avgStatuses: Record<string, number> = {};
      Object.entries(data.statuses).forEach(([status, totalDays]) => {
        avgStatuses[status] = parseFloat((totalDays / data.count).toFixed(1));
      });
      return {
        name: team,
        ...avgStatuses,
      };
    }).sort((a,b) => a.name.localeCompare(b.name));

    // Garante uma ordem consistente para as barras empilhadas
    const statusOrder = Array.from(allStatuses).sort();

    return { chartData, statusOrder, itemsByTeam };

  }, [data]);

  if (chartData.length === 0) {
    return <EmptyState message="Nenhum item concluído com dados de tempo para exibir." />;
  }

  const handleTeamClick = (team: string) => {
    setModalData({ title: `Itens concluídos — ${team}`, items: itemsByTeam[team] || [], color: '#64FFDA' });
  };

  return (
    <div>
      <ItemListModal data={modalData} onClose={() => setModalData(null)} />
      <div className="bg-ds-navy border border-ds-border rounded-lg p-3 mb-4">
        <p className="text-ds-text text-xs">
          ℹ️ Tempo em cada status calculado a partir do histórico real de mudança de estado do item no Azure DevOps. Clique numa barra para ver os itens concluídos do time.
        </p>
      </div>
      <ResponsiveContainer width="100%" height={400}>
      <BarChart data={chartData} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
        <CartesianGrid strokeDasharray="3 3" stroke={CHART_COLORS.grid} />
        <XAxis dataKey="name" stroke={CHART_COLORS.text} />
        <YAxis stroke={CHART_COLORS.text} />
        <Tooltip
          cursor={{ fill: 'rgba(100, 255, 218, 0.1)' }}
          contentStyle={{ backgroundColor: '#0a192f', border: '1px solid #64ffda', borderRadius: '8px', color: '#e6f1ff', padding: '10px 14px' }}
          labelStyle={{ color: '#64ffda', fontWeight: 'bold' }}
          itemStyle={{ color: '#e6f1ff' }}
          formatter={(value: number, name: string) => [`${value.toFixed(1)} dias`, name]}
        />
        <Legend wrapperStyle={{ color: CHART_COLORS.text }} />
        {statusOrder.map((status, index) => (
            <Bar
                key={status}
                dataKey={status}
                stackId="a"
                fill={CHART_COLORS.palette[index % CHART_COLORS.palette.length]}
                cursor="pointer"
                onClick={(d: any) => handleTeamClick(d.name)}
            />
        ))}
      </BarChart>
    </ResponsiveContainer>
    </div>
  );
};

export default BottleneckAnalysisChart;
