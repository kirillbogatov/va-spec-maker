import { createContext, useContext, type ReactNode } from 'react';
import { useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { ProjectListItem } from '@/lib/types';

interface Ctx {
  project: ProjectListItem | null;
  isLoading: boolean;
}
const ProjectCtx = createContext<Ctx | null>(null);

/** Текущий проект определяется по адресу /p/:projectId. */
export function ProjectProvider({ children }: { children: ReactNode }) {
  const { projectId } = useParams();
  const { data = [], isLoading } = useQuery({ queryKey: ['projects'], queryFn: api.projects.list });
  const project = data.find((p) => String(p.id) === projectId) ?? null;
  return <ProjectCtx.Provider value={{ project, isLoading }}>{children}</ProjectCtx.Provider>;
}

export function useProject(): Ctx {
  const c = useContext(ProjectCtx);
  if (!c) throw new Error('useProject вне ProjectProvider');
  return c;
}

export function useProjectId(): number {
  const { project } = useProject();
  if (!project) throw new Error('Проект не выбран');
  return project.id;
}

/** Строит адрес внутри текущего проекта: path('/scenarios') → /p/3/scenarios. */
export function usePath(): (suffix: string) => string {
  const id = useProjectId();
  return (suffix) => `/p/${id}${suffix}`;
}
