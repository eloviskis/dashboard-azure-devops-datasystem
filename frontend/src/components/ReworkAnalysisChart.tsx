import React, { useMemo, useState } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, Cell } from 'recharts';
import { WorkItem } from '../types';
import { CHART_COLORS } from '../constants';

interface ReworkAnalysisChartProps {
  data: WorkItem[];
}

interface ModalData {
  title: string;
  items: WorkItem[];
  color: string;
}

const COMPLETED_STATES = ['Done', 'Concluído', 'Closed', 'Fechado', 'Finished', 'Resolved', 'Pronto'];
const AZURE_DEVOPS_BASE_URL = 'https://dev.azure.com/datasystemsoftwares/USE/_workitems/edit';

// Helper para gerar URL do work item
const getWorkItemUrl = (workItemId: number | string): string => {
  return `${AZURE_DEVOPS_BASE_URL}/${workItemId}`;
};

// Custom Tooltip para evitar renderização de objetos
const CustomTooltip = ({ active, payload, label }: any) => {
  if (active && payload && payload.length) {
    return (
      <div style={{ backgroundColor: '#0a192f', border: '1px solid #64ffda', borderRadius: '8px', color: '#e6f1ff', padding: '10px 14px' }}>
        <p style={{ color: '#64ffda', fontWeight: 'bold', marginBottom: '5px' }}>{String(label)}</p>
        {payload.map((entry: any, index: number) => {
          // Garantir que só valores primitivos sejam renderizados
          const value = typeof entry.value === 'object' ? JSON.stringify(entry.value) : String(entry.value);
          return (
            <p key={index} style={{ color: entry.color, margin: '2px 0' }}>
              {String(entry.name)}: {value}
            </p>
          );
        })}
      </div>
    );
  }
  return null;
};

// Custom Label para garantir renderização segura
const CustomLabel = (props: any) => {
  const { x, y, width, value } = props;
  try {
    const displayValue = typeof value === 'object' ? '' : String(value || '');
    return (
      <text 
        x={x + width / 2} 
        y={y - 5} 
        fill="#e6f1ff" 
        textAnchor="middle" 
        fontSize={12}
      >
        {displayValue}
      </text>
    );
  } catch (e) {
    return null;
  }
};

