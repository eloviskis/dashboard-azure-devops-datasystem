import React, { useState, useEffect, useCallback } from 'react';
import './ChartInfoLamp.css';
import { useAuth } from '../contexts/AuthContext';

const API = import.meta.env.VITE_API_URL || '';

// ─── ChartInfoLamp original ───────────────────────────────────────────────────
interface ChartInfoLampProps { info: string; }

const ChartInfoLamp: React.FC<ChartInfoLampProps> = ({ info }) => (
  <span className="chart-info-lamp">
    <span className="chart-info-lamp-icon" tabIndex={0} aria-label="Informacao do grafico">
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#FFD600" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="chart-info-lamp-svg">
        <circle cx="12" cy="12" r="10" stroke="#FFD600" fill="#FFFDE7" />
        <path d="M9 12a3 3 0 1 1 6 0c0 1.5-1.5 2.5-3 2.5" />
        <line x1="12" y1="17" x2="12" y2="17" />
      </svg>
      <span className="chart-info-tooltip">{info}</span>
    </span>
  </span>
);

export default ChartInfoLamp;

// ─── Campos mapeaveis por chart ───────────────────────────────────────────────
export interface FieldDef {
  key: string; label: string; dbColumn: string; defaultAzureField: string;
  charts: string[]; hint?: string; isIdentity?: boolean; alwaysShow?: boolean;
}

