import { createContext, useContext, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { Project } from '@/lib/types';

interface Ctx {
  project: Project | null;
  isLoading: boolean;
}
const ProjectCtx = createContext<Ctx | null>(null);

/** Проект в сервисе один; сервер создаёт его при первом запуске. */
export function ProjectProvider({ children }: { children: ReactNode }) {
  const { data: projects = [], isLoading } = useQuery({ queryKey: ['projects'], queryFn: api.projects.list });
  return <ProjectCtx.Provider value={{ project: projects[0] ?? null, isLoading }}>{children}</ProjectCtx.Provider>;
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
