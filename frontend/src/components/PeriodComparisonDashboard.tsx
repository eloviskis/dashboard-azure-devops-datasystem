import React, { useState, useMemo, useCallback } from 'react';
import { WorkItem } from '../types';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend, Cell } from 'recharts';
import { startOfMonth, endOfMonth, subMonths, isWithinInterval, parseISO, format, subDays, startOfWeek, endOfWeek } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { exportItemsXlsx, getWorkItemColumns } from '../utils/exportXlsx';

const AZURE_DEVOPS_BASE_URL = 'https://dev.azure.com/datasystemsoftwares/USE/_workitems/edit';

interface ModalData {
  title: string;
  items: WorkItem[];
  color: string;
}

// Mesmo padrão de modal de lista de tarefas já usado em outras abas (ex: TeamComparisonDashboard).
const ItemListModal: React.FC<{ data: ModalData | null; onClose: () => void }> = ({ data, onClose }) => {
  if (!data) return null;
  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50" onClick={onClose}>
      <div
        className="bg-ds-navy border border-ds-border rounded-xl shadow-2xl max-w-4xl w-full mx-4 max-h-[85vh] flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        <div
          className="p-4 rounded-t-xl flex justify-between items-center"
          style={{ backgroundColor: data.color + '33', borderBottom: `1px solid ${data.color}40` }}
        >
          <h2 className="text-white font-bold text-base">{data.title}</h2>
          <button onClick={onClose} className="text-white hover:text-gray-200 text-2xl font-bold leading-none">×</button>
        </div>

        <div className="p-4 overflow-y-auto flex-1">
          <p className="text-ds-text text-sm mb-3">
            Total: <span className="font-bold text-white">{data.items.length}</span> {data.items.length === 1 ? 'item' : 'itens'}
          </p>
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
                    <span className="text-xs font-mono px-2 py-1 rounded shrink-0 text-white" style={{ backgroundColor: data.color + '44' }}>
                      #{item.workItemId}
                    </span>
                    <div className="flex-1 min-w-0">
                      <a
                        href={`${AZURE_DEVOPS_BASE_URL}/${item.workItemId}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-white hover:text-ds-green font-medium block truncate mb-1"
                        title={item.title}
                      >
                        {item.title}
                      </a>
                      <div className="grid grid-cols-2 gap-1 text-xs text-ds-text">
                        <div>🏷️ {item.type}</div>
                        <div>📊 {item.state}</div>
                        {item.team ? <div>👥 {item.team}</div> : null}
                        {item.storyPoints ? <div>⚡ {item.storyPoints} SP</div> : null}
                      </div>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="p-4 border-t border-ds-border">
          <button onClick={onClose} className="w-full bg-ds-border hover:bg-ds-green text-white py-2 px-4 rounded-lg transition-colors text-sm">
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
};

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
  issuesCorrecaoCriadas: number;
  issuesCorrecaoFechadas: number;
  issuesP0: number;
  issuesSemCausaRaiz: number;
  throughput: number;
}

const COMPLETED_STATES = ['Closed', 'Resolved', 'Done', 'Removed'];
const COLOR_A = '#FF9800'; // Laranja para período A
const COLOR_B = '#00B8A9'; // Verde para período B

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

const inRange = (dateValue: string | Date | null | undefined, start: Date, end: Date): boolean => {
  if (!dateValue) return false;
  try {
    const d = typeof dateValue === 'string' ? parseISO(dateValue) : new Date(dateValue);
    return isWithinInterval(d, { start, end });
  } catch {
    return false;
  }
};

// Um filtro nomeado por métrica — única fonte de verdade, usada tanto para contar (calculateMetrics)
// quanto para listar as tarefas quando o usuário clica num card/barra (evita duas lógicas divergindo).
const filterIssuesCriadas = (data: WorkItem[], start: Date, end: Date) =>
  data.filter(w => w.type === 'Issue' && inRange(w.createdDate, start, end));

const filterIssuesFechadas = (data: WorkItem[], start: Date, end: Date) =>
  data.filter(w => w.type === 'Issue' && COMPLETED_STATES.includes(w.state) && inRange(w.closedDate, start, end));

const filterBugsCriados = (data: WorkItem[], start: Date, end: Date) =>
  data.filter(w => w.type === 'Bug' && inRange(w.createdDate, start, end));

const filterBugsFechados = (data: WorkItem[], start: Date, end: Date) =>
  data.filter(w => w.type === 'Bug' && COMPLETED_STATES.includes(w.state) && inRange(w.closedDate, start, end));

const filterIssuesCorrecaoCriadas = (data: WorkItem[], start: Date, end: Date) =>
  data.filter(w => w.type === 'Issue' && w.customType === 'Correção' && inRange(w.createdDate, start, end));

const filterIssuesCorrecaoFechadas = (data: WorkItem[], start: Date, end: Date) =>
  data.filter(w => w.type === 'Issue' && COMPLETED_STATES.includes(w.state) && w.customType === 'Correção' && inRange(w.closedDate, start, end));

const filterIssuesP0 = (data: WorkItem[], start: Date, end: Date) =>
  filterIssuesCorrecaoFechadas(data, start, end).filter(w => normalizePriority(w.priority) === 0);

const filterIssuesSemCausaRaiz = (data: WorkItem[], start: Date, end: Date) =>
  filterIssuesCorrecaoFechadas(data, start, end).filter(w => !w.causaRaiz || w.causaRaiz.trim() === '');

const filterThroughput = (data: WorkItem[], start: Date, end: Date) =>
  data.filter(w => COMPLETED_STATES.includes(w.state) && inRange(w.closedDate, start, end));

type MetricKey = 'issuesCriadas' | 'issuesFechadas' | 'bugsCriados' | 'bugsFechados' | 'issuesCorrecaoCriadas' | 'issuesCorrecaoFechadas' | 'issuesP0' | 'issuesSemCausaRaiz' | 'throughput';

const METRIC_FILTER_FNS: Record<MetricKey, (data: WorkItem[], start: Date, end: Date) => WorkItem[]> = {
  issuesCriadas: filterIssuesCriadas,
  issuesFechadas: filterIssuesFechadas,
  bugsCriados: filterBugsCriados,
  bugsFechados: filterBugsFechados,
  issuesCorrecaoCriadas: filterIssuesCorrecaoCriadas,
  issuesCorrecaoFechadas: filterIssuesCorrecaoFechadas,
  issuesP0: filterIssuesP0,
  issuesSemCausaRaiz: filterIssuesSemCausaRaiz,
  throughput: filterThroughput,
};

const METRIC_LABELS: Record<MetricKey, string> = {
  issuesCriadas: 'Issues Criadas (pós-prod)',
  issuesFechadas: 'Issues Fechadas',
  bugsCriados: 'Bugs Criados (pré-prod)',
  bugsFechados: 'Bugs Fechados',
  issuesCorrecaoCriadas: 'Issues de Correção Criadas',
  issuesCorrecaoFechadas: 'Issues de Correção Fechadas',
  issuesP0: 'P0s (Críticos)',
  issuesSemCausaRaiz: 'Sem Causa Raiz',
  throughput: 'Throughput Total',
};

const calculateMetrics = (data: WorkItem[], startDate: Date, endDate: Date): PeriodMetrics => {
  return {
    issuesCriadas: filterIssuesCriadas(data, startDate, endDate).length,
    issuesFechadas: filterIssuesFechadas(data, startDate, endDate).length,
    bugsCriados: filterBugsCriados(data, startDate, endDate).length,
    bugsFechados: filterBugsFechados(data, startDate, endDate).length,
    issuesCorrecaoCriadas: filterIssuesCorrecaoCriadas(data, startDate, endDate).length,
    issuesCorrecaoFechadas: filterIssuesCorrecaoFechadas(data, startDate, endDate).length,
    issuesP0: filterIssuesP0(data, startDate, endDate).length,
    issuesSemCausaRaiz: filterIssuesSemCausaRaiz(data, startDate, endDate).length,
    throughput: filterThroughput(data, startDate, endDate).length,
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
  metricKey: MetricKey;
  periodA: number;
  periodB: number;
  periodALabel: string;
  periodBLabel: string;
  invertColors?: boolean; // Para métricas onde menos é melhor (bugs, P0s, etc.)
  onPeriodClick: (key: MetricKey, period: 'A' | 'B') => void;
}

const MetricCard: React.FC<MetricCardProps> = ({ title, metricKey, periodA, periodB, periodALabel, periodBLabel, invertColors = false, onPeriodClick }) => {
  const variation = calculateVariation(periodB, periodA);
  const isGood = invertColors ? !variation.isPositive : variation.isPositive;

  return (
    <div className="bg-ds-navy border border-ds-border rounded-lg p-4">
      <h4 className="text-ds-text text-sm font-medium mb-3">{title}</h4>
      <div className="flex justify-between items-end mb-2">
        <div
          className="text-center flex-1 cursor-pointer hover:opacity-70 transition-opacity rounded"
          onClick={() => onPeriodClick(metricKey, 'A')}
          title="Clique para ver as tarefas"
        >
          <div className="text-xs text-ds-text mb-1">{periodALabel}</div>
          <div className="text-2xl font-bold text-white">{periodA}</div>
        </div>
        <div className="text-ds-text text-xl px-2">→</div>
        <div
          className="text-center flex-1 cursor-pointer hover:opacity-70 transition-opacity rounded"
          onClick={() => onPeriodClick(metricKey, 'B')}
          title="Clique para ver as tarefas"
        >
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
  const [modalData, setModalData] = useState<ModalData | null>(null);
  const [exportingXlsx, setExportingXlsx] = useState(false);

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

  const chartData: { key: MetricKey; name: string; 'Período A': number; 'Período B': number }[] = [
    { key: 'issuesCriadas', name: 'Issues Criadas (pós-prod)', 'Período A': metricsA.issuesCriadas, 'Período B': metricsB.issuesCriadas },
    { key: 'issuesFechadas', name: 'Issues Fechadas', 'Período A': metricsA.issuesFechadas, 'Período B': metricsB.issuesFechadas },
    { key: 'issuesCorrecaoCriadas', name: 'Correção Criadas', 'Período A': metricsA.issuesCorrecaoCriadas, 'Período B': metricsB.issuesCorrecaoCriadas },
    { key: 'issuesCorrecaoFechadas', name: 'Correção Fechadas', 'Período A': metricsA.issuesCorrecaoFechadas, 'Período B': metricsB.issuesCorrecaoFechadas },
    { key: 'bugsCriados', name: 'Bugs (pré-prod)', 'Período A': metricsA.bugsCriados, 'Período B': metricsB.bugsCriados },
    { key: 'issuesP0', name: 'P0s', 'Período A': metricsA.issuesP0, 'Período B': metricsB.issuesP0 },
    { key: 'issuesSemCausaRaiz', name: 'Sem Causa Raiz', 'Período A': metricsA.issuesSemCausaRaiz, 'Período B': metricsB.issuesSemCausaRaiz },
    { key: 'throughput', name: 'Throughput', 'Período A': metricsA.throughput, 'Período B': metricsB.throughput },
  ];

  const openMetricModal = useCallback((key: MetricKey, period: 'A' | 'B') => {
    const dates = period === 'A' ? periodADates : periodBDates;
    const label = period === 'A' ? periodALabel : periodBLabel;
    const color = period === 'A' ? COLOR_A : COLOR_B;
    const items = METRIC_FILTER_FNS[key](filteredData, dates.start, dates.end);
    setModalData({ title: `${METRIC_LABELS[key]} — ${label}`, items, color });
  }, [filteredData, periodADates, periodBDates, periodALabel, periodBLabel]);

  return (
    <div className="space-y-6">
      <ItemListModal data={modalData} onClose={() => setModalData(null)} />
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <h2 className="text-xl font-bold text-white">📊 Comparação de Períodos</h2>

        <div className="flex items-center gap-3">
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
          <button
            onClick={async () => {
              if (filteredData.length === 0) return;
              setExportingXlsx(true);
              try {
                await exportItemsXlsx(filteredData, getWorkItemColumns(), `PeriodComparison_${format(new Date(), 'yyyy-MM-dd')}.xlsx`);
              } finally {
                setExportingXlsx(false);
              }
            }}
            disabled={exportingXlsx || filteredData.length === 0}
            className="px-3 py-2 text-xs rounded-md font-medium bg-ds-green text-ds-dark-blue hover:bg-ds-green/80 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            title="Exporta os itens filtrados por time para .xlsx"
          >
            {exportingXlsx ? 'Exportando…' : `📥 .xlsx (${filteredData.length})`}
          </button>
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
          color={COLOR_A}
        />
        <PeriodSelector
          label="Período B (Comparação)"
          config={periodBConfig}
          onChange={setPeriodBConfig}
          color={COLOR_B}
        />
      </div>

      {/* Metrics Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <MetricCard
          title="Issues Criadas (pós-prod)"
          metricKey="issuesCriadas"
          periodA={metricsA.issuesCriadas}
          periodB={metricsB.issuesCriadas}
          periodALabel={periodALabel}
          periodBLabel={periodBLabel}
          invertColors={true}
          onPeriodClick={openMetricModal}
        />
        <MetricCard
          title="Issues Fechadas"
          metricKey="issuesFechadas"
          periodA={metricsA.issuesFechadas}
          periodB={metricsB.issuesFechadas}
          periodALabel={periodALabel}
          periodBLabel={periodBLabel}
          onPeriodClick={openMetricModal}
        />
        <MetricCard
          title="Correção Criadas"
          metricKey="issuesCorrecaoCriadas"
          periodA={metricsA.issuesCorrecaoCriadas}
          periodB={metricsB.issuesCorrecaoCriadas}
          periodALabel={periodALabel}
          periodBLabel={periodBLabel}
          invertColors={true}
          onPeriodClick={openMetricModal}
        />
        <MetricCard
          title="Correção Fechadas"
          metricKey="issuesCorrecaoFechadas"
          periodA={metricsA.issuesCorrecaoFechadas}
          periodB={metricsB.issuesCorrecaoFechadas}
          periodALabel={periodALabel}
          periodBLabel={periodBLabel}
          onPeriodClick={openMetricModal}
        />
        <MetricCard
          title="Bugs (pré-prod)"
          metricKey="bugsCriados"
          periodA={metricsA.bugsCriados}
          periodB={metricsB.bugsCriados}
          periodALabel={periodALabel}
          periodBLabel={periodBLabel}
          invertColors={true}
          onPeriodClick={openMetricModal}
        />
        <MetricCard
          title="P0s (Críticos)"
          metricKey="issuesP0"
          periodA={metricsA.issuesP0}
          periodB={metricsB.issuesP0}
          periodALabel={periodALabel}
          periodBLabel={periodBLabel}
          invertColors={true}
          onPeriodClick={openMetricModal}
        />
        <MetricCard
          title="Sem Causa Raiz"
          metricKey="issuesSemCausaRaiz"
          periodA={metricsA.issuesSemCausaRaiz}
          periodB={metricsB.issuesSemCausaRaiz}
          periodALabel={periodALabel}
          periodBLabel={periodBLabel}
          invertColors={true}
          onPeriodClick={openMetricModal}
        />
        <MetricCard
          title="Throughput Total"
          metricKey="throughput"
          periodA={metricsA.throughput}
          periodB={metricsB.throughput}
          periodALabel={periodALabel}
          periodBLabel={periodBLabel}
          onPeriodClick={openMetricModal}
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
              <Bar
                dataKey="Período A"
                fill={COLOR_A}
                name={periodALabel}
                radius={[0, 4, 4, 0]}
                cursor="pointer"
                onClick={(d: any) => openMetricModal(d.key, 'A')}
              />
              <Bar
                dataKey="Período B"
                fill={COLOR_B}
                name={periodBLabel}
                radius={[0, 4, 4, 0]}
                cursor="pointer"
                onClick={(d: any) => openMetricModal(d.key, 'B')}
              />
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
            <span className="font-medium text-white">Correção Criadas:</span>{' '}
            {metricsA.issuesCorrecaoCriadas} → {metricsB.issuesCorrecaoCriadas}{' '}
            ({metricsB.issuesCorrecaoCriadas > metricsA.issuesCorrecaoCriadas ? '⚠️ aumento' : metricsB.issuesCorrecaoCriadas < metricsA.issuesCorrecaoCriadas ? '✅ redução' : '= estável'})
          </p>
          <p>
            <span className="font-medium text-white">Correção Fechadas:</span>{' '}
            {metricsA.issuesCorrecaoFechadas} → {metricsB.issuesCorrecaoFechadas}{' '}
            ({metricsB.issuesCorrecaoFechadas > metricsA.issuesCorrecaoFechadas ? '✅ aumento' : metricsB.issuesCorrecaoFechadas < metricsA.issuesCorrecaoFechadas ? '⚠️ redução' : '= estável'})
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
