import { api } from '@/lib/api';
import { downloadBlob } from '@/lib/download';

const key = (projectId: number) => `va-backup-${projectId}`;

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
