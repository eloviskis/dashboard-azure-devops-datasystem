import React, { useMemo } from 'react';
import { WorkItem } from '../types';
import { CHART_COLORS } from '../constants';

interface ActivityHeatmapProps {
  data: WorkItem[];
}

const COMPLETED_STATES = ['Done', 'Concluído', 'Closed', 'Fechado', 'Finished', 'Resolved', 'Pronto'];
const DAYS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
const HOURS = Array.from({ length: 24 }, (_, i) => i);

const ActivityHeatmap: React.FC<ActivityHeatmapProps> = ({ data }) => {
  const heatmapData = useMemo(() => {
    const grid: number[][] = Array.from({ length: 7 }, () => Array(24).fill(0));
    let maxCount = 0;

    // Contar itens concluídos por dia da semana e hora
    const completedItems = data.filter(i => COMPLETED_STATES.includes(i.state) && i.closedDate);
    
    completedItems.forEach(item => {
      const d = new Date(item.closedDate as string);
      if (!isNaN(d.getTime())) {
        const day = d.getDay();
        const hour = d.getHours();
        grid[day][hour]++;
        if (grid[day][hour] > maxCount) maxCount = grid[day][hour];
      }
    });

    // Contar itens criados por dia e hora
    const createdGrid: number[][] = Array.from({ length: 7 }, () => Array(24).fill(0));
    let maxCreated = 0;
    data.forEach(item => {
      const d = new Date(item.createdDate as string);
      if (!isNaN(d.getTime())) {
        const day = d.getDay();
        const hour = d.getHours();
        createdGrid[day][hour]++;
        if (createdGrid[day][hour] > maxCreated) maxCreated = createdGrid[day][hour];
      }
    });

    return { completedGrid: grid, createdGrid, maxCompleted: maxCount, maxCreated };
  }, [data]);

  const getColor = (value: number, max: number) => {
    if (max === 0 || value === 0) return 'bg-ds-bg';
    const intensity = value / max;
    if (intensity > 0.8) return 'bg-green-500';
    if (intensity > 0.6) return 'bg-green-600';
    if (intensity > 0.4) return 'bg-green-700';
    if (intensity > 0.2) return 'bg-green-800';
    return 'bg-green-900';
  };

  const getCreatedColor = (value: number, max: number) => {
    if (max === 0 || value === 0) return 'bg-ds-bg';
    const intensity = value / max;
    if (intensity > 0.8) return 'bg-blue-500';
    if (intensity > 0.6) return 'bg-blue-600';
    if (intensity > 0.4) return 'bg-blue-700';
    if (intensity > 0.2) return 'bg-blue-800';
    return 'bg-blue-900';
  };

  const renderGrid = (grid: number[][], max: number, colorFn: (v: number, m: number) => string, title: string) => (
    <div className="bg-ds-navy p-4 rounded-lg border border-ds-border">
      <h3 className="text-ds-light-text font-bold text-lg mb-4">{title}</h3>
      <div className="overflow-x-auto">
        <div className="min-w-[600px]">
          {/* Header com horas */}
          <div className="flex gap-0.5 mb-0.5 ml-10">
            {HOURS.filter(h => h % 2 === 0).map(h => (
              <div key={h} className="text-ds-text text-[9px] text-center" style={{ width: '32px' }}>
                {String(h).padStart(2, '0')}h
              </div>
            ))}
          </div>
          {/* Grid */}
          {DAYS.map((day, dayIdx) => (
            <div key={day} className="flex gap-0.5 mb-0.5 items-center">
              <span className="text-ds-text text-xs w-10 text-right pr-2">{day}</span>
              {HOURS.map(hour => (
                <div
                  key={hour}
                  className={`w-[15px] h-[15px] rounded-sm ${colorFn(grid[dayIdx][hour], max)} cursor-default`}
                  title={`${day} ${String(hour).padStart(2, '0')}:00 — ${grid[dayIdx][hour]} itens`}
                />
              ))}
            </div>
          ))}
          {/* Legenda */}
          <div className="flex items-center gap-2 mt-3 ml-10">
            <span className="text-ds-text text-xs">Menos</span>
            <div className="w-3 h-3 rounded-sm bg-ds-bg"></div>
            <div className="w-3 h-3 rounded-sm bg-green-900"></div>
            <div className="w-3 h-3 rounded-sm bg-green-700"></div>
            <div className="w-3 h-3 rounded-sm bg-green-500"></div>
            <span className="text-ds-text text-xs">Mais</span>
          </div>
        </div>
      </div>
    </div>
  );

  // Insights
  const insights = useMemo(() => {
    const { completedGrid, maxCompleted } = heatmapData;
    let bestDay = 0, bestDayCount = 0;
    let bestHour = 0, bestHourCount = 0;

    DAYS.forEach((_, dayIdx) => {
      const dayTotal = completedGrid[dayIdx].reduce((a, b) => a + b, 0);
      if (dayTotal > bestDayCount) { bestDay = dayIdx; bestDayCount = dayTotal; }
    });

    HOURS.forEach(hour => {
      const hourTotal = completedGrid.reduce((sum, day) => sum + day[hour], 0);
      if (hourTotal > bestHourCount) { bestHour = hour; bestHourCount = hourTotal; }
    });

    const weekdayTotal = [1, 2, 3, 4, 5].reduce((sum, d) => sum + completedGrid[d].reduce((a, b) => a + b, 0), 0);
    const weekendTotal = [0, 6].reduce((sum, d) => sum + completedGrid[d].reduce((a, b) => a + b, 0), 0);

    return { bestDay: DAYS[bestDay], bestDayCount, bestHour, bestHourCount, weekdayTotal, weekendTotal };
  }, [heatmapData]);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-ds-navy p-3 rounded-lg border border-ds-border text-center">
          <p className="text-ds-text text-xs">Dia Mais Ativo</p>
          <p className="text-lg font-bold text-ds-green">{insights.bestDay}</p>
          <p className="text-ds-text text-xs">{insights.bestDayCount} conclusões</p>
        </div>
        <div className="bg-ds-navy p-3 rounded-lg border border-ds-border text-center">
          <p className="text-ds-text text-xs">Hora Mais Produtiva</p>
          <p className="text-lg font-bold text-ds-green">{String(insights.bestHour).padStart(2, '0')}:00</p>
          <p className="text-ds-text text-xs">{insights.bestHourCount} conclusões</p>
        </div>
        <div className="bg-ds-navy p-3 rounded-lg border border-ds-border text-center">
          <p className="text-ds-text text-xs">Entregas em Dias Úteis</p>
          <p className="text-lg font-bold text-ds-light-text">{insights.weekdayTotal}</p>
        </div>
        <div className="bg-ds-navy p-3 rounded-lg border border-ds-border text-center">
          <p className="text-ds-text text-xs">Entregas em Fins de Semana</p>
          <p className="text-lg font-bold text-red-400">{insights.weekendTotal}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {renderGrid(heatmapData.completedGrid, heatmapData.maxCompleted, getColor, '🟢 Heatmap de Conclusões')}
        {renderGrid(heatmapData.createdGrid, heatmapData.maxCreated, getCreatedColor, '🔵 Heatmap de Criação')}
      </div>
    </div>
  );
};

export default ActivityHeatmap;
