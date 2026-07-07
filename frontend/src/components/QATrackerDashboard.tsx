import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
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
  _globalVersion?: string;
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

const STATE_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  'Closed':                  { bg: 'bg-green-300/10',   text: 'text-green-300',   border: 'border-green-300/30'   },
  'Finished':                { bg: 'bg-green-500/10',   text: 'text-green-400',   border: 'border-green-500/30'   },
  'Resolved':                { bg: 'bg-teal-500/10',    text: 'text-teal-400',    border: 'border-teal-500/30'    },
  'Completed':               { bg: 'bg-emerald-500/10', text: 'text-emerald-400', border: 'border-emerald-500/30' },
  'Pronto':                  { bg: 'bg-lime-500/10',    text: 'text-lime-400',    border: 'border-lime-500/30'    },
  'Done':                    { bg: 'bg-green-300/10',   text: 'text-green-300',   border: 'border-green-300/30'   },
  'In Progress':             { bg: 'bg-blue-500/10',    text: 'text-blue-400',    border: 'border-blue-500/30'    },
  'Active':                  { bg: 'bg-cyan-500/10',    text: 'text-cyan-400',    border: 'border-cyan-500/30'    },
  'New':                     { bg: 'bg-slate-400/10',   text: 'text-slate-400',   border: 'border-slate-400/30'   },
  'Design':                  { bg: 'bg-violet-500/10',  text: 'text-violet-400',  border: 'border-violet-500/30'  },
  'In Planning':             { bg: 'bg-indigo-500/10',  text: 'text-indigo-400',  border: 'border-indigo-500/30'  },
  'Para desenvolver':        { bg: 'bg-orange-500/10',  text: 'text-orange-400',  border: 'border-orange-500/30'  },
  'Aguardando QA':           { bg: 'bg-amber-500/10',   text: 'text-amber-400',   border: 'border-amber-500/30'   },
  'Aguardando code review':  { bg: 'bg-purple-500/10',  text: 'text-purple-400',  border: 'border-purple-500/30'  },
  'Disapproved':             { bg: 'bg-red-500/10',     text: 'text-red-400',     border: 'border-red-500/30'     },
  'Removed':                 { bg: 'bg-gray-500/10',    text: 'text-gray-400',    border: 'border-gray-500/30'    },
};
function stateCfg(state?: string) {
  return STATE_COLORS[state ?? ''] ?? { bg: 'bg-ds-muted/30', text: 'text-ds-text', border: 'border-ds-border' };
}

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
  const [qaP, setQaP] = useState(rec?.qa_person || item.qa || '');
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
            {item.state && (
              <span className="text-xs px-2 py-0.5 rounded-md font-medium bg-ds-muted/40 text-ds-text border border-ds-border">
                {item.state}
              </span>
            )}
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

// ─── XLSX Export ──────────────────────────────────────────────────────────────
async function exportQATrackerXlsx(
  items: MergedItem[],
  version: string,
  qaGlobal: string,
): Promise<void> {
  // Buffer polyfill required by ExcelJS in browser
  if (typeof (globalThis as Record<string, unknown>).Buffer === 'undefined') {
    const { Buffer: Buf } = await import('buffer');
    (globalThis as Record<string, unknown>).Buffer = Buf;
  }
  const ExcelJS = await import('exceljs');
  const wb = new ExcelJS.Workbook();
  wb.creator = 'DS Metrics · QA Tracker';
  wb.created = new Date();

  const C = {
    hdrBg: 'FF061526', hdrText: 'FF7FD320',
    rowA:  'FF0A1E35', rowB:   'FF071828',
    body:  'FFD8EBF5', border: 'FF163050',
    green: 'FF7FD320', cyan:   'FF00C4B4',
    yellow:'FFF59E0B', red:    'FFEF4444',
  };
  const thin  = (c: string) => ({ style: 'thin'   as const, color: { argb: c } });
  const thick = (c: string) => ({ style: 'medium' as const, color: { argb: c } });

  // Group by QA person
  const groups = new Map<string, MergedItem[]>();
  for (const item of items) {
    const qa = item.record?.qa_person || item.qa || 'Sem QA';
    if (!groups.has(qa)) groups.set(qa, []);
    groups.get(qa)!.push(item);
  }

  for (const [qaName, qaItems] of groups) {
    const sheetName = qaName.slice(0, 31).replace(/[*?:/\\[\]]/g, '-');
    const ws = wb.addWorksheet(sheetName, {
      pageSetup: { fitToPage: true, fitToWidth: 1, orientation: 'landscape' },
    });
    ws.views = [{ state: 'frozen', ySplit: 1 }];

    const showVer = !!qaGlobal;
    const hasImgs = qaItems.some(i =>
      (i.record?.attachments?.filter(a => a.type.startsWith('image/')) ?? []).length > 0
    );

    type ColDef = { key: string; width: number; header: string };
    const cols: ColDef[] = [
      { key: 'qa',     width: 16,  header: 'QA'                  },
      { key: 'id',     width: 10,  header: 'Tarefa'              },
      { key: 'desc',   width: 45,  header: 'Descrição'           },
      { key: 'client', width: 20,  header: 'Cliente'             },
      { key: 'tipo',   width: 14,  header: 'Tipo'                },
      { key: 'area',   width: 22,  header: 'Área'                },
      { key: 'tags',   width: 32,  header: 'Tags'                },
      { key: 'estado', width: 18,  header: 'Estado (DevOps)'     },
      { key: 'delver', width: 18,  header: 'Versão Entregue'     },
      { key: 'status', width: 16,  header: 'Status QA'           },
      { key: 'cts',    width: 40,  header: 'Casos de Teste'      },
      { key: 'obs',    width: 30,  header: 'Observações'         },
    ];
    if (showVer) cols.splice(1, 0, { key: 'ver', width: 14, header: 'Versão' });
    if (hasImgs) cols.push({ key: 'imgs', width: 72, header: 'Evidência - Testes' });

    ws.columns = cols.map(c => ({ key: c.key, width: c.width }));

    // Header
    const hdrRow = ws.addRow(cols.map(c => c.header));
    hdrRow.height = 28;
    hdrRow.eachCell(cell => {
      cell.fill      = { type: 'pattern', pattern: 'solid', fgColor: { argb: C.hdrBg } };
      cell.font      = { color: { argb: C.hdrText }, bold: true, size: 11, name: 'Calibri' };
      cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
      cell.border    = { top: thick(C.green), bottom: thick(C.green), left: thin(C.border), right: thin(C.border) };
    });

    // Data rows
    for (let i = 0; i < qaItems.length; i++) {
      const item   = qaItems[i];
      const rec    = item.record;
      const imgs   = rec?.attachments?.filter(a => a.type.startsWith('image/')) ?? [];
      const bg     = i % 2 === 0 ? C.rowA : C.rowB;
      const rowH   = imgs.length > 0 ? Math.min(75 + imgs.length * 30, 190) : 50;
      const excelRowNum = i + 2;

      const statusLabel = rec?.status === 'done'    ? '✅  Testado'
                        : rec?.status === 'blocked' ? '🔒  Bloqueado'
                        :                             '⏳  Pendente';
      const statusColor = rec?.status === 'done'    ? C.green
                        : rec?.status === 'blocked' ? C.red
                        :                             C.yellow;
      const tipoColor   = ['Bug', 'Issue'].includes(item.display_tipo) ? C.red
                        : item.display_tipo === 'Melhoria'             ? C.green
                        :                                                 C.cyan;

      const vals: unknown[] = [];
      vals.push(rec?.qa_person || item.qa || '');
      if (showVer) vals.push(item._globalVersion ?? '');
      vals.push(`#${item.work_item_id}`);
      vals.push(item.display_desc);
      vals.push(item.display_client);
      vals.push(item.display_tipo);
      vals.push(item.display_area);
      vals.push(item.tags ?? '');
      vals.push(item.state ?? '');
      vals.push(item.delivered_version ?? '');
      vals.push(statusLabel);
      vals.push(rec?.cts?.map((ct, idx) => `CT-${String(idx + 1).padStart(2, '0')}: ${ct}`).join('\n') ?? '');
      vals.push(rec?.obs ?? '');
      if (hasImgs) vals.push('');

      const row = ws.addRow(vals);
      row.height = rowH;

      const idCol  = showVer ? 3 : 2;
      const tipCol = showVer ? 6 : 5;
      const stCol  = showVer ? 11 : 10;
      const imgCol = cols.length;

      row.eachCell((cell, colNum) => {
        cell.fill      = { type: 'pattern', pattern: 'solid', fgColor: { argb: bg } };
        cell.font      = { color: { argb: C.body }, size: 10, name: 'Calibri' };
        cell.alignment = { vertical: 'top', wrapText: true };
        cell.border    = { bottom: thin(C.border), right: thin(C.border), left: thin(C.border) };

        if (colNum === idCol) {
          cell.font      = { color: { argb: C.green }, bold: true, size: 10, name: 'Courier New', underline: !!item.url };
          cell.alignment = { horizontal: 'center', vertical: 'top' };
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          if (item.url) cell.value = { text: `#${item.work_item_id}`, hyperlink: item.url } as any;
        }
        if (colNum === tipCol) {
          cell.font      = { color: { argb: tipoColor }, bold: true, size: 10, name: 'Calibri' };
          cell.alignment = { horizontal: 'center', vertical: 'top' };
        }
        if (colNum === stCol) {
          cell.font      = { color: { argb: statusColor }, bold: true, size: 10, name: 'Calibri' };
          cell.alignment = { horizontal: 'center', vertical: 'top' };
        }
        if (showVer && colNum === 2) {
          cell.font      = { color: { argb: C.cyan }, size: 9, name: 'Courier New' };
          cell.alignment = { horizontal: 'center', vertical: 'top' };
        }
      });

      // Embed screenshots
      if (hasImgs && imgs.length > 0) {
        const imgW   = 175;
        const imgH   = Math.round(rowH * 1.3) - 6;
        const evCol0 = imgCol - 1; // 0-based
        for (let j = 0; j < Math.min(imgs.length, 3); j++) {
          try {
            const att   = imgs[j];
            const b64   = att.data.includes(',') ? att.data.split(',')[1] : att.data;
            const ext   = att.type === 'image/png' ? 'png' as const : 'jpeg' as const;
            const imgId = wb.addImage({ base64: b64, extension: ext });
            ws.addImage(imgId, {
              tl:  { col: evCol0 + j * 0.37, row: excelRowNum - 1 },
              ext: { width: imgW, height: imgH },
            });
          } catch { /* skip corrupt image */ }
        }
      }
    }

    ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: cols.length } };
  }

  // Download
  const buf  = await wb.xlsx.writeBuffer();
  const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = qaGlobal
    ? `QA-${qaGlobal.replace(/\s+/g, '_')}-todas-versoes.xlsx`
    : `QA-Tracker-v${version}-${new Date().toISOString().slice(0, 10)}.xlsx`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ─── Main Dashboard ────────────────────────────────────────────────────────────
