import { differenceInHours, differenceInDays } from 'date-fns';
import { faker } from '@faker-js/faker';
import { 
  WorkItem, 
  WorkItemStatus, 
  WorkItemType, 
  PullRequest, 
  ReviewerVote, 
  PullRequestStatus 
} from '../types.ts';

// Constantes para dados simulados
const SQUADS = ['Frontend', 'Backend', 'Plataforma', 'Mobile', 'Dados'] as const;
const ASSIGNEES = Array.from({ length: 15 }, () => faker.person.fullName());
const REPOSITORIES = [
  'WebApp-Principal', 
  'API-Gateway', 
  'Servico-Autenticacao', 
  'App-iOS', 
  'App-Android'
] as const;
const TAGS = [
  'Débito Técnico', 
  'UI/UX', 
  'Performance', 
  'Segurança', 
  'Refatoração', 
  'API', 
  'Banco de Dados', 
  'Mobile First', 
  'Feature Toggle'
] as const;

/**
 * Cria um Work Item simulado com dados realistas
 * @param id - ID único do work item
 * @returns Work item gerado com dados faker
 */
const createRandomWorkItem = (id: number): WorkItem => {
    const createdDate = faker.date.recent({ days: 90 });
    const status = faker.helpers.arrayElement(Object.values(WorkItemStatus));
    
    // Work items concluídos devem ter data de fechamento
    const isCompleted = status === WorkItemStatus.Concluido || status === WorkItemStatus.Fechado;
    const closedDate = isCompleted
        ? faker.date.between({ from: createdDate, to: new Date() })
        : undefined;

    const performanceDays = closedDate ? differenceInDays(closedDate, createdDate) : 0;

    // Simula o tempo em cada status para análise de gargalos
    const timeInStatusDays: Record<string, number> = {
        [WorkItemStatus.Novo]: 0,
        [WorkItemStatus.Ativo]: 0,
        [WorkItemStatus.EmProgresso]: 0,
        [WorkItemStatus.Resolvido]: 0,
    };

    // Distribui o tempo de forma mais realista entre os status
    if (performanceDays > 0) {
        let remainingDays = performanceDays;
        
        // Fase inicial: aguardando para começar (10-20% do tempo)
        const newStatusTime = faker.number.float({ 
          min: 0.1, 
          max: Math.max(0.2, remainingDays * 0.2) 
        });
        timeInStatusDays[WorkItemStatus.Novo] = parseFloat(newStatusTime.toFixed(2));
        remainingDays -= timeInStatusDays[WorkItemStatus.Novo];
        
        if (remainingDays > 0) {
            // Fase ativa: planejamento e análise (15-25% do tempo)
            const activeTime = faker.number.float({ 
              min: 0.1, 
              max: Math.max(0.2, remainingDays * 0.25) 
            });
            timeInStatusDays[WorkItemStatus.Ativo] = parseFloat(activeTime.toFixed(2));
            remainingDays -= timeInStatusDays[WorkItemStatus.Ativo];
        }
        
        if (remainingDays > 0) {
            // Fase de desenvolvimento: maior parte do tempo (50-70%)
            const inProgressTime = faker.number.float({ 
              min: 0.1, 
              max: Math.max(0.2, remainingDays * 0.7) 
            });
            timeInStatusDays[WorkItemStatus.EmProgresso] = parseFloat(inProgressTime.toFixed(2));
            remainingDays -= timeInStatusDays[WorkItemStatus.EmProgresso];
        }
        
        // Tempo restante para revisão e resolução
        if (remainingDays > 0) {
            timeInStatusDays[WorkItemStatus.Resolvido] = parseFloat(Math.max(0, remainingDays).toFixed(2));
        }
    }
        
    return {
        id,
        title: faker.hacker.phrase(),
        status,
        assignee: faker.helpers.arrayElement(ASSIGNEES),
        area: faker.commerce.department(),
        type: faker.helpers.arrayElement(Object.values(WorkItemType)),
        createdDate,
        closedDate,
        priority: faker.number.int({ min: 1, max: 4 }),
        complexity: faker.number.int({ min: 1, max: 5 }),
        squad: faker.helpers.arrayElement(SQUADS),
        client: faker.company.name(),
        version: `v${faker.system.semver()}`,
        platform: faker.helpers.arrayElement(['Web', 'iOS', 'Android', 'API']),
        rootCauseReason: faker.lorem.sentence(),
        reoccurrence: faker.datatype.boolean(0.2),
        performanceDays,
        tags: faker.helpers.arrayElements(TAGS, { min: 0, max: 3 }),
        timeInStatusDays,
    };
};

