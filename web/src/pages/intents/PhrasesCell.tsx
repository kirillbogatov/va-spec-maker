import { useRef, useState, type ReactNode } from 'react';
import { ListPlus, Plus, X } from 'lucide-react';
import { DictCard } from '@/components/DictionaryMaster';
import { ResizableColumns } from '@/components/ResizableColumns';
import { SortHeader, useColumnSort } from '@/components/ColumnSort';
import { cn } from '@/lib/utils';
import { KindToggle } from '@/components/KindToggle';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { modeKind, modeShows, type IntentMode } from '@/lib/intentMode';
import { useProjectId } from '@/hooks/project';
import { useNormalize } from '@/lib/normalize';
import { parsePhrases } from '@/lib/parse';
import { findSlotMatches } from '@/lib/stem';
import { findNumberMatches, type NumberSlot } from '@/lib/entityTypes';
import { KeywordChips } from '@/components/KeywordChips';
import { useKeywordMatcher } from '@/lib/keywords';
import { type ValueItem, type ValueKind } from '@/lib/values';

const COLLAPSED = 7;

interface Props {
  title?: string;
  titleHint?: ReactNode;
  mode: IntentMode;
  value: ValueItem[];
  onChange: (value: ValueItem[]) => void;
  /** Значения сущностей интента: в фразах подсвечиваются как слоты. */
  highlight?: string[];
  /** Числовые сущности интента: числа в фразах подсвечиваются как их значения. */
  numbers?: NumberSlot[];
  /** Слово (в нижнем регистре) → название сущности для подсказки при наведении. */
  owners?: ReadonlyMap<string, string>;
}

/** Фраза с подсвеченными слотами: значения сущностей (при включённой нормализации — и в других формах слова) и числа числовых сущностей. Название сущности значением не считается. */
export function Slotted({ text, words, numbers = [], owners }: { text: string; words: string[]; numbers?: NumberSlot[]; owners?: ReadonlyMap<string, string> }) {
  const normalize = useNormalize(useProjectId());
  const slots: { from: number; to: number; title?: string }[] = [
    ...(words.length ? findSlotMatches(text, words, normalize) : []).map(({ from, to, word }) => {
      const owner = owners?.get(word.trim().toLowerCase());
      return { from, to, title: owner ? `Значение сущности (${owner})` : undefined };
    }),
    ...findNumberMatches(text, numbers).map(({ from, to, owner }) => ({ from, to, title: `Значение сущности (${owner})` })),
  ].sort((x, y) => x.from - y.from);
  if (!slots.length) return <>{text}</>;
  const parts: ReactNode[] = [];
  let pos = 0;
  slots.forEach(({ from, to, title }, i) => {
    if (from < pos) return;
    if (from > pos) parts.push(text.slice(pos, from));
    parts.push(<span key={i} title={title} className="rounded-[3px] bg-ent-bg px-0.5 text-ent">{text.slice(from, to)}</span>);
    pos = to;
  });
  if (pos < text.length) parts.push(text.slice(pos));
  return <>{parts}</>;
}

