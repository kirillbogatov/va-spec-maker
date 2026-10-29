import { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useMutation, useQueries, useQuery, useQueryClient } from '@tanstack/react-query';
import { ListPlus, Plus, Trash2, X } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { AddBar } from '@/components/AddBar';
import { KindToggle } from '@/components/KindToggle';
import { ADD_ROW, DeleteChoiceDialog, REMOVE_BTN } from '@/components/DeleteChoiceDialog';
import { SearchSelect } from '@/components/SearchSelect';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { SaveNote } from '@/components/SaveIndicator';
import { TypeToken } from '@/components/TypeToken';
import { KeywordChips, KeywordsHint } from '@/components/KeywordChips';
import { useKeywordMatcher } from '@/lib/keywords';
import { Slotted } from './PhrasesCell';
import { CreateDialog } from '@/components/CreateDialog';
import { numberSlots, type EntityKind, type NumberSlot } from '@/lib/entityTypes';
import { usePrefixes } from '@/lib/prefixes';
import { useProjectId } from '@/hooks/project';
import { useAutosave } from '@/hooks/useAutosave';
import { api } from '@/lib/api';
import { useNormalize } from '@/lib/normalize';
import { parsePhrases } from '@/lib/parse';
import { MODE_EMPTY, MODE_TITLE, modeKind, modeShows, useIntentMode, type IntentMode } from '@/lib/intentMode';
import { valuesPatch, type ValueItem, type ValueKind } from '@/lib/values';
import { phraseKey } from '@/lib/stem';
import { cn, uniqueName } from '@/lib/utils';
import type { EntityListItem, Intent, IntentEntity, IntentListItem } from '@/lib/types';

const toPayload = (d: Intent): Omit<Intent, 'id' | 'project_id'> => {
  const { id: _id, project_id: _pid, ...rest } = d;
  return rest;
};

// Колонки строки на широком экране: интент, фразы, сущности, «Вкл.», стрелка
const COLS = 'xl:grid-cols-[230px_minmax(0,1fr)_260px_56px_96px]';

/** Свёрнутая строка: сущности жетонами обязательные залиты цветом. */
function EntityTokens({ value, entities }: { value: IntentEntity[]; entities: EntityListItem[] }) {
  const name = (id: number) => entities.find((e) => e.id === id)?.name ?? `#${id}`;
  if (!value.length) return <span className="text-sm text-faint">Без сущностей</span>;
  return (
    <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
      {value.map((e) => (
        <TypeToken key={e.entity_id} kind="entity" required={e.required}>
          {name(e.entity_id)}
        </TypeToken>
      ))}
    </span>
  );
}

interface PhraseOwner { name: string; phrases: string[] }

/** Поле значения внутри общей рамки списка: без собственной рамки. */
const PHRASE_BOX = 'h-9 w-full min-w-0 rounded-none border-0 bg-transparent px-2.5 font-mono text-[12.5px] shadow-none focus-visible:ring-0 max-md:h-11 md:text-[12.5px]';


