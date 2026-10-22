import { useState, type ReactNode } from 'react';
import { X } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { useProjectId } from '@/hooks/project';
import { useNormalize } from '@/lib/normalize';
import { parsePhrases } from '@/lib/parse';
import { findSlotMatches } from '@/lib/stem';
import { cn, GHOST } from '@/lib/utils';

const COLLAPSED = 5;

interface Props {
  value: string[];
  onChange: (value: string[]) => void;
  /** Значения сущностей интента: в фразах подсвечиваются как слоты. */
  highlight?: string[];
  /** Слово (в нижнем регистре) → название сущности для подсказки при наведении. */
  owners?: ReadonlyMap<string, string>;
}

/** Фраза с подсвеченными слотами значений сущностей (при включённой нормализации — и в других формах слова). */
export function Slotted({ text, words, owners }: { text: string; words: string[]; owners?: ReadonlyMap<string, string> }) {
  const normalize = useNormalize(useProjectId());
  const slots = words.length ? findSlotMatches(text, words, normalize) : [];
  if (!slots.length) return <>{text}</>;
  const parts: ReactNode[] = [];
  let pos = 0;
  slots.forEach(({ from, to, word }, i) => {
    if (from > pos) parts.push(text.slice(pos, from));
    parts.push(<span key={i} title={owners?.has(word.trim().toLowerCase()) ? `Значение сущности (${owners.get(word.trim().toLowerCase())})` : undefined} className="rounded-[3px] bg-ent-bg px-0.5 text-ent">{text.slice(from, to)}</span>);
    pos = to;
  });
  if (pos < text.length) parts.push(text.slice(pos));
  return <>{parts}</>;
}

/** Тренировочные фразы вариации: поле добавления (Enter / вставка нескольких строк) и список, свёрнутый после 5 строк. */
export function PhrasesCell({ value, onChange, highlight = [], owners }: Props) {
  const [text, setText] = useState('');
  const [all, setAll] = useState(false);
  const add = (raw: string) => {
    const items = parsePhrases(raw);
    if (items.length) onChange([...value, ...items]);
    setText('');
  };
  const words = [...new Set(highlight.map((w) => w.trim()).filter((w) => w.length > 1))].sort((a, b) => b.length - a.length);
  const shown = all ? value : value.slice(0, COLLAPSED);

  return (
    <div className="space-y-2">
      <Input
        className={cn(GHOST, 'h-10 border-input md:h-9')}
        aria-label="Добавить тренировочную фразу"
        placeholder="+ фраза или паттерн"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            add(text);
          }
        }}
        onPaste={(e) => {
          const pasted = e.clipboardData.getData('text');
          if (/\r?\n/.test(pasted)) {
            e.preventDefault();
            add(pasted);
          }
        }}
      />
      {shown.length > 0 && (
      <ul className="divide-y divide-border rounded-md border">
        {shown.map((p, i) => (
          <li key={i} className="group flex min-h-10 items-center gap-2 px-3 py-1.5 hover:bg-muted md:min-h-9">
            <span className="min-w-0 flex-1 break-words font-mono text-[13px] leading-5"><Slotted text={p} words={words} owners={owners} /></span>
            <button
              type="button"
              aria-label="Удалить фразу"
              className="inline-flex size-8 shrink-0 items-center justify-center rounded text-muted-foreground opacity-0 hover:text-destructive focus-visible:opacity-100 group-hover:opacity-100 pointer-coarse:opacity-100"
              onClick={() => onChange(value.filter((_, j) => j !== i))}
            >
              <X className="size-3.5" />
            </button>
          </li>
        ))}
      </ul>
      )}
      {value.length > COLLAPSED && (
        <button type="button" className="inline-flex min-h-8 items-center px-2 text-[13px] text-brand hover:underline" onClick={() => setAll(!all)}>
          {all ? 'Свернуть' : `Показать все (${value.length})`}
        </button>
      )}
    </div>
  );
}
