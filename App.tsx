
import React, { useState, useMemo } from 'react';
// Fix: Import `subDays` from its submodule `date-fns/subDays` to resolve the export error.
import subDays from 'date-fns/subDays';
import { GoogleGenAI } from '@google/genai';

// Import Hooks
import { useAzureDevOpsData } from './hooks/useAzureDevOpsData.ts';
import { useAzureDevOpsPRData } from './hooks/useAzureDevOpsPRData.ts';

// Import Components
import Header from './components/Header.tsx';
import FilterBar from './components/FilterBar.tsx';
import SummaryCard from './components/SummaryCard.tsx';
import StatusPieChart from './components/StatusPieChart.tsx';
import TeamPerformanceBarChart from './components/TeamPerformanceBarChart.tsx';
import DeliveryTrendLineChart from './components/DeliveryTrendLineChart.tsx';
import IndividualPerformanceChart from './components/IndividualPerformanceChart.tsx';
import BugVsIssuePieChart from './components/BugVsIssuePieChart.tsx';
import BugCreationTrendChart from './components/BugCreationTrendChart.tsx';
import TeamBugChart from './components/TeamBugChart.tsx';
import TopAuthorsChart from './components/TopAuthorsChart.tsx';
import TopReviewersChart from './components/TopReviewersChart.tsx';
import VoteDistributionPieChart from './components/VoteDistributionPieChart.tsx';
import PRsByRepoChart from './components/PRsByRepoChart.tsx';
import PRLifetimeTrendChart from './components/PRLifetimeTrendChart.tsx';
import AIInsights from './components/AIInsights.tsx';
import CumulativeFlowDiagram from './components/CumulativeFlowDiagram.tsx';
import CycleTimeScatterPlot from './components/CycleTimeScatterPlot.tsx';
import ThroughputHistogram from './components/ThroughputHistogram.tsx';
import MonteCarloSimulation from './components/MonteCarloSimulation.tsx';
import TeamThroughputTrendChart from './components/TeamThroughputTrendChart.tsx';
import ThroughputBreakdownChart from './components/ThroughputBreakdownChart.tsx';
import TimeInStatusChart from './components/TimeInStatusChart.tsx';
import TopTagsChart from './components/TopTagsChart.tsx';
import CycleTimeByTagChart from './components/CycleTimeByTagChart.tsx';
import WorkItemTable from './components/WorkItemTable.tsx';

// Import Types
// Fix: Correctly import types from the refactored types.ts file.
import { WorkItem, WorkItemFilters, PRFilters, WorkItemType, PullRequest } from './types.ts';

// Import Metrics
import { calculatePerformanceMetrics, calculateQualityMetrics, calculatePRMetrics } from './utils/metrics.ts';

type Tab = 'performance' | 'quality' | 'kanban' | 'detailed-throughput' | 'bottlenecks' | 'tags' | 'prs' | 'montecarlo' | 'item-list';

