import React, { useState, useMemo, useEffect, useRef } from 'react';
import { WorkItem } from '../types';
import { CHART_COLORS } from '../constants';
import ChartInfoLamp from './ChartInfoLamp';
import {
  ResponsiveContainer, BarChart, Bar, LineChart, Line, PieChart, Pie, Cell,
  XAxis, YAxis, Tooltip, CartesianGrid, Legend, ReferenceLine, AreaChart, Area
} from 'recharts';
import { format, subMonths, startOfMonth, endOfMonth, isWithinInterval, eachMonthOfInterval, differenceInDays, addDays } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { exportItemsXlsx, getWorkItemColumns } from '../utils/exportXlsx';

interface ScrumCTCDashboardProps {
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
                        <div>👤 {item.assignedTo || 'Não atribuído'}</div>
                        <div>👥 {item.team || 'Sem time'}</div>
                        <div>🏷️ {item.type}</div>
                        <div>📊 {item.state}</div>
                        {item.storyPoints != null && <div>⚡ {item.storyPoints} SP</div>}
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
const IN_PROGRESS_STATES = ['Active', 'Ativo', 'Em Progresso', 'Para Desenvolver', 'Aguardando Code Review', 'Fazendo Code Review', 'Aguardando QA', 'Testando QA'];

const TYPE_COLORS: Record<string, string> = {
  'Product Backlog Item': '#64FFDA',
  'Bug': '#F56565',
  'Task': '#47C5FB',
  'User Story': '#B794F4',
  'Feature': '#F6E05E',
  'Eventuality': '#ED8936',
};

// Extrai o número da sprint do nome da iteration (ex: "CONSTANCE_SPRINT_157_(30)" -> 157) — usado pra
// ordenar sprints cronologicamente de forma confiável, já que a data de criação de um item não reflete
// quando a sprint em si começou (um item antigo pode ser movido pra uma sprint nova).
const extractSprintNumber = (name: string): number => {
  const match = name.match(/SPRINT[_\s]*(\d+)/i);
  return match ? parseInt(match[1], 10) : 0;
};

const ScrumCTCDashboard: React.FC<ScrumCTCDashboardProps> = ({ data }) => {
  const [sprintDuration, setSprintDuration] = useState<number>(2); // weeks
  const [sprintHistory, setSprintHistory] = useState<number>(8);
  // Vazio = todos os membros contam pra velocity. Marcar pessoas específicas restringe o cálculo de
  // velocity/confiabilidade só a elas — útil pra prever a capacidade real do time sem quem está alocado
  // em outras frentes, licença, etc.
  const [filterMembers, setFilterMembers] = useState<string[]>([]);
  const [showMemberDropdown, setShowMemberDropdown] = useState(false);
  const memberDropdownRef = useRef<HTMLDivElement>(null);
  // Vazio = todos os tipos contam. Marcar tipos específicos deixa escolher incrementalmente quais fazem
  // sentido pro cálculo de velocity (ex: só "Product Backlog Item" e "Bug", sem "Task").
  const [filterTypes, setFilterTypes] = useState<string[]>([]);
  const [showTypeDropdown, setShowTypeDropdown] = useState(false);
  const typeDropdownRef = useRef<HTMLDivElement>(null);
  const [selectedScrumTeam, setSelectedScrumTeam] = useState<string>('__all__');
  const [selectedSprint, setSelectedSprint] = useState<string>('__auto__');
  const [modalData, setModalData] = useState<ModalData | null>(null);
  const [exportingXlsx, setExportingXlsx] = useState(false);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (memberDropdownRef.current && !memberDropdownRef.current.contains(e.target as Node)) {
        setShowMemberDropdown(false);
      }
      if (typeDropdownRef.current && !typeDropdownRef.current.contains(e.target as Node)) {
        setShowTypeDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Available teams
  const availableTeams = useMemo(() => {
    return [...new Set(data.map(i => i.team).filter(Boolean) as string[])].sort();
  }, [data]);

  // Filter by selected team
  const franquiaItems = useMemo(() => {
    if (selectedScrumTeam === '__all__') return data;
    return data.filter(item => item.team === selectedScrumTeam);
  }, [data, selectedScrumTeam]);

  // Detect current sprint (most recent sprint with active items) - MUST be before sprintData/burndownData.
  // Com "Todos os Times" selecionado, times diferentes podem estar em sprints diferentes ao mesmo tempo —
  // misturar tudo numa "sprint atual" única não faz sentido, então esse recurso só funciona com um time
  // específico selecionado.
  const currentSprint = useMemo(() => {
    if (selectedScrumTeam === '__all__') return null;
    const activeItems = franquiaItems.filter(i =>
      !COMPLETED_STATES.includes(i.state) && i.state !== 'Removed' && i.iterationPath
    );
    const iterCounts: Record<string, number> = {};
    activeItems.forEach(item => {
      const iter = item.iterationPath as string;
      if (iter && iter !== 'USE') {
        iterCounts[iter] = (iterCounts[iter] || 0) + 1;
      }
    });
    if (Object.keys(iterCounts).length === 0) return null;
    const sprints = Object.keys(iterCounts).map(path => {
      const parts = path.split('\\');
      const name = parts[parts.length - 1];
      return { path, name, number: extractSprintNumber(name), count: iterCounts[path] };
    }).filter(s => s.number > 0);
    if (sprints.length === 0) return null;
    // Prioriza quem tem mais itens ativos, não o maior número de sprint — uma sprint futura/placeholder
    // com só 1-2 itens pré-planejados não deve "vencer" a sprint com o time realmente trabalhando nela.
    sprints.sort((a, b) => b.count - a.count || b.number - a.number);
    return sprints[0];
  }, [franquiaItems, selectedScrumTeam]);

  // Get iterations/sprints from iterationPath
  const sprintData = useMemo(() => {
    const now = new Date();
    const sprintDays = sprintDuration * 7;
    const sprints: { name: string; start: Date; end: Date }[] = [];

    // Generate sprints based on sprint duration going back in time
    for (let i = sprintHistory - 1; i >= 0; i--) {
      const end = new Date(now.getTime() - i * sprintDays * 24 * 60 * 60 * 1000);
      const start = new Date(end.getTime() - sprintDays * 24 * 60 * 60 * 1000);
      sprints.push({
        name: `Sprint ${sprintHistory - i}`,
        start,
        end,
      });
    }

    // Also try to extract sprint names from iterationPath
    const iterationSprints: Record<string, { items: WorkItem[]; name: string }> = {};
    franquiaItems.forEach(item => {
      if (item.iterationPath) {
        const parts = (item.iterationPath as string).split('\\');
        const sprintName = parts[parts.length - 1] || item.iterationPath;
        if (!iterationSprints[sprintName]) {
          iterationSprints[sprintName] = { items: [], name: sprintName };
        }
        iterationSprints[sprintName].items.push(item);
      }
    });

    // If we have real iteration data, use that instead
    const hasRealSprints = Object.keys(iterationSprints).length > 2;

    if (hasRealSprints) {
      const withDates = Object.values(iterationSprints).map(s => {
        const items = s.items;
        const closedDates = items.filter(i => i.closedDate).map(i => new Date(i.closedDate!).getTime());
        const createdDates = items.map(i => new Date(i.createdDate || '').getTime()).filter(d => !isNaN(d));
        const minDate = createdDates.length > 0 ? new Date(Math.min(...createdDates)) : new Date();
        const maxDate = closedDates.length > 0 ? new Date(Math.max(...closedDates)) : new Date();
        return { name: s.name, start: minDate, end: maxDate, items, number: extractSprintNumber(s.name) };
      });
      // Ordena pelo número da sprint (ex: SPRINT_157 -> 157) quando dá pra extrair — muito mais confiável
      // que a data de criação dos itens, já que uma tarefa antiga pode ser movida pra uma sprint nova sem
      // que a data de criação mude, distorcendo a ordem cronológica real.
      const hasNumbers = withDates.some(s => s.number > 0);
      // O Azure DevOps costuma já ter várias sprints futuras criadas como placeholder, com poucas tarefas
      // pré-planejadas e nada entregue ainda — sem esse corte elas "vencem" no número e entram na janela
      // de histórico no lugar das sprints passadas de verdade, zerando as métricas de velocity.
      const currentNumber = currentSprint?.number || 0;
      const withoutFuture = hasNumbers && currentNumber > 0
        ? withDates.filter(s => s.number === 0 || s.number <= currentNumber)
        : withDates;
      const sorted = hasNumbers
        ? withoutFuture.sort((a, b) => a.number - b.number)
        : withoutFuture.sort((a, b) => a.start.getTime() - b.start.getTime());
      return sorted.slice(-sprintHistory);
    }

    // Otherwise use generated sprints  
    return sprints.map(sprint => ({
      ...sprint,
      items: franquiaItems.filter(item => {
        const itemDate = new Date(item.changedDate || item.createdDate || '');
        return isWithinInterval(itemDate, { start: sprint.start, end: sprint.end });
      }),
    }));
  }, [franquiaItems, sprintDuration, sprintHistory, currentSprint]);

  // Apply member/type filters
  const filteredSprintData = useMemo(() => {
    return sprintData.map(sprint => ({
      ...sprint,
      items: sprint.items.filter(item => {
        if (filterMembers.length > 0 && !filterMembers.includes(item.assignedTo || '')) return false;
        if (filterTypes.length > 0 && !filterTypes.includes(item.type)) return false;
        return true;
      }),
    }));
  }, [sprintData, filterMembers, filterTypes]);

  // Members and types
  const members = useMemo(() => [...new Set(franquiaItems.map(i => i.assignedTo).filter(Boolean) as string[])].sort(), [franquiaItems]);
  const types = useMemo(() => [...new Set(franquiaItems.map(i => i.type).filter(Boolean))].sort(), [franquiaItems]);

  // Velocity data (committed vs delivered per sprint)
  const velocityData = useMemo(() => {
    return filteredSprintData.map(sprint => {
      const committed = sprint.items.length;
      const deliveredItems = sprint.items.filter(i => COMPLETED_STATES.includes(i.state));
      const delivered = deliveredItems.length;
      const storyPointsCommitted = sprint.items.reduce((sum, i) => sum + (i.storyPoints || 0), 0);
      const storyPointsDelivered = deliveredItems.reduce((sum, i) => sum + (i.storyPoints || 0), 0);
      return {
        sprint: sprint.name,
        committed,
        delivered,
        spCommitted: Math.round(storyPointsCommitted * 10) / 10,
        spDelivered: Math.round(storyPointsDelivered * 10) / 10,
        items: sprint.items,
        deliveredItems,
      };
    });
  }, [filteredSprintData]);

  // KPIs
  const kpis = useMemo(() => {
    const velocities = velocityData.map(v => v.delivered).filter(v => v > 0);
    const spVelocities = velocityData.map(v => v.spDelivered).filter(v => v > 0);
    const avgVelocity = velocities.length > 0 ? velocities.reduce((a, b) => a + b, 0) / velocities.length : 0;
    const avgSPVelocity = spVelocities.length > 0 ? spVelocities.reduce((a, b) => a + b, 0) / spVelocities.length : 0;

    const totalCommitted = velocityData.reduce((s, v) => s + v.committed, 0);
    const totalDelivered = velocityData.reduce((s, v) => s + v.delivered, 0);
    const reliability = totalCommitted > 0 ? (totalDelivered / totalCommitted) * 100 : 0;

    // Variability
    const avg = avgVelocity;
    const variance = velocities.length > 1
      ? Math.sqrt(velocities.reduce((sum, v) => sum + Math.pow(v - avg, 2), 0) / (velocities.length - 1))
      : 0;

    // Cycle Time
    const completedItems = franquiaItems.filter(i => COMPLETED_STATES.includes(i.state) && i.cycleTime != null);
    const avgCT = completedItems.length > 0
      ? completedItems.reduce((sum, i) => sum + (i.cycleTime as number), 0) / completedItems.length
      : 0;

    // WIP
    const wipItems = franquiaItems.filter(i => IN_PROGRESS_STATES.includes(i.state));

    const deliveredItemsAll = velocityData.flatMap(v => v.deliveredItems);
    const committedItemsAll = velocityData.flatMap(v => v.items);

    return {
      avgVelocity: Math.round(avgVelocity * 10) / 10,
      avgSPVelocity: Math.round(avgSPVelocity * 10) / 10,
      reliability: Math.round(reliability * 10) / 10,
      variability: Math.round(variance * 10) / 10,
      avgCycleTime: Math.round(avgCT * 10) / 10,
      wip: wipItems.length,
      totalMembers: members.length,
      deliveredItemsAll, committedItemsAll, completedItems, wipItems,
    };
  }, [velocityData, franquiaItems, members]);

  // Story Points by member
  const spByMember = useMemo(() => {
    const map: Record<string, { delivered: number; total: number; items: WorkItem[] }> = {};
    franquiaItems.forEach(item => {
      const name = item.assignedTo || 'Não atribuído';
      if (!map[name]) map[name] = { delivered: 0, total: 0, items: [] };
      map[name].total += item.storyPoints || 0;
      map[name].items.push(item);
      if (COMPLETED_STATES.includes(item.state)) {
        map[name].delivered += item.storyPoints || 0;
      }
    });
    return Object.entries(map)
      .map(([name, v]) => ({ name, ...v }))
      .sort((a, b) => b.delivered - a.delivered)
      .slice(0, 15);
  }, [franquiaItems]);

  // Type distribution
  const typeDistribution = useMemo(() => {
    const map: Record<string, WorkItem[]> = {};
    franquiaItems.forEach(item => {
      if (!map[item.type]) map[item.type] = [];
      map[item.type].push(item);
    });
    return Object.entries(map)
      .map(([type, items]) => ({ type, count: items.length, color: TYPE_COLORS[type] || '#8892B0', items }))
      .sort((a, b) => b.count - a.count);
  }, [franquiaItems]);

  // Velocity trend line
  const velocityTrend = useMemo(() => {
    return velocityData.map((v, i) => ({
      ...v,
      trend: kpis.avgVelocity,
    }));
  }, [velocityData, kpis]);

  // Sprint history table with carry-over analysis
  const sprintHistory2 = useMemo(() => {
    return filteredSprintData.map((sprint, idx) => {
      const items = sprint.items;
      const committed = items.length;
      const delivered = items.filter(i => COMPLETED_STATES.includes(i.state)).length;
      const bugs = items.filter(i => i.type === 'Bug').length;
      const sp = items.reduce((sum, i) => sum + (i.storyPoints || 0), 0);
      const spDelivered = items.filter(i => COMPLETED_STATES.includes(i.state)).reduce((sum, i) => sum + (i.storyPoints || 0), 0);
      // Carry-over: items not completed from this sprint
      const notDone = items.filter(i => !COMPLETED_STATES.includes(i.state) && i.state !== 'Removed');
      const carryOver = notDone.length;
      const carryOverSP = Math.round(notDone.reduce((sum, i) => sum + (i.storyPoints || 0), 0) * 10) / 10;
      return {
        name: sprint.name,
        committed,
        delivered,
        reliability: committed > 0 ? Math.round((delivered / committed) * 100) : 0,
        bugs,
        sp: Math.round(sp * 10) / 10,
        spDelivered: Math.round(spDelivered * 10) / 10,
        carryOver,
        carryOverSP,
        items,
      };
    });
  }, [filteredSprintData]);

  // Sprints reais disponíveis pro time selecionado (nome das iterations, mais recente primeiro) — usado
  // pro seletor manual de sprint, já que com mais de um time em Scrum a sprint "atual" detectada
  // automaticamente pode não ser a que o usuário quer ver.
  const availableSprints = useMemo(() => {
    return [...sprintData]
      .filter(s => s.items.length > 0)
      .sort((a, b) => b.start.getTime() - a.start.getTime())
      .map(s => s.name);
  }, [sprintData]);

  // Zera sprint e membros selecionados ao trocar de time — ambos são específicos de cada time.
  useEffect(() => {
    setSelectedSprint('__auto__');
    setFilterMembers([]);
  }, [selectedScrumTeam]);

  // Sprint efetivamente usada no Burndown: a detectada automaticamente, ou a escolhida manualmente no filtro.
  const effectiveCurrentSprint = useMemo(() => {
    if (selectedSprint !== '__auto__') {
      const found = sprintData.find(s => s.name === selectedSprint);
      if (found) return { path: found.name, name: found.name, number: 0, count: found.items.length };
    }
    return currentSprint;
  }, [selectedSprint, sprintData, currentSprint]);

  // Burndown data for current sprint
  const burndownData = useMemo(() => {
    const currentSprint = effectiveCurrentSprint;
    if (!currentSprint) return [];
    // Get items from current sprint - match by sprint name
    const sprintNamePart = currentSprint.name.replace(/.*\\/, '').split(' ')[0]; // Get just CONSTANCE_SPRINT_146
    const currentSprintData = sprintData.find(s => s.name.includes(sprintNamePart) || sprintNamePart.includes(s.name));
    if (!currentSprintData) return [];
    const items = currentSprintData.items;
    if (items.length === 0) return [];
    
    // Separate User Stories (have Story Points) from Tasks (have hours)
    const userStories = items.filter(i => i.type === 'User Story' || i.type === 'Eventuality' || i.type === 'General');
    const tasks = items.filter(i => i.type === 'Task' || i.type === 'QA');
    
    // User Stories use Story Points
    const totalSP = userStories.reduce((s, i) => s + (i.storyPoints || 0), 0);
    const totalStories = userStories.length;
    
    // Tasks use estimated hours (remaining_work for actual remaining)
    const totalHours = tasks.reduce((s, i) => s + (i.originalEstimate || 0), 0);
    
    // For burndown we track: User Stories (SP) and all items count
    const totalItems = items.length;
    
    // Determine sprint date range using sprint duration setting
    const sprintDays = sprintDuration * 7;
    const now = new Date();
    
    // Find sprint period based on activity
    const allDates = items.map(i => new Date(i.createdDate || i.changedDate || '').getTime()).filter(d => !isNaN(d) && d > 0);
    const closedDates = items.filter(i => i.closedDate && COMPLETED_STATES.includes(i.state)).map(i => new Date(i.closedDate!).getTime());
    
    let sprintStart: Date;
    let sprintEnd: Date;
    
    if (allDates.length > 0) {
      // Use earliest item creation as sprint start
      const minDate = new Date(Math.min(...allDates));
      sprintStart = minDate;
      // Sprint ends after configured duration, or now if sprint is ongoing
      sprintEnd = addDays(sprintStart, sprintDays);
      if (sprintEnd < now) {
        // Sprint already finished - use actual end
        const maxClosed = closedDates.length > 0 ? new Date(Math.max(...closedDates)) : sprintEnd;
        sprintEnd = maxClosed;
      }
    } else {
      sprintStart = addDays(now, -sprintDays);
      sprintEnd = now;
    }
    
    // Limit to reasonable range
    let totalDays = differenceInDays(sprintEnd, sprintStart) || sprintDays;
    if (totalDays > sprintDays + 7) totalDays = sprintDays + 7; // Allow 1 week buffer
    if (totalDays < 1) totalDays = sprintDays;
    
    // Build daily burndown
    const data: { day: string; remaining: number; spRemaining: number; hoursRemaining: number; ideal: number; idealSP: number; idealHours: number; items: WorkItem[] }[] = [];
    for (let d = 0; d <= totalDays; d++) {
      const date = addDays(sprintStart, d);
      const dateStr = format(date, 'dd/MM');
      
      // User Stories completed by date
      const completedStoriesByDate = userStories.filter(i => {
        if (!i.closedDate) return false;
        return new Date(i.closedDate as string) <= date && COMPLETED_STATES.includes(i.state);
      });
      const completedSP = completedStoriesByDate.reduce((s, i) => s + (i.storyPoints || 0), 0);
      
      // All items completed by date
      const completedItemsByDate = items.filter(i => {
        if (!i.closedDate) return false;
        return new Date(i.closedDate as string) <= date && COMPLETED_STATES.includes(i.state);
      });
      const completedItems = completedItemsByDate.length;
      
      // Tasks: sum completed work for items closed by date
      const completedTasksByDate = tasks.filter(i => {
        if (!i.closedDate) return false;
        return new Date(i.closedDate as string) <= date && COMPLETED_STATES.includes(i.state);
      });
      const completedHours = completedTasksByDate.reduce((s, i) => s + (i.originalEstimate || 0), 0);

      // Itens ainda não concluídos naquela data — o "restante" do burndown
      const remainingItemsByDate = items.filter(i =>
        !(i.closedDate && new Date(i.closedDate as string) <= date && COMPLETED_STATES.includes(i.state))
      );

      data.push({
        day: dateStr,
        remaining: totalItems - completedItems,
        spRemaining: Math.round((totalSP - completedSP) * 10) / 10,
        hoursRemaining: Math.round((totalHours - completedHours) * 10) / 10,
        ideal: Math.round((totalItems * (1 - d / totalDays)) * 10) / 10,
        idealSP: Math.round((totalSP * (1 - d / totalDays)) * 10) / 10,
        idealHours: Math.round((totalHours * (1 - d / totalDays)) * 10) / 10,
        items: remainingItemsByDate,
      });
    }
    return data;
  }, [effectiveCurrentSprint, sprintData, sprintDuration]);

  // Scrum insights
  const scrumInsights = useMemo(() => {
    const insights: { icon: string; text: string; type: 'good' | 'warning' | 'bad' }[] = [];

    if (kpis.reliability >= 80) {
      insights.push({ icon: '🎯', text: `Confiabilidade de ${kpis.reliability}% — o time entrega o que planeja. Excelente!`, type: 'good' });
    } else if (kpis.reliability >= 60) {
      insights.push({ icon: '⚠️', text: `Confiabilidade de ${kpis.reliability}% — margem para melhoria no planejamento.`, type: 'warning' });
    } else {
      insights.push({ icon: '🔴', text: `Confiabilidade de ${kpis.reliability}% — o time erra muito na previsão. Revisar planning.`, type: 'bad' });
    }

    if (kpis.variability > kpis.avgVelocity * 0.3) {
      insights.push({ icon: '📊', text: `Variabilidade alta (σ=${kpis.variability}). Velocidade oscilando demais entre sprints.`, type: 'warning' });
    } else {
      insights.push({ icon: '✅', text: `Variabilidade controlada (σ=${kpis.variability}). Velocidade previsível.`, type: 'good' });
    }

    if (kpis.wip > kpis.totalMembers * 2) {
      insights.push({ icon: '🚧', text: `WIP alto (${kpis.wip} itens para ${kpis.totalMembers} membros). Pode estar havendo multitasking excessivo.`, type: 'warning' });
    } else {
      insights.push({ icon: '✅', text: `WIP saudável: ${kpis.wip} itens em progresso para ${kpis.totalMembers} membros.`, type: 'good' });
    }

    if (kpis.avgCycleTime > 15) {
      insights.push({ icon: '⏱️', text: `Cycle Time médio de ${kpis.avgCycleTime} dias — itens levam muito para fechar. Investigar gargalos.`, type: 'bad' });
    } else if (kpis.avgCycleTime > 7) {
      insights.push({ icon: '⏱️', text: `Cycle Time médio de ${kpis.avgCycleTime} dias — razoável, mas pode melhorar.`, type: 'warning' });
    } else if (kpis.avgCycleTime > 0) {
      insights.push({ icon: '🚀', text: `Cycle Time excelente: ${kpis.avgCycleTime} dias em média.`, type: 'good' });
    }

    const lastSprints = velocityData.slice(-3);
    if (lastSprints.length >= 3) {
      const trend = lastSprints[2].delivered - lastSprints[0].delivered;
      if (trend > 2) {
        insights.push({ icon: '📈', text: 'Velocidade em tendência de alta nos últimos 3 sprints.', type: 'good' });
      } else if (trend < -2) {
        insights.push({ icon: '📉', text: 'Velocidade em queda nos últimos 3 sprints. Investigar causas.', type: 'bad' });
      }
    }

    return insights;
  }, [kpis, velocityData]);

  // Estimativa vs Realidade - Tasks com campos de tempo
  const estimateVsRealityData = useMemo(() => {
    // Filtrar Tasks com campos de estimativa preenchidos
    const tasksWithEstimates = franquiaItems.filter(item => 
      item.type === 'Task' && item.originalEstimate != null
    );
    
    // Agrupar por sprint
    const sprintMap: Record<string, {
      name: string;
      originalEstimate: number;
      completedWork: number;
      remainingWork: number;
      taskCount: number;
      items: WorkItem[];
    }> = {};

    tasksWithEstimates.forEach(task => {
      const iterationPath = task.iterationPath as string || 'Sem Sprint';
      const parts = iterationPath.split('\\');
      const sprintName = parts[parts.length - 1] || iterationPath;

      if (!sprintMap[sprintName]) {
        sprintMap[sprintName] = {
          name: sprintName,
          originalEstimate: 0,
          completedWork: 0,
          remainingWork: 0,
          taskCount: 0,
          items: [],
        };
      }
      sprintMap[sprintName].originalEstimate += Number(task.originalEstimate) || 0;
      sprintMap[sprintName].completedWork += Number(task.completedWork) || 0;
      sprintMap[sprintName].remainingWork += Number(task.remainingWork) || 0;
      sprintMap[sprintName].taskCount += 1;
      sprintMap[sprintName].items.push(task);
    });
    
    return Object.values(sprintMap)
      .sort((a, b) => {
        const numA = a.name.match(/(\d+)/)?.[1];
        const numB = b.name.match(/(\d+)/)?.[1];
        if (numA && numB) return parseInt(numA) - parseInt(numB);
        return a.name.localeCompare(b.name);
      })
      .slice(-10); // Últimas 10 sprints
  }, [franquiaItems]);

  // KPIs de estimativa vs realidade
  const estimateKpis = useMemo(() => {
    if (estimateVsRealityData.length === 0) return null;
    
    const totalEstimate = estimateVsRealityData.reduce((s, d) => s + d.originalEstimate, 0);
    const totalCompleted = estimateVsRealityData.reduce((s, d) => s + d.completedWork, 0);
    const totalRemaining = estimateVsRealityData.reduce((s, d) => s + d.remainingWork, 0);
    const totalTasks = estimateVsRealityData.reduce((s, d) => s + d.taskCount, 0);
    
    // Accuracy: quanto a estimativa foi próxima da realidade
    const accuracy = totalEstimate > 0 
      ? Math.round(((totalCompleted + totalRemaining) / totalEstimate) * 100) 
      : 0;
    
    // Variação: completedWork vs originalEstimate
    const variance = totalEstimate > 0 
      ? Math.round(((totalCompleted - totalEstimate) / totalEstimate) * 100) 
      : 0;
    
    return {
      totalEstimate: Math.round(totalEstimate),
      totalCompleted: Math.round(totalCompleted),
      totalRemaining: Math.round(totalRemaining),
      totalTasks,
      accuracy,
      variance,
      items: estimateVsRealityData.flatMap(d => d.items),
    };
  }, [estimateVsRealityData]);

  if (franquiaItems.length === 0) {
    return (
      <div className="bg-ds-navy p-8 rounded-lg border border-ds-border text-center">
        <p className="text-ds-text text-lg">Nenhum dado encontrado para o time selecionado.</p>
        <p className="text-ds-text text-sm mt-2">Verifique se os dados foram sincronizados e selecione um time com itens no Azure DevOps.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <ItemListModal data={modalData} onClose={() => setModalData(null)} />
      {/* Scrum Filters */}
      <div className="bg-ds-navy p-4 rounded-lg border border-ds-border">
        <div className="flex flex-wrap items-start gap-4">
          <div>
            <label htmlFor="scrum-team" className="text-ds-text text-sm mb-1 block">Time Scrum:</label>
            <select id="scrum-team" value={selectedScrumTeam} onChange={e => setSelectedScrumTeam(e.target.value)}
              className="bg-ds-navy border border-ds-border text-ds-light-text text-sm rounded-md p-2">
              <option value="__all__">Todos os Times</option>
              {availableTeams.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          <div>
            <label htmlFor="scrum-sprint" className="text-ds-text text-sm mb-1 block">Sprint:</label>
            <select id="scrum-sprint" value={selectedSprint} onChange={e => setSelectedSprint(e.target.value)}
              disabled={selectedScrumTeam === '__all__'}
              className="bg-ds-navy border border-ds-border text-ds-light-text text-sm rounded-md p-2 disabled:opacity-40 disabled:cursor-not-allowed">
              <option value="__auto__">Atual (automático)</option>
              {availableSprints.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
            {selectedScrumTeam === '__all__' && (
              <p className="text-[10px] text-ds-text mt-1 max-w-40">Selecione um time específico pra ver a sprint dele.</p>
            )}
          </div>
          <div>
            <label htmlFor="sprint-duration" className="text-ds-text text-sm mb-1 block">Duração do Sprint:</label>
            <select id="sprint-duration" value={sprintDuration} onChange={e => setSprintDuration(Number(e.target.value))}
              className="bg-ds-navy border border-ds-border text-ds-light-text text-sm rounded-md p-2">
              <option value={1}>1 semana</option>
              <option value={2}>2 semanas</option>
              <option value={3}>3 semanas</option>
              <option value={4}>4 semanas</option>
            </select>
          </div>
          <div>
            <label htmlFor="sprint-history" className="text-ds-text text-sm mb-1 block">Histórico (sprints):</label>
            <select id="sprint-history" value={sprintHistory} onChange={e => setSprintHistory(Number(e.target.value))}
              className="bg-ds-navy border border-ds-border text-ds-light-text text-sm rounded-md p-2">
              {[4, 5, 6, 7, 8, 9, 10, 11, 12].map(n => (
                <option key={n} value={n}>{n} sprints</option>
              ))}
            </select>
          </div>
          <div className="relative" ref={memberDropdownRef}>
            <label className="text-ds-text text-sm mb-1 block">Membros (velocity):</label>
            <button
              type="button"
              onClick={() => setShowMemberDropdown(v => !v)}
              className="bg-ds-navy border border-ds-border text-ds-light-text text-sm rounded-md p-2 min-w-40 text-left flex items-center justify-between gap-2"
            >
              <span>{filterMembers.length === 0 ? 'Todos' : `${filterMembers.length} selecionado${filterMembers.length > 1 ? 's' : ''}`}</span>
              <span className="text-ds-text text-xs">▾</span>
            </button>
            {showMemberDropdown && (
              <div className="absolute z-20 mt-1 w-64 max-h-72 overflow-y-auto bg-ds-navy border border-ds-border rounded-md shadow-xl p-2">
                <div className="flex items-center justify-between mb-2 px-1">
                  <button type="button" onClick={() => setFilterMembers([])} className="text-xs text-ds-green hover:underline">Todos</button>
                  <button type="button" onClick={() => setFilterMembers(members)} className="text-xs text-ds-green hover:underline">Marcar todos</button>
                </div>
                {members.map(m => (
                  <label key={m} className="flex items-center gap-2 px-1 py-1 text-sm text-ds-light-text hover:bg-ds-muted/20 rounded cursor-pointer">
                    <input
                      type="checkbox"
                      checked={filterMembers.includes(m)}
                      onChange={() => setFilterMembers(prev => prev.includes(m) ? prev.filter(x => x !== m) : [...prev, m])}
                      className="accent-ds-green"
                    />
                    {m}
                  </label>
                ))}
                {members.length === 0 && <p className="text-xs text-ds-text px-1 py-1">Nenhum membro encontrado.</p>}
              </div>
            )}
            <p className="text-[10px] text-ds-text mt-1 max-w-45">Marcar pessoas restringe a velocity/confiabilidade só a elas — previsibilidade mais realista.</p>
          </div>
          <div className="relative" ref={typeDropdownRef}>
            <label className="text-ds-text text-sm mb-1 block">Tipo de Item:</label>
            <button
              type="button"
              onClick={() => setShowTypeDropdown(v => !v)}
              className="bg-ds-navy border border-ds-border text-ds-light-text text-sm rounded-md p-2 min-w-40 text-left flex items-center justify-between gap-2"
            >
              <span>{filterTypes.length === 0 ? 'Todos' : `${filterTypes.length} selecionado${filterTypes.length > 1 ? 's' : ''}`}</span>
              <span className="text-ds-text text-xs">▾</span>
            </button>
            {showTypeDropdown && (
              <div className="absolute z-20 mt-1 w-64 max-h-72 overflow-y-auto bg-ds-navy border border-ds-border rounded-md shadow-xl p-2">
                <div className="flex items-center justify-between mb-2 px-1">
                  <button type="button" onClick={() => setFilterTypes([])} className="text-xs text-ds-green hover:underline">Todos</button>
                  <button type="button" onClick={() => setFilterTypes(types)} className="text-xs text-ds-green hover:underline">Marcar todos</button>
                </div>
                {types.map(t => (
                  <label key={t} className="flex items-center gap-2 px-1 py-1 text-sm text-ds-light-text hover:bg-ds-muted/20 rounded cursor-pointer">
                    <input
                      type="checkbox"
                      checked={filterTypes.includes(t)}
                      onChange={() => setFilterTypes(prev => prev.includes(t) ? prev.filter(x => x !== t) : [...prev, t])}
                      className="accent-ds-green"
                    />
                    {t}
                  </label>
                ))}
                {types.length === 0 && <p className="text-xs text-ds-text px-1 py-1">Nenhum tipo encontrado.</p>}
              </div>
            )}
            <p className="text-[10px] text-ds-text mt-1 max-w-45">Marcar tipos específicos restringe a velocity só a eles.</p>
          </div>
          <div className="text-ds-green text-xs flex items-center gap-2">
            <span>🏷️</span> Time: <strong>{selectedScrumTeam === '__all__' ? 'Todos' : selectedScrumTeam}</strong> — {franquiaItems.length} itens totais
            {effectiveCurrentSprint ? (
              <span className="ml-2 px-2 py-1 rounded-full bg-ds-green/20 text-ds-green font-bold text-xs border border-ds-green/40">
                🏃 {selectedSprint === '__auto__' ? 'Sprint Atual' : 'Sprint Selecionada'}: {effectiveCurrentSprint.name} ({effectiveCurrentSprint.count} {selectedSprint === '__auto__' ? 'itens ativos' : 'itens'})
              </span>
            ) : selectedScrumTeam === '__all__' && (
              <span className="ml-2 px-2 py-1 rounded-full bg-ds-navy text-ds-text text-xs border border-ds-border">
                Selecione um time pra ver a sprint atual
              </span>
            )}
          </div>
          <button
            onClick={async () => {
              const items = filteredSprintData.flatMap(s => s.items);
              if (items.length === 0) return;
              setExportingXlsx(true);
              try {
                await exportItemsXlsx(items, getWorkItemColumns(), `Scrum_${selectedScrumTeam}_${format(new Date(), 'yyyy-MM-dd')}.xlsx`);
              } finally {
                setExportingXlsx(false);
              }
            }}
            disabled={exportingXlsx || filteredSprintData.every(s => s.items.length === 0)}
            className="ml-auto px-3 py-2 text-xs rounded-md font-medium bg-ds-green text-ds-dark-blue hover:bg-ds-green/80 disabled:opacity-40 disabled:cursor-not-allowed transition-colors self-end"
            title="Exporta os itens das sprints exibidas para .xlsx"
          >
            {exportingXlsx ? 'Exportando…' : '📥 Exportar .xlsx'}
          </button>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-4">
        {[
          { label: 'Velocity Média', value: kpis.avgVelocity, unit: 'itens/sprint', color: 'text-ds-green', items: kpis.deliveredItemsAll },
          { label: 'SP Velocity', value: kpis.avgSPVelocity, unit: 'SP/sprint', color: 'text-blue-400', items: kpis.deliveredItemsAll },
          { label: 'Confiabilidade', value: `${kpis.reliability}%`, unit: '', color: kpis.reliability >= 80 ? 'text-ds-green' : kpis.reliability >= 60 ? 'text-yellow-400' : 'text-red-400', items: kpis.committedItemsAll },
          { label: 'Variabilidade', value: `σ ${kpis.variability}`, unit: '', color: 'text-ds-light-text', items: kpis.deliveredItemsAll },
          { label: 'Cycle Time', value: kpis.avgCycleTime, unit: 'dias', color: 'text-yellow-400', items: kpis.completedItems },
          { label: 'WIP', value: kpis.wip, unit: 'itens', color: 'text-orange-400', items: kpis.wipItems },
          { label: 'Membros', value: kpis.totalMembers, unit: 'ativos', color: 'text-ds-light-text', items: null },
        ].map((kpi, i) => (
          <div
            key={i}
            className={`bg-ds-navy p-4 rounded-lg border border-ds-border text-center ${kpi.items ? 'cursor-pointer hover:border-ds-green transition-colors' : ''}`}
            onClick={() => kpi.items && setModalData({ title: kpi.label, items: kpi.items, color: '#64FFDA' })}
          >
            <p className="text-ds-text text-xs">{kpi.label}</p>
            <p className={`text-2xl font-bold ${kpi.color}`}>{kpi.value}</p>
            {kpi.unit && <p className="text-ds-text text-xs">{kpi.unit}</p>}
          </div>
        ))}
      </div>

      {/* Burndown Chart */}
      {burndownData.length > 0 && (
        <div className="bg-ds-navy p-4 rounded-lg border border-ds-border">
          <h3 className="text-ds-light-text font-bold text-lg mb-4">🔥 Sprint Burndown — {effectiveCurrentSprint?.name}</h3>
          <ChartInfoLamp info="Burndown da sprint atual: SP das User Stories, Horas das Tasks e itens restantes vs. linha ideal. Se a curva real estiver acima da ideal, a sprint está atrasada. Clique num ponto pra ver os itens ainda em aberto naquele dia." />
          <div className="grid grid-cols-3 gap-4 mb-4">
            <div className="text-center p-2 bg-ds-navy/50 rounded border border-ds-border">
              <p className="text-xs text-ds-text">SP Total (User Stories)</p>
              <p className="text-xl font-bold text-blue-400">{burndownData[0]?.spRemaining || 0}</p>
            </div>
            <div className="text-center p-2 bg-ds-navy/50 rounded border border-ds-border">
              <p className="text-xs text-ds-text">Horas Total (Tasks)</p>
              <p className="text-xl font-bold text-purple-400">{burndownData[0]?.hoursRemaining || 0}h</p>
            </div>
            <div className="text-center p-2 bg-ds-navy/50 rounded border border-ds-border">
              <p className="text-xs text-ds-text">Itens Totais</p>
              <p className="text-xl font-bold text-red-400">{burndownData[0]?.remaining || 0}</p>
            </div>
          </div>
          <ResponsiveContainer width="100%" height={350}>
            <AreaChart
              data={burndownData}
              className="cursor-pointer"
              onClick={(e: any) => {
                const p = e?.activePayload?.[0]?.payload;
                if (p) setModalData({ title: `Itens em aberto — ${p.day}`, items: p.items, color: '#47C5FB' });
              }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke={CHART_COLORS.grid} />
              <XAxis dataKey="day" stroke={CHART_COLORS.text} tick={{ fontSize: 11 }} />
              <YAxis yAxisId="left" stroke={CHART_COLORS.text} />
              <YAxis yAxisId="right" orientation="right" stroke="#A78BFA" />
              <Tooltip contentStyle={{ backgroundColor: '#0a192f', border: '1px solid #64ffda', borderRadius: '8px', color: '#e6f1ff', padding: '10px 14px' }} labelStyle={{ color: '#64ffda', fontWeight: 'bold' }} itemStyle={{ color: '#e6f1ff' }} />
              <Legend />
              <Area yAxisId="left" type="monotone" dataKey="spRemaining" name="SP Restantes (User Stories)" stroke="#47C5FB" fill="#47C5FB" fillOpacity={0.15} strokeWidth={2} />
              <Area yAxisId="right" type="monotone" dataKey="hoursRemaining" name="Horas Restantes (Tasks)" stroke="#A78BFA" fill="#A78BFA" fillOpacity={0.1} strokeWidth={2} />
              <Line yAxisId="left" type="monotone" dataKey="idealSP" name="Ideal (SP)" stroke="#64FFDA" strokeDasharray="5 5" strokeWidth={1.5} dot={false} />
              <Line yAxisId="right" type="monotone" dataKey="idealHours" name="Ideal (Horas)" stroke="#FFB86C" strokeDasharray="5 5" strokeWidth={1.5} dot={false} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Velocity Chart */}
      <div className="bg-ds-navy p-4 rounded-lg border border-ds-border">
        <h3 className="text-ds-light-text font-bold text-lg mb-4">📊 Velocity por Sprint (Comprometido vs Entregue)</h3>
        <ChartInfoLamp info="Histórico de velocity: comparação entre itens comprometidos e itens efetivamente entregues em cada sprint. A diferença indica a confiabilidade do planejamento. Clique numa barra pra ver os itens." />
        <ResponsiveContainer width="100%" height={350}>
          <BarChart data={velocityTrend}>
            <CartesianGrid strokeDasharray="3 3" stroke={CHART_COLORS.grid} />
            <XAxis dataKey="sprint" stroke={CHART_COLORS.text} tick={{ fontSize: 11 }} />
            <YAxis stroke={CHART_COLORS.text} />
            <Tooltip contentStyle={{ backgroundColor: '#0a192f', border: '1px solid #64ffda', borderRadius: '8px', color: '#e6f1ff', padding: '10px 14px' }} labelStyle={{ color: '#64ffda', fontWeight: 'bold' }} itemStyle={{ color: '#e6f1ff' }} />
            <Legend />
            <Bar dataKey="committed" name="Comprometido" fill="#47C5FB" opacity={0.6} cursor="pointer" onClick={(d: any) => setModalData({ title: `Itens comprometidos — ${d.sprint}`, items: d.items, color: '#47C5FB' })} label={{ position: 'top', fill: '#47C5FB', fontSize: 9 }} />
            <Bar dataKey="delivered" name="Entregue" fill="#64FFDA" cursor="pointer" onClick={(d: any) => setModalData({ title: `Itens entregues — ${d.sprint}`, items: d.deliveredItems, color: '#64FFDA' })} label={{ position: 'top', fill: '#64FFDA', fontSize: 9 }} />
            <ReferenceLine y={kpis.avgVelocity} stroke="#FFB86C" strokeDasharray="5 5" label={{ value: `Média: ${kpis.avgVelocity}`, position: 'insideTopRight', fill: '#FFB86C', fontSize: 11 }} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Velocity Trend */}
      <div className="bg-ds-navy p-4 rounded-lg border border-ds-border">
        <h3 className="text-ds-light-text font-bold text-lg mb-4">📈 Tendência de Velocity</h3>
        <ChartInfoLamp info="Evolução da velocity (itens e SP) ao longo das sprints, com linha de média. Ajuda a prever a capacidade futura do time. Clique num ponto pra ver os itens entregues." />
        <ResponsiveContainer width="100%" height={300}>
          <LineChart
            data={velocityTrend}
            className="cursor-pointer"
            onClick={(e: any) => {
              const p = e?.activePayload?.[0]?.payload;
              if (p) setModalData({ title: `Itens entregues — ${p.sprint}`, items: p.deliveredItems, color: '#64FFDA' });
            }}
          >
            <CartesianGrid strokeDasharray="3 3" stroke={CHART_COLORS.grid} />
            <XAxis dataKey="sprint" stroke={CHART_COLORS.text} tick={{ fontSize: 11 }} />
            <YAxis stroke={CHART_COLORS.text} />
            <Tooltip contentStyle={{ backgroundColor: '#0a192f', border: '1px solid #64ffda', borderRadius: '8px', color: '#e6f1ff', padding: '10px 14px' }} labelStyle={{ color: '#64ffda', fontWeight: 'bold' }} itemStyle={{ color: '#e6f1ff' }} />
            <Legend />
            <Line type="monotone" dataKey="delivered" name="Velocity (itens)" stroke="#64FFDA" strokeWidth={2} dot={{ r: 4 }} />
            <Line type="monotone" dataKey="spDelivered" name="Velocity (SP)" stroke="#47C5FB" strokeWidth={2} dot={{ r: 4 }} />
            <ReferenceLine y={kpis.avgVelocity} stroke="#FFB86C" strokeDasharray="5 5" />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* Estimativa vs Realidade (Tasks) */}
      {estimateVsRealityData.length > 0 && estimateKpis && (
        <div className="bg-ds-navy p-4 rounded-lg border border-ds-border">
          <h3 className="text-ds-light-text font-bold text-lg mb-4">⏱️ Estimativa vs Realidade (Tasks)</h3>
          <ChartInfoLamp info="Comparação entre horas estimadas (Original Estimate) e horas reais trabalhadas (Completed Work). Mostra a acurácia das estimativas do time." />
          
          {/* KPIs de Estimativa */}
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3 mb-4">
            <div className="bg-ds-background/50 p-3 rounded-lg text-center cursor-pointer hover:brightness-110 transition-all" onClick={() => setModalData({ title: 'Tasks Analisadas (Estimativa vs Realidade)', items: estimateKpis.items, color: '#8892B0' })}>
              <p className="text-ds-text text-xs">Tasks Analisadas</p>
              <p className="text-xl font-bold text-ds-light-text">{estimateKpis.totalTasks}</p>
            </div>
            <div className="bg-ds-background/50 p-3 rounded-lg text-center cursor-pointer hover:brightness-110 transition-all" onClick={() => setModalData({ title: 'Tasks — Total Estimado', items: estimateKpis.items, color: '#47C5FB' })}>
              <p className="text-ds-text text-xs">Total Estimado</p>
              <p className="text-xl font-bold text-blue-400">{estimateKpis.totalEstimate}h</p>
            </div>
            <div className="bg-ds-background/50 p-3 rounded-lg text-center cursor-pointer hover:brightness-110 transition-all" onClick={() => setModalData({ title: 'Tasks — Trabalho Realizado', items: estimateKpis.items, color: '#64FFDA' })}>
              <p className="text-ds-text text-xs">Trabalho Realizado</p>
              <p className="text-xl font-bold text-ds-green">{estimateKpis.totalCompleted}h</p>
            </div>
            <div className="bg-ds-background/50 p-3 rounded-lg text-center cursor-pointer hover:brightness-110 transition-all" onClick={() => setModalData({ title: 'Tasks — Restante', items: estimateKpis.items, color: '#FFB86C' })}>
              <p className="text-ds-text text-xs">Restante</p>
              <p className="text-xl font-bold text-orange-400">{estimateKpis.totalRemaining}h</p>
            </div>
            <div className="bg-ds-background/50 p-3 rounded-lg text-center cursor-pointer hover:brightness-110 transition-all" onClick={() => setModalData({ title: 'Tasks — base da Acurácia', items: estimateKpis.items, color: '#22C55E' })}>
              <p className="text-ds-text text-xs">Acurácia</p>
              <p className={`text-xl font-bold ${estimateKpis.accuracy >= 80 && estimateKpis.accuracy <= 120 ? 'text-green-400' : 'text-yellow-400'}`}>{estimateKpis.accuracy}%</p>
            </div>
            <div className="bg-ds-background/50 p-3 rounded-lg text-center cursor-pointer hover:brightness-110 transition-all" onClick={() => setModalData({ title: 'Tasks — base da Variação', items: estimateKpis.items, color: '#F87171' })}>
              <p className="text-ds-text text-xs">Variação</p>
              <p className={`text-xl font-bold ${estimateKpis.variance >= 0 ? 'text-red-400' : 'text-green-400'}`}>{estimateKpis.variance > 0 ? '+' : ''}{estimateKpis.variance}%</p>
            </div>
          </div>
          
          <ResponsiveContainer width="100%" height={350}>
            <BarChart
              data={estimateVsRealityData}
              className="cursor-pointer"
              onClick={(e: any) => {
                const p = e?.activePayload?.[0]?.payload;
                if (p) setModalData({ title: `Tasks — ${p.name}`, items: p.items, color: '#47C5FB' });
              }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke={CHART_COLORS.grid} />
              <XAxis dataKey="name" stroke={CHART_COLORS.text} tick={{ fontSize: 9 }} angle={-15} textAnchor="end" height={60} />
              <YAxis stroke={CHART_COLORS.text} label={{ value: 'Horas', angle: -90, position: 'insideLeft', fill: CHART_COLORS.text }} />
              <Tooltip
                contentStyle={{ backgroundColor: '#0a192f', border: '1px solid #64ffda', borderRadius: '8px', color: '#e6f1ff', padding: '10px 14px' }}
                labelStyle={{ color: '#64ffda', fontWeight: 'bold' }}
                itemStyle={{ color: '#e6f1ff' }}
                formatter={(value: number, name: string) => [`${value}h`, name]}
              />
              <Legend />
              <Bar dataKey="originalEstimate" name="Estimado (Original)" fill="#47C5FB" opacity={0.7} label={{ position: 'top', fill: '#47C5FB', fontSize: 9, formatter: (v: number) => v > 0 ? `${v}h` : '' }} />
              <Bar dataKey="completedWork" name="Realizado" fill="#64FFDA" label={{ position: 'top', fill: '#64FFDA', fontSize: 9, formatter: (v: number) => v > 0 ? `${v}h` : '' }} />
              <Bar dataKey="remainingWork" name="Restante" fill="#FFB86C" opacity={0.6} label={{ position: 'top', fill: '#FFB86C', fontSize: 9, formatter: (v: number) => v > 0 ? `${v}h` : '' }} />
            </BarChart>
          </ResponsiveContainer>
          
          <div className="mt-3 text-xs text-ds-text">
            <p>💡 <strong>Abaixo de 100%:</strong> Time entregou mais rápido que o estimado | <strong>Acima de 100%:</strong> Levou mais tempo que o planejado</p>
          </div>
        </div>
      )}

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Story Points by Member */}
        <div className="bg-ds-navy p-4 rounded-lg border border-ds-border">
          <h3 className="text-ds-light-text font-bold text-lg mb-4">👤 Story Points por Membro</h3>
          <ChartInfoLamp info="Distribuição de story points por membro do time: entregues vs. total atribuído. Ajuda a identificar distribuição de carga." />
          <ResponsiveContainer width="100%" height={Math.max(300, spByMember.length * 35)}>
            <BarChart data={spByMember} layout="vertical" margin={{ left: 100, right: 60 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={CHART_COLORS.grid} />
              <XAxis type="number" stroke={CHART_COLORS.text} />
              <YAxis type="category" dataKey="name" tick={{ fill: '#CCD6F6', fontSize: 11 }} width={100} />
              <Tooltip contentStyle={{ backgroundColor: '#0a192f', border: '1px solid #64ffda', borderRadius: '8px', color: '#e6f1ff', padding: '10px 14px' }} labelStyle={{ color: '#64ffda', fontWeight: 'bold' }} itemStyle={{ color: '#e6f1ff' }} />
              <Legend />
              <Bar dataKey="delivered" name="Entregues" fill="#64FFDA" cursor="pointer" onClick={(d: any) => setModalData({ title: `Itens entregues — ${d.name}`, items: d.items.filter((i: WorkItem) => COMPLETED_STATES.includes(i.state)), color: '#64FFDA' })} label={{ position: 'right', fill: '#64FFDA', fontSize: 11, fontWeight: 'bold' }} />
              <Bar dataKey="total" name="Total" fill="#47C5FB" opacity={0.4} cursor="pointer" onClick={(d: any) => setModalData({ title: `Todos os itens — ${d.name}`, items: d.items, color: '#47C5FB' })} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Type Distribution */}
        <div className="bg-ds-navy p-4 rounded-lg border border-ds-border">
          <h3 className="text-ds-light-text font-bold text-lg mb-4">📦 Distribuição por Tipo</h3>
          <ChartInfoLamp info="Distribuição dos itens da sprint por tipo de work item (PBI, Bug, Task, etc.). Mostra o perfil do trabalho do time. Clique numa fatia pra ver os itens." />
          <ResponsiveContainer width="100%" height={300}>
            <PieChart>
              <Pie data={typeDistribution} dataKey="count" nameKey="type" cx="50%" cy="50%" outerRadius={100}
                cursor="pointer"
                onClick={(entry: any) => setModalData({ title: `Itens do tipo ${entry.type}`, items: entry.items, color: entry.color })}
                label={({ type, percent }) => `${type} ${(percent * 100).toFixed(0)}%`}>
                {typeDistribution.map((entry, i) => <Cell key={i} fill={entry.color} />)}
              </Pie>
              <Tooltip contentStyle={{ backgroundColor: '#0a192f', border: '1px solid #64ffda', borderRadius: '8px', color: '#e6f1ff', padding: '10px 14px' }} labelStyle={{ color: '#64ffda', fontWeight: 'bold' }} itemStyle={{ color: '#e6f1ff' }} />
              <Legend />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Sprint History Table */}
      <div className="bg-ds-navy p-4 rounded-lg border border-ds-border">
        <h3 className="text-ds-light-text font-bold text-lg mb-4">📋 Histórico de Sprints</h3>
        <ChartInfoLamp info="Tabela com histórico de sprints: comprometido vs. entregue, confiabilidade, carry-over (itens não finalizados que passam para a próxima sprint) e bugs." />
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left text-ds-text">
            <thead className="text-xs text-ds-light-text uppercase bg-ds-navy/50">
              <tr>
                <th className="px-4 py-3">Sprint</th>
                <th className="px-4 py-3">Comprometido</th>
                <th className="px-4 py-3">Entregue</th>
                <th className="px-4 py-3">Confiabilidade</th>
                <th className="px-4 py-3">SP Comprom.</th>
                <th className="px-4 py-3">SP Entregues</th>
                <th className="px-4 py-3">Carry-over</th>
                <th className="px-4 py-3">Carry SP</th>
                <th className="px-4 py-3">Bugs</th>
              </tr>
            </thead>
            <tbody>
              {sprintHistory2.map((sprint, idx) => (
                <tr
                  key={idx}
                  className="border-b border-ds-border hover:bg-ds-muted/20 cursor-pointer"
                  onClick={() => setModalData({ title: `Itens — ${sprint.name}`, items: sprint.items, color: '#64FFDA' })}
                >
                  <td className="px-4 py-3 font-medium text-ds-light-text">{sprint.name}</td>
                  <td className="px-4 py-3">{sprint.committed}</td>
                  <td className="px-4 py-3 text-ds-green font-semibold">{sprint.delivered}</td>
                  <td className="px-4 py-3">
                    <span className={`font-semibold ${sprint.reliability >= 80 ? 'text-green-400' : sprint.reliability >= 60 ? 'text-yellow-400' : 'text-red-400'}`}>
                      {sprint.reliability}%
                    </span>
                  </td>
                  <td className="px-4 py-3">{sprint.sp}</td>
                  <td className="px-4 py-3 text-blue-400">{sprint.spDelivered}</td>
                  <td className="px-4 py-3">{sprint.carryOver > 0 ? <span className="text-orange-400 font-semibold">{sprint.carryOver}</span> : '0'}</td>
                  <td className="px-4 py-3">{sprint.carryOverSP > 0 ? <span className="text-orange-400">{sprint.carryOverSP}</span> : '0'}</td>
                  <td className="px-4 py-3">{sprint.bugs > 0 ? <span className="text-red-400">{sprint.bugs}</span> : '0'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Insights */}
      <div className="bg-ds-navy p-4 rounded-lg border border-ds-border">
        <h3 className="text-ds-light-text font-bold text-lg mb-3">💡 Insights Scrum Automáticos</h3>
        <ChartInfoLamp info="Insights automáticos sobre saúde Scrum: alertas de confiabilidade, variabilidade, WIP, cycle time e tendência de velocity." />
        <div className="space-y-2">
          {scrumInsights.map((insight, i) => (
            <div key={i} className={`p-3 rounded-lg text-sm ${insight.type === 'good' ? 'bg-green-900/20 text-green-300' : insight.type === 'warning' ? 'bg-yellow-900/20 text-yellow-300' : 'bg-red-900/20 text-red-300'}`}>
              {insight.icon} {insight.text}
            </div>
          ))}
        </div>
      </div>

      {/* Glossary */}
      <div className="bg-ds-navy/50 p-4 rounded-lg border border-ds-border/50">
        <h4 className="text-ds-light-text font-semibold mb-2">📚 Glossário Scrum</h4>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-xs text-ds-text">
          <p><strong className="text-ds-green">Velocity:</strong> Quantidade de itens (ou SP) entregues por sprint.</p>
          <p><strong className="text-blue-400">Confiabilidade:</strong> % de itens comprometidos que foram entregues.</p>
          <p><strong className="text-yellow-400">Variabilidade (σ):</strong> Desvio padrão da velocity — quanto menor, mais previsível.</p>
          <p><strong className="text-orange-400">WIP:</strong> Work In Progress — itens simultaneamente em andamento.</p>
        </div>
      </div>
    </div>
  );
};

export default ScrumCTCDashboard;
