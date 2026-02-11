import React, { useState } from 'react';
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts';
import { WorkItem } from '../types';

interface RootCauseChartProps {
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

const COLORS = [
  '#FFD600', '#00B8A9', '#F6416C', '#43A047', '#FF9800', '#1E88E5', '#8E24AA', '#FDD835', '#00C853', '#FF6F00'
];

const RootCauseChart: React.FC<RootCauseChartProps> = ({ data }) => {
  const [modalData, setModalData] = useState<ModalData | null>(null);
  // Agrupa por rootCause
  const rootCauseCounts = data.reduce((acc, item) => {
    const cause = item.causaRaiz || 'Não informado';
    acc[cause] = (acc[cause] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  const chartData = Object.entries(rootCauseCounts).map(([name, value]) => ({ name, value }));

  if (chartData.length === 0) {
    return <div className="text-ds-light-text">Nenhuma Issue fechada com Root Cause informada.</div>;
  }

  return (
    <>
      <ResponsiveContainer width="100%" height={320}>
        <PieChart>
          <Pie
            data={chartData}
            cx="50%"
            cy="50%"
            outerRadius={100}
            label={({ name, value }) => `${name}: ${value}`}
            dataKey="value"
            cursor="pointer"
            onClick={(entry: any, index: number) => {
              const causeName = entry?.name as string;
              const items = data.filter(w => (w.causaRaiz || 'Não informado') === causeName);
              setModalData({
                title: `Itens - Causa Raiz: ${causeName}`,
                items,
                color: COLORS[index % COLORS.length]
              });
            }}
          >
            {chartData.map((entry, idx) => (
              <Cell key={`cell-${entry.name}`} fill={COLORS[idx % COLORS.length]} />
            ))}
          </Pie>
          <Tooltip 
            contentStyle={{ backgroundColor: '#0a192f', border: '1px solid #64ffda', borderRadius: '8px', color: '#e6f1ff', padding: '10px 14px' }}
            labelStyle={{ color: '#64ffda', fontWeight: 'bold' }}
            itemStyle={{ color: '#e6f1ff' }}
          />
        </PieChart>
      </ResponsiveContainer>
      <ItemListModal data={modalData} onClose={() => setModalData(null)} />
    </>
  );
};

export default RootCauseChart;
