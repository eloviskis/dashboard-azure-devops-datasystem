
import React, { useMemo } from 'react';
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
  const chartData = useMemo(() => {
    const endDate = new Date();
    const startDate = subDays(endDate, Math.min(period - 1, 90)); // Limita a 90 dias para performance
    const dateRange = eachDayOfInterval({ start: startDate, end: endDate });

    return dateRange.map(date => {
      const dayEnd = endOfDay(date);
      const entry: Record<string, any> = { date: format(date, 'dd/MM') };

      // Para cada coluna, contar itens que estavam naquele estado até aquela data
      // Itens concluídos até a data
      const completedByDate = data.filter(item =>
        WORKFLOW_COLUMNS[0].states.includes(item.state) &&
        item.closedDate && new Date(item.closedDate as string) <= dayEnd
      ).length;
      entry['Concluído'] = completedByDate;

      // Itens em cada estado WIP (utiliza o estado atual como proxy)
      // Para itens abertos criados até a data, distribui pelo estado atual
      const openItems = data.filter(item =>
        !WORKFLOW_COLUMNS[0].states.includes(item.state) &&
        new Date(item.createdDate as string) <= dayEnd
      );

      WORKFLOW_COLUMNS.slice(1).forEach(col => {
        entry[col.label] = openItems.filter(item => col.states.some(s => item.state === s)).length;
      });

      return entry;
    });
  }, [data, period]);

  if (data.length === 0) {
    return <EmptyState message="Nenhum dado para exibir o fluxo cumulativo." />;
  }

  return (
    <ResponsiveContainer width="100%" height={400}>
      <AreaChart data={chartData} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke={CHART_COLORS.grid} />
        <XAxis dataKey="date" stroke={CHART_COLORS.text} tick={{ fontSize: 10 }} />
        <YAxis stroke={CHART_COLORS.text} allowDecimals={false} />
        <Tooltip
          contentStyle={{ backgroundColor: CHART_COLORS.tooltipBg, borderColor: CHART_COLORS.grid, borderRadius: '8px' }}
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
  );
};

export default CumulativeFlowDiagram;