# Solução: Tarefa 89277 não aparece nos alertas de Code Review

## Problema Identificado

A tarefa **89277** não está aparecendo nos alertas de Code Review (nem Nível 1 nem Nível 2) mesmo tendo:
- Estado: "Aguardando code review" ✅
- PR vinculada no Azure DevOps ✅
- Tipo: Issue (não Feature/Epic) ✅

## Causa Raiz

A tarefa **não está no banco de dados** porque a query WIQL da sincronização filtra apenas work items modificados nos últimos **180 dias**:

```sql
SELECT [System.Id] FROM WorkItems 
WHERE [System.TeamProject] = '...' 
  AND [System.ChangedDate] >= @Today - 180
```

Se a tarefa não foi modificada recentemente, ela simplesmente não é incluída na sincronização, mesmo que tenha uma PR ativa aguardando revisão.

## Soluções Implementadas

### 1. **Logging Detalhado** ✅

Adicionado logging em [server.js](backend/server.js#L780) para identificar quando:
- PRs vinculadas não estão ativas (status != 'active')
- Há erro ao buscar detalhes de PRs
- Work items têm PRs mas `linked_pr_votes` fica NULL

**Output de exemplo:**
```
⚠️ Erro ao buscar PR 126634 do item 89277: Request failed with status code 404
⚠️ Item 89277 "N2| Relatório..." tem 1 PR(s) vinculada(s) mas nenhuma está ativa — não aparecerá nos alertas
```

### 2. **Endpoint para Sincronização de Work Items Específicos** ✅

Novo endpoint: **`POST /api/sync-work-item/:id`**

Permite forçar a sincronização de work items específicos, ignorando o filtro de 180 dias.

**Uso:**
```bash
curl -X POST http://localhost:3001/api/sync-work-item/89277 \
  -H "Authorization: Bearer <seu-token-jwt>"
```

**Resposta:**
```json
{
  "success": true,
  "workItemId": 89277,
  "title": "N2| Relatório de análise...",
  "state": "Aguardando code review",
  "linkedPrVotes": {
    "votes": [...],
    "pushCount": 1,
    "commentCount": 0,
    "mergeStatus": "succeeded"
  }
}
```

### 3. **Scripts de Diagnóstico** ✅

Criados dois scripts para troubleshooting:

#### `backend/diagnose_task_89277.js`
Verifica:
- Dados da tarefa no banco
- Elegibilidade para alertas
- PRs vinculadas e seus status

#### `backend/check_task_89277_azure.js`
Verifica:
- Se a tarefa existe no Azure DevOps
- Se atende aos critérios de data da WIQL
- Detalhes das PRs vinculadas

## Como Resolver o Problema da Tarefa 89277

### Opção 1: Forçar Sincronização (Recomendado)

Execute o endpoint de sincronização específico:

```bash
POST /api/sync-work-item/89277
```

Isso irá:
1. Buscar a tarefa diretamente do Azure DevOps
2. Processar todas as PRs vinculadas
3. Popular o campo `linked_pr_votes`
4. Inserir/atualizar no banco

Após isso, a tarefa aparecerá no próximo alerta automático (se atender aos critérios de Nível 1 ou 2).

### Opção 2: Modificar a Tarefa no Azure DevOps

Faça qualquer alteração na tarefa (adicionar um comentário, mudar uma tag etc.) para atualizar o campo `ChangedDate`. Na próxima sincronização automática, ela será incluída.

### Opção 3: Aumentar o Período da Query WIQL

Altere a constante em [server.js](backend/server.js#L612):

```javascript
// De:
query: `SELECT [System.Id] FROM WorkItems WHERE [System.TeamProject] = '...' AND [System.ChangedDate] >= @Today - 180`

// Para (ex: 365 dias):
query: `SELECT [System.Id] FROM WorkItems WHERE [System.TeamProject] = '...' AND [System.ChangedDate] >= @Today - 365`
```

**⚠️ Atenção**: Aumentar muito este período pode tornar a sincronização mais lenta e consumir mais recursos.

## Prevenção

Para evitar que outras tarefas fiquem de fora dos alertas:

1. **Certifique-se de que as PRs estão com status "active"** no Azure DevOps
2. **Use o endpoint `/api/sync-work-item/:id`** para tarefas antigas que precisam ser monitoradas
3. **Monitore os logs da sincronização** para identificar warnings sobre PRs inativas ou erros de acesso

## Verificação

Após sincronizar a tarefa 89277, confirme que ela aparece no alerta:

1. Verifique que `linked_pr_votes` foi populado:
   ```sql
   SELECT work_item_id, title, linked_pr_votes 
   FROM work_items 
   WHERE work_item_id = 89277;
   ```

2. Verifique se ela atende aos critérios do alerta:
   - Estado em: 'aguardando code review', 'fazendo code review', 'aguardando qa', 'testando qa'
   - `linked_pr_votes IS NOT NULL`
   - `code_review_level1` vazio (para N1) OU preenchido mas `code_review_level2` vazio (para N2)
   - Grupo "Code Review" ainda não aprovou (para N2)

3. Aguarde o próximo horário configurado do alerta ou execute `POST /api/teams-pr-review-alert` manualmente (se houver esse endpoint)

## Arquivos Modificados

- [backend/server.js](backend/server.js) — Adicionado logging e endpoint `/api/sync-work-item/:id`
- [backend/diagnose_task_89277.js](backend/diagnose_task_89277.js) — Script de diagnóstico do banco
- [backend/check_task_89277_azure.js](backend/check_task_89277_azure.js) — Script de verificação no Azure DevOps
- [backend/test_azure_auth.js](backend/test_azure_auth.js) — Script de teste de autenticação
