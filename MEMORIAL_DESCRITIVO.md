# Memorial Descritivo
## DevOps Performance Dashboard
### Plataforma de Análise e Gestão de Desenvolvimento de Software

---

## 2. Identificação

| Campo | Valor |
|---|---|
| **Nome da Plataforma** | DevOps Performance Dashboard |
| **Versão Atual** | 1.0 (produção) |
| **Data de Referência** | Julho de 2026 |
| **Repositório** | github.com/eloviskis/dashboard-azure-devops-datasystem |
| **Instância Data System** | https://dsmetrics.online |
| **Instância Fluxometria** | https://fluxometria.com |
| **Tecnologia Principal** | React + TypeScript (frontend) · Node.js + PostgreSQL (backend) |

---

## 2. Objetivo

O DevOps Performance Dashboard é uma plataforma web de inteligência operacional criada para equipes de desenvolvimento de software que utilizam o **Azure DevOps** como ferramenta de gestão de projetos.

Seu propósito central é transformar os dados brutos do Azure DevOps (work items, pull requests, ciclos de trabalho) em **indicadores visuais acionáveis**, permitindo que líderes técnicos, gerentes de produto e times de engenharia tomem decisões fundamentadas em dados reais.

A plataforma é **multi-cliente**: cada empresa pode ter sua própria instância com dados isolados, branding personalizado e usuários independentes, instalada em uma VPS própria.

---

## 3. Arquitetura Técnica

### 3.1 Visão Geral

```
┌─────────────────────────────────────────────────────────────┐
│                      USUÁRIO (Browser)                      │
│               React + TypeScript + Tailwind CSS             │
└────────────────────────────┬────────────────────────────────┘
                             │ HTTPS (nginx)
┌────────────────────────────▼────────────────────────────────┐
│                     VPS (Ubuntu 24.04)                      │
│  ┌─────────────────────┐   ┌─────────────────────────────┐  │
│  │  nginx (rev proxy)  │   │   PM2 Process Manager       │  │
│  │  Porta 80/443       │──▶│   Node.js Express (porta 3x)│  │
│  │  SSL Let's Encrypt  │   │   server.js                 │  │
│  └─────────────────────┘   └──────────────┬──────────────┘  │
│                                           │                  │
│  ┌────────────────────────────────────────▼──────────────┐  │
│  │              PostgreSQL 16                            │  │
│  │  work_items · pull_requests · users · qa_test_records │  │
│  │  app_settings · ceremony_records · devtracker_*       │  │
│  └───────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
                             │
                    API REST (JWT Bearer)
                             │
          ┌──────────────────▼─────────────────────┐
          │          Azure DevOps API               │
          │  Work Items · Pull Requests · Members   │
          └─────────────────────────────────────────┘
```

### 3.2 Stack Tecnológico

**Frontend**
- React 18 + TypeScript
- Vite 5 (build tool)
- Tailwind CSS v4 (CSS-first)
- Recharts (gráficos)
- ExcelJS (exportação de planilhas)
- JWT via localStorage

**Backend**
- Node.js 20 + Express 4
- PostgreSQL 16 (driver `pg`)
- PM2 (gerenciamento de processo)
- bcryptjs (hash de senhas)
- node-schedule (sync agendada a cada 30 min)
- JWT (jsonwebtoken, expiração de 24h)

**Infraestrutura**
- Ubuntu 22.04/24.04 LTS
- nginx (proxy reverso + SSL)
- Let's Encrypt (certificado TLS automático)
- GitHub Actions CI

---

## 4. Módulos e Funcionalidades

### 4.1 Dashboards Disponíveis (28 módulos)

#### Categoria: Visão Executiva
| Módulo | Descrição |
|---|---|
| **🎯 Visão Executiva** | Dashboard home com KPIs principais: volume entregue, taxa de qualidade, tempo médio de ciclo e tendências do período |
| **📈 Performance Geral** | Distribuição de itens por status, performance por time, tendência de entregas, performance individual, itens em envelhecimento e limites de WIP |
| **🏁 Metas por Time** | Acompanhamento de metas definidas por time, progresso e projeção de alcance |
| **📋 SLA Tracking** | Monitoramento de cumprimento de SLAs por tipo de item e cliente |

#### Categoria: Fluxo e Eficiência
| Módulo | Descrição |
|---|---|
| **📊 Fluxo Contínuo (Kanban)** | Diagrama de fluxo cumulativo (CFD), Lead Time vs Cycle Time, histograma de throughput e índice de eficiência de fluxo |
| **⏱️ Cycle Time Analytics** | Análise detalhada do tempo de ciclo com comparação entre times, percentil P85, distribuição por tipo e período |
| **📉 Vazão Detalhada** | Tendência de throughput por pessoa e por tipo de item; evolução semanal/mensal |
| **📚 Análise de Backlog** | Velocidade da equipe, capacidade projetada, recomendações de refinamento baseadas em histórico |
| **🎲 Previsão Monte Carlo** | Simulação probabilística de prazo baseada em histórico de throughput; curvas de confiança |