/** Ввод новой строки сверху, ключевые слова остаются вычисляемыми из фразы. */
export function PhrasesCell({ title, titleHint, value, onChange, mode, highlight = [], numbers = [], owners }: Props) {
  const [text, setText] = useState('');
  const [adding, setAdding] = useState(!title);
  const input = useRef<HTMLInputElement>(null);
  const [pickedKind, setAddKind] = useState<ValueKind>('phrase');
  const both = mode === 'both';
  const addKind = both ? pickedKind : modeKind(mode);
  const matchKw = useKeywordMatcher(useProjectId());
  const kw = mode === 'keywords';
  const sort = useColumnSort();
  const words = [...new Set(highlight.map((w) => w.trim()).filter((w) => w.length > 1))].sort((a, b) => b.length - a.length);
  const add = (raw: string) => {
    const items = parsePhrases(raw).map((t): ValueItem => ({ text: t, kind: addKind }));
    if (items.length) onChange(title ? [...items, ...value] : [...value, ...items]);
    setText('');
    if (title) setAdding(false);
  };
  const [all, setAll] = useState(false);
  const visible = value.flatMap((v, index) => modeShows(mode, v.kind) ? [{ v, index }] : []);
  const sorted = title ? sort.rows(visible, ({ v }, column) => column === 'keywords' ? matchKw(v.text).join(', ') : v.text) : visible;
  const shown = all ? sorted : sorted.slice(0, COLLAPSED);
  const [bulk, setBulk] = useState(false);
  const [bulkText, setBulkText] = useState('');
  const bulkCount = parsePhrases(bulkText).length;
  const closeBulk = () => { setBulk(false); setBulkText(''); };
  const cols = cn('grid grid-cols-[minmax(0,1fr)_32px] items-center gap-x-3 px-4', kw && 'grid-cols-[minmax(0,1fr)_minmax(0,1fr)_32px] md:[grid-template-columns:var(--resizable-columns)]');
  const content = (
    <div className={cn(title ? 'overflow-hidden rounded-xl border bg-card' : 'space-y-2', title && !adding && !bulk && !shown.length && 'border-0 bg-transparent')}>
      {title && (shown.length > 0 || adding || bulk) && <div className={cn(cols, 'border-b py-1 text-xs font-medium text-muted-foreground')}>
        <SortHeader column="text" sort={sort}>{kw ? 'Фраза' : title}</SortHeader>
        {kw && <SortHeader column="keywords" sort={sort}>Ключевые слова</SortHeader>}<span />
      </div>}
      {bulk ? (
        <div className="grid gap-2 p-2">
          <Textarea autoFocus rows={6} aria-label="Значения списком" className="font-mono text-[13px]" value={bulkText} onChange={(e) => setBulkText(e.target.value)} />
          <div className="flex flex-wrap items-center justify-between gap-2">
            {both ? <KindToggle kind={addKind} onChange={setAddKind} /> : <span />}
            <div className="flex gap-2"><Button variant="outline" onClick={closeBulk}>Отмена</Button>
              <Button disabled={!bulkCount} onClick={() => { add(bulkText); closeBulk(); }}>Добавить{bulkCount ? ` · ${bulkCount}` : ''}</Button></div>
          </div>
        </div>
      ) : adding && (
        <div className={cn(cols, title && shown.length > 0 && 'border-b')}
          onBlur={title ? (e) => { if (!e.currentTarget.contains(e.relatedTarget)) add(text); } : undefined}>
          <div className="flex min-w-0 items-center">
            {both && <KindToggle kind={addKind} onChange={setAddKind} />}
            <Input ref={input} autoFocus={!!title} className="h-10 min-w-0 flex-1 rounded-none border-0 bg-transparent shadow-none focus-visible:ring-0 md:h-9 dark:bg-transparent"
              aria-label={addKind === 'phrase' ? 'Добавить тренировочную фразу' : 'Добавить паттерн'} value={text} onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') { e.preventDefault(); add(text); }
                if (title && e.key === 'Escape') { e.preventDefault(); setText(''); setAdding(false); }
              }} onPaste={(e) => { const pasted = e.clipboardData.getData('text'); if (/\r?\n/.test(pasted)) { e.preventDefault(); add(pasted); } }} />
          </div>
          {kw && <div aria-label="Ключевые слова новой фразы" className="min-w-0 py-2"><KeywordChips names={matchKw(text)} text={text} /></div>}
          {title ? <Button variant="ghost" size="icon" aria-label="Отменить добавление" onMouseDown={(e) => e.preventDefault()}
            onClick={() => { setText(''); setAdding(false); }}><X className="size-3.5" /></Button>
            : <Button size="action" variant="outline" onClick={() => setBulk(true)}><ListPlus className="size-4" /> Добавить несколько</Button>}
        </div>
      )}
      {title && !adding && !bulk && !shown.length && <p className="text-sm text-muted-foreground">Значений пока нет.</p>}
      {shown.length > 0 && <ul className={cn('divide-y divide-border', !title && 'rounded-md border')}>
        {shown.map(({ v, index }) => <li key={index} className={cn(cols, 'group min-h-11 py-2 md:min-h-10')}>
          <span className="flex min-w-0 items-center gap-2 font-mono text-[13px]">
            {both && <KindToggle kind={v.kind} onChange={(kind) => onChange(value.map((x, j) => j === index ? { ...x, kind } : x))} />}
            <span className="min-w-0 break-words">{v.kind === 'phrase' ? <Slotted text={v.text} words={words} numbers={numbers} owners={owners} /> : v.text}</span>
          </span>
          {kw && <span className="min-w-0"><KeywordChips names={matchKw(v.text)} text={v.text} /></span>}
          <Button variant="ghost" size="icon" aria-label="Удалить" className="text-muted-foreground opacity-0 hover:text-destructive group-hover:opacity-100 group-focus-within:opacity-100 pointer-coarse:opacity-100"
            onClick={() => onChange(value.filter((_, j) => j !== index))}><X className="size-3.5" /></Button>
        </li>)}
      </ul>}
      {visible.length > COLLAPSED && <button type="button" className="inline-flex min-h-8 items-center px-2 text-[13px] text-brand hover:underline" onClick={() => setAll(!all)}>
        {all ? 'Свернуть' : `Показать все (${visible.length})`}</button>}
    </div>
  );
  return title ? <DictCard title={title} hint={titleHint} action={<>
    <Button size="action" variant="outline" onMouseDown={(e) => e.preventDefault()} onClick={() => { if (text.trim()) add(text); setAdding(true); input.current?.focus(); }}><Plus className="size-3.5" /> Добавить</Button>
    <Button size="action" variant="outline" onClick={() => setBulk(true)}><ListPlus className="size-4" /> Добавить несколько</Button>
  </>}>
    <ResizableColumns storageKey="dictionary-intent-values" columns={kw ? ['text', 'keywords'] : ['text']}
      initial={kw ? 'minmax(0,1fr) minmax(0,1fr) 32px' : 'minmax(0,1fr) 32px'} trailing="32px">{content}</ResizableColumns>
  </DictCard> : content;
}
