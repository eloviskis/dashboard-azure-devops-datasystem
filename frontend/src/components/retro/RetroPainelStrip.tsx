// Métricas da Retrô ao lado do Painel por Time: andamento das ações de melhoria dos times escolhidos no painel.
// As chaves de time são as mesmas (work_items.team), então dá pra cruzar direto.
import React, { useEffect, useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { retroApi } from './retroApi.ts';
import type { ActionType, TeamSummary } from './retroApi.ts';
import { TypeTag } from './retroUi.tsx';

const RetroPainelStrip: React.FC<{ teams: string[] }> = ({ teams }) => {
  const { user } = useAuth();
  const allowed = !user?.tabPermissions || user.tabPermissions.includes('retro');
  const [data, setData] = useState<{ teams: TeamSummary[]; types: ActionType[] } | null>(null);

  useEffect(() => {
    if (!allowed) return;
    Promise.all([retroApi.teams(), retroApi.types()]).then(([t, ty]) => setData({ teams: t, types: ty })).catch(() => setData(null));
  }, [allowed]);

  if (!allowed || !data) return null;
  const rows = data.teams.filter(t => teams.includes(t.key));
  if (!rows.length) return null;

  return (
    <section className="bg-ds-navy p-4 rounded-lg border border-ds-border" aria-labelledby="retro-painel-h">
      <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
        <h3 id="retro-painel-h" className="text-ds-light-text font-bold text-base">🔁 Ações de melhoria (Retrô)</h3>
        <a href="?tab=retro&retroView=times" className="text-xs text-ds-green hover:underline">Abrir na Retrô →</a>
      </div>
      <p className="text-xs text-ds-text/80 mb-3">Andamento das ações combinadas nas retrospectivas, independente do período escolhido acima.</p>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-ds-text border-b border-ds-border">
              <th className="py-2 pr-3 font-medium">Time</th>
              <th className="py-2 px-2 font-medium">Última retro</th>
              <th className="py-2 px-2 font-medium text-right">A fazer</th>
              <th className="py-2 px-2 font-medium text-right">Em andamento</th>
              <th className="py-2 px-2 font-medium text-right">Validar</th>
              <th className="py-2 px-2 font-medium text-right">Fechadas</th>
              <th className="py-2 px-2 font-medium text-right">Atrasadas</th>
              <th className="py-2 px-2 font-medium text-right">% fechadas</th>
              <th className="py-2 pl-2 font-medium">Foco principal</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(t => {
              const top = t.typeCounts[0] && data.types.find(ty => ty.id === t.typeCounts[0].typeId);
              return (
                <tr key={t.key} className="border-b border-ds-border/50 text-ds-light-text">
                  <td className="py-2 pr-3">{t.label}</td>
                  <td className="py-2 px-2 text-ds-text">{t.lastRetroDate ? t.lastRetroDate.split('-').reverse().join('/') : '—'}</td>
                  <td className="py-2 px-2 text-right">{t.counts.aberta}</td>
                  <td className="py-2 px-2 text-right">{t.counts.andamento}</td>
                  <td className="py-2 px-2 text-right">{t.counts.validacao}</td>
                  <td className="py-2 px-2 text-right">{t.counts.concluida}</td>
                  <td className={`py-2 px-2 text-right ${t.counts.atrasadas ? 'text-red-300 font-semibold' : ''}`}>{t.counts.atrasadas}</td>
                  <td className="py-2 px-2 text-right">{t.closedPct}%</td>
                  <td className="py-2 pl-2">{top ? <TypeTag type={top} /> : <span className="text-ds-text text-xs">—</span>}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
};

export default RetroPainelStrip;
