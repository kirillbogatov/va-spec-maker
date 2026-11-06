import { createContext, useContext } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { History, MoreHorizontal } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { usePath, useProjectId } from '@/hooks/project';
import { req } from '@/lib/api';
import { waitForSaves } from '@/lib/saveStore';

export const DictionaryHistoryContext = createContext<string | null>(null);
export function DictionaryHistoryMenuItem() {
  const base = useContext(DictionaryHistoryContext);
  const navigate = useNavigate();
  const path = usePath();
  if (!base) return null;
  return <DropdownMenuItem onClick={async () => {
    try { await waitForSaves(); navigate(path(`${base}/history`)); }
    catch { toast.error('Не удалось открыть историю: сначала сохраните изменения.'); }
  }}><History className="size-4" /> История изменений</DropdownMenuItem>;
}
export function DictionaryHistoryActions() {
  return <DropdownMenu>
    <DropdownMenuTrigger render={<Button variant="ghost" size="icon" className="size-10 md:size-8" aria-label="Действия справочника" />}><MoreHorizontal className="size-4" /></DropdownMenuTrigger>
    <DropdownMenuContent><DictionaryHistoryMenuItem /></DropdownMenuContent>
  </DropdownMenu>;
}
const TITLES: Record<string, string> = {
  intents: 'Интенты', entities: 'Сущности', prompts: 'Промпты', dependencies: 'Зависимости',
  concepts: 'Концепты', keywords: 'Ключевые слова', 'result-codes': 'Result Codes', 'response-templates': 'Шаблоны ответов',
};
interface Entry { id: number; item_name: string; at: string; description: string }
export function DictionaryHistory({ base }: { base: string }) {
  const pid = useProjectId();
  const kind = base === '/templates/responses' ? 'response-templates' : base.split('/').pop()!;
  const { data = [], isPending, isError, refetch } = useQuery({
    queryKey: ['dictionary-history', pid, kind],
    queryFn: async () => {
      await waitForSaves();
      return req<Entry[]>('GET', `/api/projects/${pid}/dictionaries/${kind}/history`);
    },
  });
  return <div className="mx-auto max-w-5xl space-y-4">
    <div><h1 className="text-xl font-semibold">История изменений</h1><p className="mt-1 text-sm text-muted-foreground">{TITLES[kind]}</p></div>
    {isPending ? <p role="status" className="text-sm text-muted-foreground">Загрузка истории…</p> : isError ?
      <div role="alert" className="space-y-3"><p>Не удалось загрузить историю изменений.</p><Button variant="outline" onClick={() => void refetch()}>Повторить</Button></div> : data.length === 0 ?
      <p className="text-sm text-muted-foreground">Изменений пока нет</p> :
      <div className="overflow-x-auto rounded-xl border bg-card">
        <table className="w-full min-w-[40rem] table-fixed text-left text-sm">
          <thead className="border-b text-xs text-muted-foreground"><tr><th className="w-36 p-3 font-medium">Дата изменения</th><th className="w-1/3 p-3 font-medium">Элемент</th><th className="p-3 font-medium">Описание изменения</th></tr></thead>
          <tbody className="divide-y">{data.map((entry) => <tr key={entry.id}>
            <td className="p-3 align-top tabular-nums"><time dateTime={entry.at}>{new Date(entry.at).toLocaleString('ru-RU')}</time></td>
            <td className="break-words p-3 align-top font-mono text-xs [overflow-wrap:anywhere]">{entry.item_name}</td>
            <td className="whitespace-pre-wrap break-words p-3 align-top [overflow-wrap:anywhere]">{entry.description}</td>
          </tr>)}</tbody>
        </table>
      </div>}
  </div>;
}
