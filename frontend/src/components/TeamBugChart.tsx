import React, { useMemo, useState } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, Cell } from 'recharts';
import { WorkItem } from '../types.ts';
import { CHART_COLORS } from '../constants.ts';
import { EmptyState } from './ChartStates.tsx';

interface TeamBugChartProps {
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

const TeamBugChart: React.FC<TeamBugChartProps> = ({ data }) => {
  const [modalData, setModalData] = useState<ModalData | null>(null);

  const chartData = useMemo(() => {
    const qualityItemsByTeam = data.reduce((acc, item) => {
      const team = item.team || 'Sem Time';
      if (!acc[team]) {
        acc[team] = { name: team, bugs: 0, issues: 0 };
      }
      if (item.type === 'Bug') {
        acc[team].bugs += 1;
      } else if (item.type === 'Issue') {
        acc[team].issues += 1;
      }
      return acc;
    }, {} as Record<string, { name: string; bugs: number; issues: number; }>);

    return Object.values(qualityItemsByTeam).sort((a: { bugs: number, issues: number }, b: { bugs: number, issues: number }) => (b.bugs + b.issues) - (a.bugs + a.issues));
  }, [data]);

  const handleBugsClick = (entry: any) => {
    const items = data.filter(item => 
      (item.team || 'Sem Time') === entry.name && item.type === 'Bug'
    );
    setModalData({
      title: `${entry.name} - Bugs`,
      items,
      color: CHART_COLORS.bug
    });
  };

  const handleIssuesClick = (entry: any) => {
    const items = data.filter(item => 
      (item.team || 'Sem Time') === entry.name && item.type === 'Issue'
    );
    setModalData({
      title: `${entry.name} - Issues`,
      items,
      color: CHART_COLORS.issue
    });
  };

  if (chartData.length === 0) {
    return <EmptyState message="Nenhum bug ou issue por time para exibir." />;
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
            formatter={(value: number, name: string) => [value, `${name} (clique para ver)`]}
          />
          <Legend />
          <Bar dataKey="bugs" name="Bugs" stackId="a" fill={CHART_COLORS.bug} cursor="pointer">
            {chartData.map((entry, index) => (
              <Cell key={`bugs-${index}`} onClick={() => handleBugsClick(entry)} />
            ))}
          </Bar>
          <Bar dataKey="issues" name="Issues" stackId="a" fill={CHART_COLORS.issue} cursor="pointer">
            {chartData.map((entry, index) => (
              <Cell key={`issues-${index}`} onClick={() => handleIssuesClick(entry)} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </>
  );
};

export default TeamBugChart;
