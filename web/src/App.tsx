import { Navigate, Route, Routes } from 'react-router-dom';
import { AppShell } from '@/components/AppShell';
import { ProjectProvider } from '@/hooks/project';
import { AdjustmentsPage } from '@/pages/adjustments/AdjustmentsPage';
import { DependenciesPage } from '@/pages/dependencies/DependenciesPage';
import { EntitiesPage } from '@/pages/entities/EntitiesPage';
import { DictionariesLayout } from '@/pages/DictionariesLayout';
import { ResultCodesPage } from '@/pages/result-codes/ResultCodesPage';
import { ScenariosPage } from '@/pages/scenarios/ScenariosPage';

export default function App() {
  return (
    <ProjectProvider>
      <Routes>
        <Route element={<AppShell />}>
          <Route index element={<Navigate to="/scenarios" replace />} />
          <Route element={<DictionariesLayout />}>
            <Route path="entities" element={<EntitiesPage />} />
            <Route path="dependencies" element={<DependenciesPage />} />
            <Route path="adjustments" element={<AdjustmentsPage />} />
            <Route path="result-codes" element={<ResultCodesPage />} />
          </Route>
          <Route path="scenarios" element={<ScenariosPage />} />
          <Route path="scenarios/:id" element={<ScenariosPage />} />
          <Route path="scenarios/:id/:tab" element={<ScenariosPage />} />
        </Route>
      </Routes>
    </ProjectProvider>
  );
}
