# Aba Retrô

A aba recebe retrospectivas exportadas do EasyRetro e transforma o que foi discutido em ações que os times acompanham. Quando uma ação é aprovada, o sistema cria um work item **Melhoria** no board **Melhoria Continua - Kaizen** do Azure DevOps.

A aba existe nos dois backends, com o mesmo contrato HTTP (`/api/retro/*`):
- **Node:** `backend/retro.js`. Os checks ficam em `backend/services/retro*.check.js`.
- **.NET:** projeto DSMetricsDotNet, `RetroController`. O teste roda com `dotnet run -- --self-check`.

## Arquivos

| Arquivo | Conteúdo |
|---|---|
| `referencia-retro-em-acao.html` | Protótipo usado como referência de comportamento |
| `retro-dados-iniciais.json` | Carga inicial: 10 tipos, 6 retros e 34 sugestões |
| `fixtures/` | Exportações reais do EasyRetro, usadas no check do importador |

## Variáveis de ambiente (backend Node)

| Variável | Padrão | Para que serve |
|---|---|---|
| `RETRO_AZDO_WRITE_ENABLED` | `false` | Com `false`, o work item só é simulado: o payload vai para o log. Ligue com `true` para criar itens de verdade. |
| `RETRO_AZDO_PAT` | usa `AZURE_PAT` | PAT com os escopos **Work Items (Read & Write)** e **Identity (Read)** |
| `RETRO_AZDO_TEAM` | `Melhoria Continua - Kaizen` | Time cujo board recebe os itens |
| `RETRO_AZDO_WORK_ITEM_TYPE` | `Melhoria` | Tipo de work item criado. É o mesmo tipo que o board já usa. |
| `RETRO_AZDO_AREA_PATH` | `USE\Melhoria Continua - Kaizen` | Area Path dos itens |
| `RETRO_AZDO_ITERATION_PATH` | `USE` | Iteração usada quando o time não tem sprint atual |
| `GEMINI_API_KEY` | (sem padrão) | IA: leitura das retros, sugestões de ação, PDF e feedback para o time |
| `FRONTEND_URL` | (já existente) | Base do link que vai do work item de volta para a ação |

No .NET, as mesmas opções ficam nas seções `Retro:AzureDevOps:*` e `Gemini:*` do `appsettings.json`. A credencial é a do assistente de sincronização.

Os times da aba e o nome que cada um tem no DSMetrics podem ser alterados na chave `retro_config` da tabela `app_settings` (no .NET, em `Retro:Teams`). O padrão é:

| Time na retro | Valor no DSMetrics |
|---|---|
| Sustentação | `Sustentacao` |
| CTC | `Franquia` |
| Inovação | `Inovacao_novo` |
| Wakanda | `Wakanda` |
| Condado | `Tatico` |

## Carga inicial

A carga pode ser rodada mais de uma vez sem duplicar nada e não cria itens no Azure DevOps.

```bash
cd backend && node seed-retro.js                      # Node
cd src/DSMetricsDotNet.Migrate && dotnet run -- --seed-retro   # .NET
```

## Testes

```bash
node frontend/src/utils/retroParser.check.mjs   # importador, rodando nas exportações reais
node backend/services/retroRules.check.js       # estados, permissões, tipos da IA, sugestões
node backend/services/retroAzdo.check.js        # JSON-Patch e idempotência, com HTTP simulado
```

## Volta do Azure DevOps

O sync de 30 minutos que já existe traz os itens da área Kaizen para a tabela `work_items`. A cada 5 minutos, a Retrô compara esses itens com as ações ligadas a eles. Não há webhook nem chamada extra à API.

| Estado do item no Azure DevOps | O que acontece com a ação |
|---|---|
| Closed, Finished ou Pronto, com a ação em A fazer ou Em andamento | Vai para **Validar**. Quem fecha continua sendo a liderança. |
| Active, code review, QA etc., com a ação em A fazer | Vai para **Em andamento** |
| Removed ou Disapproved | Fica como está e ganha uma atualização. A liderança decide se descarta. |

Toda mudança registra uma atualização assinada por "Azure DevOps". O último estado visto fica em `azdo_last_state`, então a mesma mudança não é aplicada nem anotada duas vezes. Para forçar a verificação na hora, use `POST /api/retro/azdo/reconcile` (só para a liderança).

O Painel por Time mostra o bloco "Ações de melhoria (Retrô)" para os times escolhidos no painel.

## Permissões

- **Liderança** (`admin` e `GESTOR`): aprova e descarta sugestões, fecha e reabre ações, exclui ações e retros e gerencia os tipos.
- **Demais usuários:** importam retros, sugerem ações, movem ações entre A fazer, Em andamento e Validar e registram atualizações.

As permissões são checadas no backend, não só na tela.
