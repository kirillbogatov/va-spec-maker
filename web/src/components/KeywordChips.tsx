import { useEffect, useRef, useState } from 'react';
import { Info } from 'lucide-react';
import { TypeToken } from '@/components/TypeToken';

export const KEYWORDS_HINT = 'Начните вводить фразу на естественном языке — система сама разберёт её на ключевые слова';

/** Иконка-подсказка рядом с заголовком блока «Ключевые слова»: появляется при наведении, фокусе и по клику (для сенсорных экранов). */
export function KeywordsHint() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: Event) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', close);
    return () => document.removeEventListener('pointerdown', close);
  }, [open]);
  return (
    <span ref={ref} className="relative inline-flex align-middle" onMouseEnter={() => setOpen(true)} onMouseLeave={() => setOpen(false)}>
      <button
        type="button"
        aria-label={KEYWORDS_HINT}
        aria-expanded={open}
        className="inline-flex text-muted-foreground hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring"
        onClick={() => setOpen(true)}
        onKeyDown={(e) => e.key === 'Escape' && setOpen(false)}
        onBlur={() => setOpen(false)}
      >
        <Info className="size-3.5" />
      </button>
      {open && (
        <span role="tooltip" className="absolute top-full left-0 z-50 mt-1.5 w-64 rounded-md border bg-popover px-3 py-2 text-xs font-normal leading-snug text-popover-foreground shadow-md">
          {KEYWORDS_HINT}
        </span>
      )}
    </span>
  );
}

/** Ключевые слова фразы чипами через запятую; пустое поле — заглушка, фраза без совпадений — пометка «не распознаны». */
export function KeywordChips({ names, text }: { names: string[]; text: string }) {
  if (!names.length) {
    return <span className="text-sm text-muted-foreground">{text.trim() ? 'Ключевые слова не распознаны' : 'Ключевые слова (появятся автоматически)'}</span>;
  }
  return (
    <span className="flex flex-wrap items-center gap-x-1 gap-y-1">
      {names.map((n, i) => (
        <span key={n} className="inline-flex items-center">
          <TypeToken kind="keyword">{n}</TypeToken>
          {i < names.length - 1 && <span className="text-muted-foreground">,</span>}
        </span>
      ))}
    </span>
  );
}
