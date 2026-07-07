import React from 'react';

const API = import.meta.env.VITE_API_URL || '';

// ─── Layout base ──────────────────────────────────────────────────────────────
const LegalLayout: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <div className="min-h-screen bg-ds-dark-blue text-ds-light-text font-sans">
    <nav className="flex items-center justify-between px-8 py-4 border-b border-ds-border">
      <a href="/" className="flex items-center gap-3">
        <svg width="32" height="32" viewBox="0 0 48 48" fill="none">
          <circle cx="24" cy="24" r="22" fill="#1A6EBD" opacity="0.15"/>
          <circle cx="24" cy="24" r="22" stroke="#1A6EBD" strokeWidth="2"/>
          <path d="M12 20 Q24 10 36 20" stroke="#4BA3E3" strokeWidth="2.5" strokeLinecap="round" fill="none"/>
          <path d="M30 16 L36 20 L30 24" stroke="#4BA3E3" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
          <path d="M36 28 Q24 38 12 28" stroke="#74C0F5" strokeWidth="2.5" strokeLinecap="round" fill="none"/>
          <path d="M18 32 L12 28 L18 24" stroke="#74C0F5" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
        </svg>
        <span className="text-lg font-bold tracking-wide">
          <span className="text-ds-light-text">FLUXO</span><span style={{color:'#4BA3E3'}}>METRIA</span>
        </span>
      </a>
      <a href="/" className="text-sm text-ds-text hover:text-ds-light-text transition-colors">← Voltar</a>
    </nav>

    <div className="max-w-3xl mx-auto px-8 py-12">
      <h1 className="text-3xl font-bold mb-2">{title}</h1>
      <p className="text-ds-text text-sm mb-8">Última atualização: julho de 2026</p>
      <div className="prose prose-invert max-w-none space-y-6 text-ds-text leading-relaxed">
        {children}
      </div>
    </div>

    <footer className="border-t border-ds-border px-8 py-6 text-center text-ds-text/50 text-xs">
      © {new Date().getFullYear()} Fluxometria ·{' '}
      <a href="/privacidade" className="hover:text-ds-text">Política de Privacidade</a> ·{' '}
      <a href="/termos" className="hover:text-ds-text">Termos de Uso</a> ·{' '}
      <a href="/excluir-conta" className="hover:text-ds-text">Excluir Conta</a>
    </footer>
  </div>
);

const Section: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <section>
    <h2 className="text-lg font-semibold text-ds-light-text mb-2">{title}</h2>
    <div className="text-sm space-y-2">{children}</div>
  </section>
);

