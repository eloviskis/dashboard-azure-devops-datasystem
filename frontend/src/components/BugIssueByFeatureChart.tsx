import React, { useMemo, useState } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  Legend, ResponsiveContainer, Cell, LabelList,
} from 'recharts';
import { WorkItem } from '../types.ts';
import { CHART_COLORS } from '../constants.ts';
import { EmptyState } from './ChartStates.tsx';

interface BugIssueByFeatureChartProps {
  data: WorkItem[];
}

interface ModalData {
  title: string;
  items: WorkItem[];
  color: string;
}

const AZURE_DEVOPS_BASE_URL = 'https://dev.azure.com/datasystemsoftwares/USE/_workitems/edit';
const getWorkItemUrl = (id: number | string) => `${AZURE_DEVOPS_BASE_URL}/${id}`;

// Percorre a hierarquia de parentId até encontrar o item do tipo 'Feature'
function resolveFeature(item: WorkItem, lookup: Map<number, WorkItem>): { id: number | null; title: string } {
  let current: WorkItem | undefined = item;
  const visited = new Set<number>();

  while (current) {
    if (visited.has(current.workItemId)) break;
    visited.add(current.workItemId);

    if (current.type === 'Feature') {
      return { id: current.workItemId, title: current.title };
    }

    if (!current.parentId) break;
    current = lookup.get(current.parentId);
  }

  return { id: null, title: 'Sem Feature' };
}

