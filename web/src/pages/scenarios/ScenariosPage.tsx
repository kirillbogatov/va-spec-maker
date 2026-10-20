import { useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { EmptyDetail, MasterDetail } from '@/components/MasterDetail';
import { api } from '@/lib/api';
import { ScenarioForm, type ScenarioTab } from './ScenarioForm';
import { ScenarioList } from './ScenarioList';

function ScenarioEditor({ id, tab }: { id: number; tab: ScenarioTab }) {
  // gcTime: 0 — форма инициализируется из ответа один раз, кэш не должен подсовывать устаревшие данные
  const { data } = useQuery({ queryKey: ['scenario', id], queryFn: () => api.scenarios.get(id), gcTime: 0 });
  if (!data) return null;
  return <ScenarioForm key={id} scenario={data} tab={tab} />;
}

export function ScenariosPage() {
  const { id, tab } = useParams();
  const activeTab: ScenarioTab = tab === 'intents' || tab === 'prompts' || tab === 'logic' || tab === 'errors' || tab === 'preview' ? tab : 'general';
  return (
    <MasterDetail list={<ScenarioList />}>
      {id ? <ScenarioEditor id={Number(id)} tab={activeTab} /> : <EmptyDetail />}
    </MasterDetail>
  );
}