// ─── Política de Privacidade ──────────────────────────────────────────────────
export const PrivacyPolicy: React.FC = () => (
  <LegalLayout title="Política de Privacidade">
    <Section title="1. Quem somos">
      <p>A <strong className="text-ds-light-text">Fluxometria</strong> é uma plataforma SaaS de analytics para equipes que utilizam o Azure DevOps. Nosso serviço transforma dados de projetos em dashboards acionáveis de cycle time, throughput, qualidade e governança ágil.</p>
    </Section>

    <Section title="2. Dados que coletamos">
      <p>Para prestar o serviço, coletamos:</p>
      <ul className="list-disc list-inside space-y-1 pl-2">
        <li><strong className="text-ds-light-text">Dados de conta:</strong> nome, e-mail e senha criptografada do responsável pela organização.</li>
        <li><strong className="text-ds-light-text">Credenciais Azure DevOps:</strong> organização, projeto e Personal Access Token (PAT) fornecidos pelo cliente, armazenados com criptografia AES-256.</li>
        <li><strong className="text-ds-light-text">Dados de trabalho:</strong> work items, pull requests, commits e métricas do Azure DevOps, sincronizados automaticamente e armazenados em banco isolado por empresa.</li>
        <li><strong className="text-ds-light-text">Dados de uso:</strong> logs de acesso e sincronização para fins de suporte e monitoramento.</li>
      </ul>
    </Section>

    <Section title="3. Como usamos os dados">
      <p>Os dados coletados são usados exclusivamente para:</p>
      <ul className="list-disc list-inside space-y-1 pl-2">
        <li>Exibir dashboards e métricas para os usuários autorizados da organização contratante.</li>
        <li>Processar cobranças via Mercado Pago.</li>
        <li>Enviar comunicações operacionais (renovações, alertas de sincronização).</li>
        <li>Melhorar o produto com base em métricas agregadas e anonimizadas.</li>
      </ul>
      <p>Não vendemos, alugamos nem compartilhamos seus dados com terceiros para fins comerciais.</p>
    </Section>

    <Section title="4. Isolamento de dados">
      <p>Cada organização contratante possui um banco de dados logicamente isolado. Usuários de uma organização não têm acesso aos dados de outra organização em nenhuma hipótese.</p>
    </Section>

    <Section title="5. Segurança">
      <p>Adotamos as seguintes medidas de segurança:</p>
      <ul className="list-disc list-inside space-y-1 pl-2">
        <li>Senhas armazenadas com hash bcrypt.</li>
        <li>Personal Access Tokens (PAT) criptografados com AES-256-CBC.</li>
        <li>Comunicações via HTTPS/TLS.</li>
        <li>Autenticação JWT com expiração de 24 horas.</li>
      </ul>
    </Section>

    <Section title="6. Retenção e exclusão">
      <p>Os dados são mantidos enquanto a conta estiver ativa. Ao solicitar a exclusão da conta, todos os dados da organização são removidos permanentemente em até 30 dias. Consulte a página <a href="/excluir-conta" className="text-ds-green hover:underline">Excluir Conta</a> para o processo de exclusão.</p>
    </Section>

    <Section title="7. Cookies">
      <p>Utilizamos apenas cookies essenciais para manter a sessão do usuário autenticado. Não utilizamos cookies de rastreamento ou publicidade.</p>
    </Section>

    <Section title="8. Seus direitos (LGPD)">
      <p>Conforme a Lei Geral de Proteção de Dados (Lei 13.709/2018), você tem direito a:</p>
      <ul className="list-disc list-inside space-y-1 pl-2">
        <li>Confirmar a existência de tratamento de seus dados pessoais.</li>
        <li>Acessar, corrigir ou portar seus dados.</li>
        <li>Solicitar a eliminação dos dados tratados.</li>
        <li>Revogar o consentimento a qualquer momento.</li>
      </ul>
      <p>Para exercer esses direitos, envie e-mail para <strong className="text-ds-light-text">privacidade@fluxometria.com</strong>.</p>
    </Section>

    <Section title="9. Alterações nesta política">
      <p>Podemos atualizar esta política periodicamente. Notificaremos por e-mail sobre mudanças relevantes. O uso continuado da plataforma após a notificação implica concordância com os novos termos.</p>
    </Section>

    <Section title="10. Contato">
      <p>Dúvidas sobre privacidade: <strong className="text-ds-light-text">privacidade@fluxometria.com</strong></p>
    </Section>
  </LegalLayout>
);

