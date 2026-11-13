import React, { useMemo, useState } from 'react';
import { WorkItem } from '../types';
import { CHART_COLORS } from '../constants';

interface ActivityHeatmapProps {
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

const COMPLETED_STATES = ['Done', 'Concluído', 'Closed', 'Fechado', 'Finished', 'Resolved', 'Pronto'];
const DAYS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
const HOURS = Array.from({ length: 24 }, (_, i) => i);

const ActivityHeatmap: React.FC<ActivityHeatmapProps> = ({ data }) => {
  const [modalData, setModalData] = useState<ModalData | null>(null);

  const heatmapData = useMemo(() => {
    const grid: WorkItem[][][] = Array.from({ length: 7 }, () => Array.from({ length: 24 }, () => [] as WorkItem[]));
    let maxCount = 0;

    // Contar itens concluídos por dia da semana e hora
    const completedItems = data.filter(i => COMPLETED_STATES.includes(i.state) && i.closedDate);

    completedItems.forEach(item => {
      const d = new Date(item.closedDate as string);
      if (!isNaN(d.getTime())) {
        const day = d.getDay();
        const hour = d.getHours();
        grid[day][hour].push(item);
        if (grid[day][hour].length > maxCount) maxCount = grid[day][hour].length;
      }
    });

    // Contar itens criados por dia e hora
    const createdGrid: WorkItem[][][] = Array.from({ length: 7 }, () => Array.from({ length: 24 }, () => [] as WorkItem[]));
    let maxCreated = 0;
    data.forEach(item => {
      const d = new Date(item.createdDate as string);
      if (!isNaN(d.getTime())) {
        const day = d.getDay();
        const hour = d.getHours();
        createdGrid[day][hour].push(item);
        if (createdGrid[day][hour].length > maxCreated) maxCreated = createdGrid[day][hour].length;
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

  const renderGrid = (grid: WorkItem[][][], max: number, colorFn: (v: number, m: number) => string, title: string, modalColor: string) => (
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
              {HOURS.map(hour => {
                const items = grid[dayIdx][hour];
                return (
                  <div
                    key={hour}
                    className={`w-[15px] h-[15px] rounded-sm ${colorFn(items.length, max)} ${items.length > 0 ? 'cursor-pointer hover:ring-1 hover:ring-ds-green' : 'cursor-default'}`}
                    title={`${day} ${String(hour).padStart(2, '0')}:00 — ${items.length} itens`}
                    onClick={() => items.length > 0 && setModalData({ title: `${title} — ${day} ${String(hour).padStart(2, '0')}:00`, items, color: modalColor })}
                  />
                );
              })}
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
      const dayTotal = completedGrid[dayIdx].reduce((a, b) => a + b.length, 0);
      if (dayTotal > bestDayCount) { bestDay = dayIdx; bestDayCount = dayTotal; }
    });

    HOURS.forEach(hour => {
      const hourTotal = completedGrid.reduce((sum, day) => sum + day[hour].length, 0);
      if (hourTotal > bestHourCount) { bestHour = hour; bestHourCount = hourTotal; }
    });

    const weekdayItems = [1, 2, 3, 4, 5].flatMap(d => completedGrid[d].flat());
    const weekendItems = [0, 6].flatMap(d => completedGrid[d].flat());

    return {
      bestDay: DAYS[bestDay], bestDayCount, bestHour, bestHourCount,
      weekdayTotal: weekdayItems.length, weekendTotal: weekendItems.length,
      weekdayItems, weekendItems,
      bestDayItems: completedGrid[bestDay].flat(),
      bestHourItems: completedGrid.flatMap(day => day[bestHour]),
    };
  }, [heatmapData]);

  return (
    <div className="space-y-4">
      <ItemListModal data={modalData} onClose={() => setModalData(null)} />
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div
          className="bg-ds-navy p-3 rounded-lg border border-ds-border text-center cursor-pointer hover:border-ds-green transition-colors"
          onClick={() => setModalData({ title: `Conclusões — ${insights.bestDay}`, items: insights.bestDayItems, color: '#16A34A' })}
        >
          <p className="text-ds-text text-xs">Dia Mais Ativo</p>
          <p className="text-lg font-bold text-ds-green">{insights.bestDay}</p>
          <p className="text-ds-text text-xs">{insights.bestDayCount} conclusões</p>
        </div>
        <div
          className="bg-ds-navy p-3 rounded-lg border border-ds-border text-center cursor-pointer hover:border-ds-green transition-colors"
          onClick={() => setModalData({ title: `Conclusões — ${String(insights.bestHour).padStart(2, '0')}:00`, items: insights.bestHourItems, color: '#16A34A' })}
        >
          <p className="text-ds-text text-xs">Hora Mais Produtiva</p>
          <p className="text-lg font-bold text-ds-green">{String(insights.bestHour).padStart(2, '0')}:00</p>
          <p className="text-ds-text text-xs">{insights.bestHourCount} conclusões</p>
        </div>
        <div
          className="bg-ds-navy p-3 rounded-lg border border-ds-border text-center cursor-pointer hover:border-ds-green transition-colors"
          onClick={() => setModalData({ title: 'Entregas em dias úteis', items: insights.weekdayItems, color: '#1D4ED8' })}
        >
          <p className="text-ds-text text-xs">Entregas em Dias Úteis</p>
          <p className="text-lg font-bold text-ds-light-text">{insights.weekdayTotal}</p>
        </div>
        <div
          className="bg-ds-navy p-3 rounded-lg border border-ds-border text-center cursor-pointer hover:border-red-400 transition-colors"
          onClick={() => setModalData({ title: 'Entregas em fins de semana', items: insights.weekendItems, color: '#DC2626' })}
        >
          <p className="text-ds-text text-xs">Entregas em Fins de Semana</p>
          <p className="text-lg font-bold text-red-400">{insights.weekendTotal}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {renderGrid(heatmapData.completedGrid, heatmapData.maxCompleted, getColor, '🟢 Heatmap de Conclusões', '#16A34A')}
        {renderGrid(heatmapData.createdGrid, heatmapData.maxCreated, getCreatedColor, '🔵 Heatmap de Criação', '#2563EB')}
      </div>
    </div>
  );
};

export default ActivityHeatmap;
