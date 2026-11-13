import React, { useMemo, useState } from 'react';
import { ScatterChart, Scatter, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ZAxis, ReferenceLine } from 'recharts';
import { WorkItem } from '../types';
import { CHART_COLORS } from '../constants';

interface StoryPointsVsCycleTimeProps {
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
                      <a href={item.url || `${AZURE_DEVOPS_BASE_URL}/${item.workItemId}`} target="_blank" rel="noopener noreferrer" className="text-white hover:text-ds-green font-medium block truncate mb-1" title={item.title}>
                        {item.title}
                      </a>
                      <div className="grid grid-cols-2 gap-1 text-xs text-ds-text">
                        <div>👥 {item.team || 'Sem time'}</div>
                        <div>🏷️ {item.type}</div>
                        {item.storyPoints != null && <div>⚡ {item.storyPoints} SP</div>}
                        {item.cycleTime != null && <div>⏱️ {item.cycleTime.toFixed(1)}d</div>}
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

const StoryPointsVsCycleTimeChart: React.FC<StoryPointsVsCycleTimeProps> = ({ data }) => {
  const [modalData, setModalData] = useState<ModalData | null>(null);

  const analysis = useMemo(() => {
    const items = data.filter(i =>
      COMPLETED_STATES.includes(i.state) &&
      i.cycleTime != null && i.cycleTime > 0 &&
      i.storyPoints != null && i.storyPoints > 0
    );

    if (items.length < 5) return null;

    const scatterData = items.map(i => ({
      sp: i.storyPoints as number,
      ct: i.cycleTime as number,
      title: i.title,
      team: i.team,
      type: i.type,
      item: i,
    }));

    // Média de CT por SP
    const spGroups: Record<number, WorkItem[]> = {};
    items.forEach(i => {
      const sp = i.storyPoints as number;
      if (!spGroups[sp]) spGroups[sp] = [];
      spGroups[sp].push(i);
    });

    const avgBySP = Object.entries(spGroups)
      .map(([sp, groupItems]) => {
        const cts = groupItems.map(i => i.cycleTime as number);
        return {
          sp: Number(sp),
          avgCT: Math.round((cts.reduce((a, b) => a + b, 0) / cts.length) * 10) / 10,
          count: cts.length,
          items: groupItems,
        };
      })
      .sort((a, b) => a.sp - b.sp);

    // Correlação (Pearson)
    const n = items.length;
    const sumX = items.reduce((s, i) => s + (i.storyPoints as number), 0);
    const sumY = items.reduce((s, i) => s + (i.cycleTime as number), 0);
    const sumXY = items.reduce((s, i) => s + (i.storyPoints as number) * (i.cycleTime as number), 0);
    const sumX2 = items.reduce((s, i) => s + (i.storyPoints as number) ** 2, 0);
    const sumY2 = items.reduce((s, i) => s + (i.cycleTime as number) ** 2, 0);
    const correlation = (n * sumXY - sumX * sumY) / Math.sqrt((n * sumX2 - sumX ** 2) * (n * sumY2 - sumY ** 2));

    return { scatterData, avgBySP, correlation: isNaN(correlation) ? 0 : Math.round(correlation * 100) / 100, total: items.length };
  }, [data]);

  if (!analysis) {
    return (
      <div className="bg-ds-navy p-4 rounded-lg border border-ds-border text-center text-ds-text py-8">
        Sem dados suficientes (são necessários itens concluídos com Story Points e Cycle Time).
      </div>
    );
  }

  const correlationLabel = Math.abs(analysis.correlation) > 0.7 ? 'Forte' : Math.abs(analysis.correlation) > 0.3 ? 'Moderada' : 'Fraca';
  const correlationColor = Math.abs(analysis.correlation) > 0.7 ? 'text-green-400' : Math.abs(analysis.correlation) > 0.3 ? 'text-yellow-400' : 'text-red-400';

  return (
    <div className="space-y-4">
      <ItemListModal data={modalData} onClose={() => setModalData(null)} />
      <div className="flex items-center gap-4 flex-wrap">
        <div
          className="bg-ds-navy p-4 rounded-lg border border-ds-border text-center cursor-pointer hover:border-ds-green transition-colors"
          onClick={() => setModalData({ title: 'Itens usados na Correlação SP × CT', items: analysis.scatterData.map(d => d.item), color: '#64FFDA' })}
        >
          <p className="text-ds-text text-xs">Correlação SP × CT</p>
          <p className={`text-2xl font-bold ${correlationColor}`}>{analysis.correlation}</p>
          <p className="text-ds-text text-xs">{correlationLabel}</p>
        </div>
        <div
          className="bg-ds-navy p-4 rounded-lg border border-ds-border text-center cursor-pointer hover:border-ds-green transition-colors"
          onClick={() => setModalData({ title: 'Itens Analisados', items: analysis.scatterData.map(d => d.item), color: '#64FFDA' })}
        >
          <p className="text-ds-text text-xs">Itens Analisados</p>
          <p className="text-2xl font-bold text-ds-light-text">{analysis.total}</p>
        </div>
        <div className="text-xs text-ds-text max-w-sm">
          <p>Correlação próxima de <strong className="text-green-400">1</strong> = estimativas calibradas (mais SP = mais tempo).</p>
          <p>Correlação próxima de <strong className="text-red-400">0</strong> = estimativas não refletem a realidade.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Scatter */}
        <div className="bg-ds-navy p-4 rounded-lg border border-ds-border">
          <h3 className="text-ds-light-text font-bold text-lg mb-4">Story Points × Cycle Time</h3>
          <ResponsiveContainer width="100%" height={350}>
            <ScatterChart margin={{ top: 10, right: 20, bottom: 10, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={CHART_COLORS.grid} />
              <XAxis dataKey="sp" name="Story Points" stroke={CHART_COLORS.text} tick={{ fontSize: 11 }} label={{ value: 'Story Points', position: 'insideBottom', offset: -5, style: { fill: CHART_COLORS.text, fontSize: 11 } }} />
              <YAxis dataKey="ct" name="Cycle Time" stroke={CHART_COLORS.text} tick={{ fontSize: 11 }} label={{ value: 'Cycle Time (dias)', angle: -90, position: 'insideLeft', style: { fill: CHART_COLORS.text, fontSize: 11 } }} />
              <Tooltip
                contentStyle={{ backgroundColor: '#0a192f', border: '1px solid #64ffda', borderRadius: '8px', color: '#e6f1ff', padding: '10px 14px' }} labelStyle={{ color: '#64ffda', fontWeight: 'bold' }} itemStyle={{ color: '#e6f1ff' }}
                formatter={(value: any, name: string) => {
                  if (name === 'sp') return [`${value} SP`, 'Story Points'];
                  if (name === 'ct') return [`${value} dias`, 'Cycle Time'];
                  return [value, name];
                }}
                labelFormatter={() => ''}
              />
              <Scatter
                name="Itens"
                data={analysis.scatterData}
                fill="#64FFDA"
                fillOpacity={0.6}
                cursor="pointer"
                onClick={(d: any) => setModalData({ title: `#${d.item.workItemId} — ${d.item.title}`, items: [d.item], color: '#64FFDA' })}
              />
            </ScatterChart>
          </ResponsiveContainer>
        </div>

        {/* Média de CT por SP */}
        <div className="bg-ds-navy p-4 rounded-lg border border-ds-border">
          <h3 className="text-ds-light-text font-bold text-lg mb-4">CT Médio por Story Points</h3>
          <div className="space-y-2">
            {analysis.avgBySP.map(row => (
              <div
                key={row.sp}
                className="flex items-center gap-3 p-2 bg-ds-bg rounded cursor-pointer hover:bg-ds-bg/70 transition-colors"
                onClick={() => setModalData({ title: `Itens com ${row.sp} SP`, items: row.items, color: '#64FFDA' })}
              >
                <span className="text-ds-green font-bold text-lg w-10 text-center">{row.sp}</span>
                <span className="text-ds-text text-xs">SP</span>
                <div className="flex-1 bg-ds-navy rounded-full h-3 overflow-hidden">
                  <div
                    className="h-full bg-ds-green rounded-full transition-all"
                    style={{ width: `${Math.min((row.avgCT / (analysis.avgBySP[analysis.avgBySP.length - 1]?.avgCT || 1)) * 100, 100)}%` }}
                  />
                </div>
                <div className="text-right min-w-[80px]">
                  <span className="text-ds-light-text font-bold">{row.avgCT}d</span>
                  <span className="text-ds-text text-xs ml-1">({row.count})</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default StoryPointsVsCycleTimeChart;
