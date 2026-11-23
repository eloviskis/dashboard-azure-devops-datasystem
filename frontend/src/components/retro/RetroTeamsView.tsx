// Aba Retrô → Times: acompanhamento por time (contadores, % fechadas, temas, ações por tipo, elogios, feedback da IA).
import React, { useEffect, useState } from 'react';
import { retroApi } from './retroApi.ts';
import type { TeamSummary } from './retroApi.ts';
import type { RetroCtx } from './RetroDashboard.tsx';
import { Btn, TONE_CLASS, TONE_LABEL, TypeTag, fmtDate, fmtDateTime } from './retroUi.tsx';

const Counter: React.FC<{ label: string; n: number; alert?: boolean }> = ({ label, n, alert }) => (
  <div className={`rounded-lg border px-2 py-1.5 text-center ${alert && n > 0 ? 'border-red-400/50 text-red-300' : 'border-ds-border text-ds-light-text'}`}>
    <div className="text-lg font-bold leading-tight">{n}</div>
    <div className="text-[10px] text-ds-text">{label}</div>
  </div>
);

const RetroTeamsView: React.FC<{ ctx: RetroCtx }> = ({ ctx }) => {
  const [teams, setTeams] = useState<TeamSummary[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  useEffect(() => { retroApi.teams().then(setTeams).catch(e => ctx.toast((e as Error).message, true)); }, [ctx.actions, ctx.retros]); // eslint-disable-line react-hooks/exhaustive-deps

  const feedback = async (key: string) => {
    setBusy(key);
    try {
      const fb = await retroApi.teamFeedback(key);
      setTeams(ts => ts && ts.map(t => (t.key === key ? { ...t, feedback: fb } : t)));
    } catch (e) { ctx.toast((e as Error).message, true); } finally { setBusy(null); }
  };

  if (!teams) return <p className="text-sm text-ds-text">Carregando…</p>;
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      {teams.map(t => {
        const maxType = Math.max(1, ...t.typeCounts.map(x => x.count));
        return (
          <article key={t.key} className="bg-ds-navy border border-ds-border rounded-lg p-4 space-y-4" aria-labelledby={`team-${t.key}`}>
            <header className="flex flex-wrap items-baseline justify-between gap-2">
              <h3 id={`team-${t.key}`} className="text-base font-semibold text-ds-light-text">{t.label}</h3>
              <span className="text-xs text-ds-text">{t.retros} retro{t.retros === 1 ? '' : 's'}{t.lastRetroDate ? ` · última em ${fmtDate(t.lastRetroDate, true)}` : ''}</span>
            </header>

            <div className="grid grid-cols-5 gap-1.5">
              <Counter label="a fazer" n={t.counts.aberta} />
              <Counter label="em andamento" n={t.counts.andamento} />
              <Counter label="para validar" n={t.counts.validacao} />
              <Counter label="fechadas" n={t.counts.concluida} />
              <Counter label="atrasadas" n={t.counts.atrasadas} alert />
            </div>

            <div>
              <div className="flex justify-between text-xs text-ds-text mb-1"><span>Ações aprovadas já fechadas</span><span>{t.closedPct}%</span></div>
              <div className="h-2 rounded-full bg-ds-dark-blue overflow-hidden" role="progressbar" aria-valuenow={t.closedPct} aria-valuemin={0} aria-valuemax={100} aria-label={`${t.closedPct}% fechadas`}>
                <div className="h-full bg-ds-green" style={{ width: `${t.closedPct}%` }} />
              </div>
            </div>

            {t.temas.length > 0 && (
              <div>
                <h4 className="text-xs font-medium text-ds-text mb-1">Temas que mais aparecem</h4>
                <ul className="flex flex-wrap gap-1.5">
                  {t.temas.map(tm => (
                    <li key={tm.tema} className={`text-[11px] border rounded-full px-2 py-0.5 ${TONE_CLASS[tm.tom]}`}>
                      {tm.tema} · {TONE_LABEL[tm.tom]}{tm.count > 1 ? ` · ${tm.count}×` : ''}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div>
              <h4 className="text-xs font-medium text-ds-text mb-1">Ações por tipo</h4>
              {t.typeCounts.length === 0 ? <p className="text-xs text-ds-text">Nenhuma ação com tipo.</p> : (
                <ul className="space-y-1">
                  {t.typeCounts.map(tc => {
                    const type = ctx.types.find(x => x.id === tc.typeId);
                    if (!type) return null;
                    return (
                      <li key={tc.typeId} className="grid grid-cols-[9rem_1fr_2rem] items-center gap-2">
                        <TypeTag type={type} />
                        <div className="h-2 rounded bg-ds-dark-blue overflow-hidden" aria-hidden>
                          <div className="h-full" style={{ width: `${(tc.count / maxType) * 100}%`, background: `hsl(${type.hue} 62% 50%)` }} />
                        </div>
                        <span className="text-xs text-ds-light-text text-right">{tc.count}</span>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>

            {t.elogios.length > 0 && (
              <div>
                <h4 className="text-xs font-medium text-ds-text mb-1">Elogios recentes</h4>
                <ul className="space-y-0.5">{t.elogios.map((e, i) => <li key={i} className="text-sm text-ds-light-text">💚 {e}</li>)}</ul>
              </div>
            )}

            <div className="border-t border-ds-border pt-3 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <h4 className="text-xs font-medium text-ds-text">Feedback para o time (IA)</h4>
                <Btn disabled={!!busy || !ctx.config.aiAvailable} onClick={() => feedback(t.key)} title={ctx.config.aiAvailable ? '' : 'IA não configurada no servidor'}>
                  {busy === t.key ? 'Gerando…' : t.feedback ? 'Gerar de novo' : 'Gerar feedback'}
                </Btn>
              </div>
              {t.feedback ? (
                <div className="space-y-2 text-sm">
                  <p className="text-ds-light-text">{t.feedback.mensagem}</p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <div><span className="text-xs text-ds-green font-medium">Manter</span><ul className="list-disc ml-4 text-ds-light-text">{t.feedback.manter.map((m, i) => <li key={i}>{m}</li>)}</ul></div>
                    <div><span className="text-xs text-amber-300 font-medium">Melhorar</span><ul className="list-disc ml-4 text-ds-light-text">{t.feedback.melhorar.map((m, i) => <li key={i}>{m}</li>)}</ul></div>
                  </div>
                  {t.feedback.proximo_passo && <p className="text-ds-light-text"><span className="text-xs text-ds-text">Próximo passo: </span>{t.feedback.proximo_passo}</p>}
                  <p className="text-[11px] text-ds-text">Gerado em {fmtDateTime(t.feedback.generatedAt)}{t.feedback.generatedByName ? ` por ${t.feedback.generatedByName}` : ''}</p>
                </div>
              ) : <p className="text-xs text-ds-text">Sem feedback ainda.</p>}
            </div>
          </article>
        );
      })}
    </div>
  );
};

export default RetroTeamsView;
