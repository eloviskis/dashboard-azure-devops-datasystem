import React, { useMemo } from 'react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { WorkItem, WorkItemStatus } from '../types.ts';
import { CHART_COLORS } from '../constants.ts';
import { EmptyState } from './ChartStates.tsx';
// Fix: Import date-fns functions from their respective submodules for v2 compatibility.
import { format, subDays, eachDayOfInterval, endOfDay } from 'date-fns';

interface CumulativeFlowDiagramProps {
  data: WorkItem[];
  period: number;
}

const CumulativeFlowDiagram: React.FC<CumulativeFlowDiagramProps> = ({ data, period }) => {
  const chartData = useMemo(() => {
    const endDate = new Date();
    const startDate = subDays(endDate, period - 1);
    const dateRange = eachDayOfInterval({ start: startDate, end: endDate });

    return dateRange.map(date => {
      const dayEnd = endOfDay(date);

      const created = data.filter(item => 
        item.createdDate <= dayEnd
      ).length;
      
      const completed = data.filter(item => 
        item.status === WorkItemStatus.Concluido && 
        item.closedDate && 
        item.closedDate <= dayEnd
      ).length;

      return {
        date: format(date, 'dd/MM'),
        'Concluído': completed,
        'Em Progresso (WIP)': created - completed,
      };
    });
  }, [data, period]);

  if (data.length === 0) {
    return <EmptyState message="Nenhum dado para exibir o fluxo cumulativo." />;
  }

  return (
    <ResponsiveContainer width="100%" height={300}>
      <AreaChart data={chartData} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke={CHART_COLORS.grid} />
        <XAxis dataKey="date" stroke={CHART_COLORS.text} />
        <YAxis stroke={CHART_COLORS.text} allowDecimals={false} />
        <Tooltip
          contentStyle={{ backgroundColor: CHART_COLORS.tooltipBg, borderColor: CHART_COLORS.grid }}
        />
        <Legend wrapperStyle={{ color: CHART_COLORS.text }} />
        <Area type="monotone" dataKey="Concluído" stackId="1" stroke={CHART_COLORS.primary} fill={CHART_COLORS.primary} fillOpacity={0.6} />
        <Area type="monotone" dataKey="Em Progresso (WIP)" stackId="1" stroke={CHART_COLORS.secondary} fill={CHART_COLORS.secondary} fillOpacity={0.6} />
      </AreaChart>
    </ResponsiveContainer>
  );
};

export default CumulativeFlowDiagram;