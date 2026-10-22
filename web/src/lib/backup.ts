import { api } from '@/lib/api';
import { downloadBlob } from '@/lib/download';

const key = (projectId: number) => `va-backup-${projectId}`;

/** Время последней резервной копии проекта (в этом браузере) или null. */
export function lastBackup(projectId: number): Date | null {
  try {
    const v = localStorage.getItem(key(projectId));
    return v ? new Date(Number(v)) : null;
  } catch {
    return null;
  }
}

/** Скачивает проект в JSON и запоминает время копии. */
export async function backupProject(project: { id: number; name: string }): Promise<void> {
  const dump = await api.projects.dump(project.id);
  downloadBlob(new Blob([JSON.stringify(dump, null, 2)], { type: 'application/json' }), `${project.name}.json`);
  try {
    localStorage.setItem(key(project.id), String(Date.now()));
  } catch {
    /* хранилище недоступно: копия всё равно скачана */
  }
}

/** «сегодня», «вчера», «5 дней назад» для плашки о резервной копии. */
export function backupAge(d: Date | null): string {
  if (!d) return 'никогда';
  const days = Math.floor((Date.now() - d.getTime()) / 86_400_000);
  if (days <= 0) return 'сегодня';
  if (days === 1) return 'вчера';
  const k = days % 10;
  const m = days % 100;
  return `${days} ${m > 10 && m < 15 ? 'дней' : k === 1 ? 'день' : k >= 2 && k <= 4 ? 'дня' : 'дней'} назад`;
}
