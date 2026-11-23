// Aba Retrô: detalhe da ação, nova ação e cadastro de tipos.
import React, { useEffect, useState } from 'react';
import { retroApi } from './retroApi.ts';
import type { ActionEdits, ActionState, ActionType, Priority, RetroAction } from './retroApi.ts';
import type { RetroCtx } from './RetroDashboard.tsx';
import {
  AzdoBadge, Btn, Field, Input, LIVE, Modal, NOTE_COLORS, PRI_LABEL, PersonSelect, PostIt, STATE_LABEL, Select, TYPE_HUES, TextArea,
  TypePicker, TypeTag, fmtDate, fmtDateTime,
} from './retroUi.tsx';

export interface NewActionPrefill { teamKey?: string; retroId?: string | null; origin?: string[]; title?: string }

const PRIORITIES: Priority[] = ['alta', 'media', 'baixa'];

// Prazo com o atalho "↻ Recorrente" (hábito sem data: limpa e desativa a data).
const DueField: React.FC<{ d: ActionEdits; set: (p: ActionEdits) => void; disabled?: boolean }> = ({ d, set, disabled }) => (
  <Field label="Prazo">
    <div className="flex gap-1">
      <Input type="date" value={d.recurring ? '' : d.dueDate || ''} disabled={disabled || !!d.recurring} onChange={e => set({ dueDate: e.target.value || null })} />
      <Btn aria-pressed={!!d.recurring} disabled={disabled} onClick={() => set({ recurring: !d.recurring, dueDate: null })}
        className={d.recurring ? 'border-ds-cyan text-ds-cyan' : ''} title="Hábito sem data: nunca fica atrasado">↻ Recorrente</Btn>
    </div>
  </Field>
);

