// Peças visuais da aba Retrô (padrão local dos dashboards: Modal/Input/Select com tokens ds-*).
import React, { useEffect, useMemo, useRef, useState } from 'react';
import type { ActionState, ActionType, Person, Priority, RetroAction, RetroTeam, Tone } from './retroApi.ts';
import { norm, splitMerged, todayStr } from '../../utils/retroParser.ts';

export { norm, todayStr };

export const STATE_LABEL: Record<ActionState, string> = {
  sugerida: 'Sugestão', aberta: 'A fazer', andamento: 'Em andamento', validacao: 'Validar', concluida: 'Fechada', descartada: 'Descartada',
};
export const LIVE: ActionState[] = ['aberta', 'andamento', 'validacao', 'concluida'];
export const PRI_LABEL: Record<Priority, string> = { alta: 'Alta', media: 'Média', baixa: 'Baixa' };
export const PRI_BORDER: Record<Priority, string> = { alta: '#F2766B', media: '#E8A33D', baixa: '#163050' };
export const TONE_LABEL: Record<Tone, string> = { positivo: 'Positivo', atencao: 'Atenção', critico: 'Crítico' };
export const TONE_CLASS: Record<Tone, string> = {
  positivo: 'text-ds-green border-ds-green/40', atencao: 'text-amber-300 border-amber-300/40', critico: 'text-red-300 border-red-300/40',
};
// Cores dos post-its por coluna (paleta escura do protótipo) e da tinta sobre eles.
export const NOTE_COLORS = ['#E8CB6A', '#A6D893', '#94CBE4', '#9ED6CF', '#E3AE86'];
export const NOTE_INK = '#14273A';
export const TYPE_HUES: { hue: number; name: string }[] = [
  { hue: 205, name: 'Azul' }, { hue: 125, name: 'Verde' }, { hue: 275, name: 'Roxo' }, { hue: 30, name: 'Laranja' }, { hue: 175, name: 'Teal' },
  { hue: 330, name: 'Rosa' }, { hue: 48, name: 'Amarelo' }, { hue: 0, name: 'Vermelho' }, { hue: 235, name: 'Índigo' }, { hue: 290, name: 'Magenta' },
];

export function fmtDate(iso: string | null | undefined, long = false) {
  if (!iso) return '';
  const [y, m, d] = String(iso).slice(0, 10).split('-');
  return long || y !== String(new Date().getFullYear()) ? `${d}/${m}/${y}` : `${d}/${m}`;
}
export const fmtDateTime = (iso: string | null | undefined) => (iso ? new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : '');
export const initials = (name: string | null | undefined) =>
  String(name || '?').split(/\s+|,|\s+e\s+/).filter(w => w && w.toLowerCase() !== 'e').slice(0, 2).map(w => w[0]?.toUpperCase()).join('') || '?';
export const hashHue = (s: string) => { let x = 0; for (const ch of s) x = (x * 31 + ch.charCodeAt(0)) >>> 0; return x % 360; };

// ---------------------------------------------------------------- base
export const Modal: React.FC<{ title: string; onClose: () => void; children: React.ReactNode; wide?: boolean }> = ({ title, onClose, children, wide }) => {
  const ref = useRef<HTMLDivElement>(null);
  // onClose num ref: o efeito roda só ao abrir. Com onClose nas dependências, cada re-render do pai (que passa
  // uma arrow nova) devolvia o foco pro primeiro campo no meio da digitação.
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    ref.current?.querySelector<HTMLElement>('input, select, textarea, button')?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') closeRef.current(); };
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('keydown', onKey); prev?.focus?.(); };
  }, []);
  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" onMouseDown={e => e.target === e.currentTarget && onClose()}>
      <div ref={ref} role="dialog" aria-modal="true" aria-label={title}
        className={`bg-ds-navy border border-ds-border rounded-xl shadow-2xl w-full ${wide ? 'max-w-3xl' : 'max-w-lg'} max-h-[90vh] overflow-y-auto`}>
        <div className="flex items-center justify-between p-5 border-b border-ds-border sticky top-0 bg-ds-navy z-10">
          <h3 className="text-base font-semibold text-ds-light-text">{title}</h3>
          <button onClick={onClose} aria-label="Fechar" className="text-ds-text hover:text-ds-light-text text-xl leading-none">&times;</button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
};

