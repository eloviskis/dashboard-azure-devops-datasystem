import React, { useMemo } from 'react';
import './FilterBar.css';
import { WorkItem, WorkItemFilters, WorkItemTypes, WorkItemStates } from '../types.ts';

interface FilterBarProps {
  activeTab: string;
  workItems: WorkItem[];
  workItemFilters: WorkItemFilters;
  onWorkItemFiltersChange: (filters: WorkItemFilters) => void;
  onClearFilters: () => void;
}

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
  workItemFilters, onWorkItemFiltersChange,
  onClearFilters
}) => {

  const options = useMemo(() => {
    const teams = [...new Set(workItems.map(i => i.team))].sort();
    const assignedTos = [...new Set(workItems.map(i => i.assignedTo).filter(Boolean) as string[])].sort();
    const clients = [...new Set(workItems.map(i => i.tipoCliente).filter(Boolean) as string[])].sort();
    const tags = [...new Set(workItems.flatMap(i => i.tags))].sort();
    
    return {
      teams: teams.map(s => ({ value: s, label: s })),
      assignedTos: assignedTos.map(a => ({ value: a, label: a })),
      clients: clients.map(c => ({ value: c, label: c })),
      tags: tags.map(t => ({ value: t, label: t })),
      types: [...WorkItemTypes].map(t => ({ value: t, label: t })),
      states: [...WorkItemStates].map(s => ({ value: s, label: s })),
    };
  }, [workItems]);

  const handleExport = () => {
    const dataToExport = workItems;
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
  
  const renderWorkItemFilters = () => (
    <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-4">
        <FilterSelect label="Período" value={String(workItemFilters.period)} onChange={e => onWorkItemFiltersChange({...workItemFilters, period: Number(e.target.value)})} options={[
          {value: '7', label: 'Últimos 7 dias'},
          {value: '8', label: 'Última semana + Hoje'},
          {value: '15', label: 'Últimos 15 dias'},
          {value: '30', label: 'Últimos 30 dias'},
          {value: '90', label: 'Últimos 90 dias'},
          {value: '180', label: 'Últimos 180 dias'}
        ]} />
      <FilterSelect label="Equipe" value={workItemFilters.teams} onChange={e => onWorkItemFiltersChange({...workItemFilters, teams: Array.from(e.target.selectedOptions, (option: HTMLOptionElement) => option.value)})} options={options.teams} multiple />
      <FilterSelect label="Responsável" value={workItemFilters.assignedTos} onChange={e => onWorkItemFiltersChange({...workItemFilters, assignedTos: Array.from(e.target.selectedOptions, (option: HTMLOptionElement) => option.value)})} options={options.assignedTos} multiple />
      <FilterSelect label="Tipo de Item" value={workItemFilters.types} onChange={e => onWorkItemFiltersChange({...workItemFilters, types: Array.from(e.target.selectedOptions, (option: HTMLOptionElement) => option.value)})} options={options.types} multiple />
      <FilterSelect label="Status" value={workItemFilters.states} onChange={e => onWorkItemFiltersChange({...workItemFilters, states: Array.from(e.target.selectedOptions, (option: HTMLOptionElement) => option.value)})} options={options.states} multiple />
      <FilterSelect label="Tags" value={workItemFilters.tags} onChange={e => onWorkItemFiltersChange({...workItemFilters, tags: Array.from(e.target.selectedOptions, (option: HTMLOptionElement) => option.value)})} options={options.tags} multiple />
      <FilterSelect label="Tipo Cliente" value={workItemFilters.clients} onChange={e => onWorkItemFiltersChange({...workItemFilters, clients: Array.from(e.target.selectedOptions, (option: HTMLOptionElement) => option.value)})} options={options.clients} multiple />
    </div>
  );

  return (
    <div className="bg-ds-navy p-4 rounded-lg border border-ds-border">
      {renderWorkItemFilters()}
      <div className="flex items-center justify-end gap-4 mt-4">
         <button onClick={handleExport} className="bg-ds-green/10 text-ds-green font-semibold py-2 px-4 rounded-md hover:bg-ds-green/20 transition-colors text-sm">Exportar CSV</button>
         <button onClick={onClearFilters} className="bg-ds-muted/20 text-ds-light-text font-semibold py-2 px-4 rounded-md hover:bg-ds-muted/40 transition-colors text-sm">Limpar Filtros</button>
      </div>
    </div>
  );
};

export default FilterBar;
