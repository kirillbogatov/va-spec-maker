import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { DictionaryMaster } from '@/components/DictionaryMaster';
import { DictionaryValues } from '@/components/DictionaryValues';
import { TransferMenu } from '@/components/TransferMenu';
import { Navigate } from 'react-router-dom';
import { usePath, useProjectId } from '@/hooks/project';
import { useIntentMode } from '@/lib/intentMode';
import { api } from '@/lib/api';
import { useKeywords } from '@/lib/keywords';
import { downloadDictionaryDoc } from '@/lib/dictionaryDoc';
import { splitTags } from '@/lib/parse';

/** Синонимы ключевого слова: список с полем добавления. */
function SynonymsList({ value, onChange }: { value: string[]; onChange: (v: string[]) => void }) {
  return <DictionaryValues title="Синонимы" label="Новый синоним" empty="Синонимов пока нет."
    value={value} onChange={onChange} parse={splitTags} removeLabel={(item) => `Удалить синоним ${item}`} />;
}

/** Справочник ключевых слов проекта: код и синонимы, импорт из txt, экспорт в txt и docx. */
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

  // Справочник есть только в режиме «Ключевые слова»
  if (mode !== 'keywords') return <Navigate to={path('/lists/intents')} replace />;

  return (
    <DictionaryMaster
      kind="keyword"
      mono
      base="/lists/keywords"
      items={items}
      searchValues={(i) => i.synonyms}
      meta={(i) => (i.synonyms.length ? { text: String(i.synonyms.length) } : { text: 'нет синонимов', warn: true })}
      subtitle={(i) => i.synonyms.join(', ')}
      usedIn={(i) => i.used_by}
      listActions={
        <TransferMenu
          accept=".txt,text/plain"
          format="TXT"
          importLabel="ключевых слов"
          onImport={importFile}
          exports={[
            { format: 'TXT', run: () => api.keywords.exportTxt(projectId) },
            { format: 'DOCX', run: () => downloadDictionaryDoc('keywords', projectId, 'docx') },
          ]}
        />
      }
      body={(d, patch) => (
          <SynonymsList value={d.synonyms} onChange={(synonyms) => patch({ synonyms })} />
      )}
      emptyText="Ключевых слов пока нет"
      createTitle="Новое ключевое слово"
      createDialogTitle="Добавить ключевое слово"
      deleteTitle={(d) => `Удалить ключевое слово ${d.name}?`}
      onCreate={(n) => create.mutateAsync(n)}
      onSave={async (d) => {
        await api.keywords.save(d.id, { name: d.name, synonyms: d.synonyms });
        refresh();
      }}
      onRemove={(d) => remove.mutate(d.id)}
    />
  );
}
