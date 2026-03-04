import React, { useState, useMemo } from 'react';
import { WorkItem } from '../types';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend, Cell } from 'recharts';
import { startOfMonth, endOfMonth, subMonths, isWithinInterval, parseISO, format, subDays, startOfWeek, endOfWeek } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface Props {
  data: WorkItem[];
}

type PeriodPreset = 'current-month' | 'last-month' | 'start-of-month-30' | 'last-7-days' | 'last-30-days' | 'last-90-days' | 'custom';

interface PeriodConfig {
  preset: PeriodPreset;
  customStart?: string;
  customEnd?: string;
}

interface PeriodMetrics {
  issuesCriadas: number;
  issuesFechadas: number;
  bugsCriados: number;
  bugsFechados: number;
  issuesCorrecao: number;
  issuesP0: number;
  issuesSemCausaRaiz: number;
  throughput: number;
}

const COMPLETED_STATES = ['Closed', 'Resolved', 'Done', 'Removed'];

// Helper para normalizar prioridade
const normalizePriority = (priority: any): number => {
  if (priority === null || priority === undefined || priority === '') return 0;
  const num = parseFloat(String(priority));
  return isNaN(num) ? 0 : Math.floor(num);
};

const presetOptions: { value: PeriodPreset; label: string }[] = [
  { value: 'current-month', label: 'Mês Atual' },
  { value: 'last-month', label: 'Mês Passado' },
  { value: 'start-of-month-30', label: 'Começo do Mês (-30)' },
  { value: 'last-7-days', label: 'Últimos 7 dias' },
  { value: 'last-30-days', label: 'Últimos 30 dias' },
  { value: 'last-90-days', label: 'Últimos 90 dias' },
  { value: 'custom', label: 'Personalizado' },
];

const calculatePeriodDates = (config: PeriodConfig): { start: Date; end: Date } => {
  const now = new Date();
  
  switch (config.preset) {
    case 'current-month':
      return { start: startOfMonth(now), end: endOfMonth(now) };
    case 'last-month':
      return { start: startOfMonth(subMonths(now, 1)), end: endOfMonth(subMonths(now, 1)) };
    case 'start-of-month-30':
      // Começo do Mês (-30): @StartOfMonth('-30d') até @StartOfMonth (mês passado completo)
      return { start: startOfMonth(subMonths(now, 1)), end: endOfMonth(subMonths(now, 1)) };
    case 'last-7-days':
      return { start: subDays(now, 7), end: now };
    case 'last-30-days':
      return { start: subDays(now, 30), end: now };
    case 'last-90-days':
      return { start: subDays(now, 90), end: now };
    case 'custom':
      return {
        start: config.customStart ? new Date(config.customStart + 'T00:00:00') : subDays(now, 30),
        end: config.customEnd ? new Date(config.customEnd + 'T23:59:59') : now,
      };
    default:
      return { start: startOfMonth(now), end: endOfMonth(now) };
  }
};

