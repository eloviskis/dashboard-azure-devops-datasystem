// backend/services/teams.js
// Envia mensagens pra um Webhook de Entrada do Microsoft Teams via app "Workflows" (Power Automate).
// Nunca lança — falha de envio não pode derrubar o agendador nem qualquer request que dependa disso.

const TEAMS_TIMEOUT_MS = 15000;

// O template padrão "Publicar em um canal quando uma solicitação de webhook for recebida" espera o corpo
// inteiro da requisição sendo um Adaptive Card válido (precisa do "type": "AdaptiveCard" na raiz) — mandar
// só {"text": "..."} faz a ação "Post card in a chat or channel" falhar com AdaptiveSerializationException.
// blocks: array de strings — cada elemento é um "bloco" lógico (um cabeçalho, um rótulo de seção, ou uma
// tarefa inteira, que pode ter várias linhas internas separadas por \n). Cada bloco vira um Container do
// Adaptive Card com "separator: true" (linha divisória nativa) só ENTRE blocos — as linhas internas de um
// mesmo bloco viram TextBlocks soltos, sem divisória entre si, pra não ficar uma linha por baixo de cada
// sub-linha da mesma tarefa.
function buildAdaptiveCard(blocks, footer) {
  const body = blocks
    .map(block => (block || '').split('\n').filter(line => line.length > 0))
    .filter(lines => lines.length > 0)
    .map((lines, idx) => ({
      type: 'Container',
      separator: idx > 0,
      items: lines.map(line => ({ type: 'TextBlock', text: line, wrap: true })),
    }));
  if (footer) {
    body.push({ type: 'TextBlock', text: footer, wrap: true, separator: true, isSubtle: true, size: 'Small' });
  }
  return {
    type: 'AdaptiveCard',
    $schema: 'http://adaptivecards.io/schemas/adaptive-card.json',
    version: '1.4',
    body,
  };
}

// webhookUrl: URL do fluxo do Teams (Workflows/Power Automate).
// blocks: array de strings (ver buildAdaptiveCard) — o Teams renderiza **negrito**, _itálico_ e [link](url).
// footer: linha final opcional, exibida em destaque menor (ex: assinatura "Notificação Automática de ...").
async function sendTeamsMessage(webhookUrl, blocks, footer) {
  if (!webhookUrl) {
    console.warn('⚠️ sendTeamsMessage skipped: sem webhook configurado');
    return { skipped: true };
  }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TEAMS_TIMEOUT_MS);
  try {
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(buildAdaptiveCard(blocks, footer)),
      signal: controller.signal,
    });
    if (!response.ok) {
      const errText = await response.text().catch(() => '');
      console.error('❌ Teams webhook error:', response.status, errText);
      return { error: `HTTP ${response.status}` };
    }
    return { success: true };
  } catch (error) {
    const message = error.name === 'AbortError' ? `timeout após ${TEAMS_TIMEOUT_MS}ms` : error.message;
    console.error('❌ sendTeamsMessage error:', message);
    return { error: message };
  } finally {
    clearTimeout(timeout);
  }
}

module.exports = { sendTeamsMessage };
