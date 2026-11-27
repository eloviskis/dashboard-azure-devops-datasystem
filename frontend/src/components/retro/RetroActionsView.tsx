// Aba Retrô → Ações: fila de sugestões, quadro (A fazer / Em andamento / Validar / Fechada) e descartadas.
import React, { useMemo, useState } from 'react';
import { retroApi } from './retroApi.ts';
import type { ActionEdits, ActionState, Priority, RetroAction } from './retroApi.ts';
import type { RetroCtx } from './RetroDashboard.tsx';
import {
  ActionCard, Btn, Field, Input, LIVE, NOTE_COLORS, PRI_BORDER, PRI_LABEL, PersonSelect, PostIt, Select, STATE_LABEL, TeamTag,
  TextArea, TypePicker, norm, todayStr,
} from './retroUi.tsx';
import { TypesModal } from './RetroActionModals.tsx';

const LEADER_ONLY_MSG = 'Só a liderança fecha ou reabre ações. Quando terminar, mova para Validar.';
const PRI_ORDER: Record<Priority, number> = { alta: 0, media: 1, baixa: 2 };
const LANES: { state: ActionState; hint?: string; dot: string }[] = [
  { state: 'aberta', dot: 'bg-ds-text' },
  { state: 'andamento', dot: 'bg-amber-400' },
  { state: 'validacao', hint: 'Entregue pelo responsável, esperando a liderança conferir.', dot: 'bg-sky-400' },
  { state: 'concluida', dot: 'bg-ds-green' },
];

// Atrasadas primeiro, depois prazo, depois prioridade (mesma regra do backend, retroRules.sortActions).
const sortActions = (list: RetroAction[]) => [...list].sort((a, b) =>
  Number(b.late) - Number(a.late) || String(a.dueDate || '9999').localeCompare(String(b.dueDate || '9999'))
  || PRI_ORDER[a.priority] - PRI_ORDER[b.priority]);

type OwnerFilter = '' | '__none__' | string;