#### Categoria: Qualidade
| Módulo | Descrição |
|---|---|
| **✅ Qualidade** | Proporção Bugs/Issues, taxa de defeitos, taxa de detecção em desenvolvimento, MTTR, análise de retrabalho e bugs por feature |
| **🔍 Root Cause (Issues)** | Análise de causa raiz de issues encerradas: agrupamento por categoria, prioridade, responsável |
| **⚠️ Impedimentos** | Rastreamento de itens bloqueados por impedimento: dias bloqueados, time responsável, tipo |

#### Categoria: Times e Pessoas
| Módulo | Descrição |
|---|---|
| **👥 Insights por Time** | Relatório consolidado por time: throughput, cycle time, qualidade e recomendações acionáveis |
| **📅 Evolução dos Times** | Evolução histórica dos indicadores de cada time ao longo do tempo |
| **👥 Pessoas & Senioridade** | Comparação de performance individual com classificação por senioridade e especialidade |
| **📥 Análise de Demanda (PO)** | Análise de quem cria trabalho, taxa de conclusão, qualidade de especificação e ranking de POs |

#### Categoria: DevOps & Engenharia
| Módulo | Descrição |
|---|---|
| **🔀 Pull Requests & Code Review** | Métricas de PRs: volume, tempo de review, taxa de aprovação, distribuição por revisor |
| **🚀 Indicadores DevOps (DORA)** | Métricas DORA adaptadas: frequência de deploy, lead time para mudanças, taxa de falha, MTTR |
| **🚧 Gargalos** | Tempo médio por status: identifica em qual etapa os itens ficam mais tempo parados |
| **📊 Comparação de Períodos** | Comparativo entre dois períodos configuráveis para validar melhorias ou identificar tendências |

#### Categoria: Análise Temática
| Módulo | Descrição |
|---|---|
| **🏷️ Análise de Tags** | Tags mais utilizadas e cycle time médio por tag |
| **🏢 Análise por Cliente** | Distribuição de itens, cycle time médio e throughput segmentados por cliente |
| **🏃 Scrum (CTC/Franquia)** | Métricas para times Scrum: story points vs cycle time, velocidade por sprint |

#### Categoria: Operacional
| Módulo | Descrição |
|---|---|
| **📝 Lista de Itens** | Tabela completa de work items com filtros, exportação para Excel e detalhes individuais |
| **🗂️ DevTracker** | Gestão de alocação de desenvolvedores por projeto: capacidade, dedicação e projetos ativos |
| **🗓️ Ritos & Cerimônias** | Registro e acompanhamento de cerimônias ágeis (planning, review, retrospectiva, daily) |
| **🧪 QA Tracker** | Controle do processo de testes: registro de evidências por versão entregue, status de aprovação, rastreio por responsável de QA |
| **📖 Documentação** | Referência técnica interna da plataforma |

---

### 4.2 QA Tracker — Detalhamento

O QA Tracker é o módulo mais completo para gestão do processo de qualidade pós-desenvolvimento:

- **Registro por versão**: cada work item é associado a uma versão entregue (`delivered_version`) e à versão indicada nas tags DevOps
- **Status de teste**: `Pendente` · `Testado` · `Bloqueado`
- **Validação de elegibilidade**: um item só pode ser marcado como *Testado* automaticamente se possuir os **dois campos de versão** preenchidos corretamente (`delivered_version` + tag no formato `X.X.X.X` nas tags)
- **Exceção por tipo**: itens do tipo `Eventuality` exigem apenas a tag de versão
- **Auto-popular**: botão que processa todas as versões conhecidas, cria registros faltantes e corrige registros inconsistentes
- **Evidências**: cada registro suporta casos de teste (CTs), observações e anexos de imagem
- **Drill-down**: clique em qualquer versão no histórico para ver todos os itens daquela versão
- **Alertas visuais**: badges coloridos indicam `⚠ Falta Versão` (laranja) e `🏷️ Falta Tag` (amarelo) diretamente nos cards dos itens

---

### 4.3 Sincronização com Azure DevOps

- **Automática**: a cada 30 minutos via `node-schedule`
- **Manual**: botão "Sincronizar" no header
- **Escopo**: itens dos últimos 180 dias + todos os Pull Requests ativos
- **Mapeamento de campos**: além dos campos nativos do Azure DevOps, a plataforma lê campos customizados como `delivered_version`, `bloqueio`, `impedimento`, `qa`, `causa_raiz`, `squad`, entre outros
- **Histórico**: log das últimas 50 sincronizações com timestamp e contagem de itens

---

## 5. Segurança

| Aspecto | Implementação |
|---|---|
| **Autenticação** | JWT Bearer Token, validade de 24h, renovação automática |
| **Senhas** | bcrypt com salt rounds padrão |
| **Autorização** | Roles `admin` e `user`; endpoints de escrita requerem admin |
| **CORS** | Lista de origens configurável por variável de ambiente (`ALLOWED_ORIGIN`) |
| **Captcha** | Captcha matemático na tela de login (proteção a força bruta) |
| **HTTPS** | TLS via Let's Encrypt, renovação automática via certbot |
| **Credentials** | Nunca versionadas; armazenadas em `.env` excluído do git |

