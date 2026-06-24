import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';

// ─── types ────────────────────────────────────────────────────────────────────
type QAStatus = 'pending' | 'done' | 'blocked';

interface QARecord {
  id?: number;
  work_item_id: number;
  version: string;
  qa_person?: string;
  status: QAStatus;
  obs?: string;
  cts: string[];
  attachments: Attachment[];
  override_desc?: string;
  override_client?: string;
  override_tipo?: string;
  override_area?: string;
}

interface Attachment {
  name: string;
  data: string; // base64
  type: string;
}

interface DevOpsItem {
  work_item_id: number;
  title: string;
  type: string;
  area_path: string;
  assigned_to?: string;
  qa?: string;
  state?: string;
  priority?: number;
  tags?: string;
  delivered_version?: string;
  tipo_cliente?: string;
  story_points?: number;
  complexity?: string;
  squad?: string;
  dev?: string;
  po?: string;
  url?: string;
}

interface MergedItem extends DevOpsItem {
  record?: QARecord;
  display_desc: string;
  display_client: string;
  display_tipo: string;
  display_area: string;
}

// ─── constants ────────────────────────────────────────────────────────────────
const API = import.meta.env.VITE_API_URL || '';

const STATUS_CFG: Record<QAStatus, { label: string; icon: string; bg: string; text: string; border: string }> = {
  pending:  { label: 'Pendente',  icon: '⏳', bg: 'bg-yellow-500/10', text: 'text-yellow-400', border: 'border-yellow-500/30' },
  done:     { label: 'Testado',   icon: '✅', bg: 'bg-green-500/10',  text: 'text-green-400',  border: 'border-green-500/30' },
  blocked:  { label: 'Bloqueado', icon: '🔒', bg: 'bg-red-500/10',    text: 'text-red-400',    border: 'border-red-500/30'   },
};

const TIPO_CFG: Record<string, { bg: string; text: string }> = {
  'Bug':      { bg: 'bg-red-500/15',     text: 'text-red-400'    },
  'Issue':    { bg: 'bg-orange-500/15',  text: 'text-orange-400' },
  'Melhoria': { bg: 'bg-ds-green/15',    text: 'text-ds-green'   },
  'Feature':  { bg: 'bg-ds-cyan/15',     text: 'text-ds-cyan'    },
  'default':  { bg: 'bg-ds-muted/30',    text: 'text-ds-text'    },
};

const MAX_IMG_PX = 1200;
const MAX_FILE_SIZE = 4 * 1024 * 1024;

// ─── helpers ──────────────────────────────────────────────────────────────────
function tipoCfg(type: string) {
  return TIPO_CFG[type] ?? TIPO_CFG['default'];
}

function pct(a: number, b: number) { return b === 0 ? 0 : Math.round((a / b) * 100); }

function compressImage(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        let { width, height } = img;
        if (width > MAX_IMG_PX || height > MAX_IMG_PX) {
          const ratio = Math.min(MAX_IMG_PX / width, MAX_IMG_PX / height);
          width = Math.round(width * ratio);
          height = Math.round(height * ratio);
        }
        const canvas = document.createElement('canvas');
        canvas.width = width; canvas.height = height;
        const ctx = canvas.getContext('2d')!;
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', 0.82));
      };
      img.onerror = reject;
      img.src = e.target!.result as string;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

async function processFiles(files: File[]): Promise<Attachment[]> {
  const result: Attachment[] = [];
  for (const file of files) {
    if (file.size > MAX_FILE_SIZE) continue;
    let data: string;
    if (file.type.startsWith('image/')) {
      data = await compressImage(file);
    } else {
      data = await new Promise((res, rej) => {
        const r = new FileReader();
        r.onload = () => res(r.result as string);
        r.onerror = rej;
        r.readAsDataURL(file);
      });
    }
    result.push({ name: file.name, data, type: file.type });
  }
  return result;
}

