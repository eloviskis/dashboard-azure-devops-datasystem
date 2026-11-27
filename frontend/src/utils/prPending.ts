// PRs pendentes de uma pessoa: os que ela abriu e ainda estão em aberto, e os de outros que estão
// parados esperando o voto dela. Sem filtro de período de propósito — "pendente" é pergunta de agora,
// e é justamente o PR esquecido há meses que interessa achar.
import type { PullRequest } from '../types.ts';

export interface PrPendingInfo {
  daysOpen: number;
  approvals: number;   // votos favoráveis (>0)
  reviewers: number;   // só gente — grupo do Azure (isContainer) não conta
  noVote: string[];    // quem ainda não votou
  rejected: string[];  // quem rejeitou ou devolveu pro autor (voto < 0)
}

// Grupos do Azure ("[TEAM FOUNDATION]\Time X", "[org]\QA Review") vêm na mesma lista de reviewers,
// mas não são pessoas — não faz sentido cobrar voto deles.
const people = (pr: PullRequest) => (pr.reviewers || []).filter(r => !r.isContainer && r.name);

export function prPendingInfo(pr: PullRequest): PrPendingInfo {
  const rs = people(pr);
  return {
    daysOpen: Math.ceil((Date.now() - new Date(pr.createdDate).getTime()) / (1000 * 60 * 60 * 24)),
    approvals: rs.filter(r => r.vote > 0).length,
    reviewers: rs.length,
    noVote: rs.filter(r => r.vote === 0).map(r => r.name),
    rejected: rs.filter(r => r.vote < 0).map(r => r.name),
  };
}

// Mais antigo primeiro: é a ordem de cobrança.
const byAgeDesc = (a: PullRequest, b: PullRequest) =>
  new Date(a.createdDate).getTime() - new Date(b.createdDate).getTime();

export function splitPendingByPerson(prs: PullRequest[], person: string): {
  asAuthor: PullRequest[];
  asReviewer: PullRequest[];
} {
  if (!person) return { asAuthor: [], asReviewer: [] };
  const open = prs.filter(pr => pr.status === 'active');

  return {
    asAuthor: open.filter(pr => pr.createdBy === person).sort(byAgeDesc),
    // Só sem voto: se já votou, o PR não está mais parado por causa dela. E o PR que ela mesma abriu
    // fica de fora daqui pra não aparecer nas duas listas.
    asReviewer: open
      .filter(pr => pr.createdBy !== person && people(pr).some(r => r.name === person && r.vote === 0))
      .sort(byAgeDesc),
  };
}
