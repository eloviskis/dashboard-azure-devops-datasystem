import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';

interface TeamsPrReviewConfig {
  webhookLevel1: string;
  webhookLevel2: string;
  header1: string;
  header2: string;
  itemLineTemplate: string;
  schedule: string[];
  aiEnabled: boolean;
  instantAlertsEnabled: boolean;
}

const DEFAULT_HEADER1 = '🔴 **PULL REQUESTS SEM REVIEW NÍVEL 1:**';
const DEFAULT_HEADER2 = '🟡 **PULL REQUESTS SEM REVIEW NÍVEL 2:**';
const DEFAULT_ITEM_LINE = `📌 #{id} — {title}
🔗 [Abrir Item]({url})
👤 Autor: {author}
🗳️ {votes}
💬 {comments} · 🔄 {pushes}
🛡️ {requiredReview} · {hasApproval}
{conflictWarning}`;

const DEFAULT_CONFIG: TeamsPrReviewConfig = {
  webhookLevel1: '',
  webhookLevel2: '',
  header1: DEFAULT_HEADER1,
  header2: DEFAULT_HEADER2,
  itemLineTemplate: DEFAULT_ITEM_LINE,
  schedule: ['08:30', '16:30'],
  aiEnabled: true,
  instantAlertsEnabled: false,
};