const App = () => {
  const [activeTab, setActiveTab] = useState<Tab>('performance');
  const { workItems, loading: loadingWIs, error: errorWIs } = useAzureDevOpsData();
  const { pullRequests, loading: loadingPRs, error: errorPRs } = useAzureDevOpsPRData();

  const [aiInsight, setAiInsight] = useState('');
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState('');

  const initialWorkItemFilters: WorkItemFilters = {
    period: 30,
    squads: [],
    assignees: [],
    types: [],
    status: [],
    clients: [],
    tags: [],
  };

  const initialPRFilters: PRFilters = {
    period: 30,
    repositories: [],
    authors: [],
    reviewers: [],
    prStatus: [],
  };

  const [workItemFilters, setWorkItemFilters] = useState<WorkItemFilters>(initialWorkItemFilters);
  const [prFilters, setPRFilters] = useState<PRFilters>(initialPRFilters);

  const filteredWorkItems = useMemo(() => {
    const now = new Date();
    const startDate = subDays(now, workItemFilters.period);

    return workItems.filter(item => {
      const itemDate = item.createdDate;
      if (itemDate < startDate) return false;
      if (workItemFilters.squads.length > 0 && !workItemFilters.squads.includes(item.squad)) return false;
      if (workItemFilters.assignees.length > 0 && !workItemFilters.assignees.includes(item.assignee)) return false;
      if (workItemFilters.types.length > 0 && !workItemFilters.types.includes(item.type)) return false;
      if (workItemFilters.status.length > 0 && !workItemFilters.status.includes(item.status)) return false;
      if (workItemFilters.clients.length > 0 && !workItemFilters.clients.includes(item.client)) return false;
      if (workItemFilters.tags.length > 0 && !item.tags.some(t => workItemFilters.tags.includes(t))) return false;
      return true;
    });
  }, [workItems, workItemFilters]);

  const filteredPRs = useMemo(() => {
    const now = new Date();
    const startDate = subDays(now, prFilters.period);

    return pullRequests.filter(pr => {
      const itemDate = pr.createdDate;
       if (itemDate < startDate) return false;
       if (prFilters.repositories.length > 0 && !prFilters.repositories.includes(pr.repository)) return false;
       if (prFilters.authors.length > 0 && !prFilters.authors.includes(pr.author)) return false;
       if (prFilters.prStatus.length > 0 && !prFilters.prStatus.includes(pr.status)) return false;
       if (prFilters.reviewers.length > 0 && !pr.reviewers.some(r => prFilters.reviewers.includes(r.name))) return false;
       return true;
    });
  }, [pullRequests, prFilters]);
  
  const handleGenerateInsights = async () => {
      setAiLoading(true);
      setAiError('');
      setAiInsight('');
      
      try {
        const ai = new GoogleGenAI({ apiKey: process.env.API_KEY as string });
        
        let contextData = JSON.stringify({
          filters: activeTab === 'prs' ? prFilters : workItemFilters,
          data: (activeTab === 'prs' ? filteredPRs.slice(0, 30) : filteredWorkItems.slice(0, 30)).map(d => ({...d, title: undefined})) // Limit data size and remove noisy title
        });
        let prompt = `Você é um analista de engenharia de software e agilidade sênior. Analise os seguintes dados (já filtrados) do Azure DevOps em JSON e forneça insights acionáveis em português do Brasil. Formate sua resposta usando markdown.`;

        if (activeTab === 'prs') {
            prompt += `\nFoco em: tendências de tempo para merge, colaboração (revisores), qualidade (votos), e gargalos em repositórios.`;
        } else if (activeTab === 'kanban') {
            prompt += `\nFoco em: análise de fluxo (WIP, Throughput, Cycle Time), previsibilidade, e saúde do fluxo de trabalho.`;
        } else if (activeTab === 'detailed-throughput') {
             prompt += `\nFoco em: detalhar a vazão (throughput). Compare a performance entre times, identifique quem são as pessoas que mais entregam e quais tipos de item são mais comuns.`;
        } else if (activeTab === 'bottlenecks') {
            prompt += `\nFoco em: identificar gargalos no fluxo de trabalho. Analise o tempo gasto em cada status e aponte quais etapas estão demorando mais e por quê.`;
        } else if (activeTab === 'tags') {
            prompt += `\nFoco em: analisar o uso de tags. Identifique as tags mais comuns e analise se itens com certas tags levam mais tempo para serem concluídos, sugerindo possíveis correlações.`;
        } else if (activeTab === 'item-list') {
            prompt += `\nFoco em: resumir as características principais da lista de itens de trabalho fornecida. Identifique padrões comuns, como o tipo de trabalho mais frequente, o status predominante, ou squads/pessoas com mais itens atribuídos.`;
        } else { // performance or quality
            prompt += `\nFoco em: vazão, cycle time, gargalos, e análise de qualidade (Bugs vs. Incidentes).`;
        }
        
        prompt += `\n\nDados: ${contextData}`;
        
        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: prompt,
        });

        setAiInsight(response.text);

      } catch (error) {
          console.error("Erro ao gerar insights:", error);
          setAiError("Não foi possível gerar os insights. Tente novamente.");
      } finally {
          setAiLoading(false);
      }
  };


  const { total, completed, inProgress, avgCycleTime } = useMemo(() => calculatePerformanceMetrics(filteredWorkItems), [filteredWorkItems]);
  const { openBugs, openIssues, avgResolutionTime, recurrenceRate } = useMemo(() => calculateQualityMetrics(filteredWorkItems), [filteredWorkItems]);
  const { openPRs, completedPRs, avgMergeTime, approvalRate } = useMemo(() => calculatePRMetrics(filteredPRs), [filteredPRs]);
  
  const loading = activeTab === 'prs' ? loadingPRs : loadingWIs;

  const handleTabClick = (tab: Tab) => {
    setActiveTab(tab);
    setAiInsight('');
    setAiError('');
  }

  const renderContent = () => {
    if (loading) return <div className="text-center p-10 text-ds-light-text">Carregando dados...</div>;
    if (errorWIs || errorPRs) return <div className="text-center p-10 text-red-500">Erro ao carregar dados.</div>;

    switch (activeTab) {
      case 'performance':
        return (
          <>
            <AIInsights onGenerate={handleGenerateInsights} insight={aiInsight} loading={aiLoading} error={aiError} />
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-6">
              <SummaryCard title="Total de Itens" value={total} />
              <SummaryCard title="Concluídos no Período" value={completed} />
              <SummaryCard title="Em Progresso" value={inProgress} />
              <SummaryCard title="Cycle Time Médio" value={avgCycleTime} unit="dias" />
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div className="bg-ds-navy p-4 rounded-lg border border-ds-border"><h2 className="text-ds-light-text font-bold text-lg mb-4">Status Geral</h2><StatusPieChart data={filteredWorkItems} /></div>
              <div className="bg-ds-navy p-4 rounded-lg border border-ds-border"><h2 className="text-ds-light-text font-bold text-lg mb-4">Performance dos Times</h2><TeamPerformanceBarChart data={filteredWorkItems} /></div>
              <div className="bg-ds-navy p-4 rounded-lg border border-ds-border"><h2 className="text-ds-light-text font-bold text-lg mb-4">Tendência de Entregas</h2><DeliveryTrendLineChart data={filteredWorkItems} period={workItemFilters.period} /></div>
              <div className="bg-ds-navy p-4 rounded-lg border border-ds-border"><h2 className="text-ds-light-text font-bold text-lg mb-4">Top 10 - Performance Individual</h2><IndividualPerformanceChart data={filteredWorkItems} /></div>
            </div>
          </>
        );
      case 'quality':
        return (
          <>
            <AIInsights onGenerate={handleGenerateInsights} insight={aiInsight} loading={aiLoading} error={aiError} />
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-6">
                <SummaryCard title="Bugs Abertos (Retrabalho)" value={openBugs} />
                <SummaryCard title="Incidentes em Aberto (Prod.)" value={openIssues} />
                <SummaryCard title="Tempo Médio de Resolução" value={avgResolutionTime} unit="dias" />
                <SummaryCard title="Taxa de Recorrência" value={recurrenceRate} unit="%" />
            </div>
             <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className="bg-ds-navy p-4 rounded-lg border border-ds-border"><h2 className="text-ds-light-text font-bold text-lg mb-4">Bugs vs. Incidentes</h2><BugVsIssuePieChart data={filteredWorkItems.filter(i => i.type === WorkItemType.Bug || i.type === WorkItemType.Issue)} /></div>
                <div className="bg-ds-navy p-4 rounded-lg border border-ds-border"><h2 className="text-ds-light-text font-bold text-lg mb-4">Bugs e Incidentes por Time</h2><TeamBugChart data={filteredWorkItems} /></div>
                <div className="col-span-1 lg:col-span-2 bg-ds-navy p-4 rounded-lg border border-ds-border"><h2 className="text-ds-light-text font-bold text-lg mb-4">Tendência de Criação</h2><BugCreationTrendChart data={filteredWorkItems} period={workItemFilters.period} /></div>
            </div>
          </>
        );
       case 'prs':
        return (
           <>
            <AIInsights onGenerate={handleGenerateInsights} insight={aiInsight} loading={aiLoading} error={aiError} />
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-6">
                <SummaryCard title="PRs Abertos" value={openPRs} />
                <SummaryCard title="PRs Concluídos" value={completedPRs} />
                <SummaryCard title="Tempo Médio p/ Merge" value={avgMergeTime} unit="horas" />
                <SummaryCard title="Taxa de Aprovação" value={approvalRate} unit="%" />
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className="bg-ds-navy p-4 rounded-lg border border-ds-border"><h2 className="text-ds-light-text font-bold text-lg mb-4">Top 10 Autores de PRs</h2><TopAuthorsChart data={filteredPRs} /></div>
                <div className="bg-ds-navy p-4 rounded-lg border border-ds-border"><h2 className="text-ds-light-text font-bold text-lg mb-4">Top 10 Revisores</h2><TopReviewersChart data={filteredPRs} /></div>
                <div className="bg-ds-navy p-4 rounded-lg border border-ds-border"><h2 className="text-ds-light-text font-bold text-lg mb-4">Distribuição de Votos</h2><VoteDistributionPieChart data={filteredPRs} /></div>
                <div className="bg-ds-navy p-4 rounded-lg border border-ds-border"><h2 className="text-ds-light-text font-bold text-lg mb-4">PRs por Repositório</h2><PRsByRepoChart data={filteredPRs} /></div>
                <div className="col-span-1 lg:col-span-2 bg-ds-navy p-4 rounded-lg border border-ds-border mt-6">
                    <h2 className="text-ds-light-text font-bold text-lg mb-4">Tendência de Vida dos PRs (Horas)</h2>
                    <PRLifetimeTrendChart data={filteredPRs} period={prFilters.period} />
                </div>
            </div>
           </>
        );
      case 'kanban':
        return (
          <>
            <AIInsights onGenerate={handleGenerateInsights} insight={aiInsight} loading={aiLoading} error={aiError} />
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className="lg:col-span-2 bg-ds-navy p-4 rounded-lg border border-ds-border">
                    <h2 className="text-ds-light-text font-bold text-lg mb-4">Diagrama de Fluxo Cumulativo (WIP)</h2>
                    <CumulativeFlowDiagram data={filteredWorkItems} period={workItemFilters.period} />
                </div>
                <div className="bg-ds-navy p-4 rounded-lg border border-ds-border">
                    <h2 className="text-ds-light-text font-bold text-lg mb-4">Distribuição de Cycle Time (Dispersão)</h2>
                    <CycleTimeScatterPlot data={filteredWorkItems} />
                </div>
                <div className="bg-ds-navy p-4 rounded-lg border border-ds-border">
                    <h2 className="text-ds-light-text font-bold text-lg mb-4">Vazão Semanal (Histograma)</h2>
                    <ThroughputHistogram data={filteredWorkItems} />
                </div>
            </div>
          </>
        );
      case 'detailed-throughput':
        return (
            <>
                <AIInsights onGenerate={handleGenerateInsights} insight={aiInsight} loading={aiLoading} error={aiError} />
                <div className="grid grid-cols-1 gap-6">
                    <div className="bg-ds-navy p-4 rounded-lg border border-ds-border">
                        <h2 className="text-ds-light-text font-bold text-lg mb-4">Tendência de Vazão Semanal por Time</h2>
                        <TeamThroughputTrendChart data={filteredWorkItems} period={workItemFilters.period} />
                    </div>
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                        <div className="bg-ds-navy p-4 rounded-lg border border-ds-border">
                            <h2 className="text-ds-light-text font-bold text-lg mb-4">Vazão por Responsável</h2>
                            <ThroughputBreakdownChart data={filteredWorkItems} groupBy="assignee" />
                        </div>
                         <div className="bg-ds-navy p-4 rounded-lg border border-ds-border">
                            <h2 className="text-ds-light-text font-bold text-lg mb-4">Vazão por Tipo de Item</h2>
                            <ThroughputBreakdownChart data={filteredWorkItems} groupBy="type" />
                        </div>
                    </div>
                </div>
            </>
        );
        case 'bottlenecks':
            return (
                <>
                    <AIInsights onGenerate={handleGenerateInsights} insight={aiInsight} loading={aiLoading} error={aiError} />
                     <div className="grid grid-cols-1 gap-6">
                        <div className="bg-ds-navy p-4 rounded-lg border border-ds-border">
                            <h2 className="text-ds-light-text font-bold text-lg mb-4">Tempo Médio em Cada Status (Dias)</h2>
                            <TimeInStatusChart data={filteredWorkItems} />
                        </div>
                    </div>
                </>
            );
        case 'tags':
             return (
                <>
                    <AIInsights onGenerate={handleGenerateInsights} insight={aiInsight} loading={aiLoading} error={aiError} />
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                        <div className="bg-ds-navy p-4 rounded-lg border border-ds-border">
                            <h2 className="text-ds-light-text font-bold text-lg mb-4">Top 10 Tags Mais Utilizadas</h2>
                            <TopTagsChart data={filteredWorkItems} />
                        </div>
                        <div className="bg-ds-navy p-4 rounded-lg border border-ds-border">
                             <h2 className="text-ds-light-text font-bold text-lg mb-4">Cycle Time Médio por Tag (Dias)</h2>
                            <CycleTimeByTagChart data={filteredWorkItems} />
                        </div>
                    </div>
                </>
            );
      case 'montecarlo':
        return (
            <>
                <MonteCarloSimulation data={filteredWorkItems} filters={workItemFilters} />
            </>
        );
      case 'item-list':
        return (
            <>
                <AIInsights onGenerate={handleGenerateInsights} insight={aiInsight} loading={aiLoading} error={aiError} />
                <div className="bg-ds-navy p-4 rounded-lg border border-ds-border">
                    <h2 className="text-ds-light-text font-bold text-lg mb-4">Lista de Itens de Trabalho</h2>
                    <WorkItemTable data={filteredWorkItems} />
                </div>
            </>
        );
      default:
        return null;
    }
  };

  const NavButton: React.FC<{tabId: Tab, children: React.ReactNode}> = ({ tabId, children }) => (
      <button onClick={() => handleTabClick(tabId)} className={`py-2 px-3 text-sm font-medium whitespace-nowrap ${activeTab === tabId ? 'border-b-2 border-ds-green text-ds-green' : 'text-ds-text hover:text-ds-light-text'}`}>
          {children}
      </button>
  );

  return (
    <div className="min-h-screen bg-ds-dark-blue">
      <Header />
      <div className="p-6 md:p-10">
        <div className="mb-6">
            <div className="flex border-b border-ds-border overflow-x-auto">
                <NavButton tabId="performance">Performance Geral</NavButton>
                <NavButton tabId="quality">Qualidade</NavButton>
                <NavButton tabId="kanban">Fluxo & Kanban</NavButton>
                <NavButton tabId="detailed-throughput">Vazão Detalhada</NavButton>
                <NavButton tabId="bottlenecks">Análise de Gargalos</NavButton>
                <NavButton tabId="tags">Análise de Tags</NavButton>
                <NavButton tabId="item-list">Lista de Itens</NavButton>
                <NavButton tabId="prs">Análise de PRs</NavButton>
                <NavButton tabId="montecarlo">Previsão (Monte Carlo)</NavButton>
            </div>
        </div>
        
        <FilterBar 
            activeTab={activeTab}
            workItems={workItems}
            pullRequests={pullRequests}
            workItemFilters={workItemFilters}
            onWorkItemFiltersChange={setWorkItemFilters}
            prFilters={prFilters}
            onPRFiltersChange={setPRFilters}
            onClearFilters={() => {
                if (activeTab === 'prs') {
                    setPRFilters(initialPRFilters);
                } else {
                    setWorkItemFilters(initialWorkItemFilters);
                }
            }}
        />

        <main className="mt-6">
            {renderContent()}
        </main>
      </div>
    </div>
  );
};

export default App;