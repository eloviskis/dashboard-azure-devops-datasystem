import React, { useMemo } from 'react';
import { WorkItem, PullRequest, WorkItemFilters, PRFilters, WorkItemType, WorkItemStatus, PullRequestStatus } from '../types.ts';

interface FilterBarProps {
  activeTab: string;
  workItems: WorkItem[];
  pullRequests: PullRequest[];
  workItemFilters: WorkItemFilters;
  onWorkItemFiltersChange: (filters: WorkItemFilters) => void;
  prFilters: PRFilters;
  onPRFiltersChange: (filters: PRFilters) => void;
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
    <label className="block text-ds-text text-sm mb-1">{label}:</label>
    <select
      value={value}
      onChange={onChange}
      multiple={multiple}
      className="bg-ds-navy border border-ds-border text-ds-light-text text-sm rounded-md focus:ring-ds-green focus:border-ds-green block w-full p-2.5"
      style={{ height: multiple ? '100px' : 'auto' }}
    >
      {!multiple && <option value="All">Todos</option>}
      {options.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
    </select>
  </div>
);

const FilterBar: React.FC<FilterBarProps> = ({
  activeTab, workItems, pullRequests,
  workItemFilters, onWorkItemFiltersChange,
  prFilters, onPRFiltersChange, onClearFilters
}) => {

  const options = useMemo(() => {
    const squads = [...new Set(workItems.map(i => i.squad))];
    const assignees = [...new Set(workItems.map(i => i.assignee))];
    const clients = [...new Set(workItems.map(i => i.client))];
    const tags = [...new Set(workItems.flatMap(i => i.tags))];
    const repositories = [...new Set(pullRequests.map(p => p.repository))];
    const authors = [...new Set(pullRequests.map(p => p.author))];
    const reviewers = [...new Set(pullRequests.flatMap(p => p.reviewers.map(r => r.name)))];
    
    return {
      squads: squads.map(s => ({ value: s, label: s })),
      assignees: assignees.map(a => ({ value: a, label: a })),
      clients: clients.map(c => ({ value: c, label: c })),
      tags: tags.map(t => ({ value: t, label: t })),
      types: Object.values(WorkItemType).map(t => ({ value: t, label: t })),
      status: Object.values(WorkItemStatus).map(s => ({ value: s, label: s })),
      repositories: repositories.map(r => ({ value: r, label: r })),
      authors: authors.map(a => ({ value: a, label: a })),
      reviewers: reviewers.map(r => ({ value: r, label: r })),
      prStatus: Object.values(PullRequestStatus).map(s => ({ value: s, label: s })),
    };
  }, [workItems, pullRequests]);

  const handleExport = () => {
    const dataToExport = activeTab === 'prs' ? pullRequests : workItems;
    const headers = Object.keys(dataToExport[0] || {}).join(',');
    const rows = dataToExport.map(row => 
        Object.values(row).map(value => {
            if (typeof value === 'string' && value.includes(',')) return `"${value}"`;
            if (value instanceof Date) return value.toISOString();
            if (typeof value === 'object' && value !== null) return `"${JSON.stringify(value)}"`;
            return value;
        }).join(',')
    );
    const csvContent = `data:text/csv;charset=utf-8,${headers}\n${rows.join('\n')}`;
    const link = document.createElement('a');
    link.setAttribute('href', encodeURI(csvContent));
    link.setAttribute('download', `${activeTab}_data.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };
  
  const renderWorkItemFilters = () => (
    <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-4">
      <FilterSelect label="Período" value={String(workItemFilters.period)} onChange={e => onWorkItemFiltersChange({...workItemFilters, period: Number(e.target.value)})} options={[
          {value: '1', label: 'Hoje'}, {value: '7', label: 'Últimos 7 dias'}, {value: '15', label: 'Últimos 15 dias'}, {value: '30', label: 'Últimos 30 dias'}, {value: '90', label: 'Últimos 90 dias'}
      ]} />
      <FilterSelect label="Squad" value={workItemFilters.squads} onChange={e => onWorkItemFiltersChange({...workItemFilters, squads: Array.from(e.target.selectedOptions, (option: HTMLOptionElement) => option.value)})} options={options.squads} multiple />
      <FilterSelect label="Responsável" value={workItemFilters.assignees} onChange={e => onWorkItemFiltersChange({...workItemFilters, assignees: Array.from(e.target.selectedOptions, (option: HTMLOptionElement) => option.value)})} options={options.assignees} multiple />
      <FilterSelect label="Tipo de Item" value={workItemFilters.types} onChange={e => onWorkItemFiltersChange({...workItemFilters, types: Array.from(e.target.selectedOptions, (option: HTMLOptionElement) => option.value)})} options={options.types} multiple />
      <FilterSelect label="Status" value={workItemFilters.status} onChange={e => onWorkItemFiltersChange({...workItemFilters, status: Array.from(e.target.selectedOptions, (option: HTMLOptionElement) => option.value)})} options={options.status} multiple />
      <FilterSelect label="Tags" value={workItemFilters.tags} onChange={e => onWorkItemFiltersChange({...workItemFilters, tags: Array.from(e.target.selectedOptions, (option: HTMLOptionElement) => option.value)})} options={options.tags} multiple />
      <FilterSelect label="Cliente" value={workItemFilters.clients} onChange={e => onWorkItemFiltersChange({...workItemFilters, clients: Array.from(e.target.selectedOptions, (option: HTMLOptionElement) => option.value)})} options={options.clients} multiple />
    </div>
  );

  const renderPRFilters = () => (
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
        <FilterSelect label="Período" value={String(prFilters.period)} onChange={e => onPRFiltersChange({...prFilters, period: Number(e.target.value)})} options={[
            {value: '1', label: 'Hoje'}, {value: '7', label: 'Últimos 7 dias'}, {value: '15', label: 'Últimos 15 dias'}, {value: '30', label: 'Últimos 30 dias'}, {value: '90', label: 'Últimos 90 dias'}
        ]} />
        <FilterSelect label="Repositório" value={prFilters.repositories} onChange={e => onPRFiltersChange({...prFilters, repositories: Array.from(e.target.selectedOptions, (option: HTMLOptionElement) => option.value)})} options={options.repositories} multiple />
        <FilterSelect label="Autor" value={prFilters.authors} onChange={e => onPRFiltersChange({...prFilters, authors: Array.from(e.target.selectedOptions, (option: HTMLOptionElement) => option.value)})} options={options.authors} multiple />
        <FilterSelect label="Revisor" value={prFilters.reviewers} onChange={e => onPRFiltersChange({...prFilters, reviewers: Array.from(e.target.selectedOptions, (option: HTMLOptionElement) => option.value)})} options={options.reviewers} multiple />
        <FilterSelect label="Status do PR" value={prFilters.prStatus} onChange={e => onPRFiltersChange({...prFilters, prStatus: Array.from(e.target.selectedOptions, (option: HTMLOptionElement) => option.value)})} options={options.prStatus} multiple />
      </div>
  );

  return (
    <div className="bg-ds-navy p-4 rounded-lg border border-ds-border">
      {activeTab === 'prs' ? renderPRFilters() : renderWorkItemFilters()}
      <div className="flex items-center justify-end gap-4 mt-4">
         <button onClick={handleExport} className="bg-ds-green/10 text-ds-green font-semibold py-2 px-4 rounded-md hover:bg-ds-green/20 transition-colors text-sm">Exportar CSV</button>
         <button onClick={onClearFilters} className="bg-ds-muted/20 text-ds-light-text font-semibold py-2 px-4 rounded-md hover:bg-ds-muted/40 transition-colors text-sm">Limpar Filtros</button>
      </div>
    </div>
  );
};

export default FilterBar;