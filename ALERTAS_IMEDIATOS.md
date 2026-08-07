# Sistema de Alertas Imediatos - Implementação Completa

## 🎯 Objetivo

Adicionar alertas imediatos no Teams quando tarefa **nova** entra em estado que precisa de code review, mantendo os alertas agendados (8:30 e 16:30) existentes.

---

## ✅ O Que Foi Implementado

### 1. **Backend (server.js)**

#### Banco de Dados
- ✅ Nova coluna `last_alerted_state` (TEXT, nullable) na tabela `work_items`
- Armazena: 'level1', 'level2' ou NULL
- Permite detectar quando tarefa é "nova" no alerta

#### Configuração
- ✅ Novo campo `instantAlertsEnabled` (boolean) em `teams_pr_review_config`
- Default: `false` (alertas imediatos desligados)
- Persiste no PostgreSQL via `app_settings`

#### Funções Novas
- ✅ `checkAndSendImmediateAlerts(workItemIds)` — Detecta tarefas novas após sync
- ✅ `sendImmediateAlert(item, level, config)` — Envia alerta individual
- ✅ Cabeçalhos específicos: "🆕 NOVA TAREFA AGUARDANDO CODE REVIEW NÍVEL X"

#### Lógica de Detecção
- Após `syncData()` salvar work items → chama `checkAndSendImmediateAlerts()`
- Busca itens elegíveis (estados de code review + PR ativa + tipo válido)
- Compara `last_alerted_state` do banco vs estado atual
- Se `last_alerted_state` é NULL ou diferente → é tarefa NOVA
- Envia alerta imediato + atualiza `last_alerted_state`

#### Alertas Agendados
- ✅ `runPrReviewAlert()` agora atualiza `last_alerted_state` após enviar alertas
- Garante coordenação entre alertas imediatos e agendados
- Alertas agendados continuam enviando TODAS as tarefas (snapshot completo)

#### Endpoints Novos
- ✅ `POST /api/notifications/reset-alert-history` (admin only)
- Reseta `last_alerted_state = NULL` em todos work items
- Útil para re-disparar alertas após setup inicial

### 2. **Frontend (TeamsIntegrationPage.tsx)**

#### Interface
- ✅ Novo campo `instantAlertsEnabled` na interface `TeamsPrReviewConfig`
- ✅ Estado `isResetting` para controlar loading do botão

#### UI Nova Seção "Alertas Imediatos"
- ✅ Checkbox "Ativar alertas imediatos"
- ✅ Texto explicativo sobre o que são "tarefas novas"
- ✅ Botão "Resetar Histórico de Alertas" (visível só se toggle ativo)
- ✅ Warning explicando o impacto do reset

#### Handlers
- ✅ `handleResetHistory()` — Chama endpoint de reset
- ✅ Feedback de sucesso/erro após reset

---

## 🧪 Como Testar

### 1. **Verificar Toggle Persistência**
```
1. Abrir TeamsIntegrationPage
2. Ativar "Alertas Imediatos" → Salvar
3. Recarregar página
4. ✅ Verificar toggle ainda marcado
5. Desativar → Salvar → Recarregar
6. ✅ Verificar toggle desmarcado
```

### 2. **Testar Detecção de Tarefa Nova**
```
1. Ativar "Alertas Imediatos" na UI
2. Clicar "Resetar Histórico de Alertas"
3. No Azure DevOps:
   - Criar tarefa em "Aguardando code review"
   - Vincular PR ativa
4. Rodar sync manual: POST /api/sync
5. ✅ Verificar mensagem "🆕 NOVA TAREFA..." no Teams
6. ✅ Verificar notification_log tem type='teams_pr_review_immediate_level1'
```

### 3. **Testar Não-Duplicação**
```
1. Tarefa já alertada (step 2 acima)
2. Rodar sync novamente: POST /api/sync
3. ✅ Verificar NENHUM novo alerta enviado
4. Query DB: SELECT last_alerted_state FROM work_items WHERE work_item_id = X
5. ✅ Verificar last_alerted_state = 'level1' ou 'level2'
```

### 4. **Testar Alertas Agendados**
```
1. Aguardar horário agendado (8:30 ou 16:30)
2. ✅ Verificar alerta envia TODAS as tarefas elegíveis
3. ✅ Cabeçalho é "🔴 PULL REQUESTS SEM REVIEW" (não "🆕 NOVA TAREFA")
4. ✅ Inclui tarefas já alertadas imediatamente
```

### 5. **Testar Toggle Desligado**
```
1. Desativar "Alertas Imediatos"
2. Salvar configuração
3. Criar nova tarefa que precisa de code review
4. Rodar sync
5. ✅ Verificar NENHUM alerta imediato enviado
6. Aguardar alerta agendado
7. ✅ Verificar alerta agendado AINDA funciona normalmente
```