const calculateMetrics = (data: WorkItem[], startDate: Date, endDate: Date): PeriodMetrics => {
  // Issues criadas no período
  const issuesCriadas = data.filter(w => {
    if (w.type !== 'Issue') return false;
    if (!w.createdDate) return false;
    try {
      const created = typeof w.createdDate === 'string' ? parseISO(w.createdDate) : new Date(w.createdDate);
      return isWithinInterval(created, { start: startDate, end: endDate });
    } catch {
      return false;
    }
  }).length;

  // Issues fechadas no período
  const issuesFechadas = data.filter(w => {
    if (w.type !== 'Issue') return false;
    if (!COMPLETED_STATES.includes(w.state)) return false;
    if (!w.closedDate) return false;
    try {
      const closed = typeof w.closedDate === 'string' ? parseISO(w.closedDate) : new Date(w.closedDate);
      return isWithinInterval(closed, { start: startDate, end: endDate });
    } catch {
      return false;
    }
  }).length;

  // Bugs criados no período
  const bugsCriados = data.filter(w => {
    if (w.type !== 'Bug') return false;
    if (!w.createdDate) return false;
    try {
      const created = typeof w.createdDate === 'string' ? parseISO(w.createdDate) : new Date(w.createdDate);
      return isWithinInterval(created, { start: startDate, end: endDate });
    } catch {
      return false;
    }
  }).length;

  // Bugs fechados no período
  const bugsFechados = data.filter(w => {
    if (w.type !== 'Bug') return false;
    if (!COMPLETED_STATES.includes(w.state)) return false;
    if (!w.closedDate) return false;
    try {
      const closed = typeof w.closedDate === 'string' ? parseISO(w.closedDate) : new Date(w.closedDate);
      return isWithinInterval(closed, { start: startDate, end: endDate });
    } catch {
      return false;
    }
  }).length;

  // Issues de Correção fechadas no período
  const issuesCorrecaoFechadas = data.filter(w => {
    if (w.type !== 'Issue') return false;
    if (!COMPLETED_STATES.includes(w.state)) return false;
    if (w.customType !== 'Correção') return false;
    if (!w.closedDate) return false;
    try {
      const closed = typeof w.closedDate === 'string' ? parseISO(w.closedDate) : new Date(w.closedDate);
      return isWithinInterval(closed, { start: startDate, end: endDate });
    } catch {
      return false;
    }
  });

  const issuesCorrecao = issuesCorrecaoFechadas.length;
  const issuesP0 = issuesCorrecaoFechadas.filter(w => normalizePriority(w.priority) === 0).length;
  const issuesSemCausaRaiz = issuesCorrecaoFechadas.filter(w => !w.causaRaiz || w.causaRaiz.trim() === '').length;

  // Throughput (todos os itens fechados no período)
  const throughput = data.filter(w => {
    if (!COMPLETED_STATES.includes(w.state)) return false;
    if (!w.closedDate) return false;
    try {
      const closed = typeof w.closedDate === 'string' ? parseISO(w.closedDate) : new Date(w.closedDate);
      return isWithinInterval(closed, { start: startDate, end: endDate });
    } catch {
      return false;
    }
  }).length;

  return {
    issuesCriadas,
    issuesFechadas,
    bugsCriados,
    bugsFechados,
    issuesCorrecao,
    issuesP0,
    issuesSemCausaRaiz,
    throughput,
  };
};

const calculateVariation = (current: number, previous: number): { value: number; isPositive: boolean; isNeutral: boolean } => {
  if (previous === 0) {
    if (current === 0) return { value: 0, isPositive: true, isNeutral: true };
    return { value: 100, isPositive: true, isNeutral: false };
  }
  const variation = ((current - previous) / previous) * 100;
  return { value: variation, isPositive: variation >= 0, isNeutral: variation === 0 };
};

interface MetricCardProps {
  title: string;
  periodA: number;
  periodB: number;
  periodALabel: string;
  periodBLabel: string;
  invertColors?: boolean; // Para métricas onde menos é melhor (bugs, P0s, etc.)
}

const MetricCard: React.FC<MetricCardProps> = ({ title, periodA, periodB, periodALabel, periodBLabel, invertColors = false }) => {
  const variation = calculateVariation(periodB, periodA);
  const isGood = invertColors ? !variation.isPositive : variation.isPositive;
  
  return (
    <div className="bg-ds-navy border border-ds-border rounded-lg p-4">
      <h4 className="text-ds-text text-sm font-medium mb-3">{title}</h4>
      <div className="flex justify-between items-end mb-2">
        <div className="text-center flex-1">
          <div className="text-xs text-ds-text mb-1">{periodALabel}</div>
          <div className="text-2xl font-bold text-white">{periodA}</div>
        </div>
        <div className="text-ds-text text-xl px-2">→</div>
        <div className="text-center flex-1">
          <div className="text-xs text-ds-text mb-1">{periodBLabel}</div>
          <div className="text-2xl font-bold text-white">{periodB}</div>
        </div>
      </div>
      <div className={`text-center text-sm font-medium ${
        variation.isNeutral ? 'text-gray-400' : 
        isGood ? 'text-green-400' : 'text-red-400'
      }`}>
        {variation.isNeutral ? '=' : (
          <>
            {variation.isPositive ? '↑' : '↓'} {Math.abs(variation.value).toFixed(1)}%
          </>
        )}
      </div>
    </div>
  );
};

