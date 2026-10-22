import { Navigate, Route, Routes } from 'react-router-dom';
import { DependenciesPage } from '@/pages/dependencies/DependenciesPage';
import { EntitiesPage } from '@/pages/entities/EntitiesPage';
import { IntentsPage } from '@/pages/intents/IntentsPage';
import { PromptsPage } from '@/pages/prompts/PromptsPage';
import { ProjectLayout } from '@/pages/projects/ProjectLayout';
import { ProjectsPage } from '@/pages/projects/ProjectsPage';
import { SettingsPage } from '@/pages/settings/SettingsPage';
import { ScenariosPage } from '@/pages/scenarios/ScenariosPage';

export default function App() {
  return (
    <Routes>
      <Route index element={<ProjectsPage />} />
      <Route path="p/:projectId" element={<ProjectLayout />}>
        <Route index element={<Navigate to="scenarios" replace />} />
        <Route path="lists/intents/:itemId?" element={<IntentsPage />} />
        <Route path="lists/prompts/:itemId?" element={<PromptsPage />} />
        <Route path="entities/:itemId?" element={<EntitiesPage />} />
        <Route path="dependencies/:itemId?" element={<DependenciesPage />} />
        <Route path="settings" element={<SettingsPage />} />
        <Route path="scenarios/:id?/:tab?" element={<ScenariosPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