### 6. **Testar Promoção Nível 1→2**
```
1. Tarefa já alertada em Nível 1
2. No Azure DevOps: adicionar reviewer em "Code Review Nível 1"
3. Rodar sync
4. ✅ Verificar novo alerta "🆕 NOVA TAREFA... NÍVEL 2"
5. ✅ Verificar last_alerted_state mudou de 'level1' para 'level2'
```

---

## 🔍 Verificações no Banco de Dados

```sql
-- Ver coluna last_alerted_state foi criada
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'work_items' AND column_name = 'last_alerted_state';

-- Ver tarefas alertadas
SELECT work_item_id, title, state, last_alerted_state 
FROM work_items 
WHERE last_alerted_state IS NOT NULL;

-- Ver histórico de alertas imediatos
SELECT * FROM notification_log 
WHERE type LIKE 'teams_pr_review_immediate%' 
ORDER BY sent_at DESC 
LIMIT 10;

-- Resetar manualmente (se necessário)
UPDATE work_items SET last_alerted_state = NULL;
```

---

## 📊 Arquivos Modificados

1. ✅ `backend/server.js`
   - Adicionada coluna `last_alerted_state` na lista `columnsToEnsure` (~267)
   - Constantes `IMMEDIATE_HEADER_LEVEL1/2` (~4280)
   - Função `checkAndSendImmediateAlerts()` (~4610)
   - Função `sendImmediateAlert()` (~4680)
   - Endpoint `POST /api/notifications/reset-alert-history` (~1565)
   - Atualização de `last_alerted_state` em `runPrReviewAlert()` (~4563)
   - Chamada de `checkAndSendImmediateAlerts()` em `syncData()` (~903)

2. ✅ `frontend/src/components/TeamsIntegrationPage.tsx`
   - Interface `TeamsPrReviewConfig` com `instantAlertsEnabled` (~13)
   - Estado `isResetting` (~44)
   - Handler `handleResetHistory()` (~149)
   - Nova seção UI "Alertas Imediatos" (~272)

---

## ⚙️ Configuração Recomendada

**Setup Inicial:**
1. Ativar "Alertas Imediatos" na UI
2. Salvar configuração
3. Clicar "Resetar Histórico de Alertas"
4. Aguardar próxima sync (máx 30 min)
5. Todas as tarefas elegíveis receberão alertas imediatos

**Uso Normal:**
- Alertas agendados (8:30 e 16:30): Snapshot completo de TODAS as tarefas
- Alertas imediatos: Só tarefas que mudaram de estado desde última sync

---

## 🎯 Comportamento Esperado

### Critério "Tarefa Nova"
- **Primeira vez no alerta**: `last_alerted_state` é NULL
- **Mudança de nível**: `last_alerted_state = 'level1'` → agora é 'level2'
- **NÃO é sobre data de criação**: Tarefa criada há dias, mas só agora entrou em "Aguardando code review" = NOVA

### Granularidade
- **Alertas imediatos**: 1 mensagem por tarefa
- **Alertas agendados**: 1 mensagem com todas as tarefas

### Latência
- **Alertas imediatos**: Próxima sync (~30 min)
- **Alertas agendados**: Horários fixos (8:30, 16:30)

### Deduplicação
- `last_alerted_state` garante não alertar mesma tarefa múltiplas vezes
- Alertas agendados sempre enviam tudo (ignoram `last_alerted_state`)

---

## ✨ Próximos Passos (Se Necessário)

### Reduzir Latência
- Mudar intervalo de sync de 30min para 5min
- Implementar webhook do Azure DevOps (complexo)

### Reduzir Noise
- Agrupar alertas imediatos do mesmo ciclo de sync
- Delay de 2-5min antes de enviar, acumulando batch

### Customização
- Permitir admin customizar cabeçalho de alertas imediatos
- Adicionar filtros por time/tipo no toggle

---

## 🐛 Troubleshooting

**Alertas imediatos não disparam:**
- Verificar toggle "Ativar alertas imediatos" está marcado
- Verificar webhooks estão configurados
- Verificar coluna `last_alerted_state` existe no banco
- Verificar logs do servidor durante sync

**Muitos alertas duplicados:**
- Verificar se `last_alerted_state` está sendo atualizado
- Executar query: `SELECT * FROM work_items WHERE last_alerted_state IS NOT NULL`
- Se vazio, problema no UPDATE após enviar alerta

**Alertas agendados pararam:**
- Alertas agendados são independentes do toggle
- Verificar horários em `teams_pr_review_config.schedule`
- Verificar logs do servidor no horário agendado

**Botão "Resetar Histórico" não aparece:**
- Só visível se toggle "Alertas Imediatos" estiver ATIVO
- Desmarcar e remarcar toggle se necessário

---

## 📝 Notas de Implementação

- ✅ Sem breaking changes (backward compatible)
- ✅ Toggle default = `false` (não afeta setup existente)
- ✅ Coluna `last_alerted_state` nullable (trabalha com dados antigos)
- ✅ Erros de alerta não travam sync
- ✅ Logs claros em `notification_log` (type separado para alertas imediatos)
