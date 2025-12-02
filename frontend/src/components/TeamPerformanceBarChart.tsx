import React, { useMemo, useState } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, Cell } from 'recharts';
import { WorkItem } from '../types.ts';
import { CHART_COLORS } from '../constants.ts';
import { EmptyState } from './ChartStates.tsx';
import { COMPLETED_STATES, IN_PROGRESS_STATES } from '../utils/metrics.ts';

interface TeamPerformanceBarChartProps {
  data: WorkItem[];
}

interface ModalData {
  title: string;
  items: WorkItem[];
  color: string;
}

const AZURE_DEVOPS_BASE_URL = 'https://dev.azure.com/datasystemsoftwares/USE/_workitems/edit';

const getWorkItemUrl = (workItemId: number | string): string => {
  return `${AZURE_DEVOPS_BASE_URL}/${workItemId}`;
};

const ItemListModal: React.FC<{ data: ModalData | null; onClose: () => void }> = ({ data, onClose }) => {
  if (!data) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-50" onClick={onClose}>
      <div 
        className="bg-ds-navy border border-ds-border rounded-lg shadow-2xl max-w-4xl w-full mx-4 max-h-[85vh] flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        <div className="p-4 rounded-t-lg flex justify-between items-center bg-blue-600">
          <h2 className="text-white font-bold text-lg">{data.title}</h2>
          <button
            onClick={onClose}
            className="text-white hover:text-gray-200 text-2xl font-bold leading-none"
          >
            ×
          </button>
        </div>
        
        <div className="p-4 overflow-y-auto flex-1">
          <div className="text-ds-text mb-3 text-sm">
            Total: <span className="font-bold text-white">{data.items.length}</span> itens
          </div>
          
          <ul className="space-y-2">
            {data.items.map((item, idx) => (
              <li 
                key={item.workItemId || idx}
                className="bg-ds-dark-blue border border-ds-border rounded-lg p-3 hover:border-ds-green transition-colors"
              >
                <div className="flex items-start gap-3">
                  <span className="text-xs font-mono px-2 py-1 rounded bg-blue-600 text-white flex-shrink-0">
                    #{item.workItemId}
                  </span>
                  <div className="flex-1 min-w-0">
                    <a 
                      href={getWorkItemUrl(item.workItemId)} 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="text-white hover:text-ds-green font-medium block truncate mb-2"
                      title={item.title}
                    >
                      {item.title}
                    </a>
                    <div className="grid grid-cols-2 gap-2 text-xs text-ds-text">
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
        </div>
        
        <div className="p-4 border-t border-ds-border">
          <button 
            onClick={onClose}
            className="w-full bg-ds-border hover:bg-ds-green text-white py-2 px-4 rounded-lg transition-colors"
          >
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
};

const TeamPerformanceBarChart: React.FC<TeamPerformanceBarChartProps> = ({ data }) => {
  const [modalData, setModalData] = useState<ModalData | null>(null);

  const chartData = useMemo(() => {
    const teamPerformance = data.reduce((acc, item) => {
      const team = item.team || 'Sem Time';
      if (!acc[team]) {
        acc[team] = { name: team, completed: 0, inProgress: 0 };
      }
      if (COMPLETED_STATES.includes(item.state)) {
        acc[team].completed += 1;
      }
      if (IN_PROGRESS_STATES.includes(item.state)) {
        acc[team].inProgress += 1;
      }
      return acc;
    }, {} as Record<string, { name: string; completed: number; inProgress: number; }>);

    return Object.values(teamPerformance).sort((a: { completed: number }, b: { completed: number }) => b.completed - a.completed);
  }, [data]);

  const handleCompletedClick = (entry: any) => {
    const items = data.filter(item => 
      (item.team || 'Sem Time') === entry.name && COMPLETED_STATES.includes(item.state)
    );
    setModalData({
      title: `${entry.name} - Concluídos`,
      items,
      color: CHART_COLORS.primary
    });
  };

  const handleInProgressClick = (entry: any) => {
    const items = data.filter(item => 
      (item.team || 'Sem Time') === entry.name && IN_PROGRESS_STATES.includes(item.state)
    );
    setModalData({
      title: `${entry.name} - Em Progresso`,
      items,
      color: CHART_COLORS.secondary
    });
  };
  
  if (chartData.length === 0) {
    return <EmptyState message="Nenhum dado de performance por time para exibir." />;
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
            formatter={(value: number, name: string) => [value, `${name} (clique para ver)`]}
          />
          <Legend />
          <Bar dataKey="completed" name="Concluídos" fill={CHART_COLORS.primary} cursor="pointer">
            {chartData.map((entry, index) => (
              <Cell key={`completed-${index}`} onClick={() => handleCompletedClick(entry)} />
            ))}
          </Bar>
          <Bar dataKey="inProgress" name="Em Progresso" fill={CHART_COLORS.secondary} cursor="pointer">
            {chartData.map((entry, index) => (
              <Cell key={`inprogress-${index}`} onClick={() => handleInProgressClick(entry)} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </>
  );
};

export default TeamPerformanceBarChart;