const inputCls = 'w-full bg-ds-dark-blue border border-ds-border text-ds-light-text rounded-lg px-3 py-2 text-sm placeholder:text-ds-text/50 focus:outline-none focus:border-ds-green focus:ring-1 focus:ring-ds-green/30 disabled:opacity-50';
export const Field: React.FC<{ label: string; children: React.ReactNode; className?: string }> = ({ label, children, className = '' }) => (
  <label className={`block ${className}`}><span className="block text-xs font-medium text-ds-text mb-1">{label}</span>{children}</label>
);
export const Input = (p: React.InputHTMLAttributes<HTMLInputElement>) => <input {...p} className={`${inputCls} ${p.className || ''}`} />;
export const TextArea = (p: React.TextareaHTMLAttributes<HTMLTextAreaElement>) => <textarea rows={3} {...p} className={`${inputCls} ${p.className || ''}`} />;
export const Select = (p: React.SelectHTMLAttributes<HTMLSelectElement>) => <select {...p} className={`${inputCls} ${p.className || ''}`} />;

export const Btn: React.FC<React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'ghost' | 'danger' }> = ({ variant = 'ghost', className = '', ...p }) => {
  const v = variant === 'primary' ? 'bg-ds-green text-ds-dark-blue font-semibold hover:brightness-110 border-ds-green'
    : variant === 'danger' ? 'text-red-300 border-red-400/40 hover:bg-red-400/10' : 'text-ds-light-text border-ds-border hover:border-ds-text';
  return <button type="button" {...p} className={`text-xs px-3 py-1.5 rounded-lg border transition-colors disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus-visible:ring-2 focus-visible:ring-ds-green ${v} ${className}`} />;
};

// ---------------------------------------------------------------- tags
// Tipo de ação: canto reto + quadradinho colorido. Time: pílula arredondada.
export const TypeTag: React.FC<{ type: ActionType }> = ({ type }) => (
  <span className="inline-flex items-center gap-1.5 text-[11px] leading-none px-1.5 py-1 rounded-[4px] border"
    style={{ borderColor: `hsl(${type.hue} 55% 45% / .6)`, color: `hsl(${type.hue} 55% 86%)` }}>
    <span aria-hidden className="w-[7px] h-[7px] rounded-[2px]" style={{ background: `hsl(${type.hue} 62% 50%)` }} />
    {type.name}
  </span>
);
export const TeamTag: React.FC<{ label: string }> = ({ label }) => {
  const h = hashHue(label);
  return <span className="inline-block text-[11px] leading-none px-2 py-1 rounded-full" style={{ background: `hsl(${h} 30% 22%)`, color: `hsl(${h} 60% 85%)` }}>{label}</span>;
};
export const TypeTags: React.FC<{ ids: string[]; types: ActionType[] }> = ({ ids, types }) => (
  <>{ids.map(id => types.find(t => t.id === id)).filter((t): t is ActionType => !!t).map(t => <TypeTag key={t.id} type={t} />)}</>
);

// Seleção múltipla de tipos: selecionado preenchido, não selecionado tracejado. aria-pressed pra leitores de tela.
export const TypePicker: React.FC<{ types: ActionType[]; value: string[]; onChange: (ids: string[]) => void; disabled?: boolean }> = ({ types, value, onChange, disabled }) => (
  <div className="flex flex-wrap gap-1.5" role="group" aria-label="Tipo da ação">
    {types.map(t => {
      const on = value.includes(t.id);
      return (
        <button key={t.id} type="button" disabled={disabled} aria-pressed={on}
          onClick={() => onChange(on ? value.filter(x => x !== t.id) : [...value, t.id])}
          className="inline-flex items-center gap-1.5 text-[11px] px-1.5 py-1 rounded-[4px] border focus:outline-none focus-visible:ring-2 focus-visible:ring-ds-green disabled:opacity-50"
          style={{
            borderStyle: on ? 'solid' : 'dashed', borderColor: on ? `hsl(${t.hue} 55% 55%)` : `hsl(${t.hue} 30% 45% / .7)`,
            background: on ? `hsl(${t.hue} 28% 24%)` : 'transparent', color: `hsl(${t.hue} 55% ${on ? 90 : 75}%)`,
          }}>
          <span aria-hidden className="w-[7px] h-[7px] rounded-[2px]" style={{ background: `hsl(${t.hue} 62% 50%)`, opacity: on ? 1 : 0.5 }} />
          {t.name}{on ? ' ✓' : ''}
        </button>
      );
    })}
  </div>
);

