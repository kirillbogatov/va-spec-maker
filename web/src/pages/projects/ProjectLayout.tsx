import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { AppShell } from '@/components/AppShell';
import { ProjectProvider, useProject } from '@/hooks/project';

function Guard() {
  const { project, isLoading, isError, isFetching, retry } = useProject();
  if (isLoading) return <p role="status" className="p-6 text-sm text-muted-foreground">Загрузка проекта…</p>;
  if (isError && !project) return (
    <main className="space-y-3 p-6">
      <p role="alert">Не удалось загрузить проект. Попробуйте ещё раз.</p>
      <Button variant="outline" disabled={isFetching} onClick={retry}>{isFetching ? 'Загрузка…' : 'Повторить загрузку'}</Button>
    </main>
  );
  if (!project) return (
    <main className="space-y-3 p-6">
      <h1 className="text-lg font-semibold">Проект не найден</h1>
      <Link to="/" className="text-sm text-brand underline underline-offset-4">Все проекты</Link>
    </main>
  );
  return <AppShell />;
}

export function ProjectLayout() {
  return (
    <ProjectProvider>
      <Guard />
    </ProjectProvider>
  );
}