// ─── Lightbox ─────────────────────────────────────────────────────────────────
const Lightbox: React.FC<{
  images: Attachment[];
  index: number;
  onClose: () => void;
  onNav: (dir: number) => void;
}> = ({ images, index, onClose, onNav }) => {
  const att = images[index];
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowLeft') onNav(-1);
      if (e.key === 'ArrowRight') onNav(1);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose, onNav]);
  if (!att || !att.type.startsWith('image/')) return null;
  return (
    <div className="fixed inset-0 z-[300] flex items-center justify-center bg-black/85 backdrop-blur-sm" onClick={onClose}>
      <button className="absolute top-4 right-5 w-9 h-9 rounded-full bg-white/15 text-white text-xl flex items-center justify-center hover:bg-white/30" onClick={onClose}>&times;</button>
      {images.length > 1 && <>
        <button className="absolute left-4 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-white/12 text-white text-xl flex items-center justify-center hover:bg-white/25" onClick={(e) => { e.stopPropagation(); onNav(-1); }}>‹</button>
        <button className="absolute right-4 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-white/12 text-white text-xl flex items-center justify-center hover:bg-white/25" onClick={(e) => { e.stopPropagation(); onNav(1); }}>›</button>
      </>}
      <img src={att.data} alt={att.name} className="max-w-[92vw] max-h-[90vh] rounded-lg object-contain shadow-2xl" onClick={(e) => e.stopPropagation()} />
      <div className="absolute bottom-5 left-1/2 -translate-x-1/2 text-xs text-white/70 bg-black/40 px-4 py-1.5 rounded-full">{att.name}</div>
    </div>
  );
};

