import React, { useState, useMemo, useCallback } from 'react';
import { WorkItem } from '../types.ts';
import { format, differenceInDays } from 'date-fns';
import { EmptyState } from './ChartStates.tsx';
import { STATUS_COLORS } from '../constants.ts';

interface WorkItemTableProps {
  data: WorkItem[];
}

type SortKey = keyof WorkItem;
type SortDirection = 'ascending' | 'descending';

interface SortConfig {
  key: SortKey;
  direction: SortDirection;
}

const ITEMS_PER_PAGE = 25;
const OLD_ITEM_THRESHOLD_DAYS = 90;

const SortableHeader: React.FC<{
    sortKey: SortKey,
    title: string,
    sortConfig: SortConfig | null,
    requestSort: (key: SortKey) => void
}> = ({ sortKey, title, sortConfig, requestSort }) => {
    const isSorted = sortConfig && sortConfig.key === sortKey;
    const icon = isSorted ? (sortConfig.direction === 'ascending' ? '▲' : '▼') : '↕';

    return (
        <th scope="col" className="px-6 py-3 cursor-pointer" onClick={() => requestSort(sortKey)}>
            <div className="flex items-center">
                {title}
                <span className="ml-2 text-ds-green">{icon}</span>
            </div>
        </th>
    );
};


