
import { WorkItemStatus, ReviewerVote } from './types.ts';

export const STATUS_COLORS: Record<WorkItemStatus, string> = {
  [WorkItemStatus.Novo]: '#a0aec0',       // gray
  [WorkItemStatus.Ativo]: '#4299e1',      // blue
  [WorkItemStatus.EmProgresso]: '#f6e05e',// yellow
  [WorkItemStatus.Resolvido]: '#48bb78',  // green
  [WorkItemStatus.Concluido]: '#64FFDA',  // ds-green
  [WorkItemStatus.Fechado]: '#38b2ac',    // teal
};

export const VOTE_COLORS: Record<number, string> = {
    [ReviewerVote.Approved]: '#48bb78', // green-500
    [ReviewerVote.ApprovedWithSuggestions]: '#90cdf4', // blue-300
    [ReviewerVote.NoVote]: '#a0aec0', // gray-400
    [ReviewerVote.WaitingForAuthor]: '#f6e05e', // yellow-400
    [ReviewerVote.Rejected]: '#f56565', // red-500
};

export const CHART_COLORS = {
  primary: '#64FFDA',
  secondary: '#4299e1',
  text: '#8892B0',
  grid: '#303C55',
  tooltipBg: '#112240',
  bug: '#f56565',     // red
  issue: '#f6e05e', // yellow
  palette: ['#64FFDA', '#47C5FB', '#F6E05E', '#F56565', '#B794F4', '#FBB6CE'],
};
