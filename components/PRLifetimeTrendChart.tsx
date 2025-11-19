

import React, { useMemo } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { PullRequest, PullRequestStatus } from '../types.ts';
import { CHART_COLORS } from '../constants.ts';
import { EmptyState } from './ChartStates.tsx';
// Fix: Import date-fns functions from their respective submodules for v2 compatibility.
import format from 'date-fns/format';
import subDays from 'date-fns/subDays';
import eachDayOfInterval from 'date-fns/eachDayOfInterval';

interface PRLifetimeTrendChartProps {
  data: PullRequest[];
  period: number;
}

const PRLifetimeTrendChart: React.FC<PRLifetimeTrendChartProps> = ({ data, period }) => {
  const chartData = useMemo(() => {
    const endDate = new Date();
    const startDate = subDays(endDate, period - 1);
    const dateRange = eachDayOfInterval({ start: startDate, end: endDate });

    // Primeiro, agrupe os PRs por data de fechamento e colete os tempos de vida
    const lifetimesByDay = data
      .filter(pr => pr.status === PullRequestStatus.Concluido && pr.closedDate && pr.lifetimeHours !== undefined)
      .reduce((acc: Record<string, number[]>, pr) => {
        const dateStr = format(pr.closedDate!, 'yyyy-MM-dd');
        if (!acc[dateStr]) {
          acc[dateStr] = [];
        }
        acc[dateStr].push(pr.lifetimeHours!);
        return acc;
      }, {} as Record<string, number[]>);

    // Em seguida, calcule a média para cada dia
    const avgLifetimeByDay = Object.entries(lifetimesByDay).reduce((acc: Record<string, number>, [dateStr, lifetimes]: [string, number[]]) => {
      const sum = lifetimes.reduce((a, b) => a + b, 0);
      acc[dateStr] = sum / lifetimes.length;
      return acc;
    }, {} as Record<string, number>);

    return dateRange.map(date => {
      const dateStr = format(date, 'yyyy-MM-dd');
      const formattedDate = format(date, 'dd/MM');
      const avgLifetime = avgLifetimeByDay[dateStr] ? parseFloat(avgLifetimeByDay[dateStr].toFixed(1)) : 0;
      return {
        date: formattedDate,
        'Tempo Médio (Horas)': avgLifetime,
      };
    });
  }, [data, period]);

  if (data.filter(pr => pr.status === PullRequestStatus.Concluido).length === 0) {
    return <EmptyState message="Nenhum PR concluído no período para exibir a tendência." />;
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
          formatter={(value: number) => [`${value}h`, 'Tempo Médio']}
        />
        <Legend wrapperStyle={{ color: CHART_COLORS.text }} />
        <Line type="monotone" dataKey="Tempo Médio (Horas)" stroke={CHART_COLORS.secondary} strokeWidth={2} dot={{ r: 4 }} activeDot={{ r: 8 }} />
      </LineChart>
    </ResponsiveContainer>
  );
};

export default PRLifetimeTrendChart;