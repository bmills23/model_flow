export interface GuidedResultState {
  tables: number;
  notQuantified: boolean;
  loading: boolean;
  alerts: string[];
  textLen: number;
}
export function guidedResultProblems(m: GuidedResultState): string[];
export const GUIDED_RESULT_ROUTES: string[];
