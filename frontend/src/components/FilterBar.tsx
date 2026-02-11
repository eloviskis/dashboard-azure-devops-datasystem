import React, { useMemo, useState } from 'react';
import './FilterBar.css';
import { WorkItem, WorkItemFilters, WorkItemTypes, WorkItemStates } from '../types.ts';
import { format, subMonths } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import html2canvas from 'html2canvas';

interface FilterBarProps {
  activeTab: string;
  workItems: WorkItem[];
  filteredWorkItems: WorkItem[];
  workItemFilters: WorkItemFilters;
  onWorkItemFiltersChange: (filters: WorkItemFilters) => void;
  onClearFilters: () => void;
}

type PeriodMode = 'preset' | 'specific-month' | 'custom';

const FilterSelect: React.FC<{
  label: string;
  value: string | string[];
  onChange: (e: React.ChangeEvent<HTMLSelectElement>) => void;
  options: { value: string; label: string }[];
  multiple?: boolean;
}> = ({ label, value, onChange, options, multiple = false }) => (
  <div>
    <label className="block text-ds-text text-sm mb-1" htmlFor={`filter-select-${label}`}>{label}:</label>
    <select
      id={`filter-select-${label}`}
      title={label}
      value={value}
      onChange={onChange}
      multiple={multiple}
      className={`bg-ds-navy border border-ds-border text-ds-light-text text-sm rounded-md focus:ring-ds-green focus:border-ds-green block w-full p-2.5${multiple ? ' filter-select-multi' : ''}`}
    >
      {!multiple && <option value="All">Todos</option>}
      {options.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
    </select>
  </div>
);

const FilterBar: React.FC<FilterBarProps> = ({
  workItems,
  filteredWorkItems,
  workItemFilters, onWorkItemFiltersChange,
  onClearFilters
}) => {
  const [periodMode, setPeriodMode] = useState<PeriodMode>('preset');
  const [selectedMonth, setSelectedMonth] = useState<string>('');
  const [customStart, setCustomStart] = useState<string>('');
  const [customEnd, setCustomEnd] = useState<string>('');

  const lastMonths = useMemo(() => {
    const months: { value: string; label: string }[] = [];
    const now = new Date();
    for (let i = 0; i < 12; i++) {
      const d = subMonths(now, i);
      const val = format(d, 'yyyy-MM');
      const label = format(d, 'MMMM yyyy', { locale: ptBR });
      months.push({ value: val, label: label.charAt(0).toUpperCase() + label.slice(1) });
    }
    return months;
  }, []);

  const options = useMemo(() => {
    const teams = [...new Set(workItems.map(i => i.team))].sort();
    const assignedTos = [...new Set(workItems.map(i => i.assignedTo).filter(Boolean) as string[])].sort();
    const clients = [...new Set(workItems.map(i => i.tipoCliente).filter(Boolean) as string[])].sort();
    const tags = [...new Set(workItems.flatMap(i => {
      if (!i.tags) return [];
      return Array.isArray(i.tags) ? i.tags : i.tags.split(';').map(t => t.trim());
    }).filter(Boolean))].sort();
    const priorities = [...new Set(workItems.map(i => String(i.priority || '')).filter(Boolean))].sort();
    
    return {
      teams: teams.map(s => ({ value: s, label: s })),
      assignedTos: assignedTos.map(a => ({ value: a, label: a })),
      clients: clients.map(c => ({ value: c, label: c })),
      tags: tags.map(t => ({ value: t, label: t })),
      types: [...WorkItemTypes].map(t => ({ value: t, label: t })),
      states: [...WorkItemStates].map(s => ({ value: s, label: s })),
      priorities: priorities.map(p => ({ value: p, label: `Prioridade ${p}` })),
    };
  }, [workItems]);

  const handleMonthChange = (monthValue: string) => {
    setSelectedMonth(monthValue);
    if (monthValue) {
      onWorkItemFiltersChange({ ...workItemFilters, period: 30, periodMode: 'specific-month', specificMonth: monthValue });
    }
  };

  const handleCustomDateChange = (start: string, end: string) => {
    if (start) setCustomStart(start);
    if (end) setCustomEnd(end);
    const s = start || customStart;
    const e = end || customEnd;
    if (s && e) {
      onWorkItemFiltersChange({ ...workItemFilters, period: 0, periodMode: 'custom', customStartDate: s, customEndDate: e });
    }
  };

  const handleExport = () => {
    const dataToExport = filteredWorkItems;
    if (dataToExport.length === 0) return;
    
    const headers = Object.keys(dataToExport[0] || {}).join(',');
    const rows = dataToExport.map(row => 
        Object.values(row).map(value => {
            if (typeof value === 'string' && value.includes(',')) return `"${value}"`;
            if (value instanceof Date) return value.toISOString();
            if (Array.isArray(value)) return `"${value.join(';')}"`;
            if (typeof value === 'object' && value !== null) return `"${JSON.stringify(value)}"`;
            return value;
        }).join(',')
    );
    const csvContent = `data:text/csv;charset=utf-8,${headers}\n${rows.join('\n')}`;
    const link = document.createElement('a');
    link.setAttribute('href', encodeURI(csvContent));
    link.setAttribute('download', `work_items_data.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };
  
  const renderPeriodFilter = () => (
    <div className="flex flex-wrap items-end gap-3">
      <div>
        <label className="block text-ds-text text-sm mb-1">Período:</label>
        <div className="flex gap-1">
          {[
            { value: 'preset', label: 'Pré-definido' },
            { value: 'specific-month', label: 'Mês Específico' },
            { value: 'custom', label: 'Personalizado' },
          ].map(opt => (
            <button
              key={opt.value}
              onClick={() => {
                setPeriodMode(opt.value as PeriodMode);
                if (opt.value === 'preset') {
                  onWorkItemFiltersChange({ ...workItemFilters, periodMode: undefined, specificMonth: undefined, customStartDate: undefined, customEndDate: undefined });
                }
              }}
              className={`px-3 py-1.5 text-xs rounded-md font-medium transition-colors ${periodMode === opt.value ? 'bg-ds-green text-ds-dark-blue' : 'bg-ds-muted/20 text-ds-text hover:bg-ds-muted/40'}`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {periodMode === 'preset' && (
        <div>
          <select
            value={String(workItemFilters.period)}
            onChange={e => onWorkItemFiltersChange({ ...workItemFilters, period: Number(e.target.value) })}
            className="bg-ds-navy border border-ds-border text-ds-light-text text-sm rounded-md p-2"
          >
            <option value="0">Todos</option>
            <option value="7">Últimos 7 dias</option>
            <option value="8">Última semana + Hoje</option>
            <option value="15">Últimos 15 dias</option>
            <option value="30">Últimos 30 dias</option>
            <option value="90">Últimos 90 dias</option>
            <option value="180">Últimos 180 dias</option>
            <option value="365">Último ano</option>
          </select>
        </div>
      )}

      {periodMode === 'specific-month' && (
        <div>
          <select value={selectedMonth} onChange={e => handleMonthChange(e.target.value)} className="bg-ds-navy border border-ds-border text-ds-light-text text-sm rounded-md p-2">
            <option value="">Selecione o mês...</option>
            {lastMonths.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
          </select>
        </div>
      )}

      {periodMode === 'custom' && (
        <div className="flex gap-2 items-end">
          <div>
            <label className="block text-ds-text text-sm mb-1">De:</label>
            <input type="date" value={customStart} onChange={e => handleCustomDateChange(e.target.value, '')} className="bg-ds-navy border border-ds-border text-ds-light-text text-sm rounded-md p-2" />
          </div>
          <div>
            <label className="block text-ds-text text-sm mb-1">Até:</label>
            <input type="date" value={customEnd} onChange={e => handleCustomDateChange('', e.target.value)} className="bg-ds-navy border border-ds-border text-ds-light-text text-sm rounded-md p-2" />
          </div>
        </div>
      )}
    </div>
  );

  const renderWorkItemFilters = () => (
    <div className="space-y-4">
      {renderPeriodFilter()}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-4">
        <FilterSelect label="Equipe" value={workItemFilters.teams} onChange={e => onWorkItemFiltersChange({...workItemFilters, teams: Array.from(e.target.selectedOptions, (option: HTMLOptionElement) => option.value)})} options={options.teams} multiple />
        <FilterSelect label="Responsável" value={workItemFilters.assignedTos} onChange={e => onWorkItemFiltersChange({...workItemFilters, assignedTos: Array.from(e.target.selectedOptions, (option: HTMLOptionElement) => option.value)})} options={options.assignedTos} multiple />
        <FilterSelect label="Tipo de Item" value={workItemFilters.types} onChange={e => onWorkItemFiltersChange({...workItemFilters, types: Array.from(e.target.selectedOptions, (option: HTMLOptionElement) => option.value)})} options={options.types} multiple />
        <FilterSelect label="Status" value={workItemFilters.states} onChange={e => onWorkItemFiltersChange({...workItemFilters, states: Array.from(e.target.selectedOptions, (option: HTMLOptionElement) => option.value)})} options={options.states} multiple />
        <FilterSelect label="Prioridade" value={workItemFilters.priorities} onChange={e => onWorkItemFiltersChange({...workItemFilters, priorities: Array.from(e.target.selectedOptions, (option: HTMLOptionElement) => option.value)})} options={options.priorities} multiple />
        <FilterSelect label="Tags" value={workItemFilters.tags} onChange={e => onWorkItemFiltersChange({...workItemFilters, tags: Array.from(e.target.selectedOptions, (option: HTMLOptionElement) => option.value)})} options={options.tags} multiple />
        <FilterSelect label="Tipo Cliente" value={workItemFilters.clients} onChange={e => onWorkItemFiltersChange({...workItemFilters, clients: Array.from(e.target.selectedOptions, (option: HTMLOptionElement) => option.value)})} options={options.clients} multiple />
      </div>
    </div>
  );

  return (
    <div className="bg-ds-navy p-4 rounded-lg border border-ds-border">
      {renderWorkItemFilters()}
      <div className="flex items-center justify-between gap-4 mt-4">
         <span className="text-ds-text text-sm">
           Mostrando <strong className="text-ds-green">{filteredWorkItems.length}</strong> de <strong className="text-ds-light-text">{workItems.length}</strong> itens
         </span>
         <div className="flex items-center gap-4">
           <button onClick={() => {
             const mainEl = document.querySelector('main');
             if (!mainEl) return;
             html2canvas(mainEl as HTMLElement, { backgroundColor: '#0a192f', scale: 2, useCORS: true }).then(canvas => {
               const link = document.createElement('a');
               link.download = `dashboard_${format(new Date(), 'yyyy-MM-dd_HHmm')}.png`;
               link.href = canvas.toDataURL('image/png');
               link.click();
             });
           }} className="bg-blue-500/10 text-blue-400 font-semibold py-2 px-4 rounded-md hover:bg-blue-500/20 transition-colors text-sm">Exportar PNG</button>
           <button onClick={handleExport} className="bg-ds-green/10 text-ds-green font-semibold py-2 px-4 rounded-md hover:bg-ds-green/20 transition-colors text-sm">Exportar CSV</button>
           <button onClick={onClearFilters} className="bg-ds-muted/20 text-ds-light-text font-semibold py-2 px-4 rounded-md hover:bg-ds-muted/40 transition-colors text-sm">Limpar Filtros</button>
         </div>
      </div>
    </div>
  );
};

export default FilterBar;
