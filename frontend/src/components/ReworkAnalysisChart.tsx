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
    // Bugs (erros em desenvolvimento) vs Issues (erros em produção)
    const bugs = data.filter(i => i.type === 'Bug');
    const issues = data.filter(i => i.type === 'Issue');
    const completedBugs = bugs.filter(i => COMPLETED_STATES.includes(i.state));
    
    // Reincidências (apenas em Issues - erros que voltaram em produção)
    const issuesWithReincidencia = issues.filter(i => i.reincidencia && Number(i.reincidencia) > 0);
    const totalReincidenciaValue = issuesWithReincidencia.reduce((sum, i) => sum + Number(i.reincidencia || 0), 0);
    
    // Taxa de detecção em desenvolvimento (quanto maior, melhor o QA)
    const totalDefects = bugs.length + issues.length;
    const detectionRate = totalDefects > 0 ? Math.round((bugs.length / totalDefects) * 1000) / 10 : 0;
    
    // Comparação Bugs vs Issues
    const bugVsIssueComparison = [
      {
        category: 'Bugs\n(Dev)',
        total: bugs.length,
        comReincidencia: 0, // Bugs não têm reincidência
        escapeRate: 0
      },
      {
        category: 'Issues\n(Produção)',
        total: issues.length,
        comReincidencia: issuesWithReincidencia.length,
        escapeRate: totalDefects > 0 ? Math.round((issues.length / totalDefects) * 1000) / 10 : 0
      }
    ];
    
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
    const personRework: Record<string, { reincidences: number; team: string; issues: number; totalReincidenceValue: number }> = {};
    data.forEach(item => {
      const person = item.assignedTo || 'Não Atribuído';
      if (!personRework[person]) personRework[person] = { reincidences: 0, team: item.team || 'Sem Time', issues: 0, totalReincidenceValue: 0 };
      
      // Contar apenas Issues (onde o campo reincidência é usado)
      if (item.type === 'Issue') {
        personRework[person].issues++;
        
        // Se tem campo reincidencia preenchido
        const reincValue = Number(item.reincidencia);
        if (reincValue > 0) {
          personRework[person].reincidences++;
          personRework[person].totalReincidenceValue += reincValue;
        }
      }
    });

    const personData = Object.entries(personRework)
      .filter(([_, d]) => d.issues > 0 && d.reincidences > 0)
      .map(([person, d]) => ({ 
        person, 
        ...d, 
        rate: Math.round((d.reincidences / d.issues) * 1000) / 10 
      }))
      .sort((a, b) => b.totalReincidenceValue - a.totalReincidenceValue)
      .slice(0, 10);

    return {
      totalBugs: bugs.length,
      totalIssues: issues.length,
      totalReincidences: totalReincidenciaValue,
      issuesWithReincidencia: issuesWithReincidencia.length,
      detectionRate,
      globalReworkRate: data.length > 0 ? Math.round((bugs.length / data.length) * 1000) / 10 : 0,
      globalReincidenceRate: issues.length > 0 ? Math.round((issuesWithReincidencia.length / issues.length) * 1000) / 10 : 0,
      avgBugCT: completedBugs.filter(b => b.cycleTime).length > 0
        ? Math.round((completedBugs.filter(b => b.cycleTime).reduce((sum, b) => sum + (b.cycleTime || 0), 0) / completedBugs.filter(b => b.cycleTime).length) * 10) / 10
        : 0,
      teamData,
      personData,
      bugVsIssueComparison,
    };
  }, [data]);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-6 gap-4">
        <div className="bg-ds-navy p-4 rounded-lg border border-ds-border text-center">
          <p className="text-ds-text text-xs">Bugs (Dev)</p>
          <p className="text-2xl font-bold text-yellow-400">{analysis.totalBugs}</p>
          <p className="text-xs text-ds-text mt-1">Detectados antes</p>
        </div>
        <div className="bg-ds-navy p-4 rounded-lg border border-ds-border text-center">
          <p className="text-ds-text text-xs">Issues (Produção)</p>
          <p className="text-2xl font-bold text-red-400">{analysis.totalIssues}</p>
          <p className="text-xs text-ds-text mt-1">Escaparam para prod</p>
        </div>
        <div className="bg-ds-navy p-4 rounded-lg border border-ds-border text-center">
          <p className="text-ds-text text-xs">Taxa de Detecção</p>
          <p className={`text-2xl font-bold ${analysis.detectionRate > 70 ? 'text-green-400' : analysis.detectionRate > 50 ? 'text-yellow-400' : 'text-red-400'}`}>
            {analysis.detectionRate}%
          </p>
          <p className="text-xs text-ds-text mt-1">Pegos em Dev</p>
        </div>
        <div className="bg-ds-navy p-4 rounded-lg border border-ds-border text-center">
          <p className="text-ds-text text-xs">Issues Reincidentes</p>
          <p className="text-2xl font-bold text-orange-400">{analysis.issuesWithReincidencia}</p>
          <p className="text-xs text-ds-text mt-1">Voltaram em prod</p>
        </div>
        <div className="bg-ds-navy p-4 rounded-lg border border-ds-border text-center">
          <p className="text-ds-text text-xs">Taxa Reincidência</p>
          <p className={`text-2xl font-bold ${analysis.globalReincidenceRate > 15 ? 'text-red-400' : analysis.globalReincidenceRate > 8 ? 'text-yellow-400' : 'text-green-400'}`}>
            {analysis.globalReincidenceRate}%
          </p>
          <p className="text-xs text-ds-text mt-1">De issues em prod</p>
        </div>
        <div className="bg-ds-navy p-4 rounded-lg border border-ds-border text-center">
          <p className="text-ds-text text-xs">CT Médio Bugs</p>
          <p className="text-2xl font-bold text-ds-light-text">{analysis.avgBugCT}</p>
          <p className="text-xs text-ds-text mt-1">dias</p>
        </div>
      </div>

      {/* Gráfico comparativo Bugs vs Issues */}
      <div className="bg-ds-navy p-4 rounded-lg border border-ds-border">
        <h3 className="text-ds-light-text font-bold text-lg mb-2">Bugs (Dev) vs Issues (Produção)</h3>
        <p className="text-ds-text text-sm mb-4">
          📊 <strong className="text-yellow-400">Bugs</strong> são erros detectados em desenvolvimento. 
          <strong className="text-red-400"> Issues</strong> são erros que escaparam para produção. 
          Quanto maior a taxa de detecção, melhor o processo de QA.
        </p>
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={analysis.bugVsIssueComparison} margin={{ top: 30, right: 30, bottom: 20, left: 20 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={CHART_COLORS.grid} />
            <XAxis dataKey="category" stroke={CHART_COLORS.text} tick={{ fontSize: 12 }} />
            <YAxis stroke={CHART_COLORS.text} tick={{ fontSize: 11 }} />
            <Tooltip 
              contentStyle={{ backgroundColor: '#0a192f', border: '1px solid #64ffda', borderRadius: '8px', color: '#e6f1ff', padding: '10px 14px' }} 
              labelStyle={{ color: '#64ffda', fontWeight: 'bold' }} 
              itemStyle={{ color: '#e6f1ff' }}
            />
            <Legend />
            <Bar dataKey="total" name="Total" fill="#64b5f6" radius={[4, 4, 0, 0]} label={{ position: 'top', fill: '#e6f1ff', fontSize: 12 }} />
            <Bar dataKey="comReincidencia" name="Com Reincidência" fill="#ed8936" radius={[4, 4, 0, 0]} label={{ position: 'top', fill: '#e6f1ff', fontSize: 12 }} />
          </BarChart>
        </ResponsiveContainer>
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
                    <p className="text-orange-400 font-bold">{p.totalReincidenceValue} reincidências</p>
                    <p className="text-ds-text text-xs">{p.reincidences} issues ({p.rate}%)</p>
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
