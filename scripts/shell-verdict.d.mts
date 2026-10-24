export const MIN_TEXT: number;
export const PROSE_TEXT: number;
export const HOME_LINKS: number;
export interface ShellMeasure {
  navMain: number;
  mains: number;
  mainH1: number;
  links: number;
  controls: number;
  tables: number;
  charts: number;
  textLen: number;
}
export function shellProblems(m: ShellMeasure): string[];
