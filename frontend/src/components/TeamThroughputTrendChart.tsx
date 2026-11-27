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

type GroupMode = 'weekly' | 'biweekly' | 'monthly' | 'yearly';

const TeamThroughputTrendChart: React.FC<TeamThroughputTrendChartProps> = ({ data }) => {
  const [groupMode, setGroupMode] = useState<GroupMode>('weekly');
  const [modalData, setModalData] = useState<ModalData | null>(null);

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
        if (!acc[monthKey][item.team!]) acc[monthKey][item.team!] = [];
        acc[monthKey][item.team!].push(item);
        return acc;
      }, {} as Record<string, Record<string, WorkItem[]>>);

      const chartData = Object.entries(throughputByMonth)
        .map(([key, teamItems]) => {
          const [y, m] = key.split('-').map(Number);
          const label = format(new Date(y, m - 1), 'MMM/yy', { locale: ptBR });
          const counts: Record<string, number> = {};
          Object.entries(teamItems).forEach(([team, items]) => { counts[team] = items.length; });
          return { week: label, sortKey: key, ...counts, itemsByTeam: teamItems };
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

      const throughputByBiweek: Record<string, Record<string, WorkItem[]>> = {};
      periods.forEach(p => {
        throughputByBiweek[p.key] = {};
        completedItems.forEach(item => {
          const d = new Date(item.closedDate!);
          if (isWithinInterval(d, { start: p.start, end: p.end })) {
            if (!throughputByBiweek[p.key][item.team!]) throughputByBiweek[p.key][item.team!] = [];
            throughputByBiweek[p.key][item.team!].push(item);
          }
        });
      });

      const chartData = periods.map(p => {
        const counts: Record<string, number> = {};
        Object.entries(throughputByBiweek[p.key]).forEach(([team, items]) => { counts[team] = items.length; });
        return { week: p.key, ...counts, itemsByTeam: throughputByBiweek[p.key] };
      });

      return { chartData, teams };
    }

    if (groupMode === 'yearly') {
      const now = new Date();
      const start = subMonths(now, 36);
      try {
        const years = eachYearOfInterval({ start, end: now });
        const throughputByYear: Record<string, Record<string, WorkItem[]>> = {};

        years.forEach(yearStart => {
          const yearEnd = endOfYear(yearStart);
          const yearKey = format(yearStart, 'yyyy');
          throughputByYear[yearKey] = {};
          completedItems.forEach(item => {
            const d = new Date(item.closedDate!);
            if (isWithinInterval(d, { start: yearStart, end: yearEnd })) {
              if (!throughputByYear[yearKey][item.team!]) throughputByYear[yearKey][item.team!] = [];
              throughputByYear[yearKey][item.team!].push(item);
            }
          });
        });

        const chartData = years.map(yearStart => {
          const yearKey = format(yearStart, 'yyyy');
          const counts: Record<string, number> = {};
          Object.entries(throughputByYear[yearKey]).forEach(([team, items]) => { counts[team] = items.length; });
          return { week: yearKey, ...counts, itemsByTeam: throughputByYear[yearKey] };
        });

        return { chartData, teams };
      } catch { return { chartData: [], teams }; }
    }

    // Weekly (default)
    const throughputByWeek = completedItems.reduce((acc, item) => {
      const weekKey = `${getYear(item.closedDate!)}-W${getWeek(item.closedDate!, { weekStartsOn: 1 }).toString().padStart(2, '0')}`;
      if (!acc[weekKey]) acc[weekKey] = {};
      if (!acc[weekKey][item.team!]) acc[weekKey][item.team!] = [];
      acc[weekKey][item.team!].push(item);
      return acc;
    }, {} as Record<string, Record<string, WorkItem[]>>);

    const chartData = Object.entries(throughputByWeek)
      .map(([weekKey, teamItems]) => {
        const counts: Record<string, number> = {};
        Object.entries(teamItems).forEach(([team, items]) => { counts[team] = items.length; });
        return { week: weekKey, ...counts, itemsByTeam: teamItems };
      })
      .sort((a, b) => a.week.localeCompare(b.week));

    return { chartData, teams };
  }, [data, groupMode]);

  if (chartData.length === 0) {
    return <EmptyState message="Nenhum item concluído para exibir a tendência de vazão." />;
  }

  return (
    <div>
      <ItemListModal data={modalData} onClose={() => setModalData(null)} />
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
              cursor="pointer"
              onClick={(d: any) => {
                const items = d?.itemsByTeam?.[team as string];
                if (items?.length) setModalData({ title: `${team} — ${d.week}`, items, color: CHART_COLORS.palette[index % CHART_COLORS.palette.length] });
              }}
              label={{ position: 'inside', fill: '#fff', fontSize: 9 }}
            />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
};

export default TeamThroughputTrendChart;