export const ALL_FIELD_DEFS: FieldDef[] = [
  { key:'causaRaiz',      label:'Causa Raiz',               dbColumn:'causa_raiz',       defaultAzureField:'Custom.Raizdoproblema',
    charts:['rootcause','period-comparison'], hint:'Custom.RootCause em orgs internacionais.' },
  { key:'customType',     label:'Tipo Customizado (Correcao/Alteracao)', dbColumn:'custom_type',  defaultAzureField:'Custom.Type',
    charts:['rootcause','period-comparison'], hint:'Diferencia Correcao de Alteracao nas Issues.' },
  { key:'complexity',     label:'Complexidade',              dbColumn:'complexity',        defaultAzureField:'Custom.Complexity',
    charts:['rootcause'], hint:'Valores esperados: Baixa, Media, Alta.' },
  { key:'squad',          label:'Squad / Area',              dbColumn:'squad',             defaultAzureField:'Custom.Squad',
    charts:['rootcause'], hint:'Area funcional afetada pela issue.' },
  { key:'platform',       label:'Plataforma',                dbColumn:'platform',          defaultAzureField:'Custom.Platform',
    charts:['rootcause'], hint:'Ex: Web, Mobile, API, Desktop.' },
  { key:'dev',            label:'Desenvolvedor (DEV)',        dbColumn:'dev',               defaultAzureField:'Custom.DEV',
    charts:['rootcause'], hint:'Campo identity — retorna displayName.', isIdentity:true },
  { key:'reincidencia',   label:'Reincidencia',              dbColumn:'reincidencia',      defaultAzureField:'Custom.REINCIDENCIA',
    charts:['rootcause','quality'], hint:'Campo numerico: 1, 2, 3...' },
  { key:'identificacao',  label:'Identificacao da Falha',    dbColumn:'identificacao',     defaultAzureField:'Custom.7ac99842-e0ec-4f18-b91b-53bfe3e3b3f5',
    charts:['rootcause','quality'], hint:'Campo GUID — verifique o nome exato no seu DevOps.' },
  { key:'falhaDoProcesso',label:'Falha do Processo',         dbColumn:'falha_do_processo', defaultAzureField:'Custom.Falhadoprocesso',
    charts:['rootcause','quality'], hint:'Requisitos, Dev, Code Review, QA, Deploy.' },
  { key:'rootCauseTeam',  label:'Time Causa Raiz',           dbColumn:'root_cause_team',   defaultAzureField:'Custom.rootcauseteam',
    charts:['rootcause'], hint:'Time que originou o bug.' },
  { key:'tipoCliente',    label:'Tipo de Cliente',           dbColumn:'tipo_cliente',      defaultAzureField:'Custom.Tipocliente',
    charts:['clients'],   hint:'Segmento ou nome do cliente. Alimenta toda a aba Analise por Cliente.' },
  { key:'qa',             label:'QA Responsavel',            dbColumn:'qa',                defaultAzureField:'Custom.QA',
    charts:['qa-tracker'], hint:'Campo identity — displayName do analista QA.', isIdentity:true },
  { key:'deliveredVersion',label:'Versao Entregue',          dbColumn:'delivered_version', defaultAzureField:'Custom.DeliveredVersion',
    charts:['qa-tracker'], hint:'Usado no seletor de versoes do QA Tracker.' },
  { key:'storyPoints',    label:'Story Points',              dbColumn:'story_points',      defaultAzureField:'Microsoft.VSTS.Scheduling.StoryPoints',
    charts:['scrum-ctc'], hint:'Campo padrao — geralmente ja funciona sem configuracao.' },
  { key:'po',             label:'Product Owner (PO)',        dbColumn:'po',                defaultAzureField:'Custom.PO',
    charts:['po-analysis','devtracker'], hint:'Campo identity — PO responsavel pelo item.', isIdentity:true },
  { key:'rootCauseStatus',label:'Status da Causa Raiz',      dbColumn:'root_cause_status', defaultAzureField:'Custom.RootCauseStatus',
    charts:['rootcause'], hint:'Status da investigacao de causa raiz.' },
  { key:'area',           label:'Area (Root Cause)',         dbColumn:'area',              defaultAzureField:'Custom.Area',
    charts:['rootcause'], hint:'Area de origem do problema, distinta de Squad.' },
  { key:'performanceDays',label:'Dias de Performance',       dbColumn:'performance_days',  defaultAzureField:'Custom.PerformanceDays',
    charts:['rootcause'], hint:'Dias usados em metricas de performance de Root Cause.' },
  { key:'rootCauseTask',  label:'Tarefa de Causa Raiz',      dbColumn:'root_cause_task',   defaultAzureField:'Custom.Rootcausetask',
    charts:['rootcause'], hint:'Referencia a tarefa de correcao de causa raiz.' },
  { key:'rootCauseVersion',label:'Versao de Correcao (Root Cause)', dbColumn:'root_cause_version', defaultAzureField:'Custom.rootcauseversion',
    charts:['rootcause'], hint:'Versao em que a causa raiz foi corrigida.' },
  { key:'readyDate',      label:'Data DOR (Ready)',          dbColumn:'ready_date',        defaultAzureField:'Custom.DOR',
    charts:['po-analysis'], hint:'Definition of Ready — usado na taxa de DOR.' },
  { key:'doneDate',       label:'Data DOD (Done)',           dbColumn:'done_date',         defaultAzureField:'Custom.DOD',
    charts:['po-analysis'], hint:'Definition of Done.' },
  { key:'application',    label:'Aplicacao',                 dbColumn:'application',       defaultAzureField:'Custom.Aplication',
    charts:['qa-tracker'], hint:'Aplicacao/sistema afetado pela entrega.' },
  { key:'branchBase',     label:'Branch Base',               dbColumn:'branch_base',       defaultAzureField:'Custom.BranchBase',
    charts:['qa-tracker'], hint:'Branch de origem da entrega.' },
  { key:'baseVersion',    label:'Versao Base',               dbColumn:'base_version',      defaultAzureField:'Custom.BaseVersion',
    charts:['qa-tracker'], hint:'Versao base antes da entrega, junto com Versao Entregue.' },
  { key:'categoria',      label:'Categoria',                 dbColumn:'categoria',         defaultAzureField:'Custom.Category',
    charts:['devtracker'], hint:'Categoria do item usada no DevTracker.' },
  { key:'codeReviewLevel1',label:'Code Review — Nivel 1',    dbColumn:'code_review_level1', defaultAzureField:'Custom.ab075d4c-04f5-4f96-b294-4ad0f5987028',
    charts:['item-list'], hint:'Campo identity com GUID — verifique o nome exato no seu DevOps.', isIdentity:true },
  { key:'codeReviewLevel2',label:'Code Review — Nivel 2',    dbColumn:'code_review_level2', defaultAzureField:'Custom.60cee051-7e66-4753-99d6-4bc8717fae0e',
    charts:['item-list'], hint:'Campo identity com GUID — verifique o nome exato no seu DevOps.', isIdentity:true },
  { key:'impedimento',    label:'Impedimento',               dbColumn:'impedimento',       defaultAzureField:'Custom.Impedimento',
    charts:['impedimentos'], hint:'Campo booleano (true/false).' },
  { key:'bloqueio',       label:'Bloqueio',                  dbColumn:'bloqueio',          defaultAzureField:'Custom.Bloqueio',
    charts:['impedimentos'], hint:'Campo booleano (true/false).' },

  // ─── Campos padrao do Azure DevOps — aparecem em todos os graficos ──────────
  // System.* nunca muda de nome entre organizacoes. Microsoft.VSTS.* pode variar
  // conforme o template de processo (Agile/Scrum/CMMI/Basic/Inherited).
  { key:'title',          label:'Titulo',                    dbColumn:'title',             defaultAzureField:'System.Title',
    charts:[], alwaysShow:true, hint:'Campo fixo do Azure DevOps.' },
  { key:'state',          label:'Estado (State)',            dbColumn:'state',             defaultAzureField:'System.State',
    charts:[], alwaysShow:true, hint:'Campo fixo do Azure DevOps.' },
  { key:'type',           label:'Tipo de Item',              dbColumn:'type',              defaultAzureField:'System.WorkItemType',
    charts:[], alwaysShow:true, hint:'Campo fixo do Azure DevOps.' },
  { key:'assignedTo',     label:'Responsavel (Assigned To)', dbColumn:'assigned_to',       defaultAzureField:'System.AssignedTo',
    charts:[], alwaysShow:true, hint:'Campo fixo do Azure DevOps.', isIdentity:true },
  { key:'areaPath',       label:'Area Path (Time)',          dbColumn:'area_path',         defaultAzureField:'System.AreaPath',
    charts:[], alwaysShow:true, hint:'Campo fixo do Azure DevOps. Alimenta o "Time" via extracao automatica.' },
  { key:'iterationPath',  label:'Iteration Path (Sprint)',   dbColumn:'iteration_path',    defaultAzureField:'System.IterationPath',
    charts:[], alwaysShow:true, hint:'Campo fixo do Azure DevOps.' },
  { key:'createdDate',    label:'Data de Criacao',           dbColumn:'created_date',      defaultAzureField:'System.CreatedDate',
    charts:[], alwaysShow:true, hint:'Campo fixo do Azure DevOps.' },
  { key:'changedDate',    label:'Data de Alteracao',         dbColumn:'changed_date',      defaultAzureField:'System.ChangedDate',
    charts:[], alwaysShow:true, hint:'Campo fixo do Azure DevOps.' },
  { key:'tags',           label:'Tags',                      dbColumn:'tags',              defaultAzureField:'System.Tags',
    charts:[], alwaysShow:true, hint:'Campo fixo do Azure DevOps.' },
  { key:'createdBy',      label:'Criado por',                dbColumn:'created_by',        defaultAzureField:'System.CreatedBy',
    charts:[], alwaysShow:true, hint:'Campo fixo do Azure DevOps.', isIdentity:true },
  { key:'closedDate',     label:'Data de Fechamento',        dbColumn:'closed_date',       defaultAzureField:'Microsoft.VSTS.Common.ClosedDate',
    charts:[], alwaysShow:true, hint:'Pode variar conforme o template de processo.' },
  { key:'priority',       label:'Prioridade',                dbColumn:'priority',          defaultAzureField:'Microsoft.VSTS.Common.Priority',
    charts:[], alwaysShow:true, hint:'Pode variar conforme o template de processo.' },
  { key:'activatedDate',  label:'Data de Ativacao',          dbColumn:'first_activation_date', defaultAzureField:'Microsoft.VSTS.Common.ActivatedDate',
    charts:[], alwaysShow:true, hint:'Usado no calculo de Cycle Time. Pode variar conforme o template de processo.' },
  { key:'rootCauseLegacy',label:'Root Cause (legado CMMI)',  dbColumn:'root_cause_legacy', defaultAzureField:'Microsoft.VSTS.CMMI.RootCause',
    charts:[], alwaysShow:true, hint:'So existe em processos CMMI.' },
];