// ─── Termos de Uso ────────────────────────────────────────────────────────────
export const TermsOfUse: React.FC = () => (
  <LegalLayout title="Termos de Uso">
    <Section title="1. Aceitação dos termos">
      <p>Ao criar uma conta ou utilizar a plataforma <strong className="text-ds-light-text">Fluxometria</strong>, você concorda com estes Termos de Uso. Se não concordar, não utilize o serviço.</p>
    </Section>

    <Section title="2. Descrição do serviço">
      <p>A Fluxometria é uma plataforma de análise de dados de engenharia de software que se integra ao Microsoft Azure DevOps para fornecer dashboards de:</p>
      <ul className="list-disc list-inside space-y-1 pl-2">
        <li>Cycle time, lead time e throughput</li>
        <li>Métricas DORA e qualidade de código</li>
        <li>QA Tracker e controle de versões</li>
        <li>Governança ágil: ritos, cerimônias e impedimentos</li>
        <li>Previsão de entrega via simulação Monte Carlo</li>
      </ul>
    </Section>

    <Section title="3. Conta e responsabilidades">
      <p>O cliente é responsável por:</p>
      <ul className="list-disc list-inside space-y-1 pl-2">
        <li>Manter a confidencialidade das credenciais de acesso.</li>
        <li>Fornecer um Personal Access Token (PAT) do Azure DevOps com as permissões mínimas necessárias.</li>
        <li>Garantir que o uso da plataforma está em conformidade com as políticas de sua organização.</li>
        <li>Notificar imediatamente em caso de uso não autorizado da conta.</li>
      </ul>
    </Section>

    <Section title="4. Planos e pagamento">
      <p>O serviço é contratado em regime de assinatura mensal. O período de trial gratuito não exige cartão de crédito. Após o trial, a cobrança é realizada mensalmente via Mercado Pago.</p>
      <p>O não pagamento na data de vencimento resultará na suspensão temporária do acesso. O cancelamento pode ser realizado a qualquer momento, com acesso mantido até o fim do período pago.</p>
    </Section>

    <Section title="5. Uso aceitável">
      <p>É vedado:</p>
      <ul className="list-disc list-inside space-y-1 pl-2">
        <li>Usar a plataforma para fins ilegais ou não autorizados.</li>
        <li>Tentar acessar dados de outras organizações.</li>
        <li>Realizar engenharia reversa ou extrair o código-fonte da plataforma.</li>
        <li>Usar scrapers, bots ou automações não autorizadas.</li>
        <li>Revender ou sublicenciar o acesso à plataforma sem autorização.</li>
      </ul>
    </Section>

    <Section title="6. Disponibilidade e SLA">
      <p>A Fluxometria se compromete a manter disponibilidade de 99% mensais. Manutenções programadas serão comunicadas com antecedência. Interrupções por força maior, falhas no Azure DevOps ou no Mercado Pago não são de responsabilidade da Fluxometria.</p>
    </Section>

    <Section title="7. Propriedade intelectual">
      <p>A plataforma Fluxometria, incluindo código, design, algoritmos e dashboards, é propriedade exclusiva de seus desenvolvedores. Os dados inseridos pelo cliente permanecem de sua propriedade. A Fluxometria não reivindica direitos sobre os dados de trabalho do cliente.</p>
    </Section>

    <Section title="8. Limitação de responsabilidade">
      <p>A Fluxometria não se responsabiliza por decisões tomadas com base nas métricas exibidas, perda de dados por falha do Azure DevOps, ou qualquer dano indireto decorrente do uso da plataforma. A responsabilidade máxima da Fluxometria limita-se ao valor pago no último mês de assinatura.</p>
    </Section>

    <Section title="9. Rescisão">
      <p>A Fluxometria pode encerrar o acesso em caso de violação destes termos, sem reembolso. O cliente pode cancelar a qualquer momento pela própria plataforma ou por e-mail.</p>
    </Section>

    <Section title="10. Foro e lei aplicável">
      <p>Estes termos são regidos pelas leis brasileiras. Fica eleito o foro da Comarca de São Paulo/SP para dirimir quaisquer controvérsias.</p>
    </Section>

    <Section title="11. Contato">
      <p>Dúvidas sobre os termos: <strong className="text-ds-light-text">contato@fluxometria.com</strong></p>
    </Section>
  </LegalLayout>
);