const RetroActionsView: React.FC<{ ctx: RetroCtx }> = ({ ctx }) => {
  const { config, types, actions, teamLabel } = ctx;
  const leader = config.isLeader;
  const [teamF, setTeamF] = useState<string[]>([]);
  const [ownerF, setOwnerF] = useState<OwnerFilter>('');
  const [typeF, setTypeF] = useState('');
  const [q, setQ] = useState('');
  const [showAllClosed, setShowAllClosed] = useState(false);
  const [showDiscarded, setShowDiscarded] = useState(false);
  const [typesOpen, setTypesOpen] = useState(false);
  const [dragOver, setDragOver] = useState<ActionState | null>(null);
  const [busy, setBusy] = useState(false);

  const owners = useMemo(() => [...new Set(actions.map(a => a.ownerName).filter(Boolean) as string[])].sort((a, b) => a.localeCompare(b, 'pt-BR')), [actions]);

  const filtered = useMemo(() => actions.filter(a => {
    if (teamF.length && !teamF.includes(a.teamKey)) return false;
    if (ownerF === '__none__' ? !!a.ownerName : ownerF && a.ownerName !== ownerF) return false;
    if (typeF === '__none__' ? a.typeIds.length > 0 : typeF && !a.typeIds.includes(typeF)) return false;
    if (q) {
      const hay = norm([a.title, a.detail, a.ownerName, teamLabel(a.teamKey), ...a.origin, ...a.typeIds.map(id => types.find(t => t.id === id)?.name)].join(' '));
      if (!hay.includes(norm(q))) return false;
    }
    return true;
  }), [actions, teamF, ownerF, typeF, q, types, teamLabel]);

  const suggestions = filtered.filter(a => a.state === 'sugerida').sort((a, b) => PRI_ORDER[a.priority] - PRI_ORDER[b.priority]);
  const discarded = filtered.filter(a => a.state === 'descartada');
  const live = filtered.filter(a => LIVE.includes(a.state));
  const lane = (s: ActionState) => s === 'concluida'
    ? live.filter(a => a.state === s).sort((a, b) => String(b.stateChangedAt || b.approvedAt || '').localeCompare(String(a.stateChangedAt || a.approvedAt || '')))
    : sortActions(live.filter(a => a.state === s));
  const lateCount = live.filter(a => a.late).length;

  async function run(fn: () => Promise<unknown>, ok?: string) {
    setBusy(true);
    try { await fn(); if (ok) ctx.toast(ok); await ctx.reload(); } catch (e) { ctx.toast((e as Error).message, true); } finally { setBusy(false); }
  }

  const move = (a: RetroAction, to: ActionState) => {
    if (a.state === to) return;
    if ((to === 'concluida' || a.state === 'concluida') && !leader) { ctx.toast(LEADER_ONLY_MSG, true); return; }
    run(() => retroApi.move(a.id, to));
  };

  const onDrop = (to: ActionState) => (e: React.DragEvent) => {
    e.preventDefault(); setDragOver(null);
    const a = actions.find(x => x.id === e.dataTransfer.getData('text/plain'));
    if (a) move(a, to);
  };

  return (
    <div className="space-y-5">
      {/* Filtros */}
      <div className="bg-ds-navy border border-ds-border rounded-lg p-3 space-y-3">
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filtrar por time">
          {config.teams.map(t => {
            const on = teamF.includes(t.key);
            return (
              <button key={t.key} type="button" aria-pressed={on} onClick={() => setTeamF(on ? teamF.filter(x => x !== t.key) : [...teamF, t.key])}
                className={`text-xs px-3 py-1 rounded-full border focus:outline-none focus-visible:ring-2 focus-visible:ring-ds-green ${on ? 'bg-ds-green/20 border-ds-green text-ds-green' : 'border-ds-border text-ds-text hover:text-ds-light-text'}`}>
                {t.label}{on ? ' ✓' : ''}
              </button>
            );
          })}
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
          <Select value={ownerF} onChange={e => setOwnerF(e.target.value)} aria-label="Filtrar por responsável">
            <option value="">Todos os responsáveis</option>
            <option value="__none__">Sem responsável</option>
            {owners.map(o => <option key={o} value={o}>{o}</option>)}
          </Select>
          <Select value={typeF} onChange={e => setTypeF(e.target.value)} aria-label="Filtrar por tipo">
            <option value="">Todos os tipos</option>
            <option value="__none__">Sem tipo</option>
            {types.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
          </Select>
          <Input placeholder="Buscar (título, detalhe, pessoa, tipo…)" value={q} onChange={e => setQ(e.target.value)} aria-label="Buscar ações" />
          <div className="flex gap-2 justify-end">
            <Btn onClick={() => ctx.newAction()}>+ Nova ação</Btn>
            {leader && <Btn onClick={() => setTypesOpen(true)}>Tipos de ação</Btn>}
          </div>
        </div>
      </div>

      {/* Sugestões */}
      <section aria-labelledby="sug-h" className="space-y-3">
        <h3 id="sug-h" className="text-sm font-semibold text-ds-light-text">
          Sugestões das retros <span className="text-ds-text font-normal">({suggestions.length})</span>
        </h3>
        {suggestions.length === 0
          ? <p className="text-sm text-ds-text">Nenhuma sugestão pendente{teamF.length || ownerF || typeF || q ? ' com esses filtros' : ''}.</p>
          : <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">{suggestions.map(a => <SuggestionCard key={a.id} a={a} ctx={ctx} busy={busy} run={run} />)}</div>}
      </section>

      {/* Quadro */}
      <section aria-labelledby="board-h" className="space-y-3">
        <h3 id="board-h" className="text-sm font-semibold text-ds-light-text">
          Quadro <span className="text-ds-text font-normal">
            · {lane('aberta').length} a fazer, {lane('andamento').length} em andamento, {lane('validacao').length} para validar, {lane('concluida').length} fechadas
            {lateCount > 0 && <span className="text-red-300 font-semibold"> · {lateCount} atrasada{lateCount > 1 ? 's' : ''}</span>}
          </span>
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
          {LANES.map(({ state, hint, dot }) => {
            const items = lane(state);
            const shown = state === 'concluida' && !showAllClosed ? items.slice(0, 10) : items;
            return (
              <div key={state} onDragOver={e => { e.preventDefault(); setDragOver(state); }} onDragLeave={() => setDragOver(null)} onDrop={onDrop(state)}
                className={`rounded-lg border p-2 space-y-2 min-h-[120px] transition-colors ${dragOver === state ? 'border-ds-green bg-ds-green/5' : 'border-ds-border bg-ds-navy/60'}`}
                aria-label={`Coluna ${STATE_LABEL[state]}`}>
                <div className="flex items-center gap-2 px-1">
                  <span aria-hidden className={`w-2 h-2 rounded-full ${dot}`} />
                  <span className="text-sm font-semibold text-ds-light-text">{STATE_LABEL[state]}</span>
                  <span className="text-xs text-ds-text">{items.length}</span>
                </div>
                {hint && <p className="text-[11px] text-ds-text px-1">{hint}</p>}
                {shown.map(a => (
                  <ActionCard key={a.id} a={a} types={types} teams={config.teams}
                    draggable={a.state !== 'concluida' || leader}
                    onDragStart={e => e.dataTransfer.setData('text/plain', a.id)}
                    onOpen={() => ctx.openAction(a.id)}
                    onRetry={() => run(() => retroApi.azdoRetry(a.id), 'Reenviando ao Azure DevOps…')}
                    footer={state === 'validacao' && leader ? (
                      <div className="flex gap-2 pt-1">
                        <Btn disabled={busy} onClick={() => move(a, 'andamento')}>Devolver</Btn>
                        <Btn variant="primary" disabled={busy} onClick={() => move(a, 'concluida')}>Fechar</Btn>
                      </div>
                    ) : undefined} />
                ))}
                {state === 'concluida' && items.length > 10 && (
                  <button type="button" className="text-xs text-ds-text underline px-1" onClick={() => setShowAllClosed(v => !v)}>
                    {showAllClosed ? 'Mostrar menos' : `Mostrar todas (${items.length})`}
                  </button>
                )}
              </div>
            );
          })}
        </div>
        <p className="text-[11px] text-ds-text">Arraste os cards entre as colunas, ou abra o card e mude o estado (teclado e celular).</p>
      </section>

      {/* Descartadas */}
      <section>
        <button type="button" aria-expanded={showDiscarded} onClick={() => setShowDiscarded(v => !v)} className="text-sm text-ds-text hover:text-ds-light-text">
          {showDiscarded ? '▾' : '▸'} Descartadas ({discarded.length})
        </button>
        {showDiscarded && (
          <ul className="mt-2 space-y-1">
            {discarded.map(a => (
              <li key={a.id} className="flex flex-wrap items-center gap-2 text-sm bg-ds-navy border border-ds-border rounded-lg px-3 py-2">
                <button type="button" className="text-ds-text hover:text-ds-light-text text-left flex-1" onClick={() => ctx.openAction(a.id)}>{a.title}</button>
                <TeamTag label={teamLabel(a.teamKey)} />
                {leader && <Btn disabled={busy} onClick={() => run(() => retroApi.restore(a.id), 'Voltou para as sugestões')}>Voltar para sugestões</Btn>}
              </li>
            ))}
          </ul>
        )}
      </section>

      {typesOpen && <TypesModal ctx={ctx} onClose={() => setTypesOpen(false)} />}
    </div>
  );
};

// Sugestão editável: título, detalhe, responsável (do time), prazo/recorrente, prioridade e tipos.
const SuggestionCard: React.FC<{ a: RetroAction; ctx: RetroCtx; busy: boolean; run: (fn: () => Promise<unknown>, ok?: string) => Promise<void> }> = ({ a, ctx, busy, run }) => {
  const { config, types, people, byTeam, teamLabel } = ctx;
  const [d, setD] = useState<ActionEdits>({
    title: a.title, detail: a.detail, ownerId: a.ownerId, dueDate: a.dueDate, recurring: a.recurring, priority: a.priority, typeIds: a.typeIds,
  });
  const dirty = JSON.stringify(d) !== JSON.stringify({ title: a.title, detail: a.detail, ownerId: a.ownerId, dueDate: a.dueDate, recurring: a.recurring, priority: a.priority, typeIds: a.typeIds });
  const set = (p: ActionEdits) => setD(prev => ({ ...prev, ...p }));
  const approve = () => {
    if (!String(d.title || '').trim()) { ctx.toast('Informe o título antes de aprovar', true); return; }
    if (!d.ownerId && !a.ownerNameFallback) { ctx.toast('Escolha o responsável antes de aprovar', true); return; }
    run(() => retroApi.approve(a.id, d), 'Ação aprovada. O item será criado no board Kaizen.');
  };
  return (
    <article className="bg-ds-navy border border-ds-border rounded-lg p-3 space-y-3" style={{ borderLeft: `5px solid ${PRI_BORDER[d.priority || 'media']}` }} aria-label={`Sugestão: ${a.title}`}>
      <div className="flex flex-wrap items-center gap-2 text-[11px] text-ds-text">
        <TeamTag label={teamLabel(a.teamKey)} />
        <span>{a.source === 'ia' ? 'Sugerida pela IA' : `Sugerida pelo time${a.createdByName ? ` (${a.createdByName})` : ''}`}</span>
        {a.retroTitle && <span>· {a.retroTitle}</span>}
      </div>
      <Field label="Título"><Input value={d.title || ''} onChange={e => set({ title: e.target.value })} maxLength={140} /></Field>
      <Field label="Detalhe"><TextArea value={d.detail || ''} onChange={e => set({ detail: e.target.value })} rows={2} /></Field>
      {a.origin.length > 0 && (
        <div>
          <span className="block text-xs font-medium text-ds-text mb-1">Cards de origem</span>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">{a.origin.map((o, i) => <PostIt key={i} small text={o} color={NOTE_COLORS[i % 5]} />)}</div>
        </div>
      )}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Field label="Responsável">
          <PersonSelect people={people} teamIds={byTeam[a.teamKey]} value={d.ownerId ?? null} fallback={a.ownerNameFallback} onChange={id => set({ ownerId: id })} />
        </Field>
        <div className="space-y-3">
          <Field label="Prazo">
            <div className="flex gap-1">
              <Input type="date" value={d.recurring ? '' : d.dueDate || ''} min={todayStr()} disabled={!!d.recurring} onChange={e => set({ dueDate: e.target.value || null })} />
              <Btn aria-pressed={!!d.recurring} onClick={() => set({ recurring: !d.recurring, dueDate: null })} className={d.recurring ? 'border-ds-cyan text-ds-cyan' : ''}
                title="Hábito sem data: nunca fica atrasado">↻ Recorrente</Btn>
            </div>
          </Field>
          <Field label="Prioridade">
            <Select value={d.priority} onChange={e => set({ priority: e.target.value as Priority })}>
              {(['alta', 'media', 'baixa'] as Priority[]).map(p => <option key={p} value={p}>{PRI_LABEL[p]}</option>)}
            </Select>
          </Field>
        </div>
      </div>
      <div><span className="block text-xs font-medium text-ds-text mb-1">Tipo</span><TypePicker types={types} value={d.typeIds || []} onChange={ids => set({ typeIds: ids })} /></div>
      <div className="flex flex-wrap gap-2 justify-end">
        {dirty && <Btn disabled={busy} onClick={() => run(() => retroApi.updateAction(a.id, d), 'Sugestão salva')}>Salvar</Btn>}
        {config.isLeader && <>
          <Btn variant="danger" disabled={busy} onClick={() => run(() => retroApi.discard(a.id), 'Sugestão descartada')}>Descartar</Btn>
          <Btn variant="primary" disabled={busy} onClick={approve}>Aprovar</Btn>
        </>}
      </div>
      {!config.isLeader && <p className="text-[11px] text-ds-text">A liderança aprova ou descarta as sugestões.</p>}
    </article>
  );
};

export default RetroActionsView;