const ItemListModal: React.FC<{ data: ModalData | null; onClose: () => void }> = ({ data, onClose }) => {
  if (!data) return null;
  return (
    <div
      className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-50"
      onClick={onClose}
    >
      <div
        className="bg-ds-navy border border-ds-border rounded-lg shadow-2xl max-w-4xl w-full mx-4 max-h-[85vh] flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        <div className="p-4 rounded-t-lg flex justify-between items-center bg-blue-600">
          <h2 className="text-white font-bold text-lg">{data.title}</h2>
          <button
            onClick={onClose}
            className="text-white hover:text-gray-200 text-2xl font-bold leading-none"
          >
            ×
          </button>
        </div>

        <div className="p-4 overflow-y-auto flex-1">
          <div className="text-ds-text mb-3 text-sm">
            Total: <span className="font-bold text-white">{data.items.length}</span> itens
          </div>
          <ul className="space-y-2">
            {data.items.map((item, idx) => (
              <li
                key={item.workItemId || idx}
                className="bg-ds-dark-blue border border-ds-border rounded-lg p-3 hover:border-ds-green transition-colors"
              >
                <div className="flex items-start gap-3">
                  <span className="text-xs font-mono px-2 py-1 rounded bg-blue-600 text-white flex-shrink-0">
                    #{item.workItemId}
                  </span>
                  <div className="flex-1 min-w-0">
                    <a
                      href={getWorkItemUrl(item.workItemId)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-white hover:text-ds-green font-medium block truncate mb-2"
                      title={item.title}
                    >
                      {item.title}
                    </a>
                    <div className="grid grid-cols-2 gap-2 text-xs text-ds-text">
                      <div>👤 {item.assignedTo || 'Não atribuído'}</div>
                      <div>👥 {item.team || 'Sem time'}</div>
                      <div>🏷️ {item.type}</div>
                      <div>📊 {item.state}</div>
                    </div>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </div>

        <div className="p-4 border-t border-ds-border">
          <button
            onClick={onClose}
            className="w-full bg-ds-border hover:bg-ds-green text-white py-2 px-4 rounded-lg transition-colors"
          >
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
};

// Trunca o nome da feature para caber no eixo Y
const truncate = (str: string, max: number) =>
  str.length > max ? str.slice(0, max - 1) + '…' : str;

const BugIssueByFeatureChart: React.FC<BugIssueByFeatureChartProps> = ({ data }) => {
  const [modalData, setModalData] = useState<ModalData | null>(null);

  // Mapa id → WorkItem para navegação pela hierarquia
  const lookup = useMemo(() => {
    const map = new Map<number, WorkItem>();
    data.forEach(item => map.set(item.workItemId, item));
    return map;
  }, [data]);

  // Agrupa bugs e issues por feature
  const { chartData, itemsByFeature } = useMemo(() => {
    const grouped: Record<string, { featureTitle: string; bugs: WorkItem[]; issues: WorkItem[] }> = {};

    data.forEach(item => {
      if (item.type !== 'Bug' && item.type !== 'Issue') return;

      const feature = resolveFeature(item, lookup);
      const key = feature.id !== null ? String(feature.id) : 'sem-feature';
      const label = feature.title;

      if (!grouped[key]) {
        grouped[key] = { featureTitle: label, bugs: [], issues: [] };
      }
      if (item.type === 'Bug') grouped[key].bugs.push(item);
      else grouped[key].issues.push(item);
    });

    const sorted = Object.entries(grouped)
      .map(([key, val]) => ({
        key,
        name: truncate(val.featureTitle, 40),
        fullTitle: val.featureTitle,
        bugs: val.bugs.length,
        issues: val.issues.length,
        total: val.bugs.length + val.issues.length,
        bugsItems: val.bugs,
        issuesItems: val.issues,
      }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 20); // máximo 20 features

    const map: Record<string, { bugs: WorkItem[]; issues: WorkItem[] }> = {};
    Object.entries(grouped).forEach(([key, val]) => {
      map[val.featureTitle] = { bugs: val.bugs, issues: val.issues };
    });

    return { chartData: sorted, itemsByFeature: map };
  }, [data, lookup]);

  const openModal = (featureTitle: string, type: 'Bug' | 'Issue') => {
    const entry = itemsByFeature[featureTitle];
    if (!entry) return;
    const items = type === 'Bug' ? entry.bugs : entry.issues;
    if (items.length === 0) return;
    setModalData({
      title: `${featureTitle} — ${type === 'Bug' ? 'Bugs (pré-produção)' : 'Issues (pós-produção / cliente)'}`,
      items,
      color: type === 'Bug' ? CHART_COLORS.bug : CHART_COLORS.issue,
    });
  };

  if (chartData.length === 0) {
    return <EmptyState message="Nenhum bug ou issue vinculado a uma feature no período." />;
  }

  const barHeight = 36;
  const chartHeight = Math.max(300, chartData.length * barHeight + 60);

  return (
    <>
      <ItemListModal data={modalData} onClose={() => setModalData(null)} />

      {/* Legenda de contexto */}
      <div className="flex flex-wrap gap-4 mb-4 text-xs text-ds-text">
        <span className="flex items-center gap-1">
          <span className="inline-block w-3 h-3 rounded-sm" style={{ backgroundColor: CHART_COLORS.bug }} />
          <strong className="text-white">Bug</strong> — detectado internamente (antes de ir pra produção)
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block w-3 h-3 rounded-sm" style={{ backgroundColor: CHART_COLORS.issue }} />
          <strong className="text-white">Issue</strong> — encontrado pelo cliente (após produção)
        </span>
      </div>

      <ResponsiveContainer width="100%" height={chartHeight}>
        <BarChart
          data={chartData}
          layout="vertical"
          margin={{ top: 5, right: 60, left: 10, bottom: 5 }}
          barCategoryGap="20%"
        >
          <CartesianGrid strokeDasharray="3 3" stroke={CHART_COLORS.grid} horizontal={false} />
          <XAxis
            type="number"
            stroke={CHART_COLORS.text}
            tick={{ fontSize: 11 }}
            allowDecimals={false}
          />
          <YAxis
            type="category"
            dataKey="name"
            stroke={CHART_COLORS.text}
            tick={{ fontSize: 11, fill: CHART_COLORS.text }}
            width={200}
          />
          <Tooltip
            cursor={{ fill: 'rgba(100, 255, 218, 0.07)' }}
            contentStyle={{
              backgroundColor: '#0a192f',
              border: '1px solid #64ffda',
              borderRadius: '8px',
              color: '#e6f1ff',
              padding: '10px 14px',
            }}
            labelStyle={{ color: '#64ffda', fontWeight: 'bold' }}
            itemStyle={{ color: '#e6f1ff' }}
            formatter={(value: number, name: string) => [
              value,
              name === 'bugs'
                ? `Bugs (pré-produção)`
                : `Issues (pós-produção)`,
            ]}
            labelFormatter={(label: string) => label}
          />
          <Legend
            formatter={(value: string) =>
              value === 'bugs' ? 'Bugs (pré-produção)' : 'Issues (pós-produção / cliente)'
            }
          />

          <Bar
            dataKey="bugs"
            name="bugs"
            stackId="a"
            fill={CHART_COLORS.bug}
            cursor="pointer"
            radius={[0, 0, 0, 0]}
          >
            <LabelList
              dataKey="bugs"
              position="insideRight"
              style={{ fill: '#fff', fontSize: 10, fontWeight: 'bold' }}
              formatter={(v: number) => (v > 0 ? v : '')}
            />
            {chartData.map((entry, i) => (
              <Cell
                key={`bug-${i}`}
                onClick={() => openModal(entry.fullTitle, 'Bug')}
              />
            ))}
          </Bar>

          <Bar
            dataKey="issues"
            name="issues"
            stackId="a"
            fill={CHART_COLORS.issue}
            cursor="pointer"
            radius={[0, 4, 4, 0]}
          >
            <LabelList
              dataKey="issues"
              position="insideRight"
              style={{ fill: '#0a192f', fontSize: 10, fontWeight: 'bold' }}
              formatter={(v: number) => (v > 0 ? v : '')}
            />
            {chartData.map((entry, i) => (
              <Cell
                key={`issue-${i}`}
                onClick={() => openModal(entry.fullTitle, 'Issue')}
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </>
  );
};

export default BugIssueByFeatureChart;