// ---------------------------------------------------------------- pessoas
// Responsável: pessoas do time primeiro (quem teve work item no time nos últimos 180 dias), com busca.
export const PersonSelect: React.FC<{
  people: Person[]; teamIds?: number[]; value: number | null; fallback?: string | null;
  onChange: (id: number | null) => void; disabled?: boolean;
}> = ({ people, teamIds, value, fallback, onChange, disabled }) => {
  const [q, setQ] = useState('');
  const [all, setAll] = useState(!teamIds?.length);
  const list = useMemo(() => {
    const base = all || !teamIds?.length ? people : people.filter(p => teamIds.includes(p.id) || p.id === value);
    return base.filter(p => !q || norm(p.name).includes(norm(q)));
  }, [people, teamIds, all, q, value]);
  return (
    <div className="space-y-1">
      <div className="flex gap-1">
        <Input placeholder="Buscar pessoa…" value={q} onChange={e => setQ(e.target.value)} disabled={disabled} aria-label="Buscar responsável" />
        {!!teamIds?.length && (
          <Btn onClick={() => setAll(a => !a)} disabled={disabled} title="Alternar entre pessoas do time e todas">{all ? 'Só do time' : 'Todas'}</Btn>
        )}
      </div>
      <Select value={value ?? ''} onChange={e => onChange(e.target.value ? Number(e.target.value) : null)} disabled={disabled} aria-label="Responsável">
        <option value="">{fallback ? `Sem cadastro (${fallback})` : '— Sem responsável —'}</option>
        {list.map(p => <option key={p.id} value={p.id}>{p.name}{p.active ? '' : ' (inativo)'}</option>)}
      </Select>
    </div>
  );
};

export const Initials: React.FC<{ name: string | null }> = ({ name }) => {
  const h = hashHue(name || '?');
  return (
    <span aria-hidden className="inline-flex items-center justify-center w-6 h-6 rounded-full text-[10px] font-bold shrink-0"
      style={{ background: `hsl(${h} 35% 30%)`, color: `hsl(${h} 70% 88%)` }}>{initials(name)}</span>
  );
};

// ---------------------------------------------------------------- post-it
const ROT = [-1.1, 0.7, -0.4, 1, -0.7, 0.3, -0.2, 0.9];
export const PostIt: React.FC<{ text: string; votes?: number; comments?: string[]; color: string; index?: number; small?: boolean; children?: React.ReactNode }> = ({ text, votes = 0, comments = [], color, index = 0, small, children }) => (
  <div className={`relative shadow-md ${small ? 'p-2 text-[11px]' : 'p-3 text-sm'}`}
    style={{ background: color, color: NOTE_INK, borderRadius: '2px 2px 14px 2px', transform: small ? undefined : `rotate(${ROT[index % 8]}deg)` }}>
    {splitMerged(text).map((part, i) => (
      <React.Fragment key={i}>{i > 0 && <hr className="my-1.5 border-0 border-t border-dashed" style={{ borderColor: `${NOTE_INK}55` }} />}
        <p className="whitespace-pre-wrap break-words">{part}</p></React.Fragment>
    ))}
    {(votes > 0 || comments.length > 0) && (
      <div className="mt-2 space-y-1">
        {votes > 0 && <span className="inline-block text-[11px] font-semibold px-1.5 py-0.5 rounded-full" style={{ background: 'rgba(42,36,25,.15)' }}>{votes} {votes === 1 ? 'voto' : 'votos'}</span>}
        {comments.map((c, i) => <p key={i} className="text-[12px] opacity-90">↳ {c}</p>)}
      </div>
    )}
    {children}
  </div>
);

// ---------------------------------------------------------------- card de ação do quadro
export function dueLabel(a: Pick<RetroAction, 'recurring' | 'dueDate' | 'late'>) {
  if (a.recurring) return { text: '↻ Recorrente', cls: 'text-ds-cyan' };
  if (!a.dueDate) return null;
  return a.late ? { text: `Venceu em ${fmtDate(a.dueDate)}`, cls: 'text-red-300 font-bold' } : { text: `Até ${fmtDate(a.dueDate)}`, cls: 'text-ds-text' };
}

