import React, { useMemo, useState } from 'react';
import { WorkItem } from '../types';

interface WIPLimitsProps {
  workItems: WorkItem[];
  defaultTeamLimit?: number;
  defaultPersonLimit?: number;
}

const WIPLimits: React.FC<WIPLimitsProps> = ({ 
  workItems, 
  defaultTeamLimit = 10,
  defaultPersonLimit = 3 
}) => {
  const [teamLimit, setTeamLimit] = useState(() => {
    const saved = localStorage.getItem('devops-wip-team-limit');
    return saved ? Number(saved) : defaultTeamLimit;
  });
  
  const [personLimit, setPersonLimit] = useState(() => {
    const saved = localStorage.getItem('devops-wip-person-limit');
    return saved ? Number(saved) : defaultPersonLimit;
  });

  const saveTeamLimit = (value: number) => {
    setTeamLimit(value);
    localStorage.setItem('devops-wip-team-limit', String(value));
  };

  const savePersonLimit = (value: number) => {
    setPersonLimit(value);
    localStorage.setItem('devops-wip-person-limit', String(value));
  };

  const wipAnalysis = useMemo(() => {
    const inProgressStates = [
      'Active', 'In Progress', 'Em Progresso', 'Para Desenvolver', 
      'Aguardando Code Review', 'Fazendo Code Review', 
      'Aguardando QA', 'Testando QA', 'Ativo'
    ];

    const inProgressItems = workItems.filter(i => 
      inProgressStates.some(s => i.state.toLowerCase().includes(s.toLowerCase()))
    );

    // WIP por time
    const teamWIP: Record<string, { count: number; items: WorkItem[] }> = {};
    inProgressItems.forEach(item => {
      const team = item.team || 'Sem Time';
      if (!teamWIP[team]) teamWIP[team] = { count: 0, items: [] };
      teamWIP[team].count++;
      teamWIP[team].items.push(item);
    });

    // WIP por pessoa
    const personWIP: Record<string, { count: number; items: WorkItem[]; team: string }> = {};
    inProgressItems.forEach(item => {
      const person = item.assignedTo || 'Não Atribuído';
      if (!personWIP[person]) personWIP[person] = { count: 0, items: [], team: item.team || 'Sem Time' };
      personWIP[person].count++;
      personWIP[person].items.push(item);
    });

    // WIP por coluna/estado
    const columnWIP: Record<string, number> = {};
    const columnOrder = ['Para Desenvolver', 'Active', 'Ativo', 'Aguardando Code Review', 'Fazendo Code Review', 'Aguardando QA', 'Testando QA'];
    inProgressItems.forEach(item => {
      const state = item.state || 'Outros';
      columnWIP[state] = (columnWIP[state] || 0) + 1;
    });

    // Identificar violações
    const teamViolations = Object.entries(teamWIP)
      .filter(([, data]) => data.count > teamLimit)
      .sort((a, b) => b[1].count - a[1].count);

    const personViolations = Object.entries(personWIP)
      .filter(([, data]) => data.count > personLimit)
      .sort((a, b) => b[1].count - a[1].count);

    return {
      totalWIP: inProgressItems.length,
      teamWIP: Object.entries(teamWIP).sort((a, b) => b[1].count - a[1].count),
      personWIP: Object.entries(personWIP).sort((a, b) => b[1].count - a[1].count),
      columnWIP: columnOrder.filter(s => columnWIP[s]).map(s => ({ state: s, count: columnWIP[s] || 0 })),
      teamViolations,
      personViolations,
      hasViolations: teamViolations.length > 0 || personViolations.length > 0
    };
  }, [workItems, teamLimit, personLimit]);

  const getWIPColor = (count: number, limit: number) => {
    const ratio = count / limit;
    if (ratio > 1) return 'text-red-400 bg-red-500/10 border-red-500/30';
    if (ratio >= 0.8) return 'text-yellow-400 bg-yellow-500/10 border-yellow-500/30';
    return 'text-green-400 bg-green-500/10 border-green-500/30';
  };

  return (
    <div className="bg-ds-navy p-4 rounded-lg border border-ds-border h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between mb-3 flex-shrink-0">
        <h3 className="text-ds-light-text font-bold text-lg flex items-center gap-2">
          <span className="text-xl">⚠️</span> WIP Limits
          {wipAnalysis.hasViolations && (
            <span className="animate-pulse bg-red-500 text-white text-xs px-2 py-0.5 rounded-full">
              {wipAnalysis.teamViolations.length + wipAnalysis.personViolations.length} alertas
            </span>
          )}
        </h3>
        <div className="flex items-center gap-3 text-xs">
          <div className="flex items-center gap-1">
            <span className="text-ds-text">Time:</span>
            <input
              type="number"
              value={teamLimit}
              onChange={e => saveTeamLimit(Number(e.target.value) || 10)}
              className="w-12 bg-ds-bg border border-ds-border text-ds-light-text text-xs rounded p-1 text-center"
              min="1"
            />
          </div>
          <div className="flex items-center gap-1">
            <span className="text-ds-text">Pessoa:</span>
            <input
              type="number"
              value={personLimit}
              onChange={e => savePersonLimit(Number(e.target.value) || 3)}
              className="w-12 bg-ds-bg border border-ds-border text-ds-light-text text-xs rounded p-1 text-center"
              min="1"
            />
          </div>
        </div>
      </div>

      {/* Alertas com scroll limitado */}
      {wipAnalysis.hasViolations && (
        <div className="mb-3 max-h-28 overflow-y-auto space-y-1.5 flex-shrink-0 pr-1">
          {wipAnalysis.teamViolations.map(([team, data]) => (
            <div key={team} className="bg-red-500/10 border border-red-500/30 text-red-400 p-2 rounded text-xs flex items-center gap-2">
              <span>🚨</span>
              <span className="truncate">
                <strong>{team}</strong> está com {data.count} itens em WIP (limite: {teamLimit})
              </span>
            </div>
          ))}
          {wipAnalysis.personViolations.map(([person, data]) => (
            <div key={person} className="bg-orange-500/10 border border-orange-500/30 text-orange-400 p-2 rounded text-xs flex items-center gap-2">
              <span>⚡</span>
              <span className="truncate">
                <strong>{person}</strong> ({data.team}) está com {data.count} itens (limite: {personLimit})
              </span>
            </div>
          ))}
        </div>
      )}

      {/* WIP por Coluna do Workflow */}
      {wipAnalysis.columnWIP.length > 0 && (
        <div className="mb-3 flex-shrink-0">
          <h4 className="text-ds-text text-xs mb-2 uppercase tracking-wide">WIP por Coluna do Workflow</h4>
          <div className="flex gap-1.5 flex-wrap">
            {wipAnalysis.columnWIP.map(col => {
              const colColors: Record<string, string> = {
                'Para Desenvolver': 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
                'Active': 'bg-blue-500/20 text-blue-400 border-blue-500/30',
                'Ativo': 'bg-blue-500/20 text-blue-400 border-blue-500/30',
                'Aguardando Code Review': 'bg-orange-500/20 text-orange-400 border-orange-500/30',
                'Fazendo Code Review': 'bg-orange-600/20 text-orange-300 border-orange-600/30',
                'Aguardando QA': 'bg-purple-500/20 text-purple-400 border-purple-500/30',
                'Testando QA': 'bg-purple-600/20 text-purple-300 border-purple-600/30',
              };
              return (
                <div key={col.state} className={`px-2 py-1 rounded border text-xs font-medium ${colColors[col.state] || 'bg-ds-muted/20 text-ds-text border-ds-border'}`}>
                  {col.state}: <strong>{col.count}</strong>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Grid de WIP por Time e Pessoa */}
      <div className="flex-1 min-h-0 grid grid-cols-2 gap-3">
        {/* WIP por Time */}
        <div className="flex flex-col min-h-0">
          <h4 className="text-ds-text text-xs mb-2 uppercase tracking-wide flex-shrink-0">Por Time</h4>
          <div className="flex-1 min-h-0 overflow-y-auto space-y-1.5 pr-1">
            {wipAnalysis.teamWIP.map(([team, data]) => (
              <div 
                key={team} 
                className={`p-2 rounded border text-xs ${getWIPColor(data.count, teamLimit)}`}
              >
                <div className="flex justify-between items-center">
                  <span className="font-medium truncate">{team}</span>
                  <span className="font-bold whitespace-nowrap ml-1">
                    {data.count}/{teamLimit}
                    {data.count > teamLimit && <span className="ml-0.5">⚠️</span>}
                  </span>
                </div>
                <div className="bg-ds-bg rounded-full h-1 mt-1 overflow-hidden">
                  <div 
                    className={`h-full transition-all ${data.count > teamLimit ? 'bg-red-500' : data.count >= teamLimit * 0.8 ? 'bg-yellow-500' : 'bg-green-500'}`}
                    style={{ width: `${Math.min((data.count / teamLimit) * 100, 100)}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* WIP por Pessoa */}
        <div className="flex flex-col min-h-0">
          <h4 className="text-ds-text text-xs mb-2 uppercase tracking-wide flex-shrink-0">Por Pessoa (Top 15)</h4>
          <div className="flex-1 min-h-0 overflow-y-auto space-y-1.5 pr-1">
            {wipAnalysis.personWIP.slice(0, 15).map(([person, data]) => (
              <div 
                key={person} 
                className={`p-2 rounded border text-xs ${getWIPColor(data.count, personLimit)}`}
              >
                <div className="flex justify-between items-center gap-1">
                  <div className="min-w-0 flex-1">
                    <span className="font-medium truncate block">{person}</span>
                    <span className="text-[10px] opacity-60 truncate block">{data.team}</span>
                  </div>
                  <span className="font-bold whitespace-nowrap">
                    {data.count}/{personLimit}
                    {data.count > personLimit && <span className="ml-0.5">⚠️</span>}
                  </span>
                </div>
                <div className="bg-ds-bg rounded-full h-1 mt-1 overflow-hidden">
                  <div 
                    className={`h-full transition-all ${data.count > personLimit ? 'bg-red-500' : data.count >= personLimit * 0.8 ? 'bg-yellow-500' : 'bg-green-500'}`}
                    style={{ width: `${Math.min((data.count / personLimit) * 100, 100)}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Footer com total */}
      <div className="mt-3 pt-2 border-t border-ds-border flex justify-between items-center flex-shrink-0">
        <span className="text-ds-text text-xs">Total de itens em WIP:</span>
        <span className="text-ds-green text-xl font-bold">{wipAnalysis.totalWIP}</span>
      </div>
    </div>
  );
};

export default WIPLimits;