// ---------------------------------------------------------------- detalhe
export const ActionDetailModal: React.FC<{ ctx: RetroCtx; id: string; onClose: () => void }> = ({ ctx, id, onClose }) => {
  const { config, types, people, byTeam } = ctx;
  const leader = config.isLeader;
  const [a, setA] = useState<RetroAction | null>(null);
  const [d, setD] = useState<ActionEdits>({});
  const [update, setUpdate] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const load = async () => {
    try {
      const x = await retroApi.action(id);
      setA(x);
      setD({ title: x.title, detail: x.detail, teamKey: x.teamKey, ownerId: x.ownerId, dueDate: x.dueDate, recurring: x.recurring, priority: x.priority, typeIds: x.typeIds });
    } catch (e) { setErr((e as Error).message); }
  };
  useEffect(() => { load(); }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  const run = async (fn: () => Promise<unknown>, ok?: string, close = false) => {
    setBusy(true);
    try { await fn(); if (ok) ctx.toast(ok); await ctx.reload(); if (close) onClose(); else await load(); }
    catch (e) { ctx.toast((e as Error).message, true); } finally { setBusy(false); }
  };

  // Mudar o estado não recarrega o formulário: as edições ainda não salvas (título, prazo…) continuam lá.
  const moveState = async (to: ActionState) => {
    setBusy(true);
    try {
      const moved = await retroApi.move(id, to);
      setA(prev => (prev ? { ...prev, ...moved, updates: prev.updates } : prev));
      await ctx.reload();
    } catch (e) { ctx.toast((e as Error).message, true); } finally { setBusy(false); }
  };

  if (err) return <Modal title="Ação" onClose={onClose}><p className="text-red-300 text-sm">{err}</p></Modal>;
  if (!a) return <Modal title="Ação" onClose={onClose}><p className="text-ds-text text-sm">Carregando…</p></Modal>;

  const locked = a.state === 'concluida' && !leader;
  const set = (p: ActionEdits) => setD(prev => ({ ...prev, ...p }));
  const dirty = (['title', 'detail', 'teamKey', 'ownerId', 'dueDate', 'recurring', 'priority'] as const).some(k => d[k] !== a[k])
    || JSON.stringify(d.typeIds) !== JSON.stringify(a.typeIds);

  return (
    <Modal title={a.state === 'sugerida' ? 'Sugestão de ação' : 'Ação'} onClose={onClose} wide>
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-3 text-xs text-ds-text">
          <span className="px-2 py-0.5 rounded-full border border-ds-border text-ds-light-text">{STATE_LABEL[a.state]}</span>
          {a.retroTitle && <span>Retro: {a.retroTitle}{a.retroDate ? ` (${fmtDate(a.retroDate, true)})` : ''}</span>}
          {a.approvedByName && <span>Aprovada por {a.approvedByName} em {fmtDateTime(a.approvedAt)}</span>}
          {a.closedByName && a.state === 'concluida' && <span>Fechada por {a.closedByName}</span>}
          <AzdoBadge a={a} onRetry={() => run(() => retroApi.azdoRetry(a.id), 'Reenviando ao Azure DevOps…')} />
        </div>
        {locked && <p className="text-xs text-amber-300">Ação fechada: só a liderança edita ou reabre.</p>}

        <Field label="Título"><Input value={d.title || ''} onChange={e => set({ title: e.target.value })} disabled={locked} maxLength={140} /></Field>
        <Field label="Detalhe"><TextArea value={d.detail || ''} onChange={e => set({ detail: e.target.value })} disabled={locked} /></Field>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="Time">
            <Select value={d.teamKey} onChange={e => set({ teamKey: e.target.value })} disabled={locked}>
              {config.teams.map(t => <option key={t.key} value={t.key}>{t.label}</option>)}
            </Select>
          </Field>
          <Field label="Estado">
            {LIVE.includes(a.state) ? (
              <Select value={a.state} disabled={busy || locked} onChange={e => moveState(e.target.value as ActionState)}>
                {LIVE.map(s => <option key={s} value={s} disabled={s === 'concluida' && !leader}>{STATE_LABEL[s]}{s === 'concluida' && !leader ? ' (só liderança)' : ''}</option>)}
              </Select>
            ) : <Input value={STATE_LABEL[a.state]} disabled />}
          </Field>
          <Field label="Responsável">
            <PersonSelect people={people} teamIds={byTeam[d.teamKey || a.teamKey]} value={d.ownerId ?? null} fallback={a.ownerNameFallback}
              onChange={idv => set({ ownerId: idv })} disabled={locked} />
          </Field>
          <div className="space-y-3">
            <DueField d={d} set={set} disabled={locked} />
            <Field label="Prioridade">
              <Select value={d.priority} onChange={e => set({ priority: e.target.value as Priority })} disabled={locked}>
                {PRIORITIES.map(p => <option key={p} value={p}>{PRI_LABEL[p]}</option>)}
              </Select>
            </Field>
          </div>
        </div>
        <div><span className="block text-xs font-medium text-ds-text mb-1">Tipo</span>
          <TypePicker types={types} value={d.typeIds || []} onChange={ids => set({ typeIds: ids })} disabled={locked} /></div>

        {a.origin.length > 0 && (
          <div><span className="block text-xs font-medium text-ds-text mb-1">Cards de origem</span>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">{a.origin.map((o, i) => <PostIt key={i} small text={o} color={NOTE_COLORS[i % 5]} />)}</div></div>
        )}

        <div className="flex flex-wrap gap-2 justify-end border-t border-ds-border pt-3">
          {leader && a.state !== 'descartada' && (
            <Btn variant="danger" disabled={busy} onClick={() => run(() => retroApi.discard(a.id), 'Ação descartada', true)}>Descartar</Btn>
          )}
          {leader && (
            <Btn variant="danger" disabled={busy} onClick={() => {
              if (window.confirm(`Excluir a ação "${a.title}"? Isso não pode ser desfeito. Se quiser só tirar do quadro, use Descartar.`)) {
                run(() => retroApi.deleteAction(a.id), 'Ação excluída', true);
              }
            }}>Excluir</Btn>
          )}
          {leader && a.state === 'descartada' && <Btn disabled={busy} onClick={() => run(() => retroApi.restore(a.id), 'Voltou para as sugestões')}>Voltar para sugestões</Btn>}
          {dirty && !locked && <Btn disabled={busy} onClick={() => run(() => retroApi.updateAction(a.id, d), 'Alterações salvas')}>Salvar</Btn>}
          {leader && a.state === 'sugerida' && (
            <Btn variant="primary" disabled={busy} onClick={() => run(() => retroApi.approve(a.id, d), 'Ação aprovada. O item será criado no board Kaizen.')}>Aprovar</Btn>
          )}
        </div>

        {/* Acompanhamento */}
        <section className="space-y-2 border-t border-ds-border pt-3" aria-labelledby="upd-h">
          <h4 id="upd-h" className="text-sm font-semibold text-ds-light-text">Acompanhamento</h4>
          {(a.updates || []).length === 0 && <p className="text-xs text-ds-text">Nenhuma atualização ainda.</p>}
          <ol className="space-y-2">
            {(a.updates || []).map(u => (
              <li key={u.id} className="text-sm bg-ds-dark-blue border border-ds-border rounded-lg px-3 py-2">
                <p className="text-ds-light-text whitespace-pre-wrap">{u.text}</p>
                <p className="text-[11px] text-ds-text mt-1">{u.authorName || 'alguém'} · {fmtDateTime(u.createdAt)}</p>
              </li>
            ))}
          </ol>
          <Field label="Registrar atualização">
            <TextArea value={update} onChange={e => setUpdate(e.target.value)} rows={2} placeholder="O que andou, o que travou, próximo passo…" />
          </Field>
          <div className="flex justify-end">
            <Btn disabled={busy || !update.trim()} onClick={() => run(async () => { await retroApi.addUpdate(a.id, update.trim()); setUpdate(''); }, 'Atualização registrada')}>Registrar</Btn>
          </div>
        </section>
      </div>
    </Modal>
  );
};

// ---------------------------------------------------------------- nova ação
export const NewActionModal: React.FC<{ ctx: RetroCtx; prefill: NewActionPrefill; onClose: () => void }> = ({ ctx, prefill, onClose }) => {
  const { config, types, people, byTeam } = ctx;
  const [d, setD] = useState<ActionEdits & { title: string; teamKey: string }>({
    title: prefill.title || '', detail: '', teamKey: prefill.teamKey || config.teams[0]?.key || '', ownerId: null, dueDate: null,
    recurring: false, priority: 'media', typeIds: [], origin: prefill.origin || [],
  });
  const [busy, setBusy] = useState(false);
  const set = (p: ActionEdits) => setD(prev => ({ ...prev, ...p }));
  const save = async () => {
    if (!d.title.trim()) { ctx.toast('Informe o título', true); return; }
    if (config.isLeader && !d.ownerId) { ctx.toast('Escolha o responsável', true); return; }
    setBusy(true);
    try {
      await retroApi.createAction({ ...d, retroId: prefill.retroId || null });
      ctx.toast(config.isLeader ? 'Ação criada em A fazer. O item será criado no board Kaizen.' : 'Sugestão enviada para a liderança.');
      await ctx.reload();
      onClose();
    } catch (e) { ctx.toast((e as Error).message, true); } finally { setBusy(false); }
  };
  return (
    <Modal title={config.isLeader ? 'Nova ação' : 'Sugerir ação'} onClose={onClose} wide>
      <div className="space-y-4">
        {!config.isLeader && <p className="text-xs text-ds-text">A ação entra como sugestão. A liderança aprova antes de ir para o quadro.</p>}
        {(d.origin || []).length > 0 && (
          <div><span className="block text-xs font-medium text-ds-text mb-1">Card de origem</span>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">{(d.origin || []).map((o, i) => <PostIt key={i} small text={o} color={NOTE_COLORS[i % 5]} />)}</div></div>
        )}
        <Field label="Título"><Input value={d.title} onChange={e => set({ title: e.target.value })} maxLength={140} placeholder="Começa com verbo: Definir, Criar, Revisar…" /></Field>
        <Field label="Detalhe"><TextArea value={d.detail || ''} onChange={e => set({ detail: e.target.value })} placeholder="O que fazer e como saber que foi feito" /></Field>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="Time">
            <Select value={d.teamKey} onChange={e => set({ teamKey: e.target.value })}>{config.teams.map(t => <option key={t.key} value={t.key}>{t.label}</option>)}</Select>
          </Field>
          <Field label="Prioridade">
            <Select value={d.priority} onChange={e => set({ priority: e.target.value as Priority })}>{PRIORITIES.map(p => <option key={p} value={p}>{PRI_LABEL[p]}</option>)}</Select>
          </Field>
          <Field label={config.isLeader ? 'Responsável' : 'Responsável (opcional)'}>
            <PersonSelect people={people} teamIds={byTeam[d.teamKey]} value={d.ownerId ?? null} onChange={id => set({ ownerId: id })} />
          </Field>
          <DueField d={d} set={set} />
        </div>
        <div><span className="block text-xs font-medium text-ds-text mb-1">Tipo</span><TypePicker types={types} value={d.typeIds || []} onChange={ids => set({ typeIds: ids })} /></div>
        <div className="flex justify-end gap-2"><Btn onClick={onClose}>Cancelar</Btn><Btn variant="primary" disabled={busy} onClick={save}>{config.isLeader ? 'Criar ação' : 'Enviar sugestão'}</Btn></div>
      </div>
    </Modal>
  );
};

// ---------------------------------------------------------------- tipos de ação (só liderança)
export const TypesModal: React.FC<{ ctx: RetroCtx; onClose: () => void }> = ({ ctx, onClose }) => {
  const [list, setList] = useState<Partial<ActionType>[]>(ctx.types.map(t => ({ ...t })));
  const [busy, setBusy] = useState(false);
  const removed = ctx.types.filter(t => !list.some(l => l.id === t.id));
  const affected = ctx.actions.filter(a => a.typeIds.some(id => removed.some(r => r.id === id))).length;
  const upd = (i: number, p: Partial<ActionType>) => setList(l => l.map((x, j) => (j === i ? { ...x, ...p } : x)));
  const save = async () => {
    if (list.some(t => !String(t.name || '').trim())) { ctx.toast('Todo tipo precisa de nome', true); return; }
    setBusy(true);
    try {
      ctx.setTypes(await retroApi.saveTypes(list.map(t => ({ ...t, name: String(t.name).trim() }))));
      await ctx.reload();
      ctx.toast('Tipos salvos');
      onClose();
    } catch (e) { ctx.toast((e as Error).message, true); } finally { setBusy(false); }
  };
  return (
    <Modal title="Tipos de ação" onClose={onClose}>
      <div className="space-y-3">
        <p className="text-xs text-ds-text">Renomear vale para todas as ações (elas guardam o tipo, não o nome). Os nomes também vão como tags no Azure DevOps.</p>
        <ul className="space-y-2">
          {list.map((t, i) => (
            <li key={t.id || `novo-${i}`} className="flex items-center gap-2">
              <TypeTag type={{ id: '', name: '', hue: t.hue ?? 205 }} />
              <Input value={t.name || ''} onChange={e => upd(i, { name: e.target.value })} maxLength={60} aria-label={`Nome do tipo ${i + 1}`} />
              <Select value={t.hue ?? 205} onChange={e => upd(i, { hue: Number(e.target.value) })} aria-label="Cor" className="!w-32">
                {TYPE_HUES.map(h => <option key={h.hue} value={h.hue}>{h.name}</option>)}
              </Select>
              <Btn variant="danger" onClick={() => setList(l => l.filter((_, j) => j !== i))}>Remover</Btn>
            </li>
          ))}
        </ul>
        <Btn onClick={() => setList(l => [...l, { name: '', hue: TYPE_HUES[l.length % TYPE_HUES.length].hue }])}>+ Adicionar tipo</Btn>
        {removed.length > 0 && (
          <p className="text-xs text-amber-300" role="alert">
            Remover {removed.map(r => `"${r.name}"`).join(', ')} tira esse tipo de {affected} {affected === 1 ? 'ação' : 'ações'}.
          </p>
        )}
        <div className="flex justify-end gap-2"><Btn onClick={onClose}>Cancelar</Btn><Btn variant="primary" disabled={busy} onClick={save}>Salvar</Btn></div>
      </div>
    </Modal>
  );
};
