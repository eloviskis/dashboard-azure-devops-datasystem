import React, { useMemo, useState } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { WorkItem } from '../types.ts';
import { CHART_COLORS } from '../constants.ts';
import { EmptyState } from './ChartStates.tsx';
import { getWeek, getYear, getMonth, format, subWeeks, subMonths, addDays, isWithinInterval, eachYearOfInterval, startOfYear, endOfYear } from 'date-fns'; // Updated to named imports
import { ptBR } from 'date-fns/locale';
import { COMPLETED_STATES } from '../utils/metrics.ts';

interface TeamThroughputTrendChartProps {
  data: WorkItem[];
}

type GroupMode = 'weekly' | 'biweekly' | 'monthly' | 'yearly';

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

    if (groupMode === 'biweekly') {
      const now = new Date();
      const start = subMonths(now, 6);
      const periods: { start: Date; end: Date; key: string }[] = [];
      let cursor = new Date(start);
      while (cursor < now) {
        const periodEnd = addDays(cursor, 13);
        const label = `${format(cursor, 'dd/MM')}-${format(periodEnd > now ? now : periodEnd, 'dd/MM')}`;
        periods.push({ start: new Date(cursor), end: periodEnd > now ? now : periodEnd, key: label });
        cursor = addDays(cursor, 14);
      }
      
      const throughputByBiweek: Record<string, Record<string, number>> = {};
      periods.forEach(p => {
        throughputByBiweek[p.key] = {};
        completedItems.forEach(item => {
          const d = new Date(item.closedDate!);
          if (isWithinInterval(d, { start: p.start, end: p.end })) {
            throughputByBiweek[p.key][item.team!] = (throughputByBiweek[p.key][item.team!] || 0) + 1;
          }
        });
      });

      const chartData = periods.map(p => ({
        week: p.key,
        ...(throughputByBiweek[p.key] as object)
      }));

      return { chartData, teams };
    }

    if (groupMode === 'yearly') {
      const now = new Date();
      const start = subMonths(now, 36);
      try {
        const years = eachYearOfInterval({ start, end: now });
        const throughputByYear: Record<string, Record<string, number>> = {};
        
        years.forEach(yearStart => {
          const yearEnd = endOfYear(yearStart);
          const yearKey = format(yearStart, 'yyyy');
          throughputByYear[yearKey] = {};
          completedItems.forEach(item => {
            const d = new Date(item.closedDate!);
            if (isWithinInterval(d, { start: yearStart, end: yearEnd })) {
              throughputByYear[yearKey][item.team!] = (throughputByYear[yearKey][item.team!] || 0) + 1;
            }
          });
        });

        const chartData = years.map(yearStart => ({
          week: format(yearStart, 'yyyy'),
          ...(throughputByYear[format(yearStart, 'yyyy')] as object)
        }));

        return { chartData, teams };
      } catch { return { chartData: [], teams }; }
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
          { value: 'biweekly' as GroupMode, label: 'Quinzenal' },
          { value: 'monthly' as GroupMode, label: 'Mensal' },
          { value: 'yearly' as GroupMode, label: 'Anual' },
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
              label={{ position: 'inside', fill: '#fff', fontSize: 9 }}
            />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
};

export default TeamThroughputTrendChart;
