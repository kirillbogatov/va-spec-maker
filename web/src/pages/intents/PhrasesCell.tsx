import { useState, type ReactNode } from 'react';
import { ListPlus, X } from 'lucide-react';
import { KindToggle } from '@/components/KindToggle';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { modeKind, modeShows, type IntentMode } from '@/lib/intentMode';
import { useProjectId } from '@/hooks/project';
import { useNormalize } from '@/lib/normalize';
import { parsePhrases } from '@/lib/parse';
import { findSlotMatches } from '@/lib/stem';
import { type ValueItem, type ValueKind } from '@/lib/values';
import { cn, GHOST } from '@/lib/utils';

const COLLAPSED = 7;

interface Props {
  mode: IntentMode;
  value: ValueItem[];
  onChange: (value: ValueItem[]) => void;
  /** Значения сущностей интента: в фразах подсвечиваются как слоты. */
  highlight?: string[];
  /** Названия сущностей интента: в паттернах подсвечиваются. */
  entityNames?: string[];
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

const WORD_CHAR = String.raw`[\p{L}\d_]`;

/** Паттерн с подсвеченными названиями сущностей интента (целые слова без учёта регистра, скобки и звёздочки вокруг допустимы). */
export function PatternText({ text, names }: { text: string; names: string[] }) {
  if (!names.length) return <>{text}</>;
  const escaped = [...names].sort((a, b) => b.length - a.length).map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  const re = new RegExp(`(?<!${WORD_CHAR})(?:${escaped.join('|')})(?!${WORD_CHAR})`, 'giu');
  const parts: ReactNode[] = [];
  let pos = 0;
  for (const m of text.matchAll(re)) {
    if (m.index > pos) parts.push(text.slice(pos, m.index));
    parts.push(<span key={m.index} title="Название сущности" className="rounded-[3px] bg-ent-bg px-0.5 text-ent">{m[0]}</span>);
    pos = m.index + m[0].length;
  }
  if (!parts.length) return <>{text}</>;
  if (pos < text.length) parts.push(text.slice(pos));
  return <>{parts}</>;
}

/** Значения интента (тренировочные фразы и паттерны): поле добавления (Enter / вставка нескольких строк) со значком типа и список, свёрнутый после 7 строк. */
export function PhrasesCell({ value, onChange, mode, highlight = [], entityNames = [], owners }: Props) {
  const [text, setText] = useState('');
  // Тип новых значений, добавляемых полем или списком; в режиме «оба» выбирается значком
  const [pickedKind, setAddKind] = useState<ValueKind>('phrase');
  const both = mode === 'both';
  const addKind = both ? pickedKind : modeKind(mode);
  const add = (raw: string) => {
    const items = parsePhrases(raw).map((t): ValueItem => ({ text: t, kind: addKind }));
    if (items.length) onChange([...value, ...items]);
    setText('');
  };
  const words = [...new Set(highlight.map((w) => w.trim()).filter((w) => w.length > 1))].sort((a, b) => b.length - a.length);
  const [all, setAll] = useState(false);
  // Скрытые режимом значения остаются в данных, но не показываются; индексы — по полному списку
  const visible = value.flatMap((v, index) => (modeShows(mode, v.kind) ? [{ v, index }] : []));
  const shown = all ? visible : visible.slice(0, COLLAPSED);
  const [bulk, setBulk] = useState(false);
  const [bulkText, setBulkText] = useState('');
  const bulkCount = parsePhrases(bulkText).length;
  const closeBulk = () => {
    setBulk(false);
    setBulkText('');
  };

  return (
    <div className="space-y-2">
      {bulk ? (
        <div className="grid gap-2 rounded-md border p-2">
          <Textarea
            autoFocus
            rows={6}
            className="font-mono text-[13px]"
            aria-label="Значения списком"
            placeholder="По одному значению в строке"
            value={bulkText}
            onChange={(e) => setBulkText(e.target.value)}
          />
          <div className="flex items-center justify-between gap-2">
            {both ? <KindToggle kind={addKind} onChange={setAddKind} /> : <span />}
            <div className="flex gap-2">
              <Button variant="outline" onClick={closeBulk}>Отмена</Button>
              <Button disabled={!bulkCount} onClick={() => { add(bulkText); closeBulk(); }}>Добавить{bulkCount ? ` · ${bulkCount}` : ''}</Button>
            </div>
          </div>
        </div>
      ) : (
        <div className="flex items-center gap-2">
          <div className="flex h-10 min-w-0 flex-1 items-stretch overflow-hidden rounded-md border border-input focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/50 md:h-9">
            {both && (
              <span className="flex w-11 shrink-0 items-center justify-center border-r border-input">
                <KindToggle kind={addKind} bare className="size-6 max-md:size-8" onChange={setAddKind} />
              </span>
            )}
          <Input
            className={cn(GHOST, 'h-full min-w-0 flex-1 rounded-none border-0 shadow-none focus-visible:ring-0')}
            aria-label={addKind === 'phrase' ? 'Добавить тренировочную фразу' : 'Добавить паттерн'}
            placeholder={addKind === 'phrase' ? '+ фраза' : '+ паттерн'}
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
          </div>
          <Button variant="outline" className="h-10 md:h-9" onClick={() => setBulk(true)}>
            <ListPlus className="size-4" /> Добавить несколько
          </Button>
        </div>
      )}
      {shown.length > 0 && (
      <ul className="divide-y divide-border rounded-md border">
        {shown.map(({ v, index }) => (
          <li key={index} className="group flex min-h-11 items-stretch hover:bg-muted md:min-h-10">
            {both && (
              <span className="flex w-11 shrink-0 items-center justify-center border-r">
                <KindToggle
                  kind={v.kind}
                  bare
                  className="size-6 max-md:size-8"
                  onChange={(kind) => onChange(value.map((x, j) => (j === index ? { ...x, kind } : x)))}
                />
              </span>
            )}
            <span className="min-w-0 flex-1 self-center break-words px-3 py-2 font-mono text-[13px] leading-[18px]">
              {v.kind === 'phrase' ? <Slotted text={v.text} words={words} owners={owners} /> : <PatternText text={v.text} names={entityNames} />}
            </span>
            <button
              type="button"
              aria-label="Удалить"
              className="mr-3 inline-flex size-7 shrink-0 items-center justify-center self-center rounded text-muted-foreground opacity-0 hover:text-destructive focus-visible:opacity-100 group-hover:opacity-100 pointer-coarse:opacity-100"
              onClick={() => onChange(value.filter((_, j) => j !== index))}
            >
              <X className="size-3.5" />
            </button>
          </li>
        ))}
      </ul>
      )}
      {visible.length > COLLAPSED && (
        <button type="button" className="inline-flex min-h-8 items-center px-2 text-[13px] text-brand hover:underline" onClick={() => setAll(!all)}>
          {all ? 'Свернуть' : `Показать все (${visible.length})`}
        </button>
      )}
    </div>
  );
}
