

import React, { useMemo } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { WorkItem, WorkItemType } from '../types.ts';
import { CHART_COLORS } from '../constants.ts';
import { EmptyState } from './ChartStates.tsx';
// Fix: Import date-fns functions from their respective submodules for v2 compatibility.
import { format, subDays, eachDayOfInterval } from 'date-fns';

interface BugCreationTrendChartProps {
  data: WorkItem[];
  period: number;
}

const BugCreationTrendChart: React.FC<BugCreationTrendChartProps> = ({ data, period }) => {
  const chartData = useMemo(() => {
    const endDate = new Date();
    const startDate = subDays(endDate, period - 1);
    const dateRange = eachDayOfInterval({ start: startDate, end: endDate });

    const itemsByDay = data.reduce((acc, item) => {
      const dateStr = format(item.createdDate, 'yyyy-MM-dd');
      if (!acc[dateStr]) {
        acc[dateStr] = { bugs: 0, issues: 0 };
      }
      if (item.type === WorkItemType.Bug) {
        acc[dateStr].bugs += 1;
      } else if (item.type === WorkItemType.Issue) {
        acc[dateStr].issues += 1;
      }
      return acc;
    }, {} as Record<string, { bugs: number, issues: number }>);
    
    return dateRange.map(date => {
      const dateStr = format(date, 'yyyy-MM-dd');
      const formattedDate = format(date, 'dd/MM');
      return {
        date: formattedDate,
        Bugs: itemsByDay[dateStr]?.bugs || 0,
        Incidentes: itemsByDay[dateStr]?.issues || 0,
      };
    });
  }, [data, period]);

  if (data.length === 0) {
    return <EmptyState message="Nenhuma tendência de criação para exibir." />;
  }

  return (
    <ResponsiveContainer width="100%" height={300}>
      <LineChart data={chartData} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
        <CartesianGrid strokeDasharray="3 3" stroke={CHART_COLORS.grid} />
        <XAxis dataKey="date" stroke={CHART_COLORS.text} />
        <YAxis stroke={CHART_COLORS.text} />
        <Tooltip
          cursor={{ stroke: CHART_COLORS.primary, strokeWidth: 1 }}
          contentStyle={{ backgroundColor: CHART_COLORS.tooltipBg, borderColor: CHART_COLORS.grid }}
        />
        <Legend wrapperStyle={{ color: CHART_COLORS.text }} />
        <Line type="monotone" dataKey="Bugs" stroke={CHART_COLORS.bug} strokeWidth={2} />
        <Line type="monotone" dataKey="Incidentes" stroke={CHART_COLORS.issue} strokeWidth={2} />
      </LineChart>
    </ResponsiveContainer>
  );
};

export default BugCreationTrendChart;