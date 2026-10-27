import { Info } from 'lucide-react';
import { TypeToken } from '@/components/TypeToken';
import { keywordLabel } from '@/lib/keywords';

export const KEYWORDS_HINT = 'Начните вводить фразу на естественном языке — система сама разберёт её на ключевые слова';

/** Иконка-подсказка рядом с заголовком блока «Ключевые слова». */
export function KeywordsHint() {
  return (
    <span title={KEYWORDS_HINT} aria-label={KEYWORDS_HINT} tabIndex={0} className="inline-flex cursor-help align-middle text-muted-foreground hover:text-foreground">
      <Info className="size-3.5" />
    </span>
  );
}

/** Ключевые слова фразы чипами через запятую; без совпадений — серая пометка «не распознаны» (для непустой фразы). */
export function KeywordChips({ names, text }: { names: string[]; text: string }) {
  if (!names.length) return text.trim() ? <span className="text-sm text-muted-foreground">Ключевые слова не распознаны</span> : null;
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