const QATrackerDashboard: React.FC = () => {
  const { token } = useAuth();

  const [versions,         setVersions]         = useState<string[]>([]);
  const [versionsHasMore,  setVersionsHasMore]  = useState(false);
  const [versionsOffset,   setVersionsOffset]   = useState(0);
  const [versionsLoadMore, setVersionsLoadMore] = useState(false);
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
  const [filterState,    setFilterState]    = useState('');
  const [filterHighPrio, setFilterHighPrio] = useState(false);

  const [editingItem, setEditingItem] = useState<MergedItem | null>(null);

  const [qaGlobal,      setQaGlobal]      = useState('');
  const [globalMerged,  setGlobalMerged]  = useState<MergedItem[]>([]);
  const [globalLoading, setGlobalLoading] = useState(false);
  const [exporting,          setExporting]          = useState(false);
  const [autoPopulating,     setAutoPopulating]     = useState(false);
  const [autoPopulateResult, setAutoPopulateResult] = useState<{ versionsProcessed: number; inserted: number; updated: number; corrected: number; total: number } | null>(null);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [showAnalytics, setShowAnalytics] = useState(false);
  const [versionSummary, setVersionSummary] = useState<{ version: string; total: number; done: number; pending: number; blocked: number }[]>([]);
  const [summaryLoaded, setSummaryLoaded] = useState(false);
  const [drillModal, setDrillModal] = useState<{ title: string; items: MergedItem[] } | null>(null);

  // ── Fetch versions + QA persons on mount ──
  useEffect(() => {
    if (!token) return;
    const headers = { Authorization: `Bearer ${token}` };

    fetch(`${API}/api/qa-tracker/versions?limit=10`, { headers })
      .then(r => r.json())
      .then(({ versions: v, hasMore }: { versions: string[]; total: number; hasMore: boolean }) => {
        setVersions(v);
        setVersionsHasMore(hasMore);
        setVersionsOffset(v.length);
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

  // ── Fetch all versions for a QA person (global mode) ──
  useEffect(() => {
    if (!qaGlobal || !token) { setGlobalMerged([]); return; }
    setGlobalLoading(true);
    fetch(`${API}/api/qa-tracker/items-by-qa?qa=${encodeURIComponent(qaGlobal)}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .then(r => r.json()).then((rows: any[]) => {
        setGlobalMerged(rows.map(r => ({
          work_item_id:      r.work_item_id,
          title:             r.title,
          type:              r.type,
          area_path:         r.area_path,
          assigned_to:       r.assigned_to,
          qa:                r.qa,
          state:             r.state,
          priority:          r.priority,
          tags:              r.tags,
          delivered_version: r.delivered_version,
          tipo_cliente:      r.tipo_cliente,
          url:               r.url,
          record: r.rec_id ? {
            id:              r.rec_id,
            work_item_id:    r.work_item_id,
            version:         r.qtr_version,
            qa_person:       r.qa_person,
            status:          r.status ?? 'pending',
            obs:             r.obs,
            cts:             r.cts ?? [],
            attachments:     r.attachments ?? [],
            override_desc:   r.override_desc,
            override_client: r.override_client,
            override_tipo:   r.override_tipo,
            override_area:   r.override_area,
          } : undefined,
          display_desc:   r.override_desc   || r.title,
          display_client: r.override_client || r.tipo_cliente || (r.area_path as string)?.split('\\').pop() || '',
          display_tipo:   r.override_tipo   || r.type || 'Melhoria',
          display_area:   r.override_area   || (r.area_path as string)?.split('\\').pop() || '',
          _globalVersion: r.qtr_version,
        } as MergedItem)));
      })
      .catch(() => setGlobalMerged([]))
      .finally(() => setGlobalLoading(false));
  }, [qaGlobal, token]);

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

  // ── Active list (global QA mode or version mode) ──
  const activeList = qaGlobal ? globalMerged : merged;

  // ── Derived options for dropdowns ──
  const tiposDisponiveis  = [...new Set(activeList.map(m => m.display_tipo).filter(Boolean))].sort();
  const areasDisponiveis  = [...new Set(activeList.map(m => m.display_area).filter(Boolean))].sort();
  const statesDisponiveis = [...new Set(activeList.map(m => m.state).filter(Boolean) as string[])].sort();

  // ── Filtered ──
  const displayList = activeList.filter(m => {
    const s = search.toLowerCase();
    if (s && !m.display_desc.toLowerCase().includes(s) && !String(m.work_item_id).includes(s) && !m.display_client.toLowerCase().includes(s)) return false;
    if (!qaGlobal && filterQA && (m.record?.qa_person || m.qa || 'Sem QA atuando') !== filterQA) return false;
    if (filterStatus && (m.record?.status ?? 'pending') !== filterStatus) return false;
    if (filterTipo && m.display_tipo !== filterTipo) return false;
    if (filterArea && m.display_area !== filterArea) return false;
    if (filterState && m.state !== filterState) return false;
    if (filterHighPrio && (m.priority ?? 99) > 2) return false;
    return true;
  });

  // ── Metrics ──
  const total = activeList.length;
  const done = activeList.filter(m => (m.record?.status ?? 'pending') === 'done').length;
  const blocked = activeList.filter(m => (m.record?.status ?? 'pending') === 'blocked').length;
  const pending = total - done - blocked;

  // ── QA grouping for sidebar ──
  const qaGroups: Record<string, number> = {};
  merged.forEach(m => {
    const key = m.record?.qa_person || m.qa || 'Sem QA atuando';
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

  const hasActiveFilters = filterStatus || filterTipo || filterArea || filterState || filterHighPrio || search;
  const selectCls = 'bg-ds-dark-blue border border-ds-border text-ds-text rounded-lg px-2.5 py-1.5 text-xs focus:outline-none focus:border-ds-green';

  // ── Drill-down: abre modal com itens do segmento clicado no gráfico ──
  const drillByStatus = useCallback((statusName: string) => {
    const statusMap: Record<string, QAStatus> = { 'Testados': 'done', 'Pendentes': 'pending', 'Bloqueados': 'blocked' };
    const st = statusMap[statusName];
    if (!st) return;
    const items = displayList.filter(m => (m.record?.status ?? 'pending') === st);
    setDrillModal({ title: `${statusName} · ${items.length} item${items.length !== 1 ? 's' : ''}`, items });
  }, [displayList]);

  const drillByDimension = useCallback((
    dimension: 'qa' | 'type' | 'area',
    groupName: string,
    status: QAStatus | null
  ) => {
    const getKey = (m: MergedItem): string =>
      dimension === 'qa'   ? (m.record?.qa_person || m.qa || 'Sem QA atuando') :
      dimension === 'type' ? m.display_tipo :
      m.display_area;
    const items = displayList.filter(m => {
      const matchGroup  = getKey(m) === groupName;
      const matchStatus = status ? (m.record?.status ?? 'pending') === status : true;
      return matchGroup && matchStatus;
    });
    const statusLabel = status === 'done' ? ' · ✅ Testados' : status === 'pending' ? ' · ⏳ Pendentes' : status === 'blocked' ? ' · 🔒 Bloqueados' : '';
    setDrillModal({ title: `${groupName}${statusLabel} · ${items.length} item${items.length !== 1 ? 's' : ''}`, items });
  }, [displayList]);

  const drillByHistoryVersion = useCallback((version: string, status: QAStatus | null) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    fetch(`${API}/api/qa-tracker/version-items?version=${encodeURIComponent(version)}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .then(r => r.json()).then((rows: any[]) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        let items: MergedItem[] = rows.map((r: any) => ({
          work_item_id:      r.work_item_id,
          title:             r.title,
          type:              r.type,
          area_path:         r.area_path,
          assigned_to:       r.assigned_to,
          qa:                r.qa,
          state:             r.state,
          priority:          r.priority,
          tags:              r.tags,
          delivered_version: r.delivered_version,
          tipo_cliente:      r.tipo_cliente,
          story_points:      r.story_points,
          url:               r.url,
          record: r.rec_id ? {
            id:              r.rec_id,
            work_item_id:    r.work_item_id,
            version:         r.qtr_version,
            qa_person:       r.qa_person,
            status:          r.status ?? 'pending',
            obs:             r.obs,
            cts:             r.cts ?? [],
            attachments:     r.attachments ?? [],
            override_desc:   r.override_desc,
            override_client: r.override_client,
            override_tipo:   r.override_tipo,
            override_area:   r.override_area,
          } : undefined,
          display_desc:   r.override_desc   || r.title,
          display_client: r.override_client || r.tipo_cliente || (r.area_path as string)?.split('\\').pop() || '',
          display_tipo:   r.override_tipo   || r.type || 'Melhoria',
          display_area:   r.override_area   || (r.area_path as string)?.split('\\').pop() || '',
          _globalVersion: r.qtr_version,
        } as MergedItem));
        if (status) items = items.filter(m => (m.record?.status ?? 'pending') === status);
        const statusLabel = status === 'done' ? ' · ✅ Testados' : status === 'pending' ? ' · ⏳ Pendentes' : status === 'blocked' ? ' · 🔒 Bloqueados' : '';
        setDrillModal({ title: `v${version}${statusLabel} · ${items.length} item${items.length !== 1 ? 's' : ''}`, items });
      })
      .catch(console.error);
  }, [token]);

  const handleAutoPopulate = useCallback(async () => {
    if (!token || autoPopulating) return;
    setAutoPopulating(true);
    setAutoPopulateResult(null);
    try {
      const r = await fetch(`${API}/api/qa-tracker/auto-populate`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await r.json();
      if (r.ok) {
        setAutoPopulateResult(data);
        setSummaryLoaded(false); // força reload do histórico
        setTimeout(() => setAutoPopulateResult(null), 8000);
      }
    } catch { /* ignore */ } finally {
      setAutoPopulating(false);
    }
  }, [token, autoPopulating]);

  const loadMoreVersions = useCallback(() => {
    if (!token || versionsLoadMore || !versionsHasMore) return;
    setVersionsLoadMore(true);
    fetch(`${API}/api/qa-tracker/versions?offset=${versionsOffset}&limit=10`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(r => r.json())
      .then(({ versions: more, hasMore }: { versions: string[]; total: number; hasMore: boolean }) => {
        setVersions(prev => [...prev, ...more]);
        setVersionsHasMore(hasMore);
        setVersionsOffset(prev => prev + more.length);
      })
      .catch(() => {})
      .finally(() => setVersionsLoadMore(false));
  }, [token, versionsOffset, versionsLoadMore, versionsHasMore]);

  // ── Analytics useMemo (responde aos filtros ativos) ──
  const analytics = useMemo(() => {
    const _total   = displayList.length;
    const _done    = displayList.filter(m => (m.record?.status ?? 'pending') === 'done').length;
    const _blocked = displayList.filter(m => (m.record?.status ?? 'pending') === 'blocked').length;
    const _pending = _total - _done - _blocked;

    type StatMap = Record<string, { done: number; pending: number; blocked: number }>;
    const byQAMap: StatMap   = {};
    const byTypeMap: StatMap = {};
    const byAreaMap: StatMap = {};

    for (const m of displayList) {
      const st   = m.record?.status ?? 'pending';
      const qa   = m.record?.qa_person || m.qa || 'Sem QA atuando';
      const type = m.display_tipo || '—';
      const area = m.display_area || '—';
      for (const [map, key] of [[byQAMap, qa], [byTypeMap, type], [byAreaMap, area]] as [StatMap, string][]) {
        if (!map[key]) map[key] = { done: 0, pending: 0, blocked: 0 };
        (map[key] as Record<string, number>)[st]++;
      }
    }

    const toArr = (map: StatMap) =>
      Object.entries(map)
        .map(([name, v]) => ({ name, ...v, total: v.done + v.pending + v.blocked }))
        .sort((a, b) => b.total - a.total);

    return {
      byStatus: [
        { name: 'Testados',   value: _done,    color: '#7FD320' },
        { name: 'Pendentes',  value: _pending,  color: '#F59E0B' },
        { name: 'Bloqueados', value: _blocked,  color: '#EF4444' },
      ],
      byQA:   toArr(byQAMap).slice(0, 10),
      byType: toArr(byTypeMap),
      byArea: toArr(byAreaMap).slice(0, 8),
      total: _total, done: _done, pending: _pending, blocked: _blocked,
      pctDone: pct(_done, _total),
    };
  }, [displayList]);

  // ── Fetch version summary (Fase 3) — carrega uma vez quando analytics é aberto ──
  useEffect(() => {
    if (!showAnalytics || !token || summaryLoaded) return;
    fetch(`${API}/api/qa-tracker/version-summary`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.ok ? r.json() : [])
      .then((data) => { setVersionSummary(data); setSummaryLoaded(true); })
      .catch(() => setSummaryLoaded(true));
  }, [showAnalytics, token, summaryLoaded]);

  const handleExport = useCallback(async () => {
    setExporting(true);
    try { await exportQATrackerXlsx(displayList, version, qaGlobal); }
    catch (e) { console.error('Export failed:', e); }
    finally { setExporting(false); }
  }, [displayList, version, qaGlobal]);

  return (
    <div className="flex min-h-[80vh] h-full">
      {/* ── Sidebar ── */}
      <aside className={`shrink-0 bg-ds-dark-blue border-r border-ds-border flex flex-col overflow-y-auto transition-all duration-200 ${sidebarCollapsed ? 'w-12' : 'w-56'}`}>
        {/* Logo */}
        <div className={`border-b border-ds-border flex items-center ${sidebarCollapsed ? 'justify-center px-2 py-4' : 'px-4 py-4'}`}>
          {sidebarCollapsed ? (
            <button
              type="button"
              onClick={() => setSidebarCollapsed(false)}
              title="Expandir sidebar"
              className="w-9 h-9 rounded-xl flex items-center justify-center text-ds-dark-blue font-bold text-sm bg-gradient-to-br from-ds-green to-ds-cyan hover:opacity-90 transition-opacity"
            >QA</button>
          ) : (
            <div className="flex items-center gap-2.5 w-full">
              <div className="w-9 h-9 rounded-xl flex items-center justify-center text-ds-dark-blue font-bold text-sm bg-gradient-to-br from-ds-green to-ds-cyan">QA</div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-semibold text-ds-light-text">QA Tracker</div>
                <div className="text-xs text-ds-text">Evidências de Teste</div>
              </div>
              <button
                type="button"
                onClick={() => setSidebarCollapsed(true)}
                title="Recolher sidebar"
                className="shrink-0 w-6 h-6 flex items-center justify-center rounded text-ds-text hover:text-ds-light-text hover:bg-ds-muted/30 transition-colors text-xs"
              >◀</button>
            </div>
          )}
        </div>
        {sidebarCollapsed && <div className="flex-1" />}

        {/* Version selector */}
        {!sidebarCollapsed && (
        <div className="px-3 py-3 border-b border-ds-border">
          <label className="text-[10px] font-semibold uppercase tracking-wider text-ds-text block mb-1.5">Versão</label>
          <select value={version} onChange={e => {
            if (e.target.value === '__load_more__') { loadMoreVersions(); return; }
            setVersion(e.target.value); setQaGlobal('');
          }}
            title="Selecionar versão"
            className="w-full bg-ds-navy border border-ds-border text-ds-light-text rounded-lg px-2.5 py-2 text-sm focus:outline-none focus:border-ds-green font-mono">
            {versions.length === 0 && <option value="">Carregando...</option>}
            {versions.map(v => <option key={v} value={v}>{v}</option>)}
            {versionsHasMore && (
              <option value="__load_more__" className="text-ds-text/70 italic">
                {versionsLoadMore ? 'Carregando...' : '↓ Mais versões...'}
              </option>
            )}
          </select>
          {/* Fase 2: barra de progresso da versão atual */}
          {total > 0 && (
            <div className="mt-2.5">
              <div className="flex items-center justify-between text-[10px] text-ds-text mb-1">
                <span>{done} / {total} testados</span>
                <span className="font-semibold text-ds-green">{pct(done, total)}%</span>
              </div>
              <div className="h-1.5 rounded-full bg-ds-muted/40 overflow-hidden flex">
                <div style={{ width: `${pct(done, total)}%` }} className="bg-ds-green transition-all duration-500" />
                <div style={{ width: `${pct(blocked, total)}%` }} className="bg-red-500 transition-all duration-500" />
              </div>
            </div>
          )}
        </div>
        )}

        {/* QA nav */}
        {!sidebarCollapsed && (
        <nav className="flex-1 px-2 py-3 space-y-1">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-ds-text px-2 mb-1.5">Por QA</div>
          <button onClick={() => { setFilterQA(''); setQaGlobal(''); }}
            className={`w-full flex items-center justify-between px-2.5 py-2 rounded-lg text-sm transition-colors ${!filterQA && !qaGlobal ? 'bg-ds-green/15 text-ds-green font-medium' : 'text-ds-text hover:bg-ds-muted/30 hover:text-ds-light-text'}`}>
            <span>Todos</span>
            <span className={`text-xs px-1.5 py-0.5 rounded-full ${!filterQA && !qaGlobal ? 'bg-ds-green/20 text-ds-green' : 'bg-ds-muted/30 text-ds-text'}`}>{merged.length}</span>
          </button>
          {Object.entries(qaGroups).sort((a, b) => b[1] - a[1]).map(([name, count]) => (
            <div key={name}
              className={`group w-full flex items-center gap-1 px-2.5 py-2 rounded-lg text-sm transition-colors ${
                qaGlobal === name ? 'bg-ds-cyan/10 text-ds-cyan font-medium' :
                filterQA === name ? 'bg-ds-green/15 text-ds-green font-medium' :
                'text-ds-text hover:bg-ds-muted/30 hover:text-ds-light-text'
              }`}>
              <button onClick={() => setFilterQA(name === filterQA ? '' : name)}
                className="flex-1 flex items-center justify-between gap-1 text-left min-w-0">
                <span className="truncate">{name}</span>
                <span className={`text-xs px-1.5 py-0.5 rounded-full shrink-0 ${
                  qaGlobal === name ? 'bg-ds-cyan/20 text-ds-cyan' :
                  filterQA === name ? 'bg-ds-green/20 text-ds-green' :
                  'bg-ds-muted/30 text-ds-text'
                }`}>{count}</span>
              </button>
              <button
                onClick={() => setQaGlobal(name === qaGlobal ? '' : name)}
                title={qaGlobal === name ? 'Voltar à visão por versão' : 'Ver todas as versões deste QA'}
                className={`shrink-0 w-5 h-5 rounded flex items-center justify-center text-[10px] transition-all ${
                  qaGlobal === name ? 'text-ds-cyan opacity-100' :
                  'text-ds-text opacity-0 group-hover:opacity-100 hover:text-ds-cyan hover:bg-ds-cyan/10'
                }`}>
                🌐
              </button>
            </div>
          ))}
        </nav>
        )}

        {/* Legend */}
        {!sidebarCollapsed && (
        <div className="px-3 py-3 border-t border-ds-border space-y-1.5">
          {(Object.entries(STATUS_CFG) as [QAStatus, typeof STATUS_CFG[QAStatus]][]).map(([, cfg]) => (
            <div key={cfg.label} className={`flex items-center gap-2 text-xs ${cfg.text}`}>
              <span>{cfg.icon}</span><span>{cfg.label}</span>
            </div>
          ))}
        </div>
        )}
      </aside>

      {/* ── Main ── */}
      <div className="flex-1 flex flex-col overflow-hidden bg-ds-navy">

        {/* Topbar */}
        <div className="bg-ds-dark-blue border-b border-ds-border px-5 py-3 flex items-center gap-3">
          {/* Sidebar toggle — sempre visível */}
          <button
            type="button"
            onClick={() => setSidebarCollapsed(prev => !prev)}
            title={sidebarCollapsed ? 'Expandir painel lateral' : 'Recolher painel lateral'}
            className="shrink-0 w-7 h-7 flex items-center justify-center rounded text-ds-text hover:text-ds-light-text hover:bg-ds-muted/30 transition-colors text-xs"
          >
            {sidebarCollapsed ? '▶' : '◀'}
          </button>
          <h2 className="text-base font-semibold text-ds-light-text whitespace-nowrap">
            {version ? <>v<span className="text-ds-green font-mono">{version}</span></> : 'Selecione uma versão'}
          </h2>
          <div className="flex-1" />
          <button
            onClick={handleAutoPopulate}
            disabled={autoPopulating}
            title="Preencher automaticamente status QA para versões sem registros (baseado em state DevOps, bloqueio e impedimento)"
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-ds-muted/20 text-ds-text border border-ds-border rounded-lg hover:border-ds-cyan/40 hover:text-ds-cyan disabled:opacity-40 transition-colors whitespace-nowrap font-medium"
          >
            {autoPopulating ? '⏳ Processando...' : '⚡ Auto-popular'}
          </button>
          {autoPopulateResult && (
            <span className="text-xs text-ds-green font-medium whitespace-nowrap">
              ✅ {autoPopulateResult.versionsProcessed} versões · {autoPopulateResult.inserted} criados · {autoPopulateResult.updated} atualizados{autoPopulateResult.corrected > 0 ? ` · ${autoPopulateResult.corrected} corrigidos` : ''}
            </span>
          )}
          <button
            onClick={() => setShowAnalytics(v => !v)}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs border rounded-lg transition-colors whitespace-nowrap font-medium ${
              showAnalytics
                ? 'bg-ds-cyan/20 text-ds-cyan border-ds-cyan/40'
                : 'bg-transparent text-ds-text border-ds-border hover:border-ds-cyan/40 hover:text-ds-cyan'
            }`}
          >
            📊 {showAnalytics ? 'Fechar' : 'Análise'}
          </button>
          <button
            onClick={handleExport}
            disabled={exporting || displayList.length === 0}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-ds-green/15 text-ds-green border border-ds-green/30 rounded-lg hover:bg-ds-green/25 disabled:opacity-40 transition-colors whitespace-nowrap font-medium"
          >
            {exporting ? '⏳ Exportando...' : '📥 Exportar XLSX'}
          </button>
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

        {/* Global QA mode banner */}
        {qaGlobal && (
          <div className="bg-ds-cyan/8 border-b border-ds-cyan/20 px-5 py-2 flex items-center gap-2 text-xs text-ds-cyan">
            <span>🌐</span>
            <span>Modo global · todos os itens de <strong className="font-semibold">{qaGlobal}</strong> em todas as versões</span>
            <button onClick={() => setQaGlobal('')} className="ml-auto text-ds-cyan/60 hover:text-ds-cyan transition-colors">✕ Sair</button>
          </div>
        )}

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

          {statesDisponiveis.length > 1 && (
            <select value={filterState} onChange={e => setFilterState(e.target.value)}
              title="Filtrar por State DevOps" className={selectCls}>
              <option value="">Todos os states</option>
              {statesDisponiveis.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          )}

          <button onClick={() => setFilterHighPrio(f => !f)}
            className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${filterHighPrio ? 'bg-red-500/15 text-red-400 border-red-500/30 font-semibold' : 'bg-transparent text-ds-text border-ds-border hover:border-red-400/40 hover:text-red-400'}`}>
            🔴 Alta prio
          </button>

          {hasActiveFilters && (
            <button onClick={() => { setSearch(''); setFilterStatus(''); setFilterTipo(''); setFilterArea(''); setFilterState(''); setFilterHighPrio(false); }}
              className="ml-auto text-xs text-ds-text hover:text-ds-green border border-ds-border hover:border-ds-green/40 px-2.5 py-1.5 rounded-lg transition-colors">
              ✕ Limpar
            </button>
          )}
        </div>

        {/* Analytics Panel — Fase 1 + 3 */}
        {showAnalytics && (
          <div className="border-b border-ds-border bg-ds-dark-blue/60 px-5 py-4 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-ds-light-text">
                📊 Análise
                <span className="ml-2 text-xs font-normal text-ds-text">
                  {hasActiveFilters ? `${analytics.total} itens (com filtros)` : `${analytics.total} itens`}
                </span>
              </h3>
              {hasActiveFilters && (
                <span className="text-[10px] bg-ds-cyan/10 text-ds-cyan border border-ds-cyan/20 px-2 py-0.5 rounded-full">
                  filtros ativos
                </span>
              )}
            </div>

            {/* Grid 4 gráficos */}
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">

              {/* Gráfico 1 — Cobertura (donut) */}
              <div className="bg-ds-navy rounded-xl border border-ds-border p-4 flex flex-col">
                <div className="text-[10px] font-semibold uppercase tracking-wider text-ds-text mb-2">Cobertura <span className="normal-case font-normal text-ds-text/50">· clique para filtrar</span></div>
                <div className="relative flex justify-center">
                  <ResponsiveContainer width="100%" height={130}>
                    <PieChart>
                      <Pie
                        data={analytics.byStatus.filter(d => d.value > 0)}
                        dataKey="value"
                        innerRadius={38}
                        outerRadius={58}
                        paddingAngle={2}
                        startAngle={90}
                        endAngle={-270}
                        cursor="pointer"
                        onClick={(entry: any) => drillByStatus(entry.name)}
                      >
                        {analytics.byStatus.filter(d => d.value > 0).map(entry => (
                          <Cell key={entry.name} fill={entry.color} />
                        ))}
                      </Pie>
                      <Tooltip
                        formatter={(v: number) => [`${v} item${v !== 1 ? 's' : ''} (${pct(v, analytics.total)}%)`, '']}
                        contentStyle={{ background: '#0A1E35', border: '1px solid #163050', borderRadius: 8, fontSize: 11 }}
                        labelStyle={{ color: '#D8EBF5' }}
                        itemStyle={{ color: '#D8EBF5' }}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                    <div className="text-center">
                      <div className="text-2xl font-bold text-ds-green">{analytics.pctDone}%</div>
                      <div className="text-[10px] text-ds-text">testado</div>
                    </div>
                  </div>
                </div>
                <div className="mt-1 space-y-1">
                  {analytics.byStatus.map(s => (
                    <button
                      key={s.name}
                      type="button"
                      onClick={() => drillByStatus(s.name)}
                      className="w-full flex items-center justify-between text-[11px] rounded px-1 py-0.5 hover:bg-ds-muted/25 transition-colors cursor-pointer"
                    >
                      <span className="flex items-center gap-1.5 text-ds-text">
                        <span className="w-2 h-2 rounded-full shrink-0" style={{ background: s.color }} />
                        {s.name}
                      </span>
                      <span className="font-semibold" style={{ color: s.color }}>{s.value}</span>
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={() => setDrillModal({ title: `Todos · ${analytics.total} itens`, items: displayList })}
                    className="w-full pt-1 border-t border-ds-border flex items-center justify-between text-[11px] text-ds-text rounded px-1 py-0.5 hover:bg-ds-muted/25 transition-colors cursor-pointer"
                  >
                    <span>Total</span>
                    <span className="font-bold text-ds-light-text">{analytics.total}</span>
                  </button>
                </div>
              </div>

              {/* Gráfico 2 — Por QA */}
              <div className="bg-ds-navy rounded-xl border border-ds-border p-4 flex flex-col">
                <div className="text-[10px] font-semibold uppercase tracking-wider text-ds-text mb-2">Por QA <span className="normal-case font-normal text-ds-text/50">· clique para filtrar</span></div>
                <ResponsiveContainer width="100%" height={analytics.byQA.length > 0 ? Math.min(280, analytics.byQA.length * 30 + 16) : 80}>
                  <BarChart data={analytics.byQA} layout="vertical" margin={{ top: 0, right: 4, left: 0, bottom: 0 }}>
                    <XAxis type="number" hide />
                    <YAxis type="category" dataKey="name" width={96} tick={{ fontSize: 10, fill: '#7A9EB8' }} tickLine={false} axisLine={false} />
                    <Tooltip
                      contentStyle={{ background: '#0A1E35', border: '1px solid #163050', borderRadius: 8, fontSize: 11 }}
                      labelStyle={{ color: '#D8EBF5' }}
                      itemStyle={{ color: '#D8EBF5' }}
                      formatter={(v: number, name: string) => [v, name === 'done' ? '✅ Testados' : name === 'pending' ? '⏳ Pendentes' : '🔒 Bloqueados']}
                    />
                    <Bar dataKey="done"    stackId="s" fill="#7FD320" cursor="pointer" onClick={(d: any) => drillByDimension('qa', d.name, 'done')} />
                    <Bar dataKey="pending" stackId="s" fill="#F59E0B" cursor="pointer" onClick={(d: any) => drillByDimension('qa', d.name, 'pending')} />
                    <Bar dataKey="blocked" stackId="s" fill="#EF4444" radius={[0, 3, 3, 0]} cursor="pointer" onClick={(d: any) => drillByDimension('qa', d.name, 'blocked')} />
                  </BarChart>
                </ResponsiveContainer>
                {analytics.byQA.length === 0 && <div className="text-center text-xs text-ds-text/50 py-6">Sem dados</div>}
              </div>

              {/* Gráfico 3 — Por Tipo */}
              <div className="bg-ds-navy rounded-xl border border-ds-border p-4 flex flex-col">
                <div className="text-[10px] font-semibold uppercase tracking-wider text-ds-text mb-2">Por Tipo <span className="normal-case font-normal text-ds-text/50">· clique para filtrar</span></div>
                <ResponsiveContainer width="100%" height={analytics.byType.length > 0 ? Math.min(180, analytics.byType.length * 28 + 16) : 80}>
                  <BarChart data={analytics.byType} layout="vertical" margin={{ top: 0, right: 4, left: 0, bottom: 0 }}>
                    <XAxis type="number" hide />
                    <YAxis type="category" dataKey="name" width={72} tick={{ fontSize: 10, fill: '#7A9EB8' }} tickLine={false} axisLine={false} />
                    <Tooltip
                      contentStyle={{ background: '#0A1E35', border: '1px solid #163050', borderRadius: 8, fontSize: 11 }}
                      labelStyle={{ color: '#D8EBF5' }}
                      itemStyle={{ color: '#D8EBF5' }}
                      formatter={(v: number, name: string) => [v, name === 'done' ? '✅ Testados' : name === 'pending' ? '⏳ Pendentes' : '🔒 Bloqueados']}
                    />
                    <Bar dataKey="done"    stackId="s" fill="#7FD320" cursor="pointer" onClick={(d: any) => drillByDimension('type', d.name, 'done')} />
                    <Bar dataKey="pending" stackId="s" fill="#F59E0B" cursor="pointer" onClick={(d: any) => drillByDimension('type', d.name, 'pending')} />
                    <Bar dataKey="blocked" stackId="s" fill="#EF4444" radius={[0, 3, 3, 0]} cursor="pointer" onClick={(d: any) => drillByDimension('type', d.name, 'blocked')} />
                  </BarChart>
                </ResponsiveContainer>
                {analytics.byType.length === 0 && <div className="text-center text-xs text-ds-text/50 py-6">Sem dados</div>}
              </div>

              {/* Gráfico 4 — Por Área */}
              <div className="bg-ds-navy rounded-xl border border-ds-border p-4 flex flex-col">
                <div className="text-[10px] font-semibold uppercase tracking-wider text-ds-text mb-2">Por Área <span className="normal-case font-normal text-ds-text/50">· clique para filtrar</span></div>
                <ResponsiveContainer width="100%" height={analytics.byArea.length > 0 ? Math.min(180, analytics.byArea.length * 24 + 16) : 80}>
                  <BarChart data={analytics.byArea} layout="vertical" margin={{ top: 0, right: 4, left: 0, bottom: 0 }}>
                    <XAxis type="number" hide />
                    <YAxis type="category" dataKey="name" width={72} tick={{ fontSize: 10, fill: '#7A9EB8' }} tickLine={false} axisLine={false} />
                    <Tooltip
                      contentStyle={{ background: '#0A1E35', border: '1px solid #163050', borderRadius: 8, fontSize: 11 }}
                      labelStyle={{ color: '#D8EBF5' }}
                      itemStyle={{ color: '#D8EBF5' }}
                      formatter={(v: number, name: string) => [v, name === 'done' ? '✅ Testados' : name === 'pending' ? '⏳ Pendentes' : '🔒 Bloqueados']}
                    />
                    <Bar dataKey="done"    stackId="s" fill="#7FD320" cursor="pointer" onClick={(d: any) => drillByDimension('area', d.name, 'done')} />
                    <Bar dataKey="pending" stackId="s" fill="#F59E0B" cursor="pointer" onClick={(d: any) => drillByDimension('area', d.name, 'pending')} />
                    <Bar dataKey="blocked" stackId="s" fill="#EF4444" radius={[0, 3, 3, 0]} cursor="pointer" onClick={(d: any) => drillByDimension('area', d.name, 'blocked')} />
                  </BarChart>
                </ResponsiveContainer>
                {analytics.byArea.length === 0 && <div className="text-center text-xs text-ds-text/50 py-6">Sem dados</div>}
              </div>
            </div>

            {/* Fase 3 — Histórico por versão */}
            {(versionSummary.length > 0 || summaryLoaded) && (
              <div className="bg-ds-navy rounded-xl border border-ds-border p-4">
                <div className="text-[10px] font-semibold uppercase tracking-wider text-ds-text mb-3">
                  Histórico por Versão
                  <span className="ml-2 normal-case font-normal text-ds-text/60">(últimas versões)</span>
                  <span className="ml-1 normal-case font-normal text-ds-text/50">· clique para filtrar</span>
                </div>
                {versionSummary.length > 0 ? (
                  <ResponsiveContainer width="100%" height={120}>
                    <BarChart data={versionSummary} margin={{ top: 0, right: 8, left: 0, bottom: 24 }}>
                      <XAxis
                        dataKey="version"
                        tick={{ fontSize: 10, fill: '#7A9EB8' }}
                        tickLine={false}
                        axisLine={false}
                        angle={-30}
                        textAnchor="end"
                        interval={0}
                      />
                      <YAxis hide />
                      <Tooltip
                        contentStyle={{ background: '#0A1E35', border: '1px solid #163050', borderRadius: 8, fontSize: 11 }}
                        labelStyle={{ color: '#D8EBF5' }}
                        itemStyle={{ color: '#D8EBF5' }}
                        formatter={(v: number, name: string) => [v, name === 'done' ? '✅ Testados' : name === 'pending' ? '⏳ Pendentes' : '🔒 Bloqueados']}
                      />
                      <Bar dataKey="done"    stackId="s" fill="#7FD320" cursor="pointer" onClick={(d: any) => drillByHistoryVersion(d.version, 'done')} />
                      <Bar dataKey="pending" stackId="s" fill="#F59E0B" cursor="pointer" onClick={(d: any) => drillByHistoryVersion(d.version, 'pending')} />
                      <Bar dataKey="blocked" stackId="s" fill="#EF4444" radius={[3, 3, 0, 0]} cursor="pointer" onClick={(d: any) => drillByHistoryVersion(d.version, 'blocked')} />
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="text-center text-xs text-ds-text/50 py-6">Carregando histórico...</div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Metric cards */}
        <div className="grid grid-cols-4 gap-3 px-5 py-3 border-b border-ds-border bg-ds-dark-blue">
          {[
            {
              label: 'Total',
              value: total,
              color: 'text-ds-green',
              items: activeList,
              title: `Todos · ${total} itens`,
            },
            {
              label: '✅ Testados',
              value: `${done} (${pct(done, total)}%)`,
              color: 'text-green-400',
              items: activeList.filter(m => (m.record?.status ?? 'pending') === 'done'),
              title: `✅ Testados · ${done} itens`,
            },
            {
              label: '⏳ Pendentes',
              value: pending,
              color: 'text-yellow-400',
              items: activeList.filter(m => (m.record?.status ?? 'pending') === 'pending'),
              title: `⏳ Pendentes · ${pending} itens`,
            },
            {
              label: '🔒 Bloqueados',
              value: blocked,
              color: 'text-red-400',
              items: activeList.filter(m => (m.record?.status ?? 'pending') === 'blocked'),
              title: `🔒 Bloqueados · ${blocked} itens`,
            },
          ].map(m => (
            <button
              key={m.label}
              type="button"
              onClick={() => setDrillModal({ title: m.title, items: m.items })}
              className="bg-ds-navy rounded-xl border border-ds-border p-3 text-left hover:border-ds-green/40 hover:bg-ds-muted/10 transition-all cursor-pointer group"
            >
              <div className="text-[10px] text-ds-text uppercase tracking-wider mb-1 group-hover:text-ds-light-text transition-colors">{m.label}</div>
              <div className={`text-2xl font-bold ${m.color}`}>{m.value}</div>
            </button>
          ))}
        </div>

        {/* Item list */}
        <div className="flex-1 overflow-y-auto px-5 py-3 space-y-2">
          {(loading || globalLoading) && (
            <div className="flex justify-center py-16">
              <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-ds-green" />
            </div>
          )}
          {!loading && !globalLoading && error && <div className="text-center py-12 text-red-400 text-sm">{error}</div>}
          {!loading && !globalLoading && !error && displayList.length === 0 && (
            <div className="flex flex-col items-center justify-center py-16 text-ds-text gap-3">
              <span className="text-4xl opacity-30">🧪</span>
              <p className="text-sm">{qaGlobal ? `Nenhum item encontrado para ${qaGlobal}` : version ? `Nenhum item encontrado para v${version}` : 'Selecione uma versão'}</p>
              {hasActiveFilters && <p className="text-xs text-ds-text/60">Verifique os filtros ativos</p>}
            </div>
          )}
          {!loading && !globalLoading && displayList.map(item => {
            const rec  = item.record;
            const st: QAStatus = rec?.status ?? 'pending';
            const scfg = STATUS_CFG[st];
            const tcfg = tipoCfg(item.display_tipo);
            const ctCount  = rec?.cts?.length ?? 0;
            const attCount = rec?.attachments?.length ?? 0;
            const hasDeliveredVersion = /^\d+\.\d+\.\d+\.\d+$/.test(item.delivered_version ?? '');
            const hasTagVersion = !!(item.tags && /\d+\.\d+\.\d+\.\d+/.test(item.tags));
            const sscfg = stateCfg(item.state);
            return (
              <div key={item.work_item_id}
                onClick={() => setEditingItem(item)}
                className="bg-ds-dark-blue border border-ds-border rounded-xl p-4 cursor-pointer hover:border-ds-green/40 hover:bg-ds-muted/10 transition-all">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                      <span className="font-mono text-xs text-ds-green font-semibold">#{item.work_item_id}</span>
                      <span className={`text-[10px] px-2 py-0.5 rounded-md font-medium ${tcfg.bg} ${tcfg.text}`}>{item.display_tipo}</span>
                      {item.state && <span className={`text-[10px] px-1.5 py-0.5 rounded border font-medium ${sscfg.bg} ${sscfg.text} ${sscfg.border}`}>{item.state}</span>}
                      {(item.priority ?? 99) <= 2 && <span className="text-[10px] px-1.5 py-0.5 rounded bg-red-500/10 text-red-400 border border-red-500/20">🔴 Alta</span>}
                      {qaGlobal && item._globalVersion && <span className="text-[10px] px-1.5 py-0.5 rounded bg-ds-cyan/10 text-ds-cyan border border-ds-cyan/20 font-mono">v{item._globalVersion}</span>}
                      {!hasDeliveredVersion && item.type !== 'Eventuality' && <span className="text-[10px] px-1.5 py-0.5 rounded bg-orange-500/10 text-orange-400 border border-orange-500/20 font-medium">⚠ Falta Versão</span>}
                      {!hasTagVersion && <span className="text-[10px] px-1.5 py-0.5 rounded bg-yellow-500/10 text-yellow-400 border border-yellow-500/20 font-medium">🏷️ Falta Tag</span>}
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
          version={editingItem._globalVersion || version}
          token={token!}
          qaPersons={qaPersons}
          onClose={() => setEditingItem(null)}
          onSaved={handleSaved}
        />
      )}

      {/* ── Drill-down Modal ── */}
      {drillModal && (
        <div
          className="fixed inset-0 z-[250] flex items-center justify-center bg-black/70 backdrop-blur-sm"
          onClick={() => setDrillModal(null)}
        >
          <div
            className="bg-ds-navy border border-ds-border rounded-2xl w-full max-w-2xl mx-4 max-h-[85vh] flex flex-col shadow-2xl"
            onClick={e => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-ds-border shrink-0">
              <div>
                <h3 className="text-sm font-semibold text-ds-light-text">{drillModal.title}</h3>
                <p className="text-[11px] text-ds-text mt-0.5">Clique em um item para editar o registro QA</p>
              </div>
              <button
                type="button"
                onClick={() => setDrillModal(null)}
                title="Fechar"
                className="w-7 h-7 flex items-center justify-center rounded text-ds-text hover:text-ds-light-text hover:bg-ds-muted/30 transition-colors"
              >✕</button>
            </div>

            {/* Item list */}
            <div className="overflow-y-auto flex-1 px-4 py-3 space-y-2">
              {drillModal.items.length === 0 && (
                <div className="text-center py-10 text-ds-text text-sm">Nenhum item neste segmento</div>
              )}
              {drillModal.items.map(item => {
                const rec   = item.record;
                const st: QAStatus = rec?.status ?? 'pending';
                const scfg  = STATUS_CFG[st];
                const tcfg  = tipoCfg(item.display_tipo);
                const ctCount  = rec?.cts?.length ?? 0;
                const attCount = rec?.attachments?.length ?? 0;
                const hasDeliveredVersionD = /^\d+\.\d+\.\d+\.\d+$/.test(item.delivered_version ?? '');
                const hasTagVersionD = !!(item.tags && /\d+\.\d+\.\d+\.\d+/.test(item.tags));
                const sscfgD = stateCfg(item.state);
                return (
                  <div
                    key={item.work_item_id}
                    onClick={() => { setDrillModal(null); setEditingItem(item); }}
                    className="bg-ds-dark-blue border border-ds-border rounded-xl p-3.5 cursor-pointer hover:border-ds-green/40 hover:bg-ds-muted/10 transition-all"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1 flex-wrap">
                          <span className="font-mono text-xs text-ds-green font-semibold">#{item.work_item_id}</span>
                          <span className={`text-[10px] px-2 py-0.5 rounded-md font-medium ${tcfg.bg} ${tcfg.text}`}>{item.display_tipo}</span>
                          {item.state && <span className={`text-[10px] px-1.5 py-0.5 rounded border font-medium ${sscfgD.bg} ${sscfgD.text} ${sscfgD.border}`}>{item.state}</span>}
                          {(item.priority ?? 99) <= 2 && <span className="text-[10px] px-1.5 py-0.5 rounded bg-red-500/10 text-red-400 border border-red-500/20">🔴 Alta</span>}
                          {item._globalVersion && <span className="text-[10px] px-1.5 py-0.5 rounded bg-ds-cyan/10 text-ds-cyan border border-ds-cyan/20 font-mono">v{item._globalVersion}</span>}
                          {!hasDeliveredVersionD && item.type !== 'Eventuality' && <span className="text-[10px] px-1.5 py-0.5 rounded bg-orange-500/10 text-orange-400 border border-orange-500/20 font-medium">⚠ Falta Versão</span>}
                          {!hasTagVersionD && <span className="text-[10px] px-1.5 py-0.5 rounded bg-yellow-500/10 text-yellow-400 border border-yellow-500/20 font-medium">🏷️ Falta Tag</span>}
                        </div>
                        <p className="text-sm text-ds-light-text leading-snug mb-1.5 line-clamp-2">{item.display_desc}</p>
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
                          {rec?.obs && <span className="text-ds-text/60 truncate max-w-[180px]" title={rec.obs}>💬 {rec.obs}</span>}
                        </div>
                      </div>
                      <span className={`text-xs px-2.5 py-1 rounded-full border font-medium flex items-center gap-1 shrink-0 ${scfg.bg} ${scfg.text} ${scfg.border}`}>
                        {scfg.icon} {scfg.label}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default QATrackerDashboard;
