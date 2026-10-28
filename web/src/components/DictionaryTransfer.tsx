import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { TransferMenu } from '@/components/TransferMenu';
import { useProjectId } from '@/hooks/project';
import { downloadDictionaryDoc } from '@/lib/dictionaryDoc';
import { downloadDictionary, importDictionary, summary, type DictKind } from '@/lib/dictionaryTransfer';

/** Импорт справочника из CSV; экспорт в CSV (для обратного импорта), TXT и DOCX (таблицей). */
export function DictionaryTransfer({ kind }: { kind: DictKind }) {
  const projectId = useProjectId();
  const qc = useQueryClient();
  return (
    <TransferMenu
      accept=".csv,text/csv"
      format="CSV"
      exports={[
        { format: 'CSV', run: () => downloadDictionary(kind, projectId) },
        { format: 'TXT', run: () => downloadDictionaryDoc(kind, projectId, 'txt') },
        { format: 'DOCX', run: () => downloadDictionaryDoc(kind, projectId, 'docx') },
      ]}
      onImport={async (file) => {
        try {
          const r = await importDictionary(kind, projectId, await file.text());
          await qc.invalidateQueries();
          if (r.warnings.length) toast.warning(`${summary(r)}. ${r.warnings.slice(0, 3).join('; ')}${r.warnings.length > 3 ? ` и ещё ${r.warnings.length - 3}` : ''}`);
          else toast.success(summary(r));
        } catch (e) {
          toast.error((e as Error).message);
        }
      }}
    />
  );
}