/**
 * Cria um Pull Request simulado com dados realistas
 * @param id - ID único do pull request
 * @returns Pull request gerado com dados faker
 */
const createRandomPullRequest = (id: number): PullRequest => {
    const createdDate = faker.date.recent({ days: 90 });
    const status = faker.helpers.arrayElement(Object.values(PullRequestStatus));
    let closedDate: Date | undefined = undefined;
    let lifetimeHours: number | undefined = undefined;

    // PRs não ativos devem ter data de fechamento e tempo de vida
    if (status !== PullRequestStatus.Ativo) {
        closedDate = faker.date.between({ from: createdDate, to: new Date() });
        lifetimeHours = differenceInHours(closedDate, createdDate);
    }
    
    // Prefixos de commit convencionais
    const commitTypes = ['feat', 'fix', 'refactor', 'docs', 'test', 'chore', 'perf', 'style'];
    const commitType = faker.helpers.arrayElement(commitTypes);
    
    // Gera votos dos reviewers de forma mais realista
    const reviewerCount = faker.number.int({ min: 1, max: 4 });
    const reviewers = Array.from({ length: reviewerCount }, () => {
        // PRs aprovados têm maior chance de votos positivos
        let vote: ReviewerVote;
        if (status === PullRequestStatus.Concluido) {
            vote = faker.helpers.weightedArrayElement([
                { weight: 8, value: ReviewerVote.Approved },
                { weight: 1, value: ReviewerVote.ApprovedWithSuggestions },
                { weight: 1, value: ReviewerVote.WaitingForAuthor }
            ]);
        } else if (status === PullRequestStatus.Abandonado) {
            vote = faker.helpers.weightedArrayElement([
                { weight: 5, value: ReviewerVote.Rejected },
                { weight: 3, value: ReviewerVote.WaitingForAuthor },
                { weight: 2, value: ReviewerVote.NoVote }
            ]);
        } else {
            vote = faker.helpers.arrayElement([
                ReviewerVote.NoVote,
                ReviewerVote.ApprovedWithSuggestions,
                ReviewerVote.WaitingForAuthor
            ]);
        }
        
        return {
            name: faker.helpers.arrayElement(ASSIGNEES),
            vote,
        };
    });
    
    return {
        id,
        title: `${commitType}: ${faker.hacker.verb()} ${faker.hacker.noun()}`,
        author: faker.helpers.arrayElement(ASSIGNEES),
        repository: faker.helpers.arrayElement(REPOSITORIES),
        status,
        reviewers,
        createdDate,
        closedDate,
        lifetimeHours,
    };
};


/**
 * Busca work items simulados
 * @returns Promise com array de work items
 */
export const getWorkItems = async (): Promise<WorkItem[]> => {
  // Simula delay de rede
  await new Promise(resolve => setTimeout(resolve, 500));
  
  const workItems = Array.from({ length: 300 }, (_, i) => createRandomWorkItem(i + 1));
  return workItems;
};

/**
 * Busca pull requests simulados
 * @returns Promise com array de pull requests
 */
export const getPullRequests = async (): Promise<PullRequest[]> => {
    // Simula delay de rede
    await new Promise(resolve => setTimeout(resolve, 500));
    
    const pullRequests = Array.from({ length: 200 }, (_, i) => createRandomPullRequest(i + 1));
    return pullRequests;
};