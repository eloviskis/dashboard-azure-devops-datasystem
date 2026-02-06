import React, { useState, useMemo } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, ReferenceLine } from 'recharts';
import { WorkItem, WorkItemFilters } from '../types.ts';
import { CHART_COLORS } from '../constants.ts';
import { getWeek, getYear } from 'date-fns';
import { COMPLETED_STATES } from '../utils/metrics.ts';

interface MonteCarloSimulationProps {
  data: WorkItem[];
  filters: WorkItemFilters;
}

interface SimulationResult {
    howMany: {
        distribution: { items: number; frequency: number }[];
        confidenceLevels: { p50: number, p85: number, p95: number };
    };
    when: {
        distribution: { weeks: number; frequency: number }[];
        confidenceLevels: { p50: number, p85: number, p95: number };
    };
}

const NUM_TRIALS = 5000;

const MonteCarloSimulation: React.FC<MonteCarloSimulationProps> = ({ data, filters }) => {
    const [numItems, setNumItems] = useState(20);
    const [numWeeks, setNumWeeks] = useState(4);
    const [simulationResult, setSimulationResult] = useState<SimulationResult | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const weeklyThroughput = useMemo(() => {
        const throughput: Record<string, number> = data
            .filter(item => COMPLETED_STATES.includes(item.state) && item.closedDate)
            .reduce((acc, item) => {
                const d = new Date(item.closedDate!);
                const weekKey = `${getYear(d)}-W${getWeek(d, { weekStartsOn: 1 })}`;
                acc[weekKey] = (acc[weekKey] || 0) + 1;
                return acc;
            }, {} as Record<string, number>);
        return Object.values(throughput);
    }, [data]);

    const selectedTeamsText = useMemo(() => {
        if (filters.teams.length > 0) {
            return filters.teams.join(', ');
        }
        return 'todos os times';
    }, [filters.teams]);

    const runSimulation = () => {
        if (weeklyThroughput.length < 2) {
            setError('Dados históricos insuficientes para uma simulação confiável (mínimo 2 semanas de vazão).');
            setSimulationResult(null);
            return;
        }
        
        setIsLoading(true);
        setError(null);
        setSimulationResult(null);

        // Run async to avoid blocking UI
        setTimeout(() => {
            const howManyOutcomes: number[] = [];
            for (let i = 0; i < NUM_TRIALS; i++) {
                let itemsCompleted = 0;
                for (let week = 0; week < numWeeks; week++) {
                    const randomWeekThroughput = weeklyThroughput[Math.floor(Math.random() * weeklyThroughput.length)];
                    itemsCompleted += randomWeekThroughput;
                }
                howManyOutcomes.push(itemsCompleted);
            }

            const whenOutcomes: number[] = [];
            for (let i = 0; i < NUM_TRIALS; i++) {
                let itemsCompleted = 0;
                let weeksPassed = 0;
                while (itemsCompleted < numItems) {
                    const randomWeekThroughput = weeklyThroughput[Math.floor(Math.random() * weeklyThroughput.length)];
                    itemsCompleted += randomWeekThroughput;
                    weeksPassed++;
                     if(weeksPassed > 200) break; // Safety break
                }
                whenOutcomes.push(weeksPassed);
            }

            howManyOutcomes.sort((a, b) => a - b);
            whenOutcomes.sort((a, b) => a - b);
            
            const getConfidenceLevels = (outcomes: number[], percentile_calc: (p: number) => number) => ({
                p50: outcomes[percentile_calc(0.50)],
                p85: outcomes[percentile_calc(0.85)],
                p95: outcomes[percentile_calc(0.95)],
            });
            
            const howManyConfidence = getConfidenceLevels(howManyOutcomes, p => Math.floor(howManyOutcomes.length * (1 - p)));
            const whenConfidence = getConfidenceLevels(whenOutcomes, p => Math.ceil(whenOutcomes.length * p) - 1);

            const getDistribution = (outcomes: number[]) => {
                 const frequencyMap = outcomes.reduce((acc, val) => {
                    acc[val] = (acc[val] || 0) + 1;
                    return acc;
                }, {} as Record<number, number>);
                return Object.entries(frequencyMap).map(([key, freq]) => ({ val: Number(key), frequency: freq }));
            }
            
            const howManyDist = getDistribution(howManyOutcomes).map(d => ({items: d.val, frequency: d.frequency}));
            const whenDist = getDistribution(whenOutcomes).map(d => ({weeks: d.val, frequency: d.frequency}));

            setSimulationResult({
                howMany: { distribution: howManyDist, confidenceLevels: howManyConfidence },
                when: { distribution: whenDist, confidenceLevels: whenConfidence }
            });

            setIsLoading(false);
        }, 50);
    };

    return (
        <div className="space-y-6">
            <div className="bg-ds-navy p-6 rounded-lg border border-ds-border">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-end">
                    <div className="md:col-span-2">
                        <h2 className="text-lg font-bold text-ds-light-text mb-2">Configurar Simulação</h2>
                        <p className="text-sm text-ds-text mb-4">Use dados históricos de vazão para prever o desempenho futuro. A simulação usa os dados filtrados na barra acima.</p>
                        <div className="flex flex-col sm:flex-row gap-4">
                           <div>
                               <label htmlFor="numWeeks" className="block text-ds-text text-sm mb-1">Quantos itens em</label>
                               <input id="numWeeks" type="number" value={numWeeks} onChange={(e) => setNumWeeks(Number(e.target.value))} className="bg-ds-dark-blue border border-ds-border text-ds-light-text rounded-md w-full p-2" />
                               <label htmlFor="numWeeks" className="block text-ds-text text-sm mt-1">semanas?</label>
                           </div>
                           <div>
                               <label htmlFor="numItems" className="block text-ds-text text-sm mb-1">Quando terminaremos</label>
                               <input id="numItems" type="number" value={numItems} onChange={(e) => setNumItems(Number(e.target.value))} className="bg-ds-dark-blue border border-ds-border text-ds-light-text rounded-md w-full p-2" />
                               <label htmlFor="numItems" className="block text-ds-text text-sm mt-1">itens?</label>
                           </div>
                        </div>
                    </div>
                    <div className="flex justify-start md:justify-end">
                        <button onClick={runSimulation} disabled={isLoading} className="bg-ds-green text-ds-dark-blue font-bold py-2 px-6 rounded-md hover:bg-opacity-80 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center min-w-[180px]">
                           {isLoading ? (
                              <>
                                <svg className="animate-spin -ml-1 mr-2 h-5 w-5 text-ds-dark-blue" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                </svg>
                                Simulando...
                              </>
                           ) : 'Executar Simulação'}
                        </button>
                    </div>
                </div>
                 {error && <p className="text-red-400 mt-4">{error}</p>}
                 <div className="text-xs text-ds-muted mt-4 space-y-1">
                    <p><strong className="text-ds-text">Contexto da Análise:</strong> {selectedTeamsText}</p>
                    <p><strong className="text-ds-text">Vazão Semanal Histórica (itens/semana):</strong> [{weeklyThroughput.join(', ')}] com base em {weeklyThroughput.length} semanas de dados.</p>
                 </div>
            </div>

            {!simulationResult && !isLoading && (
                 <div className="bg-ds-navy p-6 rounded-lg border border-ds-border text-center text-ds-text">
                    <h3 className="text-lg font-bold text-ds-light-text mb-2">Aguardando Simulação</h3>
                    <p>Selecione os filtros desejados e clique em "Executar Simulação" para ver as previsões.</p>
                </div>
            )}

            {simulationResult && (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    <div className="bg-ds-navy p-4 rounded-lg border border-ds-border">
                        <h3 className="text-ds-light-text font-bold text-lg mb-2">Previsão: Quantos itens em {numWeeks} semanas?</h3>
                        <div className="text-ds-text space-y-1 mb-4 text-sm">
                            <p><span className="font-bold text-red-400">95% de probabilidade</span> de concluir <span className="font-bold text-white">{simulationResult.howMany.confidenceLevels.p95} ou mais</span> itens.</p>
                            <p><span className="font-bold text-ds-green">85% de probabilidade</span> de concluir <span className="font-bold text-white">{simulationResult.howMany.confidenceLevels.p85} ou mais</span> itens.</p>
                            <p><span className="font-bold text-ds-cyan">50% de probabilidade</span> de concluir <span className="font-bold text-white">{simulationResult.howMany.confidenceLevels.p50} ou mais</span> itens.</p>
                        </div>
                        <ResponsiveContainer width="100%" height={300}>
                            <BarChart data={simulationResult.howMany.distribution} margin={{ top: 5, right: 20, left: -10, bottom: 5 }}>
                                <CartesianGrid strokeDasharray="3 3" stroke={CHART_COLORS.grid} />
                                <XAxis dataKey="items" stroke={CHART_COLORS.text} name="Nº de Itens"/>
                                <YAxis stroke={CHART_COLORS.text} name="Frequência" />
                                <Tooltip contentStyle={{ backgroundColor: CHART_COLORS.tooltipBg, borderColor: CHART_COLORS.grid }}/>
                                <Legend wrapperStyle={{ color: CHART_COLORS.text }} />
                                <Bar dataKey="frequency" name="Frequência" fill={CHART_COLORS.primary} fillOpacity={0.8}/>
                                <ReferenceLine x={simulationResult.howMany.confidenceLevels.p50} stroke="#47C5FB" strokeDasharray="3 3" label={{ value: '50%', position: 'insideTop', fill: '#47C5FB' }} />
                                <ReferenceLine x={simulationResult.howMany.confidenceLevels.p85} stroke="#64FFDA" strokeDasharray="3 3" label={{ value: '85%', position: 'insideTop', fill: '#64FFDA' }} />
                                <ReferenceLine x={simulationResult.howMany.confidenceLevels.p95} stroke="#F56565" strokeDasharray="3 3" label={{ value: '95%', position: 'insideTop', fill: '#F56565' }} />
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                    <div className="bg-ds-navy p-4 rounded-lg border border-ds-border">
                        <h3 className="text-ds-light-text font-bold text-lg mb-2">Previsão: Quando terminaremos {numItems} itens?</h3>
                         <div className="text-ds-text space-y-1 mb-4 text-sm">
                            <p><span className="font-bold text-red-400">95% de probabilidade</span> de concluir em <span className="font-bold text-white">até {simulationResult.when.confidenceLevels.p95} semanas</span>.</p>
                            <p><span className="font-bold text-ds-green">85% de probabilidade</span> de concluir em <span className="font-bold text-white">até {simulationResult.when.confidenceLevels.p85} semanas</span>.</p>
                            <p><span className="font-bold text-ds-cyan">50% de probabilidade</span> de concluir em <span className="font-bold text-white">até {simulationResult.when.confidenceLevels.p50} semanas</span>.</p>
                        </div>
                        <ResponsiveContainer width="100%" height={300}>
                            <BarChart data={simulationResult.when.distribution} margin={{ top: 5, right: 20, left: -10, bottom: 5 }}>
                                <CartesianGrid strokeDasharray="3 3" stroke={CHART_COLORS.grid} />
                                <XAxis dataKey="weeks" stroke={CHART_COLORS.text} name="Nº de Semanas"/>
                                <YAxis stroke={CHART_COLORS.text} name="Frequência" />
                                <Tooltip contentStyle={{ backgroundColor: CHART_COLORS.tooltipBg, borderColor: CHART_COLORS.grid }}/>
                                <Legend wrapperStyle={{ color: CHART_COLORS.text }} />
                                <Bar dataKey="frequency" name="Frequência" fill={CHART_COLORS.secondary} fillOpacity={0.8} />
                                <ReferenceLine x={simulationResult.when.confidenceLevels.p50} stroke="#47C5FB" strokeDasharray="3 3" label={{ value: '50%', position: 'insideTop', fill: '#47C5FB' }} />
                                <ReferenceLine x={simulationResult.when.confidenceLevels.p85} stroke="#47C5FB" strokeDasharray="3 3" label={{ value: '85%', position: 'insideTop', fill: '#47C5FB' }} />
                                <ReferenceLine x={simulationResult.when.confidenceLevels.p95} stroke="#F56565" strokeDasharray="3 3" label={{ value: '95%', position: 'insideTop', fill: '#F56565' }} />
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                </div>
            )}
        </div>
    );
};

export default MonteCarloSimulation;