// Componente do Modal
const ItemListModal: React.FC<{ data: ModalData | null; onClose: () => void }> = ({ data, onClose }) => {
  if (!data) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-50" onClick={onClose}>
      <div 
        className="bg-ds-navy border border-ds-border rounded-lg shadow-2xl max-w-4xl w-full mx-4 max-h-[80vh] flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-4 rounded-t-lg flex justify-between items-center" style={{ backgroundColor: data.color }}>
          <h2 className="text-white font-bold text-lg">{data.title}</h2>
          <button
            onClick={onClose}
            className="text-white hover:text-gray-200 text-2xl font-bold leading-none"
          >
            ×
          </button>
        </div>
        
        {/* Content */}
        <div className="p-4 overflow-y-auto flex-1">
          <div className="text-ds-text mb-3 text-sm">
            Total: <span className="font-bold text-white">{data.items.length}</span> itens
          </div>
          
          {data.items.length === 0 ? (
            <div className="text-ds-text text-center py-8">Nenhum item encontrado</div>
          ) : (
            <ul className="space-y-2">
              {data.items.map((item, idx) => (
                <li 
                  key={item.workItemId || idx}
                  className="bg-ds-dark-blue border border-ds-border rounded-lg p-3 hover:border-ds-green transition-colors"
                >
                  <div className="flex items-start gap-3">
                    <span className="text-xs font-mono px-2 py-1 rounded bg-blue-600 text-white">
                      #{String(item.workItemId)}
                    </span>
                    <div className="flex-1 min-w-0">
                      <a 
                        href={getWorkItemUrl(item.workItemId)} 
                        target="_blank" 
                        rel="noopener noreferrer"
                        className="text-white hover:text-ds-green font-medium block truncate"
                        title={String(item.title)}
                      >
                        {String(item.title)}
                      </a>
                      <div className="flex gap-4 mt-1 text-xs text-ds-text flex-wrap">
                        <span>👤 {String(item.assignedTo || 'Não atribuído')}</span>
                        <span>📊 {String(item.state)}</span>
                        <span>🏢 {String(item.team || 'Sem time')}</span>
                        {item.reincidencia && Number(item.reincidencia) > 0 && (
                          <span className="text-orange-400">🔄 Reincidência: {String(item.reincidencia)}</span>
                        )}
                      </div>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
        
        {/* Footer */}
        <div className="p-4 border-t border-ds-border">
          <button 
            onClick={onClose}
            className="w-full bg-ds-border hover:bg-ds-green text-white py-2 px-4 rounded-lg transition-colors"
          >
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
};

const ReworkAnalysisChart: React.FC<ReworkAnalysisChartProps> = ({ data: rawData }) => {
  const [modalData, setModalData] = useState<ModalData | null>(null);

  // Sanitizar dados de entrada para remover referências circulares ou objetos complexos
  const data = useMemo(() => {
    return rawData.map(item => ({
      ...item,
      // Garantir que campos complexos não sejam objetos
      tags: Array.isArray(item.tags) ? item.tags.join(', ') : String(item.tags || ''),
      timeInStatusDays: undefined, // Remover objeto complexo
    }));
  }, [rawData]);

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
      bugs,
      issues,
      issuesWithReincidenciaItems: issuesWithReincidencia,
    };
  }, [data]);

  // Funções para abrir modal com filtros
  const handleShowBugs = () => {
    setModalData({
      title: 'Bugs (Detectados em Desenvolvimento)',
      items: analysis.bugs,
      color: '#FFC107'
    });
  };

  const handleShowIssues = () => {
    setModalData({
      title: 'Issues (Erros em Produção)',
      items: analysis.issues,
      color: '#f56565'
    });
  };

  const handleShowIssuesWithReincidencia = () => {
    setModalData({
      title: 'Issues com Reincidência',
      items: analysis.issuesWithReincidenciaItems,
      color: '#ed8936'
    });
  };

  const handleShowPersonIssues = (person: string) => {
    const personIssues = analysis.issues.filter(i => 
      (i.assignedTo || 'Não Atribuído') === person &&
      i.reincidencia && Number(i.reincidencia) > 0
    );
    setModalData({
      title: `Issues com Reincidência - ${person}`,
      items: personIssues,
      color: '#ed8936'
    });
  };

  const handleBarClick = (category: string) => {
    if (category === 'Bugs\n(Dev)') {
      handleShowBugs();
    } else if (category === 'Issues\n(Produção)') {
      handleShowIssues();
    }
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-6 gap-4">
        <div 
          className="bg-ds-navy p-4 rounded-lg border border-ds-border text-center cursor-pointer hover:border-yellow-400 transition-colors"
          onClick={handleShowBugs}
          title="Clique para ver detalhes"
        >
          <p className="text-ds-text text-xs">Bugs (Dev)</p>
          <p className="text-2xl font-bold text-yellow-400">{String(analysis.totalBugs)}</p>
          <p className="text-xs text-ds-text mt-1">Detectados antes</p>
        </div>
        <div 
          className="bg-ds-navy p-4 rounded-lg border border-ds-border text-center cursor-pointer hover:border-red-400 transition-colors"
          onClick={handleShowIssues}
          title="Clique para ver detalhes"
        >
          <p className="text-ds-text text-xs">Issues (Produção)</p>
          <p className="text-2xl font-bold text-red-400">{String(analysis.totalIssues)}</p>
          <p className="text-xs text-ds-text mt-1">Escaparam para prod</p>
        </div>
        <div className="bg-ds-navy p-4 rounded-lg border border-ds-border text-center">
          <p className="text-ds-text text-xs">Taxa de Detecção</p>
          <p className={`text-2xl font-bold ${analysis.detectionRate > 70 ? 'text-green-400' : analysis.detectionRate > 50 ? 'text-yellow-400' : 'text-red-400'}`}>
            {String(analysis.detectionRate)}%
          </p>
          <p className="text-xs text-ds-text mt-1">Pegos em Dev</p>
        </div>
        <div 
          className="bg-ds-navy p-4 rounded-lg border border-ds-border text-center cursor-pointer hover:border-orange-400 transition-colors"
          onClick={handleShowIssuesWithReincidencia}
          title="Clique para ver detalhes"
        >
          <p className="text-ds-text text-xs">Issues Reincidentes</p>
          <p className="text-2xl font-bold text-orange-400">{analysis.issuesWithReincidencia}</p>
          <p className="text-xs text-ds-text mt-1">Voltaram em prod</p>
        </div>
        <div className="bg-ds-navy p-4 rounded-lg border border-ds-border text-center">
          <p className="text-ds-text text-xs">Taxa Reincidência</p>
          <p className={`text-2xl font-bold ${analysis.globalReincidenceRate > 15 ? 'text-red-400' : analysis.globalReincidenceRate > 8 ? 'text-yellow-400' : 'text-green-400'}`}>
            {String(analysis.globalReincidenceRate)}%
          </p>
          <p className="text-xs text-ds-text mt-1">De issues em prod</p>
        </div>
        <div className="bg-ds-navy p-4 rounded-lg border border-ds-border text-center">
          <p className="text-ds-text text-xs">CT Médio Bugs</p>
          <p className="text-2xl font-bold text-ds-light-text">{String(analysis.avgBugCT)}</p>
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
            <Tooltip content={<CustomTooltip />} />
            <Legend />
            <Bar 
              dataKey="total" 
              name="Total" 
              fill="#64b5f6" 
              radius={[4, 4, 0, 0]} 
              label={<CustomLabel />}
              onClick={(data: any) => {
                const category = data && data.category ? String(data.category) : '';
                handleBarClick(category);
              }}
              cursor="pointer"
            />
            <Bar 
              dataKey="comReincidencia" 
              name="Com Reincidência" 
              fill="#ed8936" 
              radius={[4, 4, 0, 0]} 
              label={<CustomLabel />}
              onClick={handleShowIssuesWithReincidencia}
              cursor="pointer"
            />
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
                <Tooltip content={<CustomTooltip />} />
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
                <div 
                  key={p.person} 
                  className="flex items-center gap-3 p-2 bg-ds-bg rounded cursor-pointer hover:bg-ds-dark-blue hover:border hover:border-ds-green transition-colors"
                  onClick={() => handleShowPersonIssues(p.person)}
                  title="Clique para ver issues desta pessoa"
                >
                  <span className="text-ds-green font-bold text-sm w-6">{String(idx + 1)}º</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-ds-light-text text-sm truncate">{String(p.person)}</p>
                    <p className="text-ds-text text-xs">{String(p.team)}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-orange-400 font-bold">{String(p.totalReincidenceValue)} reincidências</p>
                    <p className="text-ds-text text-xs">{String(p.reincidences)} issues ({String(p.rate)}%)</p>
                  </div>
                </div>
              ))}
            </div>
          ) : <p className="text-ds-text text-center py-8">Nenhuma reincidência encontrada.</p>}
        </div>
      </div>

      {/* Modal de detalhes */}
      <ItemListModal data={modalData} onClose={() => setModalData(null)} />
    </div>
  );
};

export default ReworkAnalysisChart;