const WorkItemTable: React.FC<WorkItemTableProps> = ({ data }) => {
  const [currentPage, setCurrentPage] = useState(1);
  const [sortConfig, setSortConfig] = useState<SortConfig | null>({ key: 'createdDate', direction: 'descending' });
  const [searchText, setSearchText] = useState('');

  // Export CSV function
  const exportCSV = useCallback(() => {
    const headers = ['ID', 'Título', 'Status', 'Responsável', 'Time', 'CR Nível 1', 'CR Nível 2', 'Tipo', 'Criado em', 'Cycle Time (dias)', 'Tags'];
    const rows = data.map(item => [
      item.workItemId,
      `"${(item.title || '').replace(/"/g, '""')}"`,
      item.state,
      item.assignedTo || 'N/A',
      item.team || '',
      item.codeReviewLevel1 || 'N/A',
      item.codeReviewLevel2 || 'N/A',
      item.type,
      item.createdDate ? format(new Date(item.createdDate), 'dd/MM/yyyy') : '',
      item.cycleTime ?? '',
      Array.isArray(item.tags) ? item.tags.join('; ') : (item.tags || ''),
    ]);

    const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `work-items-${format(new Date(), 'yyyy-MM-dd')}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }, [data]);

  // Counters for Code Review Level 1 and Level 2 by person
  const crCounters = useMemo(() => {
    const level1: Record<string, number> = {};
    const level2: Record<string, number> = {};
    data.forEach(item => {
      if (item.codeReviewLevel1) {
        level1[item.codeReviewLevel1] = (level1[item.codeReviewLevel1] || 0) + 1;
      }
      if (item.codeReviewLevel2) {
        level2[item.codeReviewLevel2] = (level2[item.codeReviewLevel2] || 0) + 1;
      }
    });
    return {
      level1: Object.entries(level1).sort((a, b) => b[1] - a[1]),
      level2: Object.entries(level2).sort((a, b) => b[1] - a[1]),
    };
  }, [data]);

  const sortedItems = useMemo(() => {
    // First filter by search text
    let items = [...data];
    if (searchText.trim()) {
      const search = searchText.toLowerCase().trim();
      items = items.filter(item =>
        (item.title || '').toLowerCase().includes(search) ||
        (item.assignedTo || '').toLowerCase().includes(search) ||
        (item.team || '').toLowerCase().includes(search) ||
        (item.type || '').toLowerCase().includes(search) ||
        (item.state || '').toLowerCase().includes(search) ||
        String(item.workItemId).includes(search) ||
        (item.codeReviewLevel1 || '').toLowerCase().includes(search) ||
        (item.codeReviewLevel2 || '').toLowerCase().includes(search)
      );
    }

    if (sortConfig !== null) {
      items.sort((a, b) => {
        let aValue: any = a[sortConfig.key];
        let bValue: any = b[sortConfig.key];

        const aNull = aValue === null || aValue === undefined;
        const bNull = bValue === null || bValue === undefined;
        if (aNull && bNull) return 0;
        if (aNull) return 1; // nulls always last
        if (bNull) return -1;

        if (aValue < bValue) {
          return sortConfig.direction === 'ascending' ? -1 : 1;
        }
        if (aValue > bValue) {
          return sortConfig.direction === 'ascending' ? 1 : -1;
        }
        return 0;
      });
    }
    return items;
  }, [data, sortConfig, searchText]);

  const requestSort = (key: SortKey) => {
    let direction: SortDirection = 'ascending';
    if (sortConfig && sortConfig.key === key && sortConfig.direction === 'ascending') {
      direction = 'descending';
    }
    setSortConfig({ key, direction });
    setCurrentPage(1);
  };
  
  const totalPages = Math.ceil(sortedItems.length / ITEMS_PER_PAGE);
  const paginatedItems = sortedItems.slice(
    (currentPage - 1) * ITEMS_PER_PAGE,
    currentPage * ITEMS_PER_PAGE
  );
  
  const handlePageChange = (page: number) => {
    if (page >= 1 && page <= totalPages) {
      setCurrentPage(page);
    }
  };


  if (data.length === 0) {
    return <EmptyState message="Nenhum item de trabalho corresponde aos filtros selecionados." />;
  }

  return (
    <div className="space-y-4">
        {/* Total Counter + Search + Export */}
        <div className="flex flex-wrap items-center gap-4 bg-ds-navy p-3 rounded-lg border border-ds-border">
          <span className="text-ds-light-text font-semibold text-sm">
            📊 Total: <span className="text-ds-green text-lg">{data.length}</span>
            {searchText && <span className="text-ds-text text-xs ml-2">(filtrados: {sortedItems.length})</span>}
          </span>
          <div className="flex-1">
            <input
              type="text"
              placeholder="🔍 Buscar por título, responsável, time, ID..."
              value={searchText}
              onChange={e => { setSearchText(e.target.value); setCurrentPage(1); }}
              className="bg-ds-dark-blue border border-ds-border text-ds-light-text text-sm rounded-md p-2 w-full max-w-md placeholder-ds-muted"
            />
          </div>
          <button
            onClick={exportCSV}
            className="bg-ds-green/10 text-ds-green font-semibold py-2 px-4 rounded-md hover:bg-ds-green/20 transition-colors text-sm flex items-center gap-2"
          >
            📥 Exportar CSV
          </button>
        </div>

        {/* Code Review Counters */}
        {(crCounters.level1.length > 0 || crCounters.level2.length > 0) && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {crCounters.level1.length > 0 && (
              <div className="bg-ds-dark-blue p-3 rounded-lg border border-ds-border">
                <h4 className="text-ds-light-text font-semibold text-sm mb-2">📋 Code Review Nível 1 por Pessoa</h4>
                <div className="flex flex-wrap gap-2">
                  {crCounters.level1.map(([name, count]) => (
                    <span key={name} className="bg-ds-muted/20 text-ds-text text-xs px-2 py-1 rounded-md">
                      {name}: <strong className="text-ds-green">{count}</strong>
                    </span>
                  ))}
                </div>
              </div>
            )}
            {crCounters.level2.length > 0 && (
              <div className="bg-ds-dark-blue p-3 rounded-lg border border-ds-border">
                <h4 className="text-ds-light-text font-semibold text-sm mb-2">📋 Code Review Nível 2 por Pessoa</h4>
                <div className="flex flex-wrap gap-2">
                  {crCounters.level2.map(([name, count]) => (
                    <span key={name} className="bg-ds-muted/20 text-ds-text text-xs px-2 py-1 rounded-md">
                      {name}: <strong className="text-blue-400">{count}</strong>
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Table */}
        <div className="relative overflow-x-auto">
        <table className="w-full text-sm text-left text-ds-text">
            <thead className="text-xs text-ds-light-text uppercase bg-ds-navy/50">
                <tr>
                    <SortableHeader sortKey="workItemId" title="ID" sortConfig={sortConfig} requestSort={requestSort} />
                    <SortableHeader sortKey="title" title="Título" sortConfig={sortConfig} requestSort={requestSort} />
                    <SortableHeader sortKey="state" title="Status" sortConfig={sortConfig} requestSort={requestSort} />
                    <SortableHeader sortKey="assignedTo" title="Responsável" sortConfig={sortConfig} requestSort={requestSort} />
                    <SortableHeader sortKey="team" title="Time" sortConfig={sortConfig} requestSort={requestSort} />
                    <SortableHeader sortKey="codeReviewLevel1" title="CR Nível 1" sortConfig={sortConfig} requestSort={requestSort} />
                    <SortableHeader sortKey="codeReviewLevel2" title="CR Nível 2" sortConfig={sortConfig} requestSort={requestSort} />
                    <SortableHeader sortKey="type" title="Tipo" sortConfig={sortConfig} requestSort={requestSort} />
                    <SortableHeader sortKey="createdDate" title="Criado em" sortConfig={sortConfig} requestSort={requestSort} />
                    <SortableHeader sortKey="cycleTime" title="Cycle Time (d)" sortConfig={sortConfig} requestSort={requestSort} />
                </tr>
            </thead>
            <tbody>
                {paginatedItems.map((item) => {
                    const itemAge = item.createdDate ? differenceInDays(new Date(), new Date(item.createdDate)) : 0;
                    const isOld = itemAge >= OLD_ITEM_THRESHOLD_DAYS && !['Done', 'Concluído', 'Closed', 'Fechado', 'Finished', 'Resolved', 'Pronto'].includes(item.state);
                    return (
                    <tr key={item.workItemId} className={`border-b border-ds-border hover:bg-ds-muted/20 ${isOld ? 'bg-red-900/10' : 'bg-ds-navy'}`}>
                        <td className="px-6 py-4 font-medium text-ds-light-text whitespace-nowrap">
                          {item.url ? (
                            <a href={item.url} target="_blank" rel="noopener noreferrer" className="text-ds-green hover:underline">{item.workItemId}</a>
                          ) : item.workItemId}
                        </td>
                        <td className="px-6 py-4 max-w-xs truncate" title={item.title}>
                          {item.title}
                          {isOld && <span className="ml-2 text-xs text-red-400" title={`Criado há ${itemAge} dias`}>🔴 {itemAge}d</span>}
                        </td>
                        <td className="px-6 py-4">
                            <span className="flex items-center">
                                <span className="h-2 w-2 rounded-full mr-2" style={{ backgroundColor: STATUS_COLORS[item.state] }}></span>
                                {item.state}
                            </span>
                        </td>
                        <td className="px-6 py-4">{item.assignedTo || 'N/A'}</td>
                        <td className="px-6 py-4">{item.team}</td>
                        <td className="px-6 py-4">{item.codeReviewLevel1 || 'N/A'}</td>
                        <td className="px-6 py-4">{item.codeReviewLevel2 || 'N/A'}</td>
                        <td className="px-6 py-4">{item.type}</td>
                        <td className="px-6 py-4">{item.createdDate ? format(new Date(item.createdDate), 'dd/MM/yyyy') : '-'}</td>
                        <td className="px-6 py-4 text-center">{item.cycleTime !== null ? item.cycleTime : '-'}</td>
                    </tr>
                    );
                })}
            </tbody>
        </table>
        
        {/* Pagination Controls */}
        <nav className="flex items-center justify-between pt-4" aria-label="Table navigation">
            <span className="text-sm font-normal text-ds-text">
                Mostrando <span className="font-semibold text-ds-light-text">{(currentPage - 1) * ITEMS_PER_PAGE + 1}-{Math.min(currentPage * ITEMS_PER_PAGE, sortedItems.length)}</span> de <span className="font-semibold text-ds-light-text">{sortedItems.length}</span>
            </span>
            <ul className="inline-flex items-center -space-x-px">
                <li>
                    <button onClick={() => handlePageChange(currentPage - 1)} disabled={currentPage === 1} className="block px-3 py-2 ml-0 leading-tight text-ds-text bg-ds-navy border border-ds-border rounded-l-lg hover:bg-ds-muted disabled:opacity-50 disabled:cursor-not-allowed">
                        Anterior
                    </button>
                </li>
                <li>
                    <span className="px-3 py-2 leading-tight text-ds-text bg-ds-navy border border-ds-border">
                        Página {currentPage} de {totalPages}
                    </span>
                </li>
                 <li>
                    <button onClick={() => handlePageChange(currentPage + 1)} disabled={currentPage === totalPages} className="block px-3 py-2 leading-tight text-ds-text bg-ds-navy border border-ds-border rounded-r-lg hover:bg-ds-muted disabled:opacity-50 disabled:cursor-not-allowed">
                        Próximo
                    </button>
                </li>
            </ul>
        </nav>
    </div>
    </div>
  );
};

export default WorkItemTable;
