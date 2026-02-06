import React, { useMemo } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, Cell, ReferenceLine } from 'recharts';
import { WorkItem } from '../types';
import { CHART_COLORS } from '../constants';

interface FlowEfficiencyChartProps {
  data: WorkItem[];
}

const COMPLETED_STATES = ['Done', 'Concluído', 'Closed', 'Fechado', 'Finished', 'Resolved', 'Pronto'];

// Status que representam "trabalho ativo" (não espera)
const ACTIVE_WORK_STATES = ['Active', 'Ativo', 'Fazendo Code Review', 'Testando QA'];
// Status que representam "espera"
const WAIT_STATES = ['New', 'Novo', 'Para Desenvolver', 'Aguardando Code Review', 'Aguardando QA'];

const FlowEfficiencyChart: React.FC<FlowEfficiencyChartProps> = ({ data }) => {
  const analysis = useMemo(() => {
    const completedItems = data.filter(i =>
      COMPLETED_STATES.includes(i.state) &&
      i.cycleTime != null && i.cycleTime > 0 &&
      i.timeInStatusDays
    );

    if (completedItems.length === 0) return null;

    // Calcular flow efficiency por time
    const teamMap: Record<string, { activeTime: number; waitTime: number; totalCT: number; count: number }> = {};
    
    completedItems.forEach(item => {
      const team = item.team || 'Sem Time';
      if (!teamMap[team]) teamMap[team] = { activeTime: 0, waitTime: 0, totalCT: 0, count: 0 };

      const tis = item.timeInStatusDays || {};
      let activeTime = 0;
      let waitTime = 0;

      Object.entries(tis).forEach(([status, days]) => {
        if (ACTIVE_WORK_STATES.some(s => status.toLowerCase().includes(s.toLowerCase()))) {
          activeTime += days;
        } else {
          waitTime += days;
        }
      });

      teamMap[team].activeTime += activeTime;
      teamMap[team].waitTime += waitTime;
      teamMap[team].totalCT += item.cycleTime as number;
      teamMap[team].count++;
    });

    const teamData = Object.entries(teamMap)
      .filter(([_, d]) => d.count >= 3)
      .map(([team, d]) => {
        const avgActive = d.activeTime / d.count;
        const avgWait = d.waitTime / d.count;
        const avgCT = d.totalCT / d.count;
        const efficiency = avgCT > 0 ? Math.round((avgActive / avgCT) * 100) : 0;
        return {
          team,
          activeTime: Math.round(avgActive * 10) / 10,
          waitTime: Math.round(avgWait * 10) / 10,
          efficiency,
          count: d.count,
        };
      })
      .sort((a, b) => b.efficiency - a.efficiency);

    // Eficiência global
    const globalActive = completedItems.reduce((sum, i) => {
      const tis = i.timeInStatusDays || {};
      return sum + Object.entries(tis).reduce((s, [status, days]) =>
        s + (ACTIVE_WORK_STATES.some(st => status.toLowerCase().includes(st.toLowerCase())) ? days : 0), 0);
    }, 0);
    const globalCT = completedItems.reduce((sum, i) => sum + (i.cycleTime as number), 0);
    const globalEfficiency = globalCT > 0 ? Math.round((globalActive / globalCT) * 100) : 0;

    return { teamData, globalEfficiency, totalItems: completedItems.length };
  }, [data]);

  if (!analysis || analysis.teamData.length === 0) {
    return (
      <div className="bg-ds-navy p-4 rounded-lg border border-ds-border text-center text-ds-text py-8">
        Sem dados suficientes para calcular Flow Efficiency. É necessário ter itens concluídos com dados de tempo em status.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-4 flex-wrap">
        <div className="bg-ds-navy p-4 rounded-lg border border-ds-border text-center">
          <p className="text-ds-text text-xs">Flow Efficiency Global</p>
          <p className={`text-3xl font-bold ${analysis.globalEfficiency >= 40 ? 'text-green-400' : analysis.globalEfficiency >= 20 ? 'text-yellow-400' : 'text-red-400'}`}>
            {analysis.globalEfficiency}%
          </p>
          <p className="text-ds-text text-xs mt-1">
            {analysis.globalEfficiency >= 40 ? '🚀 Excelente' : analysis.globalEfficiency >= 20 ? '⚠️ Atenção' : '🔴 Crítico'}
          </p>
        </div>
        <div className="text-xs text-ds-text max-w-md">
          <p><strong className="text-ds-green">Flow Efficiency</strong> = tempo trabalhando ÷ cycle time total.</p>
          <p className="mt-1">Ideal: &gt;40%. Típico: 15-25%. Indica quanto tempo o item fica em "espera" vs "trabalho ativo".</p>
        </div>
      </div>

      <div className="bg-ds-navy p-4 rounded-lg border border-ds-border">
        <h3 className="text-ds-light-text font-bold text-lg mb-4">Flow Efficiency por Time</h3>
        <ResponsiveContainer width="100%" height={Math.max(250, analysis.teamData.length * 45)}>
          <BarChart data={analysis.teamData} layout="vertical" margin={{ left: 120 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={CHART_COLORS.grid} />
            <XAxis type="number" stroke={CHART_COLORS.text} tick={{ fontSize: 11 }} domain={[0, 'auto']} unit=" dias" />
            <YAxis type="category" dataKey="team" stroke={CHART_COLORS.text} tick={{ fontSize: 11 }} width={110} />
            <Tooltip contentStyle={{ backgroundColor: CHART_COLORS.tooltipBg, border: 'none', borderRadius: '8px', color: '#E2E8F0' }} />
            <Legend />
            <Bar dataKey="activeTime" name="Tempo Ativo (dias)" stackId="a" fill="#64FFDA" radius={[0, 0, 0, 0]} />
            <Bar dataKey="waitTime" name="Tempo em Espera (dias)" stackId="a" fill="#F56565" fillOpacity={0.6} radius={[0, 4, 4, 0]} />
          </BarChart>
        </ResponsiveContainer>
        
        {/* Ranking de eficiência */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mt-4">
          {analysis.teamData.map((t, idx) => (
            <div key={t.team} className="p-2 bg-ds-bg rounded text-xs text-center">
              <span className="text-ds-text">{idx === 0 ? '🥇' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : ''} {t.team}</span>
              <p className={`text-lg font-bold ${t.efficiency >= 40 ? 'text-green-400' : t.efficiency >= 20 ? 'text-yellow-400' : 'text-red-400'}`}>
                {t.efficiency}%
              </p>
              <p className="text-ds-text">{t.count} itens</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default FlowEfficiencyChart;