// ─── EditModal ─────────────────────────────────────────────────────────────────
const EditModal: React.FC<{
  item: MergedItem;
  onClose: () => void;
  onSaved: (record: QARecord) => void;
  token: string;
  version: string;
  qaPersons: string[];
}> = ({ item, onClose, onSaved, token, version, qaPersons }) => {
  const rec = item.record;
  const [qaP, setQaP] = useState(rec?.qa_person ?? item.qa ?? '');
  const [status, setStatus] = useState<QAStatus>(rec?.status ?? 'pending');
  const [obs, setObs] = useState(rec?.obs ?? '');
  const [cts, setCts] = useState<string[]>(rec?.cts ?? []);
  const [ctInput, setCtInput] = useState('');
  const [attachments, setAttachments] = useState<Attachment[]>(rec?.attachments ?? []);
  const [overrideDesc, setOverrideDesc] = useState(rec?.override_desc ?? '');
  const [overrideClient, setOverrideClient] = useState(rec?.override_client ?? '');
  const [overrideTipo, setOverrideTipo] = useState(rec?.override_tipo ?? '');
  const [overrideArea, setOverrideArea] = useState(rec?.override_area ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [lbIdx, setLbIdx] = useState<number | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const imgAttachments = attachments.filter(a => a.type.startsWith('image/'));

  const addCt = () => {
    const t = ctInput.trim();
    if (!t) return;
    setCts(prev => [...prev, t]);
    setCtInput('');
  };

  const handleFiles = async (files: File[]) => {
    const newAtts = await processFiles(files);
    setAttachments(prev => [...prev, ...newAtts]);
  };

  const handlePaste = useCallback((e: ClipboardEvent) => {
    const items = Array.from(e.clipboardData?.items ?? []);
    const imgItems = items.filter(i => i.type.startsWith('image/'));
    if (imgItems.length) {
      e.preventDefault();
      const files = imgItems.map(i => i.getAsFile()).filter(Boolean) as File[];
      handleFiles(files);
    }
  }, []);

  useEffect(() => {
    document.addEventListener('paste', handlePaste);
    return () => document.removeEventListener('paste', handlePaste);
  }, [handlePaste]);

  const handleSave = async () => {
    setSaving(true); setError('');
    const body: QARecord = {
      work_item_id: item.work_item_id,
      version,
      qa_person: qaP || undefined,
      status,
      obs: obs || undefined,
      cts,
      attachments,
      override_desc: overrideDesc || undefined,
      override_client: overrideClient || undefined,
      override_tipo: overrideTipo || undefined,
      override_area: overrideArea || undefined,
    };
    try {
      const method = rec?.id ? 'PUT' : 'POST';
      const url = rec?.id ? `${API}/api/qa-tracker/records/${rec.id}` : `${API}/api/qa-tracker/records`;
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(body),
      });
      if (!res.ok) { const d = await res.json().catch(() => ({ error: `HTTP ${res.status}` })); throw new Error(d.error || `Erro ${res.status}`); }
      const saved = await res.json();
      onSaved({ ...body, id: saved.id });
    } catch (e: unknown) { setError(e instanceof Error ? e.message : 'Erro'); } finally { setSaving(false); }
  };

  const handleDelete = async () => {
    if (!rec?.id || !confirm('Remover este registro de QA?')) return;
    setSaving(true);
    const fallback: QARecord = { work_item_id: item.work_item_id, version, status: 'pending', cts: [], attachments: [] };
    try {
      const res = await fetch(`${API}/api/qa-tracker/records/${rec.id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      onSaved({ ...fallback, id: undefined });
    } catch (e: unknown) { setError(e instanceof Error ? e.message : 'Erro'); } finally { setSaving(false); }
  };

  const inputCls = 'w-full bg-ds-dark-blue border border-ds-border text-ds-light-text rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-ds-green placeholder:text-ds-text/40';

  return (
    <div className="fixed inset-0 z-200 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-ds-navy border border-ds-border rounded-2xl shadow-2xl w-full max-w-2xl mx-4 max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-ds-border">
          <div className="flex items-center gap-3">
            <span className="font-mono text-ds-green text-sm font-semibold">#{item.work_item_id}</span>
            <span className={`text-xs px-2 py-0.5 rounded-md font-medium ${tipoCfg(item.display_tipo).bg} ${tipoCfg(item.display_tipo).text}`}>{item.display_tipo}</span>
            {item.url && (
              <a href={item.url} target="_blank" rel="noopener noreferrer" className="text-xs text-ds-text hover:text-ds-green transition-colors">↗ DevOps</a>
            )}
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-lg bg-ds-muted/30 text-ds-text hover:bg-ds-muted transition-colors flex items-center justify-center text-lg">&times;</button>
        </div>

        <div className="p-5 space-y-5">
          {error && <div className="text-red-400 text-xs bg-red-500/10 border border-red-500/20 rounded-lg p-3">{error}</div>}

          {/* DADOS DO ITEM */}
          <div className="bg-ds-dark-blue rounded-xl border border-ds-border p-4 space-y-3">
            <p className="text-[10px] font-semibold text-ds-text uppercase tracking-wider">📋 Dados do Item (editável localmente)</p>
            <div className="space-y-1">
              <label className="text-xs text-ds-text">Descrição</label>
              <textarea value={overrideDesc} onChange={e => setOverrideDesc(e.target.value)}
                placeholder={item.title} rows={2}
                className={`${inputCls} resize-none`} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-xs text-ds-text">Cliente</label>
                <input value={overrideClient} onChange={e => setOverrideClient(e.target.value)}
                  placeholder={item.display_client || '—'} className={inputCls} />
              </div>
              <div className="space-y-1">
                <label className="text-xs text-ds-text">Tipo</label>
                <select value={overrideTipo || item.type} onChange={e => setOverrideTipo(e.target.value)}
                  title="Tipo do item" className={inputCls}>
                  <option value="">— padrão DevOps —</option>
                  {['Melhoria', 'Bug', 'Issue', 'Feature', 'Task', 'Correção'].map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              <div className="space-y-1">
                <label className="text-xs text-ds-text">Área</label>
                <input value={overrideArea} onChange={e => setOverrideArea(e.target.value)}
                  placeholder={item.display_area || '—'} className={inputCls} />
              </div>
              <div className="space-y-1">
                <label className="text-xs text-ds-text">QA Responsável</label>
                <select value={qaP} onChange={e => setQaP(e.target.value)}
                  title="QA Responsável" className={inputCls}>
                  <option value="">— não atribuído —</option>
                  {qaPersons.map(n => <option key={n} value={n}>{n}</option>)}
                </select>
              </div>
            </div>
          </div>

          {/* EVIDÊNCIA DE TESTE */}
          <div className="bg-ds-dark-blue rounded-xl border border-ds-border p-4 space-y-4">
            <p className="text-[10px] font-semibold text-ds-text uppercase tracking-wider">🧪 Evidência de Teste</p>

            {/* Status */}
            <div className="space-y-1.5">
              <label className="text-xs text-ds-text">Status</label>
              <div className="flex gap-2">
                {(Object.entries(STATUS_CFG) as [QAStatus, typeof STATUS_CFG[QAStatus]][]).map(([s, cfg]) => (
                  <button key={s} onClick={() => setStatus(s)}
                    className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg border text-sm font-medium transition-colors ${status === s ? `${cfg.bg} ${cfg.text} ${cfg.border}` : 'border-ds-border text-ds-text hover:border-ds-green/40 hover:text-ds-light-text'}`}>
                    {cfg.icon} {cfg.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Casos de Teste */}
            <div className="space-y-1.5">
              <label className="text-xs text-ds-text">Casos de Teste</label>
              <div className="flex gap-2">
                <input value={ctInput} onChange={e => setCtInput(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addCt(); } }}
                  placeholder="Descrever caso de teste e pressionar Enter"
                  className={inputCls} />
                <button onClick={addCt} className="px-3 py-2 bg-ds-green/15 text-ds-green border border-ds-green/30 rounded-lg text-sm hover:bg-ds-green/25 transition-colors">+</button>
              </div>
              {cts.length > 0 && (
                <div className="flex flex-wrap gap-2 pt-1">
                  {cts.map((ct, i) => (
                    <span key={i} className="flex items-center gap-1.5 bg-ds-muted/20 border border-ds-border rounded-lg px-3 py-1.5 text-xs text-ds-light-text">
                      <span className="text-ds-green font-mono">CT-{String(i + 1).padStart(2, '0')}</span>
                      {ct}
                      <button onClick={() => setCts(prev => prev.filter((_, j) => j !== i))} className="text-ds-text hover:text-red-400 ml-1 text-sm leading-none transition-colors">&times;</button>
                    </span>
                  ))}
                </div>
              )}
            </div>

            {/* Observações */}
            <div className="space-y-1.5">
              <label className="text-xs text-ds-text">Observações</label>
              <textarea value={obs} onChange={e => setObs(e.target.value)} rows={3}
                placeholder="Resultado do teste, comportamento observado, notas..."
                className={`${inputCls} resize-none`} />
            </div>

            {/* Evidências */}
            <div className="space-y-2">
              <label className="text-xs text-ds-text">Evidências (imagens / arquivos)</label>
              <div
                className={`border-2 border-dashed rounded-xl p-5 text-center cursor-pointer transition-colors ${dragOver ? 'border-ds-green bg-ds-green/5' : 'border-ds-border bg-ds-dark-blue hover:border-ds-green/50'}`}
                onDragOver={e => { e.preventDefault(); setDragOver(true); }}
                onDragLeave={() => setDragOver(false)}
                onDrop={e => { e.preventDefault(); setDragOver(false); if (e.dataTransfer.files.length) handleFiles(Array.from(e.dataTransfer.files)); }}
                onClick={() => document.getElementById('qa-file-input')?.click()}
              >
                <div className="text-2xl mb-1">📎</div>
                <p className="text-sm text-ds-text">Arrastar arquivos ou <strong className="text-ds-green">clicar para selecionar</strong></p>
                <p className="text-xs text-ds-text/50 mt-1">Máx 4MB/arquivo · <kbd className="bg-ds-muted/40 px-1.5 py-0.5 rounded text-ds-text text-[10px]">Ctrl+V</kbd> para colar screenshot</p>
              </div>
              <input id="qa-file-input" type="file" multiple accept="image/*,.pdf,.txt,.json,.csv"
                title="Selecionar evidências" aria-label="Selecionar arquivos de evidência" className="hidden"
                onChange={e => { if (e.target.files) handleFiles(Array.from(e.target.files)); }} />

              {attachments.length > 0 && (
                <div className="flex flex-wrap gap-2 pt-1">
                  {attachments.map((att, i) => (
                    <div key={i} className="relative w-20 h-20 rounded-lg overflow-hidden border border-ds-border bg-ds-muted/20 group cursor-pointer"
                      onClick={() => { if (att.type.startsWith('image/')) { const idx = imgAttachments.findIndex(a => a.name === att.name && a.data === att.data); setLbIdx(idx); } }}>
                      {att.type.startsWith('image/')
                        ? <img src={att.data} alt={att.name} className="w-full h-full object-cover" />
                        : <div className="w-full h-full flex flex-col items-center justify-center p-1">
                            <span className="text-2xl">📄</span>
                            <span className="text-[9px] text-ds-text text-center break-all leading-tight mt-1">{att.name}</span>
                          </div>
                      }
                      <button onClick={e => { e.stopPropagation(); setAttachments(prev => prev.filter((_, j) => j !== i)); }}
                        className="absolute top-1 right-1 w-5 h-5 rounded-full bg-black/70 text-white text-xs opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">&times;</button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-5 py-4 border-t border-ds-border">
          {rec?.id
            ? <button onClick={handleDelete} disabled={saving} className="text-xs text-red-400 hover:text-red-300 border border-red-500/30 hover:border-red-400 px-3 py-1.5 rounded-lg transition-colors">🗑 Excluir</button>
            : <span />}
          <div className="flex gap-2">
            <button onClick={onClose} className="px-4 py-2 text-sm bg-ds-muted/30 text-ds-text rounded-lg hover:bg-ds-muted/50 transition-colors border border-ds-border">Cancelar</button>
            <button onClick={handleSave} disabled={saving}
              className="px-5 py-2 text-sm bg-ds-green text-ds-dark-blue font-bold rounded-lg hover:bg-ds-green/80 disabled:opacity-50 transition-colors">
              {saving ? 'Salvando...' : '💾 Salvar'}
            </button>
          </div>
        </div>
      </div>

      {lbIdx !== null && (
        <Lightbox images={imgAttachments} index={lbIdx} onClose={() => setLbIdx(null)}
          onNav={dir => setLbIdx(i => { const next = (i! + dir + imgAttachments.length) % imgAttachments.length; return next; })} />
      )}
    </div>
  );
};

// ─── Main Dashboard ────────────────────────────────────────────────────────────
const QATrackerDashboard: React.FC = () => {
  const { token } = useAuth();

  const [versions,  setVersions]  = useState<string[]>([]);
  const [qaPersons, setQaPersons] = useState<string[]>([]);
  const [version,   setVersion]   = useState<string>(() => localStorage.getItem('qa_tracker_version') || '');
  const [items,     setItems]     = useState<DevOpsItem[]>([]);
  const [records,   setRecords]   = useState<QARecord[]>([]);
  const [loading,   setLoading]   = useState(false);
  const [error,     setError]     = useState('');

  const [search,         setSearch]         = useState('');
  const [filterQA,       setFilterQA]       = useState('');
  const [filterStatus,   setFilterStatus]   = useState<QAStatus | ''>('');
  const [filterTipo,     setFilterTipo]     = useState('');
  const [filterArea,     setFilterArea]     = useState('');
  const [filterHighPrio, setFilterHighPrio] = useState(false);

  const [editingItem, setEditingItem] = useState<MergedItem | null>(null);

  // ── Fetch versions + QA persons on mount ──
  useEffect(() => {
    if (!token) return;
    const headers = { Authorization: `Bearer ${token}` };

    fetch(`${API}/api/qa-tracker/versions`, { headers })
      .then(r => r.json())
      .then((v: string[]) => {
        setVersions(v);
        setVersion(prev => prev || v[0] || '');
      })
      .catch(() => setError('Erro ao carregar versões'));

    fetch(`${API}/api/qa-tracker/qa-persons`, { headers })
      .then(r => r.json())
      .then(setQaPersons)
      .catch(() => {});
  }, [token]);

  // ── Fetch items + records when version changes ──
  const fetchData = useCallback(async () => {
    if (!version || !token) return;
    setLoading(true); setError('');
    try {
      const [itemsRes, recordsRes] = await Promise.all([
        fetch(`${API}/api/qa-tracker/items?version=${encodeURIComponent(version)}`, { headers: { Authorization: `Bearer ${token}` } }),
        fetch(`${API}/api/qa-tracker/records?version=${encodeURIComponent(version)}`, { headers: { Authorization: `Bearer ${token}` } }),
      ]);
      if (itemsRes.ok) setItems(await itemsRes.json());
      if (recordsRes.ok) setRecords(await recordsRes.json());
    } catch { setError('Erro ao carregar dados'); } finally { setLoading(false); }
  }, [version, token]);

  useEffect(() => {
    fetchData();
    if (version) localStorage.setItem('qa_tracker_version', version);
  }, [fetchData, version]);

  // ── Merge items + records ──
  const merged: MergedItem[] = items.map(wi => {
    const rec = records.find(r => r.work_item_id === wi.work_item_id);
    return {
      ...wi,
      record: rec,
      display_desc:   rec?.override_desc   || wi.title,
      display_client: rec?.override_client || wi.tipo_cliente || wi.area_path?.split('\\').pop() || '',
      display_tipo:   rec?.override_tipo   || wi.type || 'Melhoria',
      display_area:   rec?.override_area   || wi.area_path?.split('\\').pop() || '',
    };
  });

  // ── Derived options for dropdowns ──
  const tiposDisponiveis = [...new Set(merged.map(m => m.display_tipo).filter(Boolean))].sort();
  const areasDisponiveis = [...new Set(merged.map(m => m.display_area).filter(Boolean))].sort();

  // ── Filtered ──
  const filtered = merged.filter(m => {
    const s = search.toLowerCase();
    if (s && !m.display_desc.toLowerCase().includes(s) && !String(m.work_item_id).includes(s) && !m.display_client.toLowerCase().includes(s)) return false;
    if (filterQA && (m.record?.qa_person ?? m.qa ?? '') !== filterQA) return false;
    if (filterStatus && (m.record?.status ?? 'pending') !== filterStatus) return false;
    if (filterTipo && m.display_tipo !== filterTipo) return false;
    if (filterArea && m.display_area !== filterArea) return false;
    if (filterHighPrio && (m.priority ?? 99) > 2) return false;
    return true;
  });

  // ── Metrics ──
  const total = merged.length;
  const done = merged.filter(m => (m.record?.status ?? 'pending') === 'done').length;
  const blocked = merged.filter(m => (m.record?.status ?? 'pending') === 'blocked').length;
  const pending = total - done - blocked;

  // ── QA grouping for sidebar ──
  const qaGroups: Record<string, number> = {};
  merged.forEach(m => {
    const key = m.record?.qa_person ?? m.qa ?? '—';
    qaGroups[key] = (qaGroups[key] || 0) + 1;
  });

  // ── onSaved ──
  const handleSaved = (saved: QARecord) => {
    if (!saved.id) {
      setRecords(prev => prev.filter(r => r.work_item_id !== saved.work_item_id));
    } else {
      setRecords(prev => {
        const existing = prev.findIndex(r => r.work_item_id === saved.work_item_id);
        if (existing >= 0) { const arr = [...prev]; arr[existing] = saved; return arr; }
        return [...prev, saved];
      });
    }
    setEditingItem(null);
  };

  const hasActiveFilters = filterStatus || filterTipo || filterArea || filterHighPrio || search;
  const selectCls = 'bg-ds-dark-blue border border-ds-border text-ds-text rounded-lg px-2.5 py-1.5 text-xs focus:outline-none focus:border-ds-green';

  return (
    <div className="flex min-h-[80vh] h-full">
      {/* ── Sidebar ── */}
      <aside className="w-56 shrink-0 bg-ds-dark-blue border-r border-ds-border flex flex-col overflow-y-auto">
        {/* Logo */}
        <div className="px-4 py-4 border-b border-ds-border">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl flex items-center justify-center text-ds-dark-blue font-bold text-sm bg-gradient-to-br from-ds-green to-ds-cyan">QA</div>
            <div>
              <div className="text-sm font-semibold text-ds-light-text">QA Tracker</div>
              <div className="text-xs text-ds-text">Evidências de Teste</div>
            </div>
          </div>
        </div>

        {/* Version selector */}
        <div className="px-3 py-3 border-b border-ds-border">
          <label className="text-[10px] font-semibold uppercase tracking-wider text-ds-text block mb-1.5">Versão</label>
          <select value={version} onChange={e => setVersion(e.target.value)}
            title="Selecionar versão"
            className="w-full bg-ds-navy border border-ds-border text-ds-light-text rounded-lg px-2.5 py-2 text-sm focus:outline-none focus:border-ds-green font-mono">
            {versions.length === 0 && <option value="">Carregando...</option>}
            {versions.map(v => <option key={v} value={v}>{v}</option>)}
          </select>
        </div>

        {/* QA nav */}
        <nav className="flex-1 px-2 py-3 space-y-1">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-ds-text px-2 mb-1.5">Por QA</div>
          <button onClick={() => setFilterQA('')}
            className={`w-full flex items-center justify-between px-2.5 py-2 rounded-lg text-sm transition-colors ${!filterQA ? 'bg-ds-green/15 text-ds-green font-medium' : 'text-ds-text hover:bg-ds-muted/30 hover:text-ds-light-text'}`}>
            <span>Todos</span>
            <span className={`text-xs px-1.5 py-0.5 rounded-full ${!filterQA ? 'bg-ds-green/20 text-ds-green' : 'bg-ds-muted/30 text-ds-text'}`}>{total}</span>
          </button>
          {Object.entries(qaGroups).sort((a, b) => b[1] - a[1]).map(([name, count]) => (
            <button key={name} onClick={() => setFilterQA(name === filterQA ? '' : name)}
              className={`w-full flex items-center justify-between px-2.5 py-2 rounded-lg text-sm transition-colors ${filterQA === name ? 'bg-ds-green/15 text-ds-green font-medium' : 'text-ds-text hover:bg-ds-muted/30 hover:text-ds-light-text'}`}>
              <span className="truncate">{name}</span>
              <span className={`text-xs px-1.5 py-0.5 rounded-full shrink-0 ${filterQA === name ? 'bg-ds-green/20 text-ds-green' : 'bg-ds-muted/30 text-ds-text'}`}>{count}</span>
            </button>
          ))}
        </nav>

        {/* Legend */}
        <div className="px-3 py-3 border-t border-ds-border space-y-1.5">
          {(Object.entries(STATUS_CFG) as [QAStatus, typeof STATUS_CFG[QAStatus]][]).map(([, cfg]) => (
            <div key={cfg.label} className={`flex items-center gap-2 text-xs ${cfg.text}`}>
              <span>{cfg.icon}</span><span>{cfg.label}</span>
            </div>
          ))}
        </div>
      </aside>

      {/* ── Main ── */}
      <div className="flex-1 flex flex-col overflow-hidden bg-ds-navy">

        {/* Topbar */}
        <div className="bg-ds-dark-blue border-b border-ds-border px-5 py-3 flex items-center gap-3">
          <h2 className="text-base font-semibold text-ds-light-text whitespace-nowrap">
            {version ? <>v<span className="text-ds-green font-mono">{version}</span></> : 'Selecione uma versão'}
          </h2>
          <div className="flex-1" />
          <div className="relative">
            <input value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Buscar item, ID, cliente..."
              className="w-64 bg-ds-navy border border-ds-border text-ds-light-text rounded-lg pl-8 pr-3 py-1.5 text-sm focus:outline-none focus:border-ds-green placeholder:text-ds-text/50" />
            <span className="absolute left-2.5 top-2 text-ds-text text-sm">🔍</span>
            {search && (
              <button onClick={() => setSearch('')} className="absolute right-2.5 top-2 text-ds-text hover:text-ds-light-text">&times;</button>
            )}
          </div>
        </div>

        {/* Filter bar */}
        <div className="bg-ds-dark-blue border-b border-ds-border px-5 py-2.5 flex flex-wrap items-center gap-2">
          {([['', 'Todos'], ['pending', '⏳ Pendentes'], ['done', '✅ Testados'], ['blocked', '🔒 Bloqueados']] as [string, string][]).map(([s, label]) => (
            <button key={s} onClick={() => setFilterStatus(s as QAStatus | '')}
              className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${filterStatus === s ? 'bg-ds-green/15 text-ds-green border-ds-green/40 font-semibold' : 'bg-transparent text-ds-text border-ds-border hover:border-ds-green/40 hover:text-ds-light-text'}`}>
              {label}
            </button>
          ))}

          <div className="w-px h-4 bg-ds-border mx-1 hidden sm:block" />

          {tiposDisponiveis.length > 1 && (
            <select value={filterTipo} onChange={e => setFilterTipo(e.target.value)}
              title="Filtrar por tipo" className={selectCls}>
              <option value="">Todos os tipos</option>
              {tiposDisponiveis.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          )}

          {areasDisponiveis.length > 1 && (
            <select value={filterArea} onChange={e => setFilterArea(e.target.value)}
              title="Filtrar por área" className={selectCls}>
              <option value="">Todas as áreas</option>
              {areasDisponiveis.map(a => <option key={a} value={a}>{a}</option>)}
            </select>
          )}

          <button onClick={() => setFilterHighPrio(f => !f)}
            className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${filterHighPrio ? 'bg-red-500/15 text-red-400 border-red-500/30 font-semibold' : 'bg-transparent text-ds-text border-ds-border hover:border-red-400/40 hover:text-red-400'}`}>
            🔴 Alta prio
          </button>

          {hasActiveFilters && (
            <button onClick={() => { setSearch(''); setFilterStatus(''); setFilterTipo(''); setFilterArea(''); setFilterHighPrio(false); }}
              className="ml-auto text-xs text-ds-text hover:text-ds-green border border-ds-border hover:border-ds-green/40 px-2.5 py-1.5 rounded-lg transition-colors">
              ✕ Limpar
            </button>
          )}
        </div>

        {/* Metric cards */}
        <div className="grid grid-cols-4 gap-3 px-5 py-3 border-b border-ds-border bg-ds-dark-blue">
          {[
            { label: 'Total',          value: total,                            color: 'text-ds-green'   },
            { label: '✅ Testados',     value: `${done} (${pct(done, total)}%)`, color: 'text-green-400' },
            { label: '⏳ Pendentes',    value: pending,                          color: 'text-yellow-400'},
            { label: '🔒 Bloqueados',  value: blocked,                          color: 'text-red-400'   },
          ].map(m => (
            <div key={m.label} className="bg-ds-navy rounded-xl border border-ds-border p-3">
              <div className="text-[10px] text-ds-text uppercase tracking-wider mb-1">{m.label}</div>
              <div className={`text-2xl font-bold ${m.color}`}>{m.value}</div>
            </div>
          ))}
        </div>

        {/* Item list */}
        <div className="flex-1 overflow-y-auto px-5 py-3 space-y-2">
          {loading && (
            <div className="flex justify-center py-16">
              <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-ds-green" />
            </div>
          )}
          {!loading && error && <div className="text-center py-12 text-red-400 text-sm">{error}</div>}
          {!loading && !error && filtered.length === 0 && (
            <div className="flex flex-col items-center justify-center py-16 text-ds-text gap-3">
              <span className="text-4xl opacity-30">🧪</span>
              <p className="text-sm">{version ? `Nenhum item encontrado para v${version}` : 'Selecione uma versão'}</p>
              {hasActiveFilters && <p className="text-xs text-ds-text/60">Verifique os filtros ativos</p>}
            </div>
          )}
          {!loading && filtered.map(item => {
            const rec  = item.record;
            const st: QAStatus = rec?.status ?? 'pending';
            const scfg = STATUS_CFG[st];
            const tcfg = tipoCfg(item.display_tipo);
            const ctCount  = rec?.cts?.length ?? 0;
            const attCount = rec?.attachments?.length ?? 0;
            return (
              <div key={item.work_item_id}
                onClick={() => setEditingItem(item)}
                className="bg-ds-dark-blue border border-ds-border rounded-xl p-4 cursor-pointer hover:border-ds-green/40 hover:bg-ds-muted/10 transition-all">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                      <span className="font-mono text-xs text-ds-green font-semibold">#{item.work_item_id}</span>
                      <span className={`text-[10px] px-2 py-0.5 rounded-md font-medium ${tcfg.bg} ${tcfg.text}`}>{item.display_tipo}</span>
                      {(item.priority ?? 99) <= 2 && <span className="text-[10px] px-1.5 py-0.5 rounded bg-red-500/10 text-red-400 border border-red-500/20">🔴 Alta</span>}
                    </div>
                    <p className="text-sm text-ds-light-text leading-snug mb-2 line-clamp-2">{item.display_desc}</p>
                    <div className="flex flex-wrap gap-3 text-xs text-ds-text">
                      {(rec?.qa_person ?? item.qa) && <span>👤 {rec?.qa_person ?? item.qa}</span>}
                      {item.display_client && <span>🏢 {item.display_client}</span>}
                      {item.display_area && <span>📁 {item.display_area}</span>}
                      {(ctCount > 0 || attCount > 0) && (
                        <span className="text-ds-cyan/70">
                          {ctCount > 0 ? `${ctCount} CT` : ''}
                          {ctCount > 0 && attCount > 0 ? ' · ' : ''}
                          {attCount > 0 ? `${attCount} anexo${attCount > 1 ? 's' : ''}` : ''}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-2 shrink-0">
                    <span className={`text-xs px-2.5 py-1 rounded-full border font-medium flex items-center gap-1 ${scfg.bg} ${scfg.text} ${scfg.border}`}>
                      {scfg.icon} {scfg.label}
                    </span>
                    {rec?.obs && (
                      <span className="text-[10px] text-ds-text/60 max-w-35 truncate text-right" title={rec.obs}>{rec.obs}</span>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {editingItem && (
        <EditModal
          item={editingItem}
          version={version}
          token={token!}
          qaPersons={qaPersons}
          onClose={() => setEditingItem(null)}
          onSaved={handleSaved}
        />
      )}
    </div>
  );
};

export default QATrackerDashboard;