/** Сущности интента таблицей без заголовков: название, описание, обязательность, удаление; ниже выбор следующей. */
function EntitiesEditor({ value, entities, onChange }: { value: IntentEntity[]; entities: EntityListItem[]; onChange: (v: IntentEntity[]) => void }) {
  const find = (id: number) => entities.find((e) => e.id === id);
  const options = entities.filter((e) => !value.some((v) => v.entity_id === e.id)).map((e) => ({ value: String(e.id), label: e.name, hint: e.description }));
  const projectId = useProjectId();
  const prefixes = usePrefixes(projectId);
  const qc = useQueryClient();
  const [creating, setCreating] = useState(false);
  // Созданная сущность сразу добавляется в интент
  const create = useMutation({
    mutationFn: ({ name, kind }: { name: string; kind?: EntityKind }) => api.entities.create(projectId, name, kind),
    onSuccess: (c) => {
      qc.invalidateQueries({ queryKey: ['entities'] });
      onChange([...value, { entity_id: c.id, required: false }]);
    },
    onError: (e: Error) => toast.error(e.message),
  });
  return (
    <div className="grid content-start gap-1.5">
      {value.length > 0 && (
        <table className="w-full border-collapse">
          <tbody className="divide-y">
            {value.map((e) => {
              const ent = find(e.entity_id);
              return (
                <tr key={e.entity_id} className="h-10">
                  <td className="whitespace-nowrap py-1 pr-3 pl-0 align-middle"><TypeToken kind="entity" required={e.required}>{ent?.name ?? `#${e.entity_id}`}</TypeToken></td>
                  <td className="w-full max-w-0 truncate py-1 pr-3 align-middle text-xs text-muted-foreground" title={ent?.description}>{ent?.description?.trim() || '—'}</td>
                  <td className="py-1 pr-1 align-middle">
                    <label className="flex w-36 cursor-pointer items-center gap-2 text-xs font-medium max-md:min-h-10">
                      <Switch
                        checked={e.required}
                        onCheckedChange={(required) => onChange(value.map((v) => (v === e ? { ...v, required } : v)))}
                        aria-label={`${ent?.name ?? e.entity_id}: обязательность`}
                      />
                      <span className="text-muted-foreground">{e.required ? 'обязательная' : 'необязательная'}</span>
                    </label>
                  </td>
                  <td className="py-1 pr-1 align-middle">
                    <button type="button" aria-label={`Убрать ${ent?.name ?? e.entity_id}`} className={REMOVE_BTN} onClick={() => onChange(value.filter((v) => v !== e))}>
                      <X className="size-3.5" />
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
      <SearchSelect
        options={options}
        value={null}
        onChange={(v) => v != null && onChange([...value, { entity_id: Number(v), required: false }])}
        label="Добавить сущность"
        className={cn(ADD_ROW, 'justify-start gap-2 px-2.5')}
        icon={<Plus className="size-3.5 shrink-0" />}
        placeholder="сущность"
        createLabel="Новая сущность…"
        onCreate={() => setCreating(true)}
      />
      <CreateDialog
        open={creating}
        onOpenChange={setCreating}
        title="Новая сущность"
        prefix={prefixes.entity}
        existingNames={entities.map((e) => e.name)}
        withType
        onCreate={(name, kind) => create.mutate({ name, kind })}
      />
    </div>
  );
}

/** Значения интента (тренировочные фразы и паттерны) редактируемыми строками со значком типа, поле добавления и массовое добавление списком. */
function PhrasesEditor({ value, others, words, numbers, mode, onChange }: { value: ValueItem[]; others: PhraseOwner[]; words: string[]; numbers: NumberSlot[]; mode: IntentMode; onChange: (v: ValueItem[]) => void }) {
  const [text, setText] = useState('');
  const matchKw = useKeywordMatcher(useProjectId());
  const kw = mode === 'keywords';
  // Тип новых значений, добавляемых полем или списком; в режиме «оба» выбирается значком
  const [pickedKind, setAddKind] = useState<ValueKind>('phrase');
  const both = mode === 'both';
  const addKind = both ? pickedKind : modeKind(mode);
  // Скрытые режимом значения остаются в данных, но не показываются; индексы — по полному списку
  const visible = value.flatMap((v, i) => (modeShows(mode, v.kind) ? [{ v, i }] : []));
  // Редактируемая фраза показывается полем, остальные — с подсвеченными значениями сущностей
  const [editing, setEditing] = useState<number | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const prevCount = useRef(value.length);
  useEffect(() => {
    if (value.length > prevCount.current) listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
    prevCount.current = value.length;
  }, [value.length]);
  const [error, setError] = useState('');
  const [bulk, setBulk] = useState(false);
  const [bulkText, setBulkText] = useState('');
  const bulkCount = parsePhrases(bulkText).length;
  // Где значение уже встречается: выше в этом же списке или (для фраз) в соседнем интенте сценария
  const normalize = useNormalize(useProjectId());
  const conflict = (v: ValueItem, before: ValueItem[]) => {
    const k = phraseKey(v.text, normalize);
    if (before.some((x) => x.kind === v.kind && phraseKey(x.text, normalize) === k)) return 'повторяется в этом интенте';
    if (v.kind === 'pattern') return '';
    const o = others.find((x) => x.phrases.some((y) => phraseKey(y, normalize) === k));
    return o ? `уже есть в интенте ${o.name}` : '';
  };
  const add = (raw: string) => {
    const accepted: ValueItem[] = [];
    const skipped: string[] = [];
    for (const t of parsePhrases(raw)) {
      const item: ValueItem = { text: t, kind: addKind };
      const c = conflict(item, [...value, ...accepted]);
      if (c) skipped.push(`«${t}» — ${c}`);
      else accepted.push(item);
    }
    if (accepted.length) onChange([...value, ...accepted]);
    setError(skipped.length ? `Не добавлено (дубликаты в сценарии): ${skipped.join('; ')}` : '');
    setText('');
  };
  const closeBulk = () => {
    setBulk(false);
    setBulkText('');
  };
  return (
    <div className="flex shrink-0 flex-col gap-1.5">
      <div ref={listRef} className={cn('max-h-72 divide-y divide-input overflow-y-auto rounded-md bg-background', visible.length > 0 && 'border border-input')}>
      {visible.map(({ v, i }, n) => {
        const dup = conflict(v, value.slice(0, i));
        const label = `${v.kind === 'phrase' ? 'Фраза' : 'Паттерн'} ${n + 1}`;
        return (
        <div key={i} className={cn('group flex items-stretch focus-within:bg-muted/50', dup && 'bg-destructive/10')}>
            {both && (
              <span className="grid w-9 shrink-0 place-items-center border-r border-input max-md:w-11">
                <KindToggle kind={v.kind} bare className="size-6 max-md:size-8" onChange={(kind) => onChange(value.map((x, j) => (j === i ? { ...x, kind } : x)))} />
              </span>
            )}
          {v.kind === 'phrase' && (words.length > 0 || numbers.length > 0) && editing !== i && v.text.trim() ? (
            <div
              role="textbox"
              tabIndex={0}
              aria-label={label}
              title={dup ? `Дубликат: ${dup}` : undefined}
              className={cn(PHRASE_BOX, 'flex cursor-text items-center')}
              onFocus={() => setEditing(i)}
            >
              <span className="truncate"><Slotted text={v.text} words={words} numbers={numbers} /></span>
            </div>
          ) : (
            <Input
              autoFocus={editing === i}
              className={PHRASE_BOX}
              aria-label={label}
              aria-invalid={!!dup}
              title={dup ? `Дубликат: ${dup}` : undefined}
              value={v.text}
              onChange={(e) => onChange(value.map((x, j) => (j === i ? { ...x, text: e.target.value } : x)))}
              onBlur={() => {
                setEditing((cur) => (cur === i ? null : cur));
                if (!v.text.trim()) onChange(value.filter((_, j) => j !== i));
              }}
            />
          )}
          {kw && (
            <span className="hidden w-[38%] shrink-0 items-center border-l border-input px-2 md:flex">
              <KeywordChips names={matchKw(v.text)} text={v.text} />
            </span>
          )}
          <button type="button" aria-label="Удалить значение" className={cn(REMOVE_BTN, 'my-auto mr-1 size-7 max-md:size-9')} onClick={() => onChange(value.filter((_, j) => j !== i))}>
            <X className="size-3.5" />
          </button>
        </div>
        );
      })}
      </div>
      {error && <p role="alert" className="shrink-0 text-xs text-destructive">{error}</p>}
      {bulk ? (
        <div className="grid shrink-0 gap-1.5 rounded-md border border-dashed p-2">
          <Textarea
            autoFocus
            rows={5}
            className="rounded-md bg-background font-mono text-[12.5px] md:text-[12.5px]"
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
        <div className="flex shrink-0 items-center gap-1.5">
          <div className="flex min-w-0 flex-1 items-stretch overflow-hidden rounded-md border border-dashed border-input focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/50">
            {both && (
              <span className="grid w-9 shrink-0 place-items-center border-r border-dashed max-md:w-11">
                <KindToggle kind={addKind} bare className="size-6 max-md:size-8" onChange={setAddKind} />
              </span>
            )}
          <div className="relative min-w-0 flex-1">
            <Plus className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              className={cn(ADD_ROW, 'rounded-none border-0 pl-8 font-mono text-[12.5px] shadow-none focus-visible:ring-0 placeholder:font-sans placeholder:text-sm md:text-[12.5px]')}
              aria-label={addKind === 'phrase' ? 'Добавить тренировочную фразу' : 'Добавить паттерн'}
              placeholder={addKind === 'phrase' ? 'фраза' : 'паттерн'}
              value={text}
              onChange={(e) => { setText(e.target.value); setError(''); }}
              onBlur={() => text.trim() && add(text)}
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
          </div>
          {kw && (
            <div aria-label="Ключевые слова новой фразы" className="hidden h-8 w-[38%] shrink-0 items-center rounded-md border border-dashed bg-muted/40 px-2 md:flex">
              <KeywordChips names={matchKw(text)} text={text} />
            </div>
          )}
          <Button variant="outline" className="h-8 max-md:h-10" onClick={() => setBulk(true)}>
            <ListPlus className="size-4" /> Добавить несколько
          </Button>
        </div>
      )}
    </div>
  );
}

/** Интент: компактная строка ~48px, клик раскрывает редактор (название, комментарий, фразы, сущности, удаление). */
function IntentRow({ intent, link, siblings, defaultOpen, focusName, onToggleGlobal, onDisconnect, onRemove }: {
  intent: Intent; link: IntentListItem; siblings: PhraseOwner[]; defaultOpen: boolean; focusName: boolean; onToggleGlobal: (v: boolean) => void; onDisconnect: () => void; onRemove: () => void;
}) {
  const projectId = useProjectId();
  const mode = useIntentMode(projectId);
  const qc = useQueryClient();
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [draft, setDraft] = useState<Intent>(intent);
  const [params] = useSearchParams();
  const target = params.get('open') === String(intent.id);
  const [open, setOpen] = useState(target || defaultOpen);
  const ref = useRef<HTMLDivElement>(null);
  const { data: entities = [] } = useQuery({ queryKey: ['entities', projectId], queryFn: () => api.entities.list(projectId) });

  useEffect(() => {
    if (target) ref.current?.scrollIntoView({ block: 'center' });
  }, [target]);

  const status = useAutosave(draft, async (d) => {
    if (!d.name.trim()) return;
    await api.intents.save(intent.id, toPayload(d));
    qc.invalidateQueries({ queryKey: ['intents'] });
    qc.invalidateQueries({ queryKey: ['entities'] });
  });
  const patch = (p: Partial<Intent>) => setDraft((d) => ({ ...d, ...p }));
  // Значения сущностей интента и их синонимы: в фразах подсвечиваются как слоты
  const slotWords = useMemo(() => {
    const words = draft.entities.flatMap((ie) => entities.find((e) => e.id === ie.entity_id)?.values.flatMap((v) => [v.value, ...v.synonyms]) ?? []);
    return [...new Set(words.map((w) => w.trim()).filter((w) => w.length > 1))].sort((a, b) => b.length - a.length);
  }, [draft.entities, entities]);
  const numbers = useMemo(() => numberSlots(draft.entities.flatMap((ie) => entities.find((e) => e.id === ie.entity_id) ?? [])), [draft.entities, entities]);
  const shownValues = draft.values.filter((v) => modeShows(mode, v.kind));
  const shown = shownValues.slice(0, 2).map((v) => v.text).join(' · ');
  const more = shownValues.length - 2;

  return (
    <div ref={ref} className={cn('border-t first:border-t-0', target && 'bg-accent/50')}>
      <div
        className={cn('grid min-h-12 cursor-pointer grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 px-4 py-2 hover:bg-muted/60', COLS)}
        onClick={(e) => {
          if (!(e.target as HTMLElement).closest('button,input,[role=switch],label')) setOpen(true);
        }}
      >
        <span className={cn('col-start-1 row-start-1 min-w-0 justify-self-start xl:col-start-1', !draft.enabled && 'opacity-60')}>
          <TypeToken kind="intent" className="text-[12.5px]">{draft.name}</TypeToken>
          {link.scenarios.length > 1 && <span className="mt-0.5 block text-xs text-faint">также в: {link.scenarios.map((s) => s.name).join(', ')}</span>}
        </span>
        <span className={cn('col-span-2 row-start-2 flex min-w-0 font-mono text-[12.5px] text-muted-foreground xl:col-span-1 xl:col-start-2 xl:row-start-1', !draft.enabled && 'opacity-60')}>
          {shownValues.length === 0 ? (
            <span className="font-sans text-sm text-warning">{MODE_EMPTY[mode][0].toUpperCase() + MODE_EMPTY[mode].slice(1)}</span>
          ) : (
            <>
              <span className="truncate">{shown}</span>
              {more > 0 && <span className="shrink-0 whitespace-pre font-sans text-faint"> · ещё {more}</span>}
            </>
          )}
        </span>
        <span className={cn('col-span-2 row-start-3 min-w-0 xl:col-span-1 xl:col-start-3 xl:row-start-1', !draft.enabled && 'opacity-60')}>
          <EntityTokens value={draft.entities} entities={entities} />
        </span>
        <span className="col-start-2 row-start-1 flex items-center gap-3 xl:contents">
          <span className="flex items-center xl:col-start-4">
            <Switch checked={draft.enabled} onCheckedChange={(enabled) => patch({ enabled })} aria-label={`Интент ${draft.name} включён`} />
          </span>
          <span className="flex items-center xl:col-start-5">
            <Switch checked={!!link.is_global} onCheckedChange={onToggleGlobal} aria-label={`Интент ${draft.name} глобальный`} />
          </span>
        </span>
      </div>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className={cn('max-h-[90dvh] flex flex-col gap-0 overflow-hidden p-5 sm:max-w-xl', mode === 'keywords' && 'sm:max-w-2xl')}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
            e.preventDefault();
            (document.activeElement as HTMLElement | null)?.blur();
            setOpen(false);
          }
        }}
      >
          <DialogHeader className="shrink-0 pb-4 pr-8">
            <DialogTitle className="font-mono text-[15px]">Интент {draft.name.trim() || 'без названия'}</DialogTitle>
          </DialogHeader>
          <div className="-mx-1 flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-1">
            <label className="grid shrink-0 gap-1 text-xs text-muted-foreground">
              Название
              <Input autoFocus={focusName} onFocus={(e) => focusName && e.target.select()} className="h-8 rounded-md bg-background font-mono text-[12.5px] max-md:h-10 md:text-[12.5px]" aria-label="Название интента" value={draft.name} onChange={(e) => patch({ name: e.target.value })} />
            </label>
            <label className="grid shrink-0 gap-1 text-xs text-muted-foreground">
              Комментарий
              <Textarea rows={1} className="min-h-10 rounded-md bg-background text-sm md:text-sm" aria-label="Комментарий" value={draft.comment} onChange={(e) => patch({ comment: e.target.value })} />
            </label>
            <div className="flex shrink-0 flex-col gap-1 border-t border-dashed border-border/60 pt-4">
              <span className="flex shrink-0 items-center gap-1.5 text-xs text-muted-foreground">
                {MODE_TITLE[mode]}
                {mode === 'keywords' && <KeywordsHint />}
              </span>
              <PhrasesEditor
                value={draft.values}
                others={siblings}
                words={slotWords}
                numbers={numbers}
                mode={mode}
                onChange={(items) => patch(valuesPatch(items))}
              />
            </div>
            <div className="grid shrink-0 content-start gap-1 border-t border-dashed border-border/60 pt-4">
              <span className="text-xs text-muted-foreground">Сущности</span>
              <EntitiesEditor value={draft.entities} entities={entities} onChange={(e) => patch({ entities: e })} />
            </div>
          </div>
          <DialogFooter className="shrink-0 -mx-5 -mb-5 mt-4 px-5 sm:items-center sm:justify-between">
            <SaveNote state={status} />
            <div className="flex flex-wrap items-center gap-2">
              <Button variant="outline" className="text-destructive hover:text-destructive" onClick={() => setConfirmRemove(true)}>
                <Trash2 className="size-4" /> Удалить
              </Button>
              <Button onClick={() => setOpen(false)}>Готово</Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <DeleteChoiceDialog
        open={confirmRemove}
        onOpenChange={setConfirmRemove}
        noun="интент"
        name={draft.name}
        scenarios={link.scenarios}
        removeNote="Глобальные переходы с интентом тоже будут удалены."
        onDisconnect={() => { setOpen(false); onDisconnect(); }}
        onRemove={() => { setOpen(false); onRemove(); }}
      />
    </div>
  );
}

function IntentRowLoader({ link, siblings, defaultOpen, focusName, onToggleGlobal, onDisconnect, onRemove }: {
  link: IntentListItem; siblings: PhraseOwner[]; defaultOpen: boolean; focusName: boolean; onToggleGlobal: (v: boolean) => void; onDisconnect: () => void; onRemove: () => void;
}) {
  // gcTime: 0 — строки инициализируются из ответа один раз, кэш не должен подсовывать устаревшие данные
  const { data } = useQuery({ queryKey: ['intent', link.id], queryFn: () => api.intents.get(link.id), gcTime: 0 });
  if (!data) return <div className="min-h-12 border-t first:border-t-0" />;
  return <IntentRow intent={data} link={link} siblings={siblings} defaultOpen={defaultOpen} focusName={focusName} onToggleGlobal={onToggleGlobal} onDisconnect={onDisconnect} onRemove={onRemove} />;
}

export function IntentsTable({ scenarioId }: { scenarioId: number }) {
  const mode = useIntentMode(useProjectId());
  const projectId = useProjectId();
  const qc = useQueryClient();
  const [created, setCreated] = useState<number | null>(null);
  // Только что созданный интент: его название редактируется сразу
  const [fresh, setFresh] = useState<number | null>(null);
  const { data: items = [], isSuccess } = useQuery({ queryKey: ['intents', 'scenario', scenarioId], queryFn: () => api.intents.listByScenario(scenarioId) });
  // Название интента уникально в рамках всего проекта, а не только сценария
  const { data: all = [] } = useQuery({ queryKey: ['intents', projectId], queryFn: () => api.intents.list(projectId) });

  // Фразы всех интентов сценария для проверки дубликатов; ключ под ['intents'] — сбрасывается после автосохранения
  const phraseQueries = useQueries({
    queries: items.map((i) => ({ queryKey: ['intents', 'phrases', i.id], queryFn: () => api.intents.get(i.id) })),
  });
  const owners = items.flatMap((i, n) => {
    const d = phraseQueries[n]?.data;
    return d ? [{ id: i.id, name: d.name, phrases: d.phrases }] : [];
  });

  const refresh = () => qc.invalidateQueries({ queryKey: ['intents'] });
  const onError = (e: Error) => toast.error(e.message);
  const create = useMutation({
    mutationFn: (n: string) => api.intents.create(scenarioId, n),
    onSuccess: (c) => { setCreated(c.id); setFresh(c.id); refresh(); },
    onError,
  });
  const connect = useMutation({
    mutationFn: (v: { id: number; is_global?: boolean }) => api.intents.connect(scenarioId, v.id, v.is_global),
    onSuccess: (_d, v) => { if (v.is_global === undefined) setCreated(v.id); refresh(); },
    onError: (e: Error) => { toast.error(e.message); refresh(); },
  });
  const disconnect = useMutation({ mutationFn: (id: number) => api.intents.disconnect(scenarioId, id), onSuccess: refresh, onError });
  const remove = useMutation({ mutationFn: (id: number) => api.intents.remove(id), onSuccess: () => { refresh(); qc.invalidateQueries({ queryKey: ['scenario'] }); }, onError });
  const free = all.filter((i) => !items.some((x) => x.id === i.id)).map((i) => ({ value: String(i.id), label: i.name, hint: i.hint }));

  return (
    <div className="grid gap-4">
      <AddBar
        createLabel="Интент"
        onCreate={() => create.mutate(uniqueName('Новый интент', all.map((i) => i.name)))}
        creating={create.isPending}
        options={free}
        onConnect={(id) => connect.mutate({ id })}
        connectLabel="Подключить существующий интент"
      />
      <section className="overflow-hidden rounded-xl border bg-card" aria-label="Интенты сценария">
        <div className={cn('hidden gap-x-3 px-4 py-2 text-xs font-medium text-muted-foreground xl:grid', COLS)}>
          <span>Интент</span>
          <span>{MODE_TITLE[mode]}</span>
          <span>Сущности</span>
          <span>Вкл.</span>
          <span title="Срабатывает из любого состояния">Глобальный</span>
          <span />
        </div>
        {items.map((i) => (
          <IntentRowLoader
            key={i.id}
            link={i}
            siblings={owners.filter((o) => o.id !== i.id)}
            defaultOpen={i.id === created}
            focusName={i.id === fresh}
            onToggleGlobal={(is_global) => connect.mutate({ id: i.id, is_global })}
            onDisconnect={() => disconnect.mutate(i.id)}
            onRemove={() => remove.mutate(i.id)}
          />
        ))}
        {isSuccess && items.length === 0 && <p className="px-4 py-6 text-center text-sm text-muted-foreground">Интентов пока нет. Нажмите «Интент» выше или подключите существующий интент.</p>}
      </section>
    </div>
  );
}