const TeamsIntegrationPage: React.FC = () => {
  const { token } = useAuth();
  const [config, setConfig] = useState<TeamsPrReviewConfig>(DEFAULT_CONFIG);
  const [newTime, setNewTime] = useState('09:00');
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [testingWebhookLevel, setTestingWebhookLevel] = useState<1 | 2 | null>(null);
  const [isResetting, setIsResetting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const API_URL = import.meta.env.VITE_API_URL || '';

  const fetchConfig = useCallback(async () => {
    try {
      const response = await fetch(`${API_URL}/api/settings/teams_pr_review_config`, {
        headers: { 'Authorization': `Bearer ${token}` },
      });
      if (response.ok) {
        const data = await response.json();
        if (data.value) {
          setConfig({ ...DEFAULT_CONFIG, ...data.value });
        }
      }
    } catch {
      setError('Erro de conexão ao carregar configuração');
    } finally {
      setIsLoading(false);
    }
  }, [token, API_URL]);

  useEffect(() => { fetchConfig(); }, [fetchConfig]);

  const handleSave = async () => {
    setError('');
    setSuccess('');
    setIsSaving(true);
    try {
      const response = await fetch(`${API_URL}/api/settings/teams_pr_review_config`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ value: config }),
      });
      if (response.ok) {
        setSuccess('Configuração salva com sucesso.');
      } else {
        const data = await response.json().catch(() => ({}));
        setError(data.error || 'Erro ao salvar configuração');
      }
    } catch {
      setError('Erro de conexão ao salvar');
    } finally {
      setIsSaving(false);
    }
  };

  const handleTestNow = async () => {
    setError('');
    setSuccess('');
    setIsTesting(true);
    try {
      const response = await fetch(`${API_URL}/api/notifications/resend/pr-review-alert`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      });
      const data = await response.json();
      if (response.ok) {
        setSuccess('Alerta disparado com a configuração atual. Confira os canais do Teams.');
      } else {
        setError(data.error || 'Erro ao disparar alerta');
      }
    } catch {
      setError('Erro de conexão');
    } finally {
      setIsTesting(false);
    }
  };

  const handleTestWebhook = async (level: 1 | 2) => {
    const webhookUrl = level === 1 ? config.webhookLevel1 : config.webhookLevel2;
    if (!webhookUrl) return;
    setError('');
    setSuccess('');
    setTestingWebhookLevel(level);
    try {
      const response = await fetch(`${API_URL}/api/notifications/teams/test-webhook`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ webhookUrl, level }),
      });
      const data = await response.json();
      if (response.ok) {
        setSuccess(`Mensagem de teste enviada para Nível ${level}. Confira o canal do Teams.`);
      } else {
        setError(data.error || `Erro ao testar webhook Nível ${level}`);
      }
    } catch {
      setError('Erro de conexão');
    } finally {
      setTestingWebhookLevel(null);
    }
  };

  const addTime = () => {
    if (config.schedule.includes(newTime)) return;
    setConfig(prev => ({ ...prev, schedule: [...prev.schedule, newTime].sort((a, b) => a.localeCompare(b)) }));
  };

  const removeTime = (time: string) => {
    setConfig(prev => ({ ...prev, schedule: prev.schedule.filter(t => t !== time) }));
  };

  const handleResetHistory = async () => {
    setError('');
    setSuccess('');
    setIsResetting(true);
    try {
      const response = await fetch(`${API_URL}/api/notifications/reset-alert-history`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      });
      const data = await response.json();
      if (response.ok) {
        setSuccess('Histórico de alertas resetado. Próxima sincronização enviará alertas imediatos para todas as tarefas elegíveis.');
      } else {
        setError(data.error || 'Erro ao resetar histórico');
      }
    } catch {
      setError('Erro de conexão');
    } finally {
      setIsResetting(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-ds-green"></div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <h1 className="text-2xl font-bold text-ds-light-text mb-1">Integração com Microsoft Teams</h1>
      <p className="text-xs text-ds-text mb-6">Alerta de work items entre os estados Aguardando Code Review e Testando QA que tenham uma Pull Request <strong>ativa</strong> vinculada — sem PR ativa, o item não aparece. Separados por Nível 1 (sem revisor) e Nível 2 (revisor 1 ok, falta revisor 2). Tarefas cuja PR está com conflito de merge sempre aparecem em Nível 2, com aviso, independente do revisor configurado.</p>

      {error && (
        <div className="mb-4 bg-red-500/10 border border-red-500/50 text-red-400 px-4 py-3 rounded-lg">{error}</div>
      )}
      {success && (
        <div className="mb-4 bg-green-500/10 border border-green-500/50 text-green-400 px-4 py-3 rounded-lg">{success}</div>
      )}

      <div className="bg-ds-navy rounded-lg p-6 mb-4 border border-ds-border">
        <h2 className="text-sm font-semibold text-ds-light-text mb-3">Webhooks</h2>
        <p className="text-xs text-ds-text mb-4">Crie um Webhook de Entrada no canal do Teams (⋯ do canal → Conectores → Webhook de Entrada, ou app "Workflows") e cole a URL aqui.</p>
        <div className="flex flex-col gap-3">
          <label className="flex flex-col gap-1">
            <span className="text-xs text-ds-text">Webhook Nível 1 (sem revisor)</span>
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={config.webhookLevel1}
                onChange={e => setConfig(prev => ({ ...prev, webhookLevel1: e.target.value }))}
                placeholder="https://outlook.office.com/webhook/..."
                className="flex-1 bg-ds-dark-blue border border-ds-border rounded-md px-3 py-2 text-sm text-ds-light-text"
              />
              <button
                type="button"
                onClick={() => handleTestWebhook(1)}
                disabled={!config.webhookLevel1 || testingWebhookLevel !== null}
                className="text-xs px-3 py-2 rounded-md border border-ds-border text-ds-text hover:bg-ds-border/50 transition-colors disabled:opacity-50 shrink-0"
              >
                {testingWebhookLevel === 1 ? 'Enviando...' : 'Testar'}
              </button>
            </div>
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs text-ds-text">Webhook Nível 2 (revisor 1 ok, falta revisor 2)</span>
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={config.webhookLevel2}
                onChange={e => setConfig(prev => ({ ...prev, webhookLevel2: e.target.value }))}
                placeholder="https://outlook.office.com/webhook/..."
                className="flex-1 bg-ds-dark-blue border border-ds-border rounded-md px-3 py-2 text-sm text-ds-light-text"
              />
              <button
                type="button"
                onClick={() => handleTestWebhook(2)}
                disabled={!config.webhookLevel2 || testingWebhookLevel !== null}
                className="text-xs px-3 py-2 rounded-md border border-ds-border text-ds-text hover:bg-ds-border/50 transition-colors disabled:opacity-50 shrink-0"
              >
                {testingWebhookLevel === 2 ? 'Enviando...' : 'Testar'}
              </button>
            </div>
          </label>
        </div>
      </div>

      <div className="bg-ds-navy rounded-lg p-6 mb-4 border border-ds-border">
        <h2 className="text-sm font-semibold text-ds-light-text mb-3">Horários de envio</h2>
        <p className="text-xs text-ds-text mb-3">O alerta dispara automaticamente nos horários abaixo, só em dias úteis (segunda a sexta) — verificação a cada 5 minutos.</p>
        <div className="flex flex-wrap gap-2 mb-3">
          {config.schedule.map(time => (
            <span key={time} className="flex items-center gap-2 bg-ds-dark-blue border border-ds-border rounded-full px-3 py-1 text-xs text-ds-light-text">
              {time}
              <button type="button" onClick={() => removeTime(time)} className="text-red-400 hover:text-red-300">×</button>
            </span>
          ))}
          {config.schedule.length === 0 && (
            <span className="text-xs text-ds-text">Nenhum horário configurado — o alerta não dispara automaticamente.</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <input
            type="time"
            step={300}
            value={newTime}
            onChange={e => setNewTime(e.target.value)}
            className="bg-ds-dark-blue border border-ds-border rounded-md px-3 py-2 text-sm text-ds-light-text"
          />
          <button
            type="button"
            onClick={addTime}
            className="text-xs px-3 py-2 rounded-md border border-ds-border text-ds-text hover:bg-ds-border/50 transition-colors"
          >
            Adicionar horário
          </button>
        </div>
      </div>

      <div className="bg-ds-navy rounded-lg p-6 mb-4 border border-ds-border">
        <h2 className="text-sm font-semibold text-ds-light-text mb-3">Alertas Imediatos</h2>
        <p className="text-xs text-ds-text mb-4">Envie alerta individual no Teams quando tarefa <strong>nova</strong> precisar de code review (além dos horários agendados). Tarefa "nova" = primeira vez que aparece no alerta, ou quando muda de Nível 1 para Nível 2.</p>
        <label className="flex items-center gap-2 mb-3 cursor-pointer">
          <input
            type="checkbox"
            checked={config.instantAlertsEnabled}
            onChange={e => setConfig(prev => ({ ...prev, instantAlertsEnabled: e.target.checked }))}
            className="accent-ds-green w-4 h-4"
          />
          <span className="text-sm text-ds-light-text">Ativar alertas imediatos</span>
        </label>
        {config.instantAlertsEnabled && (
          <div className="bg-ds-dark-blue border border-ds-border rounded-lg p-3">
            <p className="text-xs text-ds-text mb-2">
              ⚠️ <strong>Resetar histórico:</strong> Marca todas as tarefas como "não alertadas". A próxima sincronização enviará alertas imediatos para <strong>todas</strong> as tarefas elegíveis (útil após configurar pela primeira vez).
            </p>
            <button
              type="button"
              onClick={handleResetHistory}
              disabled={isResetting}
              className="text-xs px-3 py-2 rounded-md bg-orange-500/20 border border-orange-500/50 text-orange-400 hover:bg-orange-500/30 transition-colors disabled:opacity-50"
            >
              {isResetting ? 'Resetando...' : 'Resetar Histórico de Alertas'}
            </button>
          </div>
        )}
      </div>

      <div className="bg-ds-navy rounded-lg p-6 mb-4 border border-ds-border">
        <h2 className="text-sm font-semibold text-ds-light-text mb-3">Mensagem</h2>
        <label className="flex items-center gap-2 mb-4 cursor-pointer">
          <input
            type="checkbox"
            checked={config.aiEnabled}
            onChange={e => setConfig(prev => ({ ...prev, aiEnabled: e.target.checked }))}
            className="accent-ds-green w-4 h-4"
          />
          <span className="text-sm text-ds-light-text">Usar IA para encurtar títulos longos</span>
        </label>
        <div className="flex flex-col gap-3">
          <label className="flex flex-col gap-1">
            <span className="text-xs text-ds-text">Cabeçalho — Nível 1</span>
            <input
              type="text"
              value={config.header1}
              onChange={e => setConfig(prev => ({ ...prev, header1: e.target.value }))}
              className="bg-ds-dark-blue border border-ds-border rounded-md px-3 py-2 text-sm text-ds-light-text"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs text-ds-text">Cabeçalho — Nível 2</span>
            <input
              type="text"
              value={config.header2}
              onChange={e => setConfig(prev => ({ ...prev, header2: e.target.value }))}
              className="bg-ds-dark-blue border border-ds-border rounded-md px-3 py-2 text-sm text-ds-light-text"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs text-ds-text">Formato da tarefa na mensagem</span>
            <textarea
              rows={7}
              value={config.itemLineTemplate}
              onChange={e => setConfig(prev => ({ ...prev, itemLineTemplate: e.target.value }))}
              className="bg-ds-dark-blue border border-ds-border rounded-md px-3 py-2 text-sm text-ds-light-text font-mono resize-y"
            />
            <span className="text-[11px] text-ds-text mt-1">
              Cada Enter quebra a linha dentro do cartão daquela tarefa no Teams — linhas em branco (ex: {'{conflictWarning}'} quando não há conflito) somem sozinhas, sem deixar espaço vazio. Placeholders disponíveis: {'{id}'} {'{title}'} {'{url}'} {'{author}'} {'{votes}'} (quantos e quais votos a PR recebeu) {'{comments}'} (comentários reais na PR, sem contar avisos automáticos) {'{pushes}'} (quantos envios/commits a PR teve — mais de 1 pode indicar revotação necessária) {'{requiredReview}'} (status do grupo obrigatório "Code Review" da política de branch, separado dos revisores opcionais) {'{hasApproval}'} (se já existe pelo menos um voto de aprovação, de qualquer revisor) {'{conflictWarning}'} (aviso de conflito de merge — tarefas com conflito sempre aparecem em Nível 2, independente do revisor configurado)
            </span>
          </label>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={handleSave}
          disabled={isSaving}
          className="text-sm px-4 py-2 rounded-md bg-ds-green text-ds-dark-blue font-semibold hover:bg-ds-green/80 disabled:opacity-50"
        >
          {isSaving ? 'Salvando...' : 'Salvar configuração'}
        </button>
        <button
          type="button"
          onClick={handleTestNow}
          disabled={isTesting || (!config.webhookLevel1 && !config.webhookLevel2)}
          className="text-sm px-4 py-2 rounded-md border border-ds-border text-ds-light-text hover:bg-ds-border/50 transition-colors disabled:opacity-50"
        >
          {isTesting ? 'Enviando...' : 'Testar agora'}
        </button>
      </div>
    </div>
  );
};

export default TeamsIntegrationPage;
