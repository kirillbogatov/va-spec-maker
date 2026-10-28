import { Fragment, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { usePath, useProjectId } from '@/hooks/project';
import { api } from '@/lib/api';
import type { HistoryRef } from '@/lib/types';
import { Card } from './Card';

/** 2026-10-28 → 28.10.26 */
const formatDay = (day: string) => {
  const [y, m, d] = day.split('-');
  return `${d}.${m}.${y.slice(2)}`;
};

/** Все изменения сценария (записываются автоматически): «дата — что изменилось», названия изменённых объектов — ссылки на них. */
export function ScenarioHistory({ scenarioId }: { scenarioId: number }) {
  const projectId = useProjectId();
  const path = usePath();
  const { data: entries = [], isSuccess } = useQuery({ queryKey: ['history', scenarioId], queryFn: () => api.scenarios.history(scenarioId) });
  const { data: intents } = useQuery({ queryKey: ['intents', projectId], queryFn: () => api.intents.list(projectId) });
  const { data: prompts } = useQuery({ queryKey: ['prompts', projectId], queryFn: () => api.prompts.list(projectId) });

  const where = (suffix: string, part?: string, state?: string) => {
    const q = new URLSearchParams();
    if (part) q.set('part', part);
    if (state) q.set('state', state);
    return path(`/scenarios/${scenarioId}/${suffix}${q.size ? `?${q}` : ''}`);
  };
  /** Куда ведёт ссылка и под каким названием; null — объекта больше нет, показываем обычным текстом. */
  const target = (r: HistoryRef): { to: string; label: string } | null => {
    switch (r.type) {
      case 'intent': {
        const cur = intents?.find((i) => i.id === r.id);
        return intents && !cur ? null : { to: path(`/lists/intents/${r.id}`), label: cur?.name ?? r.name };
      }
      case 'prompt': {
        const cur = prompts?.find((p) => p.id === r.id);
        return prompts && !cur ? null : { to: path(`/lists/prompts/${r.id}`), label: cur?.name ?? r.name };
      }
      case 'state': return { to: where('logic', r.part, r.name), label: r.name };
      case 'part': return { to: where('logic', r.part), label: r.name };
      case 'error': return { to: where('errors', r.part), label: r.name };
      case 'dependency': return { to: where('general'), label: r.name };
    }
  };

  const render = (text: string, refs: HistoryRef[]): ReactNode =>
    text.split(/\{(\d+)\}/).map((chunk, i) => {
      if (i % 2 === 0) return <Fragment key={i}>{chunk}</Fragment>;
      const ref = refs[Number(chunk)];
      const t = ref && target(ref);
      if (!ref) return null;
      return t ? (
        <Link key={i} to={t.to} className="font-mono text-[13px] text-brand hover:underline">{t.label}</Link>
      ) : (
        <span key={i} className="font-mono text-[13px]">{ref.name}</span>
      );
    });

  return (
    <Card title="Все изменения" flush>
      {isSuccess && entries.length === 0 && <p className="border-t px-4 py-4 text-sm text-muted-foreground">Изменений пока нет.</p>}
      <ul>
        {entries.map((e) => (
          <li key={e.id} className="flex gap-3 border-t px-4 py-2.5 text-sm">
            <time dateTime={e.day} className="w-16 shrink-0 tabular-nums text-muted-foreground">{formatDay(e.day)}</time>
            <span className="min-w-0 flex-1 break-words">{render(e.text, e.refs)}</span>
          </li>
        ))}
      </ul>
    </Card>
  );
}
