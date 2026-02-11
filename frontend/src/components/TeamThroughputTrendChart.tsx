import React, { useMemo, useState } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { WorkItem } from '../types.ts';
import { CHART_COLORS } from '../constants.ts';
import { EmptyState } from './ChartStates.tsx';
import { getWeek, getYear, getMonth, format } from 'date-fns'; // Updated to named imports
import { ptBR } from 'date-fns/locale';
import { COMPLETED_STATES } from '../utils/metrics.ts';

interface TeamThroughputTrendChartProps {
  data: WorkItem[];
}

type GroupMode = 'weekly' | 'monthly';

const TeamThroughputTrendChart: React.FC<TeamThroughputTrendChartProps> = ({ data }) => {
  const [groupMode, setGroupMode] = useState<GroupMode>('weekly');

  const { chartData, teams } = useMemo(() => {
    const completedItems = data.filter(item => COMPLETED_STATES.includes(item.state) && item.closedDate);
    const teams = [...new Set(completedItems.map(item => item.team))].sort();

    if (completedItems.length === 0) {
      return { chartData: [], teams: [] };
    }

    if (groupMode === 'monthly') {
      const throughputByMonth = completedItems.reduce((acc, item) => {
        const d = new Date(item.closedDate!);
        const monthKey = `${getYear(d)}-${String(getMonth(d) + 1).padStart(2, '0')}`;
        if (!acc[monthKey]) acc[monthKey] = {};
        acc[monthKey][item.team!] = (acc[monthKey][item.team!] || 0) + 1;
        return acc;
      }, {} as Record<string, Record<string, number>>);

      const chartData = Object.entries(throughputByMonth)
        .map(([key, teamData]) => {
          const [y, m] = key.split('-').map(Number);
          const label = format(new Date(y, m - 1), 'MMM/yy', { locale: ptBR });
          return { week: label, sortKey: key, ...(teamData as object) };
        })
        .sort((a, b) => a.sortKey.localeCompare(b.sortKey));

      return { chartData, teams };
    }

    // Weekly (default)
    const throughputByWeek = completedItems.reduce((acc, item) => {
      const weekKey = `${getYear(item.closedDate!)}-W${getWeek(item.closedDate!, { weekStartsOn: 1 }).toString().padStart(2, '0')}`;
      if (!acc[weekKey]) {
        acc[weekKey] = {};
      }
      acc[weekKey][item.team!] = (acc[weekKey][item.team!] || 0) + 1;
      return acc;
    }, {} as Record<string, Record<string, number>>);

    const chartData = Object.entries(throughputByWeek)
      .map(([weekKey, teamData]) => ({
        week: weekKey,
        ...(teamData as object)
      }))
      .sort((a, b) => a.week.localeCompare(b.week));

    return { chartData, teams };
  }, [data, groupMode]);

  if (chartData.length === 0) {
    return <EmptyState message="Nenhum item concluído para exibir a tendência de vazão." />;
  }

  return (
    <div>
      <div className="flex items-center gap-2 mb-4">
        {[
          { value: 'weekly' as GroupMode, label: 'Semanal' },
          { value: 'monthly' as GroupMode, label: 'Mensal' },
        ].map(opt => (
          <button
            key={opt.value}
            onClick={() => setGroupMode(opt.value)}
            className={`px-3 py-1.5 text-xs rounded-md font-medium transition-colors ${groupMode === opt.value ? 'bg-ds-green text-ds-dark-blue' : 'bg-ds-muted/20 text-ds-text hover:bg-ds-muted/40'}`}
          >
            {opt.label}
          </button>
        ))}
      </div>
      <ResponsiveContainer width="100%" height={350}>
        <BarChart data={chartData} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={CHART_COLORS.grid} />
          <XAxis dataKey="week" stroke={CHART_COLORS.text} tick={{ fontSize: 11 }} />
          <YAxis stroke={CHART_COLORS.text} allowDecimals={false} />
          <Tooltip 
            cursor={{ fill: 'rgba(100, 255, 218, 0.1)' }}
            contentStyle={{ backgroundColor: '#0a192f', border: '1px solid #64ffda', borderRadius: '8px', color: '#e6f1ff', padding: '10px 14px' }}
            labelStyle={{ color: '#64ffda', fontWeight: 'bold' }}
            itemStyle={{ color: '#e6f1ff' }}
          />
          <Legend />
          {teams.map((team, index) => (
            <Bar 
              key={team} 
              dataKey={team} 
              stackId="a" 
              fill={CHART_COLORS.palette[index % CHART_COLORS.palette.length]} 
            />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
};

export default TeamThroughputTrendChart;
