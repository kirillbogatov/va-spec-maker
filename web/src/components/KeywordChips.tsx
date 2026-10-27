import { TypeToken } from '@/components/TypeToken';
import { keywordLabel } from '@/lib/keywords';

/** Ключевые слова фразы чипами через запятую; без совпадений — приглушённая подсказка. */
export function KeywordChips({ names, placeholder }: { names: string[]; placeholder?: string }) {
  if (!names.length) return placeholder ? <span className="text-sm text-muted-foreground">{placeholder}</span> : null;
  return (
    <span className="flex flex-wrap items-center gap-x-1 gap-y-1">
      {names.map((n, i) => (
        <span key={n} className="inline-flex items-center">
          <TypeToken kind="keyword">{keywordLabel(n)}</TypeToken>
          {i < names.length - 1 && <span className="text-muted-foreground">,</span>}
        </span>
      ))}
    </span>
  );
}
