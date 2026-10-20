import { Navigate, Route, Routes } from 'react-router-dom';
import { DependenciesPage } from '@/pages/dependencies/DependenciesPage';
import { EntitiesPage } from '@/pages/entities/EntitiesPage';
import { DictionariesLayout } from '@/pages/DictionariesLayout';
import { ProjectLayout } from '@/pages/projects/ProjectLayout';
import { ProjectsPage } from '@/pages/projects/ProjectsPage';
import { ScenariosPage } from '@/pages/scenarios/ScenariosPage';

export default function App() {
  return (
    <Routes>
      <Route index element={<ProjectsPage />} />
      <Route path="p/:projectId" element={<ProjectLayout />}>
        <Route index element={<Navigate to="scenarios" replace />} />
        <Route element={<DictionariesLayout />}>
          <Route path="entities" element={<EntitiesPage />} />
          <Route path="dependencies" element={<DependenciesPage />} />
        </Route>
        <Route path="scenarios" element={<ScenariosPage />} />
        <Route path="scenarios/:id" element={<ScenariosPage />} />
        <Route path="scenarios/:id/:tab" element={<ScenariosPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
