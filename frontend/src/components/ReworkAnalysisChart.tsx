import React, { useMemo } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, Cell } from 'recharts';
import { WorkItem } from '../types';
import { CHART_COLORS } from '../constants';

interface ReworkAnalysisChartProps {
  data: WorkItem[];
}

const COMPLETED_STATES = ['Done', 'Concluído', 'Closed', 'Fechado', 'Finished', 'Resolved', 'Pronto'];

const ReworkAnalysisChart: React.FC<ReworkAnalysisChartProps> = ({ data }) => {
  const analysis = useMemo(() => {
    // Itens com reincidência
    const reincidentItems = data.filter(i => i.reincidencia && Number(i.reincidencia) > 0);
    
    // Bugs (retrabalho por definição)
    const bugs = data.filter(i => i.type === 'Bug');
    const completedBugs = bugs.filter(i => COMPLETED_STATES.includes(i.state));
    
    // Por time
    const teamRework: Record<string, { bugs: number; reincidences: number; total: number; avgBugCT: number }> = {};
    data.forEach(item => {
      const team = item.team || 'Sem Time';
      if (!teamRework[team]) teamRework[team] = { bugs: 0, reincidences: 0, total: 0, avgBugCT: 0 };
      teamRework[team].total++;
      if (item.type === 'Bug') teamRework[team].bugs++;
      if (item.reincidencia && Number(item.reincidencia) > 0) teamRework[team].reincidences++;
    });

    // Calcular CT médio de bugs por time
    const bugCTByTeam: Record<string, number[]> = {};
    completedBugs.forEach(bug => {
      const team = bug.team || 'Sem Time';
      if (!bugCTByTeam[team]) bugCTByTeam[team] = [];
      if (bug.cycleTime != null) bugCTByTeam[team].push(bug.cycleTime);
    });

    const teamData = Object.entries(teamRework)
      .map(([team, d]) => ({
        team,
        bugs: d.bugs,
        reincidences: d.reincidences,
        reworkRate: d.total > 0 ? Math.round((d.bugs / d.total) * 1000) / 10 : 0,
        reincidenceRate: d.bugs > 0 ? Math.round((d.reincidences / d.bugs) * 1000) / 10 : 0,
        avgBugCT: bugCTByTeam[team]?.length > 0 
          ? Math.round((bugCTByTeam[team].reduce((a, b) => a + b, 0) / bugCTByTeam[team].length) * 10) / 10 
          : 0,
      }))
      .filter(d => d.bugs > 0)
      .sort((a, b) => b.reworkRate - a.reworkRate);

    // Por pessoa (top reincidentes)
    const personRework: Record<string, { reincidences: number; team: string; total: number }> = {};
    data.forEach(item => {
      const person = item.assignedTo || 'Não Atribuído';
      if (!personRework[person]) personRework[person] = { reincidences: 0, team: item.team || 'Sem Time', total: 0 };
      personRework[person].total++;
      if (item.reincidencia && Number(item.reincidencia) > 0) personRework[person].reincidences++;
    });

    const personData = Object.entries(personRework)
      .filter(([_, d]) => d.reincidences > 0)
      .map(([person, d]) => ({ person, ...d, rate: Math.round((d.reincidences / d.total) * 1000) / 10 }))
      .sort((a, b) => b.reincidences - a.reincidences)
      .slice(0, 10);

    return {
      totalBugs: bugs.length,
      totalReincidences: reincidentItems.length,
      globalReworkRate: data.length > 0 ? Math.round((bugs.length / data.length) * 1000) / 10 : 0,
      globalReincidenceRate: bugs.length > 0 ? Math.round((reincidentItems.length / bugs.length) * 1000) / 10 : 0,
      avgBugCT: completedBugs.filter(b => b.cycleTime).length > 0
        ? Math.round((completedBugs.filter(b => b.cycleTime).reduce((sum, b) => sum + (b.cycleTime || 0), 0) / completedBugs.filter(b => b.cycleTime).length) * 10) / 10
        : 0,
      teamData,
      personData,
    };
  }, [data]);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <div className="bg-ds-navy p-4 rounded-lg border border-ds-border text-center">
          <p className="text-ds-text text-xs">Total de Bugs</p>
          <p className="text-2xl font-bold text-red-400">{analysis.totalBugs}</p>
        </div>
        <div className="bg-ds-navy p-4 rounded-lg border border-ds-border text-center">
          <p className="text-ds-text text-xs">Reincidências</p>
          <p className="text-2xl font-bold text-orange-400">{analysis.totalReincidences}</p>
        </div>
        <div className="bg-ds-navy p-4 rounded-lg border border-ds-border text-center">
          <p className="text-ds-text text-xs">Taxa de Retrabalho</p>
          <p className={`text-2xl font-bold ${analysis.globalReworkRate > 20 ? 'text-red-400' : analysis.globalReworkRate > 10 ? 'text-yellow-400' : 'text-green-400'}`}>
            {analysis.globalReworkRate}%
          </p>
        </div>
        <div className="bg-ds-navy p-4 rounded-lg border border-ds-border text-center">
          <p className="text-ds-text text-xs">Taxa Reincidência</p>
          <p className={`text-2xl font-bold ${analysis.globalReincidenceRate > 15 ? 'text-red-400' : 'text-yellow-400'}`}>
            {analysis.globalReincidenceRate}%
          </p>
        </div>
        <div className="bg-ds-navy p-4 rounded-lg border border-ds-border text-center">
          <p className="text-ds-text text-xs">CT Médio de Bugs</p>
          <p className="text-2xl font-bold text-ds-light-text">{analysis.avgBugCT} <span className="text-sm">dias</span></p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Taxa de retrabalho por time */}
        <div className="bg-ds-navy p-4 rounded-lg border border-ds-border">
          <h3 className="text-ds-light-text font-bold text-lg mb-4">Taxa de Retrabalho por Time</h3>
          {analysis.teamData.length > 0 ? (
            <ResponsiveContainer width="100%" height={Math.max(200, analysis.teamData.length * 40)}>
              <BarChart data={analysis.teamData} layout="vertical" margin={{ left: 100 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={CHART_COLORS.grid} />
                <XAxis type="number" stroke={CHART_COLORS.text} tick={{ fontSize: 11 }} unit="%" />
                <YAxis type="category" dataKey="team" stroke={CHART_COLORS.text} tick={{ fontSize: 10 }} width={90} />
                <Tooltip contentStyle={{ backgroundColor: '#0a192f', border: '1px solid #64ffda', borderRadius: '8px', color: '#e6f1ff', padding: '10px 14px' }} labelStyle={{ color: '#64ffda', fontWeight: 'bold' }} itemStyle={{ color: '#e6f1ff' }} />
                <Legend />
                <Bar dataKey="reworkRate" name="% Bugs" fill="#f56565" radius={[0, 4, 4, 0]} />
                <Bar dataKey="reincidenceRate" name="% Reincidência" fill="#ed8936" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : <p className="text-ds-text text-center py-8">Sem dados de retrabalho.</p>}
        </div>

        {/* Top reincidentes por pessoa */}
        <div className="bg-ds-navy p-4 rounded-lg border border-ds-border">
          <h3 className="text-ds-light-text font-bold text-lg mb-4">Top 10 — Pessoas com Reincidência</h3>
          {analysis.personData.length > 0 ? (
            <div className="space-y-2">
              {analysis.personData.map((p, idx) => (
                <div key={p.person} className="flex items-center gap-3 p-2 bg-ds-bg rounded">
                  <span className="text-ds-green font-bold text-sm w-6">{idx + 1}º</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-ds-light-text text-sm truncate">{p.person}</p>
                    <p className="text-ds-text text-xs">{p.team}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-orange-400 font-bold">{p.reincidences} reincidências</p>
                    <p className="text-ds-text text-xs">{p.rate}% dos itens</p>
                  </div>
                </div>
              ))}
            </div>
          ) : <p className="text-ds-text text-center py-8">Nenhuma reincidência encontrada.</p>}
        </div>
      </div>
    </div>
  );
};

export default ReworkAnalysisChart;
