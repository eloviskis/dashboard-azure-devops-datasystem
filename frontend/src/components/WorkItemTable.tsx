import React, { useState, useMemo } from 'react';
import { WorkItem } from '../types.ts';
import { format } from 'date-fns';
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

const ITEMS_PER_PAGE = 15;

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
    let sortableItems = [...data];
    if (sortConfig !== null) {
      sortableItems.sort((a, b) => {
        let aValue: any = a[sortConfig.key];
        let bValue: any = b[sortConfig.key];

        if (aValue === null || aValue === undefined) aValue = -1;
        if (bValue === null || bValue === undefined) bValue = -1;

        if (aValue < bValue) {
          return sortConfig.direction === 'ascending' ? -1 : 1;
        }
        if (aValue > bValue) {
          return sortConfig.direction === 'ascending' ? 1 : -1;
        }
        return 0;
      });
    }
    return sortableItems;
  }, [data, sortConfig]);

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
        {/* Total Counter */}
        <div className="flex items-center justify-between bg-ds-navy p-3 rounded-lg border border-ds-border">
          <span className="text-ds-light-text font-semibold text-sm">
            📊 Total de Itens: <span className="text-ds-green text-lg">{data.length}</span>
          </span>
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
                {paginatedItems.map((item) => (
                    <tr key={item.workItemId} className="bg-ds-navy border-b border-ds-border hover:bg-ds-muted/20">
                        <td className="px-6 py-4 font-medium text-ds-light-text whitespace-nowrap">{item.workItemId}</td>
                        <td className="px-6 py-4 max-w-xs truncate" title={item.title}>{item.title}</td>
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
                        <td className="px-6 py-4">{format(item.createdDate, 'dd/MM/yyyy')}</td>
                        <td className="px-6 py-4 text-center">{item.cycleTime !== null ? item.cycleTime : '-'}</td>
                    </tr>
                ))}
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