// ─── Hook para ler/salvar mapeamentos ─────────────────────────────────────────
export function useFieldMappings() {
  const { token } = useAuth();
  const [mappings, setMappings] = useState<Record<string,string>>({});
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    if (!token) return;
    try {
      const r = await fetch(`${API}/api/settings/field_mappings`, { headers: { Authorization: `Bearer ${token}` } });
      if (r.ok) {
        const d = await r.json();
        if (d.value) setMappings(typeof d.value === 'string' ? JSON.parse(d.value) : d.value);
      }
    } catch {}
  }, [token]);

  useEffect(() => { load(); }, [load]);

  const save = useCallback(async (newMappings: Record<string,string>) => {
    if (!token) return false;
    setLoading(true);
    try {
      const r = await fetch(`${API}/api/settings/field_mappings`, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ value: newMappings }),
      });
      if (r.ok) { setMappings(newMappings); return true; }
      return false;
    } catch { return false; } finally { setLoading(false); }
  }, [token]);

  const getField = (key: string) =>
    mappings[key] || ALL_FIELD_DEFS.find(f => f.key === key)?.defaultAzureField || '';

  return { mappings, loading, save, getField, reload: load };
}

// ─── Catalogo real de campos do Azure DevOps (metadados do processo) ─────────
export interface AzureFieldMeta { name: string; referenceName: string; type: string; isIdentity: boolean; isPicklist: boolean; }