---

## 6. Gestão de Usuários

- Criação, edição e exclusão de usuários pelo admin
- Controle granular por aba: o admin pode restringir quais módulos cada usuário pode ver
- Senhas alteráveis pelo próprio usuário (modal no header)
- Usuário `admin` criado automaticamente no primeiro startup com senha configurável via `ADMIN_DEFAULT_PASSWORD`

---

## 7. Personalização por Cliente (Branding)

Cada instância pode ser personalizada pelo admin sem alterar código:

| Configuração | Como ajustar |
|---|---|
| Nome da empresa | `app_settings` → chave `branding.company_name` |
| Logo na tela de login | `app_settings` → chave `branding.logo_url` |
| Imagem de fundo do login | `app_settings` → chave `branding.cover_url` |
| Texto do rodapé | `app_settings` → chave `branding.footer_text` |
| Ordem/visibilidade das abas | Admin → Configurar Abas (salvo globalmente para todos os usuários) |
| Tema visual | `VITE_DEFAULT_THEME` na build (`default` = Data System verde / `bluey` = pastel claro) |

---

## 8. Temas Visuais

| Tema | Descrição | Ativação |
|---|---|---|
| **Data System (padrão)** | Dark blue profundo com verde lima e ciano; identidade visual da Data System | Padrão (sem configuração) |
| **Bluey Pastel (claro)** | Tons pastéis inspirados no desenho animado Bluey: azul céu, brancos, teal suave | `VITE_DEFAULT_THEME=bluey` na build |
| **Bluey Noturno** | Blues profundos com acentos Bluey; toggle de lua/sol no header | Botão ☀️/🌙 no header (persiste via localStorage) |

---

## 9. Implantação (Deploy)

### 9.1 Requisitos de Infraestrutura

| Componente | Mínimo Recomendado |
|---|---|
| Sistema Operacional | Ubuntu 22.04 LTS ou 24.04 LTS |
| RAM | 2 GB |
| CPU | 2 vCPU |
| Disco | 20 GB SSD |
| Node.js | v20+ |
| PostgreSQL | v15+ |
| nginx | v1.18+ |

### 9.2 Instalação em Nova VPS

```bash
# 1. Copiar o script de instalação para a VPS
scp deploy.sh root@IP_NOVO:/tmp/deploy.sh

# 2. Executar (pedirá informações interativamente)
bash /tmp/deploy.sh
```

O script `deploy.sh` realiza automaticamente:
- Instalação de Node.js, PostgreSQL, nginx e PM2
- Clonagem do repositório
- Criação do banco de dados e usuário PostgreSQL
- Geração do `JWT_SECRET` aleatório
- Configuração do arquivo `.env`
- Build do frontend com a URL correta
- Configuração do nginx como proxy reverso
- Configuração de SSL via Let's Encrypt (se domínio fornecido)
- Inicialização do processo via PM2 com nome do projeto
- Criação do usuário admin inicial

### 9.3 Estrutura de Arquivos por Instância

```
/opt/{nome-projeto}/          ← código-fonte
  backend/
    server.js                 ← servidor Express
    .env                      ← credenciais (não versionado)
  frontend/
    dist/                     ← frontend compilado

/var/www/{nome-projeto}/      ← arquivos servidos pelo nginx
/etc/nginx/sites-available/   ← configuração nginx
~/.pm2/                       ← logs e estado PM2
```

### 9.4 Estratégia de Branches (Multi-cliente)

```
main                    ← produto base limpo (sem credenciais, sem branding fixo)
client/datasystem       ← instância Data System (dsmetrics.online)
client/fluxometria      ← instância Fluxometria (fluxometria.com) + tema Bluey
client/{empresa-abc}    ← próximos clientes
```

Correções de bugs → commitar em `main` → `git merge main` em cada branch de cliente → redeploy em ~5 min.

---

## 10. Manutenção

| Operação | Comando |
|---|---|
| Ver logs em tempo real | `pm2 logs {nome-projeto}` |
| Reiniciar backend | `pm2 restart {nome-projeto}` |
| Atualizar credenciais Azure | `nano /opt/{nome}/backend/.env` + restart |
| Sync manual via API | `POST /api/sync` (autenticado) |
| Verificar status | `pm2 list` |
| Renovar SSL (automático) | `certbot renew` (cron automático) |

---

## 11. Instâncias em Produção

| Cliente | URL | VPS | Tema |
|---|---|---|---|
| Data System | https://dsmetrics.online | 187.77.55.172 | Verde Data System |
| Fluxometria | https://fluxometria.com | 77.37.41.105 | Bluey Pastel |

---

## 12. Desenvolvido por

**Data System Softwares**  
Eloi Santaroza  
eloi.santaroza@datasystem.com.br

---

*Este documento descreve o estado da plataforma em julho de 2026.*
