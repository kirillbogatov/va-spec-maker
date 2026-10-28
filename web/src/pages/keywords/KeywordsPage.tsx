import { useState } from 'react';
import { Plus, X } from 'lucide-react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { DictCard, DictionaryMaster } from '@/components/DictionaryMaster';
import { Input } from '@/components/ui/input';
import { TransferMenu } from '@/components/TransferMenu';
import { Navigate } from 'react-router-dom';
import { usePath, useProjectId } from '@/hooks/project';
import { useIntentMode } from '@/lib/intentMode';
import { api } from '@/lib/api';
import { useKeywords } from '@/lib/keywords';
import { downloadDictionaryDoc } from '@/lib/dictionaryDoc';
import { splitTags } from '@/lib/parse';

/** Синонимы концепта: список с полем добавления. */
function SynonymsList({ value, onChange }: { value: string[]; onChange: (v: string[]) => void }) {
  const [text, setText] = useState('');
  const add = () => {
    const items = splitTags(text);
    if (items.length) onChange([...value, ...items]);
    setText('');
  };
  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <Input
          className="h-10 md:h-9"
          aria-label="Новый синоним"
          placeholder="Новый синоним"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              add();
            }
          }}
        />
        <button
          type="button"
          onClick={add}
          disabled={!text.trim()}
          className="inline-flex h-10 shrink-0 items-center gap-1 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground hover:bg-primary/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:opacity-50 md:h-9"
        >
          <Plus className="size-3.5" /> Добавить
        </button>
      </div>
      {value.length === 0 ? (
        <p className="text-sm text-muted-foreground">Синонимов пока нет.</p>
      ) : (
        <ul className="divide-y divide-border rounded-md border">
          {value.map((v, i) => (
            <li key={`${v}-${i}`} className="group flex min-h-10 items-center gap-2 px-3 py-1 hover:bg-muted md:min-h-9">
              <span className="min-w-0 flex-1 break-words text-sm">{v}</span>
              <button
                type="button"
                aria-label={`Удалить синоним ${v}`}
                className="inline-flex size-8 shrink-0 items-center justify-center rounded text-muted-foreground opacity-0 hover:text-destructive focus-visible:opacity-100 group-hover:opacity-100 pointer-coarse:opacity-100"
                onClick={() => onChange(value.filter((_, j) => j !== i))}
              >
                <X className="size-4" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Справочник концептов проекта: код и синонимы, импорт из txt, экспорт в txt и docx. */
export function KeywordsPage() {
  const projectId = useProjectId();
  const path = usePath();
  const mode = useIntentMode(projectId);
  const qc = useQueryClient();
  const items = useKeywords(projectId);
  const refresh = () => qc.invalidateQueries({ queryKey: ['keywords', projectId] });
  const create = useMutation({ mutationFn: (name: string) => api.keywords.create(projectId, name), onSuccess: refresh });
  const remove = useMutation({ mutationFn: (id: number) => api.keywords.remove(id), onSuccess: refresh });

  const importFile = async (file: File) => {
    try {
      const r = await api.keywords.import(projectId, await file.text());
      refresh();
      toast.success(`Добавлено: ${r.added}, обновлено: ${r.updated}${r.skipped ? `, пропущено строк: ${r.skipped}` : ''}`);
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  // Справочник есть только в режиме «Концепты»
  if (mode !== 'keywords') return <Navigate to={path('/lists/intents')} replace />;

  return (
    <DictionaryMaster
      kind="keyword"
      mono
      base="/lists/keywords"
      items={items}
      meta={(i) => (i.synonyms.length ? { text: String(i.synonyms.length) } : { text: 'нет синонимов', warn: true })}
      subtitle={(i) => i.synonyms.join(', ')}
      usedIn={(i) => i.used_by}
      listActions={
        <TransferMenu
          accept=".txt,text/plain"
          format="TXT"
          onImport={importFile}
          exports={[
            { format: 'TXT', run: () => api.keywords.exportTxt(projectId) },
            { format: 'DOCX', run: () => downloadDictionaryDoc('keywords', projectId, 'docx') },
          ]}
        />
      }
      body={(d, patch) => (
        <DictCard title="Синонимы">
          <SynonymsList value={d.synonyms} onChange={(synonyms) => patch({ synonyms })} />
        </DictCard>
      )}
      emptyText="Концептов пока нет"
      createTitle="Новый концепт"
      deleteTitle={(d) => `Удалить концепт ${d.name}?`}
      onCreate={(n) => create.mutateAsync(n)}
      onSave={async (d) => {
        await api.keywords.save(d.id, { name: d.name, synonyms: d.synonyms });
        refresh();
      }}
      onRemove={(d) => remove.mutate(d.id)}
    />
  );
}