let _catalogCache: { fields: AzureFieldMeta[]; fetchedAt: number } | null = null;

export function useAzureFieldsCatalog() {
  const { token } = useAuth();
  const [fields, setFields] = useState<AzureFieldMeta[]>(_catalogCache?.fields || []);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async (force = false) => {
    if (!token) return;
    if (!force && _catalogCache && Date.now() - _catalogCache.fetchedAt < 5 * 60 * 1000) {
      setFields(_catalogCache.fields);
      return;
    }
    setLoading(true); setError('');
    try {
      const r = await fetch(`${API}/api/admin/azure-fields${force ? '?refresh=1' : ''}`,
        { headers: { Authorization: `Bearer ${token}` } });
      if (r.ok) {
        const d = await r.json();
        _catalogCache = { fields: d.fields, fetchedAt: Date.now() };
        setFields(d.fields);
      } else {
        setError('Nao foi possivel carregar o catalogo de campos.');
      }
    } catch {
      setError('Erro de conexao ao buscar catalogo.');
    } finally {
      setLoading(false);
    }
  }, [token]);

  return { fields, loading, error, load };
}

// ─── Combobox de busca no catalogo de campos ──────────────────────────────────
const AzureFieldCombobox: React.FC<{
  value: string; onChange: (v: string) => void; catalog: AzureFieldMeta[]; disabled?: boolean;
}> = ({ value, onChange, catalog, disabled }) => {
  const [query, setQuery] = useState(value);
  const [open, setOpen] = useState(false);

  useEffect(() => { setQuery(value); }, [value]);

  const filtered = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = !q ? catalog : catalog.filter(f =>
      f.name.toLowerCase().includes(q) || f.referenceName.toLowerCase().includes(q)
    );
    return list.slice(0, 30);
  }, [query, catalog]);

  return (
    <div className="relative flex-1">
      <input
        value={query}
        onChange={e => { setQuery(e.target.value); onChange(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        disabled={disabled}
        className="w-full bg-ds-dark-blue border border-ds-border rounded px-3 py-1.5 text-xs text-ds-light-text focus:outline-none focus:border-ds-green font-mono"
        placeholder="Digite ou selecione um campo..."
      />
      {open && !disabled && filtered.length > 0 && (
        <ul className="absolute z-10 mt-1 w-full max-h-56 overflow-y-auto bg-ds-navy border border-ds-border rounded shadow-2xl">
          {filtered.map(f => (
            <li key={f.referenceName}
              onMouseDown={() => { onChange(f.referenceName); setQuery(f.referenceName); setOpen(false); }}
              className="px-3 py-1.5 text-xs hover:bg-ds-dark-blue cursor-pointer flex justify-between gap-2"
            >
              <span className="text-ds-light-text truncate">{f.name}</span>
              <span className="text-ds-text/40 font-mono shrink-0">{f.referenceName}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

// ─── Campos criticos: alcance sobre o dashboard inteiro (nao so 1-2 graficos) ──
const CRITICAL_KEYS = ['state', 'type', 'assignedTo', 'title', 'areaPath'];

interface PreviewResult { loading: boolean; samples: { workItemId: number; value: string | null }[]; hasData: boolean; error?: string; }

// ─── Modal de configuracao ────────────────────────────────────────────────────
interface FieldMappingModalProps { chartId: string; onClose: () => void; }

export const FieldMappingModal: React.FC<FieldMappingModalProps> = ({ chartId, onClose }) => {
  const { isAdmin, token } = useAuth();
  const { mappings, loading, save } = useFieldMappings();
  const { fields: catalog, loading: catalogLoading, error: catalogError, load: loadCatalog } = useAzureFieldsCatalog();
  const [local, setLocal] = useState<Record<string,string>>({});
  const [saved, setSaved] = useState(false);
  const [err, setErr] = useState('');
  const [confirmingCritical, setConfirmingCritical] = useState(false);
  const [previewState, setPreviewState] = useState<Record<string, PreviewResult>>({});

  const relevant = chartId === '__all__'
    ? ALL_FIELD_DEFS
    : ALL_FIELD_DEFS.filter(f => f.alwaysShow || f.charts.some(c => c.includes(chartId)));

  useEffect(() => {
    const init: Record<string,string> = {};
    relevant.forEach(f => { init[f.key] = mappings[f.key] || f.defaultAzureField; });
    setLocal(init);
  }, [mappings]);

  useEffect(() => { loadCatalog(); }, [loadCatalog]);

  const updateLocal = (key: string, value: string) => {
    setConfirmingCritical(false);
    setLocal(m => ({ ...m, [key]: value }));
  };

  const testField = async (key: string, fieldRef: string) => {
    if (!token || !fieldRef) return;
    setPreviewState(p => ({ ...p, [key]: { loading: true, samples: [], hasData: false } }));
    try {
      const r = await fetch(`${API}/api/admin/field-preview?field=${encodeURIComponent(fieldRef)}`,
        { headers: { Authorization: `Bearer ${token}` } });
      const d = await r.json();
      setPreviewState(p => ({ ...p, [key]: { loading: false, samples: d.samples || [], hasData: !!d.hasData, error: d.error } }));
    } catch {
      setPreviewState(p => ({ ...p, [key]: { loading: false, samples: [], hasData: false, error: 'Erro de conexao ao testar o campo.' } }));
    }
  };

  const handleSave = async () => {
    setErr('');
    const changedCritical = CRITICAL_KEYS.some(key => {
      if (!(key in local)) return false;
      const def = ALL_FIELD_DEFS.find(f => f.key === key);
      const before = mappings[key] || def?.defaultAzureField || '';
      return local[key] !== before;
    });
    if (changedCritical && !confirmingCritical) {
      setConfirmingCritical(true);
      return;
    }
    setConfirmingCritical(false);
    const ok = await save({ ...mappings, ...local });
    if (ok) { setSaved(true); setTimeout(onClose, 1800); }
    else setErr('Erro ao salvar. Verifique sua conexao.');
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-ds-navy border border-ds-border rounded-xl w-full max-w-2xl max-h-[90vh] flex flex-col shadow-2xl" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-ds-border">
          <div>
            <h3 className="font-bold text-ds-light-text">Configurar Campos Azure DevOps</h3>
            <p className="text-xs text-ds-text mt-0.5">
              Escolha de onde cada dado deve ser puxado no <strong>seu</strong> Azure DevOps.
              Sera aplicado no proximo sincronismo.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <button onClick={() => loadCatalog(true)} disabled={catalogLoading}
              className="text-xs text-ds-text/50 hover:text-ds-green disabled:opacity-50 transition-colors"
              title="Recarregar catalogo de campos do Azure DevOps">
              {catalogLoading ? 'Atualizando...' : '🔄 Atualizar catalogo'}
            </button>
            <button onClick={onClose} className="text-ds-muted hover:text-white text-xl leading-none">&times;</button>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-3">
          {catalogError && (
            <p className="text-amber-400 text-xs bg-amber-900/20 border border-amber-900/40 rounded px-3 py-2">
              ⚠️ {catalogError} Voce ainda pode digitar o nome do campo manualmente.
            </p>
          )}
          {relevant.length === 0 && (
            <p className="text-ds-text text-sm text-center py-8">Nenhum campo configuravel para este grafico.</p>
          )}
          {relevant.map(f => {
            const current = local[f.key] ?? f.defaultAzureField;
            const isCustomized = current !== f.defaultAzureField;
            const inCatalog = catalog.length === 0 || catalog.some(ff => ff.referenceName === current);
            const isCritical = CRITICAL_KEYS.includes(f.key);
            const preview = previewState[f.key];
            return (
              <div key={f.key} className={`bg-ds-dark-blue rounded border p-3 ${isCritical ? 'border-amber-600/50' : 'border-ds-border'}`}>
                <div className="flex items-center gap-2 mb-2 flex-wrap">
                  <span className="text-ds-light-text text-sm font-medium">{f.label}</span>
                  {f.isIdentity && <span className="text-xs bg-purple-900/40 text-purple-300 px-1.5 py-0.5 rounded">identity</span>}
                  {isCustomized && <span className="text-xs bg-amber-900/40 text-amber-300 px-1.5 py-0.5 rounded">customizado</span>}
                  {isCritical && <span className="text-xs bg-red-900/40 text-red-300 px-1.5 py-0.5 rounded">⚠️ critico — usado em todo o dashboard</span>}
                  <span className="text-xs text-ds-text/50 ml-auto font-mono">banco: <span className="text-blue-300">{f.dbColumn}</span></span>
                </div>

                <div className="grid grid-cols-[auto_1fr] gap-x-2 gap-y-1 text-xs mb-2">
                  <span className="text-ds-text/50">Puxando agora:</span>
                  <span className={`font-mono ${inCatalog ? 'text-ds-green' : 'text-amber-400'}`}>
                    {current}{!inCatalog && ' (nao encontrado no catalogo do Azure DevOps)'}
                  </span>
                  <span className="text-ds-text/50">Padrao do sistema:</span>
                  <span className="font-mono text-ds-text/70">{f.defaultAzureField}</span>
                </div>

                <div className="flex gap-2 items-center">
                  <AzureFieldCombobox
                    value={current}
                    onChange={v => updateLocal(f.key, v)}
                    catalog={catalog}
                    disabled={!isAdmin}
                  />
                  <button
                    onClick={() => testField(f.key, current)}
                    disabled={preview?.loading}
                    className="text-xs text-ds-text/50 hover:text-ds-cyan shrink-0 px-2 py-1 border border-ds-border rounded disabled:opacity-50"
                    title="Testar este campo contra dados reais do Azure DevOps"
                  >
                    {preview?.loading ? '⏳' : '🔍 Testar'}
                  </button>
                  {isCustomized && (
                    <button
                      onClick={() => updateLocal(f.key, f.defaultAzureField)}
                      className="text-xs text-ds-text/50 hover:text-ds-text shrink-0 px-2 py-1 border border-ds-border rounded"
                      title="Restaurar padrao"
                    >
                      reset
                    </button>
                  )}
                </div>
                {preview && (
                  <p className={`text-xs mt-1 ${preview.error ? 'text-amber-400' : preview.hasData ? 'text-ds-green' : 'text-ds-text/50'}`}>
                    {preview.loading ? 'Testando...' :
                      preview.error ? `⚠️ ${preview.error}` :
                      preview.hasData ? `Valores encontrados: ${preview.samples.map(s => s.value).filter(Boolean).join(', ')}` :
                      'Nenhum dado encontrado para este campo nos itens recentes.'}
                  </p>
                )}
                {f.hint && <p className="text-ds-text/50 text-xs mt-1">Dica: {f.hint}</p>}
                <p className="text-ds-text/40 text-xs mt-0.5">
                  Graficos: {f.alwaysShow ? 'campo padrao, usado em todos os graficos' : (f.charts.length ? f.charts.join(', ') : 'nenhum grafico usa este campo ainda')}
                </p>
              </div>
            );
          })}
        </div>

        {/* Footer */}
        <div className="px-5 py-4 border-t border-ds-border flex items-center justify-between gap-3">
          <div className="flex-1 text-xs min-w-0">
            {err   && <span className="text-red-400">{err}</span>}
            {saved && <span className="text-ds-green">Salvo! Sera aplicado no proximo sincronismo.</span>}
            {confirmingCritical && !saved && !err && (
              <span className="text-amber-400">⚠️ Voce alterou um campo critico (afeta todo o dashboard). Clique de novo pra confirmar.</span>
            )}
            {!isAdmin && !err && !saved && !confirmingCritical && <span className="text-ds-text/50">Apenas admins podem alterar os mapeamentos.</span>}
          </div>
          <div className="flex gap-2 shrink-0">
            <button onClick={onClose}
              className="px-4 py-2 text-sm border border-ds-border rounded-lg text-ds-text hover:border-ds-green/30 transition-colors">
              Fechar
            </button>
            {isAdmin && (
              <button onClick={handleSave} disabled={loading || saved}
                className={`px-4 py-2 text-sm font-bold rounded-lg disabled:opacity-50 transition-all ${
                  confirmingCritical ? 'bg-amber-500 text-ds-dark-blue hover:brightness-110' : 'bg-ds-green text-ds-dark-blue hover:brightness-110'}`}>
                {loading ? 'Salvando...' : saved ? 'Salvo!' : confirmingCritical ? 'Confirmar alteracao critica?' : 'Salvar'}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

// ─── Botao de engrenagem (usar no titulo dos graficos) ────────────────────────
interface FieldMappingButtonProps { chartId: string; className?: string; }

export const FieldMappingButton: React.FC<FieldMappingButtonProps> = ({ chartId, className = '' }) => {
  const { isAdmin } = useAuth();
  const [open, setOpen] = useState(false);
  if (!isAdmin) return null;
  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className={`text-ds-text/40 hover:text-ds-green transition-colors p-1 rounded ${className}`}
        title="Configurar campos Azure DevOps para este grafico"
      >
        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
        </svg>
      </button>
      {open && <FieldMappingModal chartId={chartId} onClose={() => setOpen(false)} />}
    </>
  );
};
