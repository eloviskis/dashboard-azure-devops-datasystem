import React, { useMemo } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, ReferenceLine } from 'recharts';
import { WorkItem } from '../types';
import { CHART_COLORS } from '../constants';
import { eachDayOfInterval, format, isWithinInterval, startOfDay } from 'date-fns';

interface BurndownChartProps {
  sprintItems: WorkItem[];
  sprintStart: Date;
  sprintEnd: Date;
  sprintName: string;
}

const COMPLETED_STATES = ['Done', 'Concluído', 'Closed', 'Fechado', 'Finished', 'Resolved', 'Pronto'];

const BurndownChart: React.FC<BurndownChartProps> = ({ sprintItems, sprintStart, sprintEnd, sprintName }) => {
  const chartData = useMemo(() => {
    if (!sprintItems.length) return [];

    const totalItems = sprintItems.length;
    const totalSP = sprintItems.reduce((sum, i) => sum + (i.storyPoints || 0), 0);
    
    const today = new Date();
    const effectiveEnd = sprintEnd > today ? today : sprintEnd;
    
    const days = eachDayOfInterval({ start: startOfDay(sprintStart), end: startOfDay(effectiveEnd) });
    const totalDays = eachDayOfInterval({ start: startOfDay(sprintStart), end: startOfDay(sprintEnd) }).length;

    return days.map((day, idx) => {
      const completedByDay = sprintItems.filter(item =>
        COMPLETED_STATES.includes(item.state) &&
        item.closedDate &&
        new Date(item.closedDate as string) <= day
      );

      const remainingItems = totalItems - completedByDay.length;
      const remainingSP = totalSP - completedByDay.reduce((sum, i) => sum + (i.storyPoints || 0), 0);
      const idealRemaining = Math.max(0, totalItems - (totalItems / (totalDays - 1)) * idx);
      const idealRemainingSP = Math.max(0, totalSP - (totalSP / (totalDays - 1)) * idx);

      return {
        date: format(day, 'dd/MM'),
        remaining: remainingItems,
        remainingSP: Math.round(remainingSP * 10) / 10,
        ideal: Math.round(idealRemaining * 10) / 10,
        idealSP: Math.round(idealRemainingSP * 10) / 10,
      };
    });
  }, [sprintItems, sprintStart, sprintEnd]);

  if (!chartData.length) return null;

  return (
    <div className="bg-ds-navy p-4 rounded-lg border border-ds-border">
      <h3 className="text-ds-light-text font-bold text-lg mb-4">📉 Burndown Chart — {sprintName}</h3>
      <ResponsiveContainer width="100%" height={350}>
        <LineChart data={chartData}>
          <CartesianGrid strokeDasharray="3 3" stroke={CHART_COLORS.grid} />
          <XAxis dataKey="date" stroke={CHART_COLORS.text} tick={{ fontSize: 11 }} />
          <YAxis stroke={CHART_COLORS.text} tick={{ fontSize: 11 }} />
          <Tooltip contentStyle={{ backgroundColor: CHART_COLORS.tooltipBg, border: 'none', borderRadius: '8px', color: '#E2E8F0' }} />
          <Legend />
          <Line type="monotone" dataKey="remaining" name="Itens Restantes" stroke="#F56565" strokeWidth={2} dot={{ r: 3 }} />
          <Line type="monotone" dataKey="ideal" name="Ideal (Itens)" stroke="#a0aec0" strokeDasharray="5 5" strokeWidth={1.5} dot={false} />
          <Line type="monotone" dataKey="remainingSP" name="SP Restantes" stroke="#64FFDA" strokeWidth={2} dot={{ r: 3 }} />
          <Line type="monotone" dataKey="idealSP" name="Ideal (SP)" stroke="#64FFDA" strokeDasharray="5 5" strokeWidth={1.5} dot={false} opacity={0.5} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
};

export default BurndownChart;