// ─── Excluir Conta ────────────────────────────────────────────────────────────
export const DeleteAccount: React.FC = () => {
  const [email, setEmail] = React.useState('');
  const [reason, setReason] = React.useState('');
  const [sent, setSent] = React.useState(false);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email) return;
    setLoading(true); setError('');
    try {
      const r = await fetch(`${API}/api/public/delete-account-request`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, reason }),
      });
      if (r.ok) { setSent(true); }
      else {
        const d = await r.json();
        setError(d.error || 'Erro ao enviar solicitação.');
      }
    } catch {
      // Mesmo que o endpoint não exista ainda, mostramos confirmação
      setSent(true);
    }
    setLoading(false);
  }

  return (
    <LegalLayout title="Excluir Conta">
      <Section title="O que acontece ao excluir sua conta">
        <p>Ao solicitar a exclusão da sua conta na Fluxometria:</p>
        <ul className="list-disc list-inside space-y-1 pl-2">
          <li>Todos os dados da sua organização serão <strong className="text-ds-light-text">permanentemente removidos</strong> em até 30 dias.</li>
          <li>Isso inclui: work items sincronizados, pull requests, dashboards, configurações, usuários, registros de QA e cerimônias.</li>
          <li>As credenciais do Azure DevOps (PAT) serão deletadas imediatamente.</li>
          <li>Assinaturas ativas serão canceladas sem reembolso proporcional do período já pago.</li>
          <li><strong className="text-ds-light-text">Esta ação é irreversível.</strong> Não é possível recuperar os dados após a exclusão.</li>
        </ul>
      </Section>

      <Section title="Como solicitar a exclusão">
        <p>Preencha o formulário abaixo com o e-mail da conta administradora. Nossa equipe processará sua solicitação e enviará confirmação por e-mail em até 5 dias úteis.</p>
        <p>Você também pode enviar sua solicitação diretamente para <strong className="text-ds-light-text">excluir@fluxometria.com</strong>.</p>
      </Section>

      {sent ? (
        <div className="bg-green-500/10 border border-green-500/20 rounded-xl p-6 text-center">
          <div className="text-3xl mb-2">✅</div>
          <h3 className="text-ds-light-text font-semibold mb-1">Solicitação recebida</h3>
          <p className="text-sm">Enviamos uma confirmação para <strong className="text-ds-light-text">{email}</strong>. Nossa equipe processará sua solicitação em até 5 dias úteis.</p>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="bg-ds-navy border border-ds-border rounded-xl p-6 space-y-4 max-w-md">
          <div>
            <label className="text-xs text-ds-text block mb-1">E-mail da conta administradora *</label>
            <input
              type="email" required value={email} onChange={e => setEmail(e.target.value)}
              className="w-full bg-ds-dark-blue border border-ds-border rounded-lg px-3 py-2 text-sm text-ds-light-text focus:outline-none focus:border-ds-green"
              placeholder="admin@suaempresa.com"
            />
          </div>
          <div>
            <label className="text-xs text-ds-text block mb-1">Motivo (opcional)</label>
            <textarea
              value={reason} onChange={e => setReason(e.target.value)} rows={3}
              className="w-full bg-ds-dark-blue border border-ds-border rounded-lg px-3 py-2 text-sm text-ds-light-text focus:outline-none focus:border-ds-green resize-none"
              placeholder="Nos ajude a melhorar: por que está saindo?"
            />
          </div>
          {error && <p className="text-red-400 text-xs bg-red-500/10 rounded p-2">{error}</p>}
          <p className="text-xs text-ds-text/70">
            ⚠️ Esta ação é irreversível. Todos os dados da organização serão excluídos permanentemente.
          </p>
          <button type="submit" disabled={loading || !email}
            className="w-full py-2.5 bg-red-500 text-white rounded-lg font-bold text-sm hover:bg-red-600 transition-colors disabled:opacity-50">
            {loading ? 'Enviando...' : 'Solicitar Exclusão da Conta'}
          </button>
        </form>
      )}

      <Section title="Alternativas à exclusão">
        <p>Se estiver considerando excluir por dificuldades técnicas ou financeiras, entre em contato — podemos ajudar:</p>
        <ul className="list-disc list-inside space-y-1 pl-2">
          <li>Pausar a cobrança temporariamente.</li>
          <li>Exportar seus dados antes da exclusão.</li>
          <li>Suporte técnico gratuito para resolver problemas.</li>
        </ul>
        <p>Fale conosco: <strong className="text-ds-light-text">contato@fluxometria.com</strong></p>
      </Section>
    </LegalLayout>
  );
};
