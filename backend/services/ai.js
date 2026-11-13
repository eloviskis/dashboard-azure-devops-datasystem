// backend/services/ai.js
// Gera narrativas em português para os emails semanais usando Gemini.
// Mesma família de modelo já usada no frontend (AIInsights): gemini-2.5-flash (camada gratuita).
// Nunca lança — se a chave não estiver configurada ou a chamada falhar, o email segue sem a narrativa.

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GEMINI_MODEL = 'gemini-2.5-flash';

if (!GEMINI_API_KEY) {
  console.warn('⚠️ GEMINI_API_KEY not set — os resumos por email não terão narrativa gerada por IA.');
}

// Timeout explícito: fetch nativo do Node não tem timeout por padrão — sem isso, uma chamada que trava
// (visto em produção durante rate limit do Gemini) prende pra sempre a fila de emails que depende dela.
const GEMINI_TIMEOUT_MS = 20000;

async function callGemini(prompt) {
  if (!GEMINI_API_KEY) return null;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), GEMINI_TIMEOUT_MS);
  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`;
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
      signal: controller.signal,
    });
    if (!response.ok) {
      const errText = await response.text();
      console.error('❌ Gemini API error:', response.status, errText);
      return null;
    }
    const data = await response.json();
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    return text ? text.trim() : null;
  } catch (error) {
    console.error('❌ callGemini error:', error.name === 'AbortError' ? `timeout após ${GEMINI_TIMEOUT_MS}ms` : error.message);
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

// contextData: objeto simples com os números já calculados (throughput por time, cycle time, lead time, WIP, impedimentos).
async function generateWeeklyInsight(contextData) {
  const prompt = `Você é um analista de engenharia de software e agilidade sênior. Analise os seguintes dados semanais (JSON) do Azure DevOps e escreva um resumo curto e acionável em português do Brasil, para ser lido por gestores em um email — no máximo 4-5 frases, sem markdown, direto ao ponto, destacando o que precisa de atenção esta semana (gargalos, times com impedimentos antigos, cycle time alto, tarefas com bloqueio externo, e também reconhecendo quem mais se engajou revisando código quando esse dado estiver presente).\n\nDados: ${JSON.stringify(contextData)}`;
  return callGemini(prompt);
}

// teamContext: números já calculados de um time específico (composição, tempos, WIP, impedimentos, retrabalho, gargalo).
// Retorna { recommendation, suggestedMessage }, ambos null se a IA não estiver disponível.
async function generateTeamNarrative(teamContext) {
  const prompt = `Você é um analista de engenharia de software e agilidade sênior, escrevendo trechos de um informativo semanal por time para POs e líderes técnicos, em português do Brasil, tom direto e profissional (como o exemplo abaixo).

Exemplo de tom esperado para a recomendação: "Tratar os dois impedimentos ativos com prioridade e preservar a redução de WIP. O time apresentou boa evolução de entrega, mas os bloqueios atuais podem comprometer o ritmo da semana."
Exemplo de tom esperado para a mensagem sugerida: "Diretoria teve uma boa semana, com 21 entregas consideradas e forte presença de User Stories. O retrabalho caiu para 10% e o WIP atual foi reduzido para 27. O principal alerta são os 2 impedimentos ativos."

Com base nos dados do time a seguir (JSON), escreva EXATAMENTE neste formato, sem markdown, sem texto antes ou depois:
RECOMENDACAO: <2-3 frases de recomendação prática para o PO deste time>
MENSAGEM: <2-3 frases em tom de mensagem pronta para ler em daily ou review>

Dados do time: ${JSON.stringify(teamContext)}`;

  const raw = await callGemini(prompt);
  if (!raw) return { recommendation: null, suggestedMessage: null };

  const recIdx = raw.toUpperCase().indexOf('RECOMENDACAO:');
  const msgIdx = raw.toUpperCase().indexOf('MENSAGEM:');

  let recommendation = null;
  if (recIdx !== -1) {
    const recEnd = msgIdx !== -1 ? msgIdx : undefined;
    recommendation = raw.slice(recIdx + 'RECOMENDACAO:'.length, recEnd).trim();
  }
  const suggestedMessage = msgIdx !== -1 ? raw.slice(msgIdx + 'MENSAGEM:'.length).trim() : null;

  return { recommendation, suggestedMessage };
}

// titles: array de títulos brutos de work items. Retorna um array na MESMA ordem/tamanho, encurtado pela IA
// pra caber bem numa mensagem do Teams. Uma única chamada pro lote inteiro (não uma por item — evita
// estourar o limite de 5 req/min da camada gratuita do Gemini). Nunca lança — se a IA falhar ou devolver
// algo inconsistente (tamanho diferente, não for array de strings), retorna os títulos originais.
async function shortenTitles(titles) {
  if (!titles.length) return titles;
  const prompt = `Você vai receber uma lista de títulos de work items do Azure DevOps, em português, muitas vezes longos e com informação redundante (números de ticket, nomes de cliente repetidos, etc). Reescreva cada título de forma bem mais curta (no máximo ~80 caracteres), mantendo o essencial pra alguém identificar rapidamente do que se trata, sem inventar informação nova.

Responda SOMENTE com um array JSON de strings, na mesma ordem e mesma quantidade de itens da entrada, sem nenhum texto antes ou depois.

Títulos: ${JSON.stringify(titles)}`;

  const raw = await callGemini(prompt);
  if (!raw) return titles;

  try {
    const cleaned = raw.trim().replace(/^```json\s*|^```\s*|```\s*$/g, '');
    const parsed = JSON.parse(cleaned);
    if (Array.isArray(parsed) && parsed.length === titles.length && parsed.every(t => typeof t === 'string')) {
      return parsed;
    }
    console.warn('⚠️ shortenTitles: resposta da IA em formato inesperado, usando títulos originais');
    return titles;
  } catch (err) {
    console.warn('⚠️ shortenTitles: falha ao parsear resposta da IA, usando títulos originais:', err.message);
    return titles;
  }
}

// contextData: números do Painel por Time (período atual vs anterior, por time, só as métricas que cada
// time acompanha, com indicação de dentro/fora da meta). Pede explicitamente sugestão de melhoria, que
// generateWeeklyInsight não pede (é sobre impedimentos/fluxo semanal, domínio diferente).
async function generatePainelPorTimeInsight(contextData) {
  const prompt = `Você é um analista de engenharia de software e agilidade sênior. Analise os números do Painel por Time a seguir (JSON), comparando o período atual com o anterior, e escreva um resumo curto em português do Brasil para gestores, no máximo 4-5 frases, sem markdown: diga como as métricas evoluíram (melhorou/piorou/estável), destaque o time ou métrica mais fora da meta, e termine com 1-2 sugestões concretas de como melhorar no próximo período.\n\nDados: ${JSON.stringify(contextData)}`;
  return callGemini(prompt);
}

module.exports = { generateWeeklyInsight, generateTeamNarrative, shortenTitles, generatePainelPorTimeInsight };