export const AzdoBadge: React.FC<{ a: RetroAction; onRetry?: () => void }> = ({ a, onRetry }) => {
  if (a.azdo.workItemId && a.azdo.url) {
    return (
      <a href={a.azdo.url} target="_blank" rel="noreferrer" onClick={e => e.stopPropagation()}
        className="text-[11px] text-sky-300 hover:underline" title="Abrir no Azure DevOps (board Melhoria Contínua - Kaizen)">#{a.azdo.workItemId}</a>
    );
  }
  if (a.azdo.status === 'erro') {
    return (
      <span className="inline-flex items-center gap-1 text-[11px] text-red-300" title={a.azdo.error || ''}>
        ⚠ Falha no Azure DevOps
        {onRetry && <button type="button" onClick={e => { e.stopPropagation(); onRetry(); }} className="underline hover:text-red-200">Tentar de novo</button>}
      </span>
    );
  }
  if (a.azdo.status === 'simulado') return <span className="text-[11px] text-ds-text" title="RETRO_AZDO_WRITE_ENABLED desligado no servidor">Azure DevOps: simulado</span>;
  if (a.azdo.status === 'pendente' || a.azdo.status === 'enviando') return <span className="text-[11px] text-ds-text">Enviando ao Azure DevOps…</span>;
  return null;
};

export const ActionCard: React.FC<{
  a: RetroAction; types: ActionType[]; teams: RetroTeam[]; draggable?: boolean; onOpen: () => void;
  onDragStart?: (e: React.DragEvent) => void; onRetry?: () => void; footer?: React.ReactNode;
}> = ({ a, types, teams, draggable, onOpen, onDragStart, onRetry, footer }) => {
  const due = dueLabel(a);
  return (
    <div draggable={draggable} onDragStart={onDragStart}
      className="bg-ds-dark-blue border border-ds-border rounded-lg p-3 space-y-2 hover:border-ds-text/60 transition-colors"
      style={{ borderLeft: `4px solid ${PRI_BORDER[a.priority]}` }}>
      <button type="button" onClick={onOpen}
        className={`text-left text-sm font-medium w-full focus:outline-none focus-visible:underline ${a.state === 'concluida' ? 'line-through text-ds-text' : 'text-ds-light-text'}`}>
        {a.title}
      </button>
      <div className="flex flex-wrap gap-1"><TypeTags ids={a.typeIds} types={types} /></div>
      <div className="flex items-center justify-between gap-2 text-[11px]">
        <span className="flex items-center gap-1.5 min-w-0">
          <Initials name={a.ownerName} />
          <span className="truncate text-ds-text">{a.ownerName || 'Sem responsável'}</span>
        </span>
        {due && <span className={due.cls}>{due.text}</span>}
      </div>
      <div className="flex flex-wrap items-center gap-2 text-[11px] text-ds-text">
        <TeamTag label={teams.find(t => t.key === a.teamKey)?.label || a.teamKey} />
        <span>Prioridade {PRI_LABEL[a.priority]}</span>
        {a.updatesCount > 0 && <span>{a.updatesCount} {a.updatesCount === 1 ? 'atualização' : 'atualizações'}</span>}
        <AzdoBadge a={a} onRetry={onRetry} />
      </div>
      {footer}
    </div>
  );
};

// ---------------------------------------------------------------- aviso flutuante
export function useToast() {
  const [msg, setMsg] = useState<{ text: string; error?: boolean } | null>(null);
  useEffect(() => { if (!msg) return; const t = setTimeout(() => setMsg(null), 5000); return () => clearTimeout(t); }, [msg]);
  const node = msg && (
    <div role="status" aria-live="polite"
      className={`fixed bottom-4 right-4 z-[60] max-w-sm px-4 py-3 rounded-lg shadow-xl text-sm border ${msg.error ? 'bg-red-950 border-red-400/50 text-red-100' : 'bg-ds-navy border-ds-green/50 text-ds-light-text'}`}>
      {msg.text}
    </div>
  );
  return { toast: (text: string, error = false) => setMsg({ text, error }), toastNode: node };
}
