
import React, { useMemo, useState } from 'react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { WorkItem } from '../types.ts';
import { CHART_COLORS, STATUS_COLORS } from '../constants.ts';
import { EmptyState } from './ChartStates.tsx';
import { format, subDays, eachDayOfInterval, endOfDay } from 'date-fns';
import { COMPLETED_STATES, IN_PROGRESS_STATES } from '../utils/metrics.ts';

interface CumulativeFlowDiagramProps {
  data: WorkItem[];
  period: number;
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

// Colunas do workflow na ordem correta (de baixo pra cima no CFD)
const WORKFLOW_COLUMNS = [
  { key: 'Done', label: 'Concluído', color: '#64FFDA', states: ['Done', 'Concluído', 'Closed', 'Fechado', 'Finished', 'Resolved', 'Pronto'] },
  { key: 'TestandoQA', label: 'Testando QA', color: '#805ad5', states: ['Testando QA'] },
  { key: 'AguardandoQA', label: 'Aguardando QA', color: '#9f7aea', states: ['Aguardando QA'] },
  { key: 'FazendoCR', label: 'Fazendo Code Review', color: '#dd6b20', states: ['Fazendo Code Review'] },
  { key: 'AguardandoCR', label: 'Aguardando Code Review', color: '#ed8936', states: ['Aguardando Code Review'] },
  { key: 'Active', label: 'Active / Desenvolvendo', color: '#4299e1', states: ['Active', 'Ativo'] },
  { key: 'ParaDesenvolver', label: 'Para Desenvolver', color: '#f6e05e', states: ['Para Desenvolver'] },
  { key: 'New', label: 'New / Novo', color: '#a0aec0', states: ['New', 'Novo'] },
];

const CumulativeFlowDiagram: React.FC<CumulativeFlowDiagramProps> = ({ data, period }) => {
  const [modalData, setModalData] = useState<ModalData | null>(null);

  const chartData = useMemo(() => {
    const endDate = new Date();
    const startDate = subDays(endDate, Math.min(period - 1, 90)); // Limita a 90 dias para performance
    const dateRange = eachDayOfInterval({ start: startDate, end: endDate });

    return dateRange.map(date => {
      const dayEnd = endOfDay(date);
      const entry: Record<string, any> = { date: format(date, 'dd/MM') };
      const allItemsThatDay: WorkItem[] = [];

      // Para cada coluna, contar itens que estavam naquele estado até aquela data
      // Itens concluídos até a data
      const completedItems = data.filter(item =>
        WORKFLOW_COLUMNS[0].states.includes(item.state) &&
        item.closedDate && new Date(item.closedDate as string) <= dayEnd
      );
      entry['Concluído'] = completedItems.length;
      allItemsThatDay.push(...completedItems);

      // Itens em cada estado WIP (utiliza o estado atual como proxy)
      // Para itens abertos criados até a data, distribui pelo estado atual
      const openItems = data.filter(item =>
        !WORKFLOW_COLUMNS[0].states.includes(item.state) &&
        new Date(item.createdDate as string) <= dayEnd
      );

      WORKFLOW_COLUMNS.slice(1).forEach(col => {
        const colItems = openItems.filter(item => col.states.some(s => item.state === s));
        entry[col.label] = colItems.length;
        allItemsThatDay.push(...colItems);
      });

      entry.items = allItemsThatDay;
      return entry;
    });
  }, [data, period]);

  if (data.length === 0) {
    return <EmptyState message="Nenhum dado para exibir o fluxo cumulativo." />;
  }

  return (
    <div>
      <ItemListModal data={modalData} onClose={() => setModalData(null)} />
      <div className="bg-yellow-900/20 border border-yellow-700/40 rounded-lg p-2 mb-3">
        <p className="text-yellow-300 text-xs">
          ⚠️ <strong>Aproximação:</strong> A coluna "Concluído" usa <em>closedDate</em> real. Para itens em progresso, o CFD usa o <strong>estado atual</strong> como proxy para todas as datas — não reflete o histórico real de transições de estado. Clique num ponto do gráfico pra ver todos os itens daquele dia (não dá pra isolar com precisão uma faixa específica do empilhado).
        </p>
      </div>
      <ResponsiveContainer width="100%" height={400}>
      <AreaChart
        data={chartData}
        margin={{ top: 10, right: 30, left: 0, bottom: 0 }}
        className="cursor-pointer"
        onClick={(e: any) => {
          const p = e?.activePayload?.[0]?.payload;
          if (p?.items?.length) setModalData({ title: `Itens do fluxo — ${p.date}`, items: p.items, color: '#64FFDA' });
        }}
      >
        <CartesianGrid strokeDasharray="3 3" stroke={CHART_COLORS.grid} />
        <XAxis dataKey="date" stroke={CHART_COLORS.text} tick={{ fontSize: 10 }} />
        <YAxis stroke={CHART_COLORS.text} allowDecimals={false} />
        <Tooltip
          contentStyle={{ backgroundColor: '#0a192f', border: '1px solid #64ffda', borderRadius: '8px', color: '#e6f1ff', padding: '10px 14px' }}
          labelStyle={{ color: '#64ffda', fontWeight: 'bold' }}
          itemStyle={{ color: '#e6f1ff' }}
        />
        <Legend wrapperStyle={{ color: CHART_COLORS.text }} />
        {WORKFLOW_COLUMNS.map((col) => (
          <Area
            key={col.key}
            type="monotone"
            dataKey={col.label}
            stackId="1"
            stroke={col.color}
            fill={col.color}
            fillOpacity={0.6}
          />
        ))}
      </AreaChart>
    </ResponsiveContainer>
    </div>
  );
};

export default CumulativeFlowDiagram;