const PeriodSelector: React.FC<{
  label: string;
  config: PeriodConfig;
  onChange: (config: PeriodConfig) => void;
  color: string;
}> = ({ label, config, onChange, color }) => {
  return (
    <div className={`bg-ds-navy border-2 rounded-lg p-4`} style={{ borderColor: color }}>
      <div className="flex items-center gap-2 mb-3">
        <div className="w-3 h-3 rounded-full" style={{ backgroundColor: color }}></div>
        <h4 className="text-white font-medium">{label}</h4>
      </div>
      <div className="space-y-3">
        <select
          value={config.preset}
          onChange={e => onChange({ ...config, preset: e.target.value as PeriodPreset })}
          className="w-full bg-ds-dark-blue border border-ds-border text-ds-light-text text-sm rounded-md p-2"
        >
          {presetOptions.map(opt => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
        
        {config.preset === 'custom' && (
          <div className="flex gap-2">
            <input
              type="date"
              value={config.customStart || ''}
              onChange={e => onChange({ ...config, customStart: e.target.value })}
              className="flex-1 bg-ds-dark-blue border border-ds-border text-ds-light-text text-sm rounded-md p-2"
            />
            <input
              type="date"
              value={config.customEnd || ''}
              onChange={e => onChange({ ...config, customEnd: e.target.value })}
              className="flex-1 bg-ds-dark-blue border border-ds-border text-ds-light-text text-sm rounded-md p-2"
            />
          </div>
        )}
      </div>
    </div>
  );
};

export const PeriodComparisonDashboard: React.FC<Props> = ({ data }) => {
  const [periodAConfig, setPeriodAConfig] = useState<PeriodConfig>({ preset: 'last-month' });
  const [periodBConfig, setPeriodBConfig] = useState<PeriodConfig>({ preset: 'current-month' });
  const [selectedTeam, setSelectedTeam] = useState<string>('all');

  // Extrair times disponíveis
  const availableTeams = useMemo(() => {
    const teams = new Set<string>();
    data.forEach(w => {
      if (w.team) teams.add(w.team);
    });
    return Array.from(teams).sort();
  }, [data]);

  // Filtrar dados por time
  const filteredData = useMemo(() => {
    if (selectedTeam === 'all') return data;
    return data.filter(w => w.team === selectedTeam);
  }, [data, selectedTeam]);

  const periodADates = useMemo(() => calculatePeriodDates(periodAConfig), [periodAConfig]);
  const periodBDates = useMemo(() => calculatePeriodDates(periodBConfig), [periodBConfig]);

  const metricsA = useMemo(() => calculateMetrics(filteredData, periodADates.start, periodADates.end), [filteredData, periodADates]);
  const metricsB = useMemo(() => calculateMetrics(filteredData, periodBDates.start, periodBDates.end), [filteredData, periodBDates]);

  const periodALabel = format(periodADates.start, "dd/MM", { locale: ptBR }) + ' - ' + format(periodADates.end, "dd/MM/yy", { locale: ptBR });
  const periodBLabel = format(periodBDates.start, "dd/MM", { locale: ptBR }) + ' - ' + format(periodBDates.end, "dd/MM/yy", { locale: ptBR });

  const chartData = [
    { name: 'Issues (pós-produção)', 'Período A': metricsA.issuesCriadas, 'Período B': metricsB.issuesCriadas },
    { name: 'Issues Fechadas', 'Período A': metricsA.issuesFechadas, 'Período B': metricsB.issuesFechadas },
    { name: 'Issues Correção', 'Período A': metricsA.issuesCorrecao, 'Período B': metricsB.issuesCorrecao },
    { name: 'Bugs (pré-produção)', 'Período A': metricsA.bugsCriados, 'Período B': metricsB.bugsCriados },
    { name: 'P0s', 'Período A': metricsA.issuesP0, 'Período B': metricsB.issuesP0 },
    { name: 'Sem Causa Raiz', 'Período A': metricsA.issuesSemCausaRaiz, 'Período B': metricsB.issuesSemCausaRaiz },
    { name: 'Throughput', 'Período A': metricsA.throughput, 'Período B': metricsB.throughput },
  ];

  const colorA = '#FF9800'; // Laranja para período A
  const colorB = '#00B8A9'; // Verde para período B

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <h2 className="text-xl font-bold text-white">📊 Comparação de Períodos</h2>
        
        {/* Filtro de Time */}
        <div className="flex items-center gap-2">
          <label className="text-ds-text text-sm">Time:</label>
          <select
            value={selectedTeam}
            onChange={e => setSelectedTeam(e.target.value)}
            className="bg-ds-navy border border-ds-border text-ds-light-text text-sm rounded-md p-2"
          >
            <option value="all">Todos os Times</option>
            {availableTeams.map(team => (
              <option key={team} value={team}>{team}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Datas calculadas (debug visível) */}
      <div className="bg-ds-dark-blue border border-ds-border rounded-lg p-3 text-xs">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <span className="text-orange-400 font-medium">Período A:</span>
            <span className="text-white ml-2">
              {format(periodADates.start, "dd/MM/yyyy HH:mm", { locale: ptBR })} até {format(periodADates.end, "dd/MM/yyyy HH:mm", { locale: ptBR })}
            </span>
          </div>
          <div>
            <span className="text-green-400 font-medium">Período B:</span>
            <span className="text-white ml-2">
              {format(periodBDates.start, "dd/MM/yyyy HH:mm", { locale: ptBR })} até {format(periodBDates.end, "dd/MM/yyyy HH:mm", { locale: ptBR })}
            </span>
          </div>
        </div>
        {selectedTeam !== 'all' && (
          <div className="mt-2 text-ds-text">
            Filtrando por time: <span className="text-white font-medium">{selectedTeam}</span> ({filteredData.length} itens)
          </div>
        )}
      </div>

      {/* Period Selectors */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <PeriodSelector
          label="Período A (Referência)"
          config={periodAConfig}
          onChange={setPeriodAConfig}
          color={colorA}
        />
        <PeriodSelector
          label="Período B (Comparação)"
          config={periodBConfig}
          onChange={setPeriodBConfig}
          color={colorB}
        />
      </div>

      {/* Metrics Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <MetricCard
          title="Issues (pós-produção)"
          periodA={metricsA.issuesCriadas}
          periodB={metricsB.issuesCriadas}
          periodALabel={periodALabel}
          periodBLabel={periodBLabel}
          invertColors={true}
        />
        <MetricCard
          title="Issues Fechadas"
          periodA={metricsA.issuesFechadas}
          periodB={metricsB.issuesFechadas}
          periodALabel={periodALabel}
          periodBLabel={periodBLabel}
        />
        <MetricCard
          title="Issues Correção"
          periodA={metricsA.issuesCorrecao}
          periodB={metricsB.issuesCorrecao}
          periodALabel={periodALabel}
          periodBLabel={periodBLabel}
        />
        <MetricCard
          title="Bugs (pré-produção)"
          periodA={metricsA.bugsCriados}
          periodB={metricsB.bugsCriados}
          periodALabel={periodALabel}
          periodBLabel={periodBLabel}
          invertColors={true}
        />
        <MetricCard
          title="P0s (Críticos)"
          periodA={metricsA.issuesP0}
          periodB={metricsB.issuesP0}
          periodALabel={periodALabel}
          periodBLabel={periodBLabel}
          invertColors={true}
        />
        <MetricCard
          title="Sem Causa Raiz"
          periodA={metricsA.issuesSemCausaRaiz}
          periodB={metricsB.issuesSemCausaRaiz}
          periodALabel={periodALabel}
          periodBLabel={periodBLabel}
          invertColors={true}
        />
        <MetricCard
          title="Throughput Total"
          periodA={metricsA.throughput}
          periodB={metricsB.throughput}
          periodALabel={periodALabel}
          periodBLabel={periodBLabel}
        />
      </div>

      {/* Comparison Chart */}
      <div className="bg-ds-navy border border-ds-border rounded-lg p-4">
        <h3 className="text-white font-medium mb-4">Comparativo Visual</h3>
        <div className="h-80">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} layout="vertical" margin={{ left: 100, right: 20 }}>
              <XAxis type="number" tick={{ fill: '#8892b0' }} />
              <YAxis type="category" dataKey="name" tick={{ fill: '#8892b0' }} width={100} />
              <Tooltip
                contentStyle={{ backgroundColor: '#112240', border: '1px solid #1d3557', borderRadius: '8px' }}
                labelStyle={{ color: '#fff' }}
              />
              <Legend />
              <Bar dataKey="Período A" fill={colorA} name={periodALabel} radius={[0, 4, 4, 0]} />
              <Bar dataKey="Período B" fill={colorB} name={periodBLabel} radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Summary */}
      <div className="bg-ds-dark-blue border border-ds-border rounded-lg p-4">
        <h3 className="text-white font-medium mb-3">📈 Resumo da Comparação</h3>
        <div className="text-ds-text text-sm space-y-2">
          <p>
            <span className="font-medium text-white">Issues (pós-produção):</span>{' '}
            {metricsA.issuesCriadas} → {metricsB.issuesCriadas}{' '}
            ({metricsB.issuesCriadas > metricsA.issuesCriadas ? '⚠️ aumento' : metricsB.issuesCriadas < metricsA.issuesCriadas ? '✅ redução' : '= estável'})
          </p>
          <p>
            <span className="font-medium text-white">Issues Fechadas:</span>{' '}
            {metricsA.issuesFechadas} → {metricsB.issuesFechadas}{' '}
            ({metricsB.issuesFechadas > metricsA.issuesFechadas ? '✅ aumento' : metricsB.issuesFechadas < metricsA.issuesFechadas ? '⚠️ redução' : '= estável'})
          </p>
          <p>
            <span className="font-medium text-white">Issues Correção (Fechadas):</span>{' '}
            {metricsA.issuesCorrecao} → {metricsB.issuesCorrecao}{' '}
            ({metricsB.issuesCorrecao > metricsA.issuesCorrecao ? '⚠️ aumento' : metricsB.issuesCorrecao < metricsA.issuesCorrecao ? '✅ redução' : '= estável'})
          </p>
          <p>
            <span className="font-medium text-white">P0s:</span>{' '}
            {metricsA.issuesP0} → {metricsB.issuesP0}{' '}
            ({metricsB.issuesP0 > metricsA.issuesP0 ? '🔴 aumento crítico' : metricsB.issuesP0 < metricsA.issuesP0 ? '✅ redução' : '= estável'})
          </p>
          <p>
            <span className="font-medium text-white">Throughput:</span>{' '}
            {metricsA.throughput} → {metricsB.throughput}{' '}
            ({metricsB.throughput > metricsA.throughput ? '✅ aumento' : metricsB.throughput < metricsA.throughput ? '⚠️ redução' : '= estável'})
          </p>
        </div>
      </div>

      {/* Legenda explicativa */}
      <div className="bg-ds-navy border border-ds-border rounded-lg p-4 text-xs text-ds-text">
        <p className="font-medium text-white mb-2">📋 Legenda dos campos:</p>
        <ul className="space-y-1">
          <li><strong>🔴 Issue (pós-produção):</strong> Defeito encontrado pelo CLIENTE após ir para produção</li>
          <li><strong>🟡 Bug (pré-produção):</strong> Defeito encontrado INTERNAMENTE antes de ir para produção (QA/Testes)</li>
          <li><strong>Issues Correção:</strong> Issues com customType="Correção" (fechadas)</li>
          <li><strong>P0s:</strong> Issues de Correção com prioridade crítica (priority=0 ou null)</li>
        </ul>
      </div>
    </div>
  );
};

export default PeriodComparisonDashboard;
