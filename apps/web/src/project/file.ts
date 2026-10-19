import { parseProject, type LoadResult, type Project } from './index';

/** Project files are small; anything past this is not one of ours and is not read. */
export const MAX_PROJECT_FILE_BYTES = 25 * 1024 * 1024;
const MAX_NAME_LENGTH = 80;
const FALLBACK_NAME = 'model_flow-project';

/** `<title or model_flow-project>-<YYYY-MM-DD>.json`, safe on every file system. */
export function projectFileName(title: string | undefined, now: Date): string {
  const date = now.toISOString().slice(0, 10);
  const suffix = `-${date}.json`;
  let base = (title ?? '')
    .trim()
    .replace(/[\\/:*?"<>|]+/g, ' ')
    .replace(/\p{Cc}+/gu, ' ')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/^[.-]+/, '');
  base = base.slice(0, MAX_NAME_LENGTH - suffix.length).replace(/[.-]+$/, '');
  return `${base === '' ? FALLBACK_NAME : base}${suffix}`;
}

export function serializeProject(project: Project): string {
  return `${JSON.stringify(project, null, 2)}\n`;
}

/** Download the project as a JSON file through a Blob and an anchor. */
export function downloadProject(project: Project, now: Date = new Date()): string {
  const name = projectFileName(project.title, now);
  const url = URL.createObjectURL(
    new Blob([serializeProject(project)], { type: 'application/json' }),
  );
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
  return name;
}

function readText(file: File): Promise<string> {
  if (typeof file.text === 'function') return file.text();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsText(file);
  });
}

/** Read and validate a chosen file exactly as a shared link is validated. */
export async function readProjectFile(file: File): Promise<LoadResult> {
  if (file.size > MAX_PROJECT_FILE_BYTES) {
    return { ok: false, error: 'This file is too large to be a model_flow project.' };
  }
  let text: string;
  try {
    text = await readText(file);
  } catch {
    return { ok: false, error: 'This file could not be read.' };
  }
  return parseProject(text);
}
