import { Navigate } from 'react-router-dom';
import { AppShell } from '@/components/AppShell';
import { ProjectProvider, useProject } from '@/hooks/project';

function Guard() {
  const { project, isLoading } = useProject();
  if (isLoading) return null;
  if (!project) return <Navigate to="/" replace />;
  return <AppShell />;
}

export function ProjectLayout() {
  return (
    <ProjectProvider>
      <Guard />
    </ProjectProvider>
  );
}
