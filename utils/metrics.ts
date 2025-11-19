import { WorkItem, WorkItemStatus, WorkItemType, PullRequest, PullRequestStatus, ReviewerVote } from '../types.ts';
import { differenceInDays, differenceInHours } from 'date-fns';

export const calculatePerformanceMetrics = (workItems: WorkItem[]) => {
  const completed = workItems.filter(item => item.status === WorkItemStatus.Concluido);
  const inProgress = workItems.filter(item => 
    item.status === WorkItemStatus.Ativo || item.status === WorkItemStatus.EmProgresso
  );

  const totalCycleTime = completed.reduce((acc, item) => {
    if (item.closedDate) {
      return acc + differenceInDays(item.closedDate, item.createdDate);
    }
    return acc;
  }, 0);

  const avgCycleTime = completed.length > 0 ? (totalCycleTime / completed.length).toFixed(1) : '0';

  return {
    total: workItems.length,
    completed: completed.length,
    inProgress: inProgress.length,
    avgCycleTime,
  };
};

export const calculateQualityMetrics = (workItems: WorkItem[]) => {
    const qualityItems = workItems.filter(item => item.type === WorkItemType.Bug || item.type === WorkItemType.Issue);
    
    const openBugs = qualityItems.filter(item => item.type === WorkItemType.Bug && item.status !== WorkItemStatus.Concluido).length;
    const openIssues = qualityItems.filter(item => item.type === WorkItemType.Issue && item.status !== WorkItemStatus.Concluido).length;

    const resolvedQualityItems = qualityItems.filter(item => item.status === WorkItemStatus.Concluido && item.closedDate);
    
    const totalResolutionTime = resolvedQualityItems.reduce((acc, item) => {
        return acc + differenceInDays(item.closedDate!, item.createdDate);
    }, 0);

    const avgResolutionTime = resolvedQualityItems.length > 0 ? (totalResolutionTime / resolvedQualityItems.length).toFixed(1) : '0';

    const recurringItems = qualityItems.filter(item => item.reoccurrence).length;
    const recurrenceRate = qualityItems.length > 0 ? ((recurringItems / qualityItems.length) * 100).toFixed(0) : '0';

    return {
        openBugs,
        openIssues,
        avgResolutionTime,
        recurrenceRate
    };
};


export const calculatePRMetrics = (pullRequests: PullRequest[]) => {
    const openPRs = pullRequests.filter(pr => pr.status === PullRequestStatus.Ativo).length;
    const completedPRs = pullRequests.filter(pr => pr.status === PullRequestStatus.Concluido);

    const totalMergeTime = completedPRs.reduce((acc, pr) => acc + (pr.lifetimeHours || 0), 0);
    const avgMergeTime = completedPRs.length > 0 ? (totalMergeTime / completedPRs.length).toFixed(1) : '0';
    
    const approvedPRs = completedPRs.filter(pr => 
        !pr.reviewers.some(r => r.vote === ReviewerVote.Rejected)
    ).length;

    const approvalRate = completedPRs.length > 0 ? ((approvedPRs / completedPRs.length) * 100).toFixed(0) : '0';

    return {
        openPRs,
        completedPRs: completedPRs.length,
        avgMergeTime,
        approvalRate,
    };
};