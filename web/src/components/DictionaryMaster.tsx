import { useEffect, useState, type ReactNode } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { MoreHorizontal, Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { CreateDialog } from '@/components/CreateDialog';
import { EmptyDetail, ListGroup, ListHeader, ListItem, MasterDetail, listEmpty, useListFilter } from '@/components/MasterDetail';
import { SaveIndicator } from '@/components/SaveIndicator';
import { KIND_LABEL, type ObjectKind } from '@/components/TypeToken';
import { useAutosave } from '@/hooks/useAutosave';
import { usePath } from '@/hooks/project';
import type { EntityKind } from '@/lib/entityTypes';
import { cn, GHOST } from '@/lib/utils';

export interface DictItem {
  id: number;
  name: string;
  description?: string;
  used_by: { id: number; name: string; scenario_id?: number | null }[];
}

export interface ScenarioRef {
  id: number;
  name: string;
}

interface Props<T extends DictItem> {
  kind: ObjectKind;
  /** Путь раздела без идентификатора, например «/lists/intents». */
  base: string;
  /** Порядок элементов задаёт вызывающий; внутри группы он сохраняется. */
  items: T[];
  /** Элементы ещё догружаются: не выбираем первый и не показываем пустое состояние. */
  loading?: boolean;
  /** Идентификаторы (интенты, сущности, промпты) набираются моноширинным шрифтом. */
  mono?: boolean;
  /** Название группы в списке; null — элемент без группы. */
  groupOf?: (i: T) => string | null;
  /** Название группы для элементов, у которых groupOf вернул null. */
  fallbackGroup?: string;
  /** Мета справа в списке; warn — выделить как проблему. */
  meta?: (i: T) => { text: string; warn?: boolean } | null;
  /** Куда ведёт «Используется в»: сценарии. Без функции берутся used_by со scenario_id. */
  usedIn?: (i: T) => ScenarioRef[];
  /** Поле одной строкой под названием («comment» или «description»). */
  commentKey?: 'comment' | 'description';
  /** Краткое описание под названием в списке; без функции берётся поле commentKey. */
  subtitle?: (i: T) => string;
  /** Элементы справа в шапке (например, тумблер «Включён»). */
  headerExtra?: (draft: T, patch: (p: Partial<T>) => void) => ReactNode;
  /** Меню справа от «+ Новое…» над списком (импорт и экспорт). */
  listActions?: ReactNode;
  /** Основное содержимое детали. */
  body: (draft: T, patch: (p: Partial<T>) => void) => ReactNode;
  emptyText: string;
  createTitle?: string;
  createPrefix?: string;
  deleteTitle: (d: T) => string;
  deleteDescription?: (d: T) => string | undefined;
  /** Диалог создания спрашивает тип сущности и диапазон. */
  createWithType?: boolean;
  onCreate?: (name: string, kind?: EntityKind) => Promise<{ id: number }>;
  onSave: (draft: T) => Promise<unknown>;
  onRemove: (item: T) => void;
}

const CHIP: Record<ObjectKind, string> = {
  intent: 'bg-int-bg text-int',
  entity: 'bg-ent-bg text-ent',
  prompt: 'bg-prm-bg text-prm',
  state: 'bg-st-bg text-st',
  dependency: 'bg-dep-bg text-dep',
  keyword: 'bg-kw-bg text-kw',
};

/** Подсказка поиска в списке: «Искать в …». */
const SEARCH_WHERE: Record<ObjectKind, string> = {
  intent: 'интентах',
  entity: 'сущностях',
  prompt: 'промптах',
  state: 'состояниях',
  dependency: 'зависимостях',
  keyword: 'концептах',
};

/** Карточка раздела внутри детали: заголовок, действия справа. */
export function DictCard({ title, hint, action, children }: { title: string; hint?: ReactNode; action?: ReactNode; children: ReactNode }) {
  return (
    <section className="rounded-xl border bg-card">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b px-4 py-2.5">
        <h3 className="text-sm font-semibold">
          {title}
          {hint && <span className="ml-1.5">{hint}</span>}
        </h3>
        {action && <div className="flex flex-wrap items-center gap-2">{action}</div>}
      </div>
      <div className="p-4">{children}</div>
    </section>
  );
}

/** Склонение: plural(3, 'фраза', 'фразы', 'фраз') — «3 фразы». */
export function plural(n: number, one: string, few: string, many: string): string {
  const m = n % 100;
  const k = n % 10;
  return `${n} ${m > 10 && m < 15 ? many : k === 1 ? one : k >= 2 && k <= 4 ? few : many}`;
}

const isDesktop = () => typeof window !== 'undefined' && window.matchMedia('(min-width: 768px)').matches;

/** Справочник по схеме «мастер — деталь»: слева сгруппированный список, справа форма выбранного с автосохранением. */
export function DictionaryMaster<T extends DictItem>(p: Props<T>) {
  const { itemId } = useParams();
  const navigate = useNavigate();
  const path = usePath();
  const [creating, setCreating] = useState(false);
  const { filtered, search, filtering } = useListFilter(p.items, SEARCH_WHERE[p.kind]);
  const selected = p.items.find((i) => String(i.id) === itemId);

  // Группы: в порядке первого появления, «без группы» — в конце
  const fallback = p.fallbackGroup ?? 'Общие';
  const groups: { label: string; items: T[] }[] = [];
  for (const i of filtered) {
    const label = p.groupOf?.(i) ?? fallback;
    let g = groups.find((x) => x.label === label);
    if (!g) groups.push((g = { label, items: [] }));
    g.items.push(i);
  }
  groups.sort((a, b) => Number(a.label === fallback) - Number(b.label === fallback));
  const showGroups = !!p.groupOf && (groups.length > 1 || (groups[0] && groups[0].label !== fallback));
  const first = groups[0]?.items[0] ?? p.items[0];
  const sub = (i: T) => {
    const s = p.subtitle?.(i) ?? (p.commentKey ? String((i as Record<string, unknown>)[p.commentKey] ?? '') : '');
    return s.trim().replace(/\s+/g, ' ');
  };

  // На десктопе без выбора открываем первый элемент, на мобильном остаёмся в списке
  useEffect(() => {
    if (!p.loading && !selected && first && isDesktop()) navigate(path(`${p.base}/${first.id}`), { replace: true });
  }, [selected, first?.id, p.loading]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <MasterDetail
      selected={!!selected}
      onBack={() => navigate(path(p.base))}
      list={
        <>
          {p.onCreate && <ListHeader onCreate={() => setCreating(true)} label={p.createTitle} extra={p.listActions} />}
          {search}
          <ul className="flex-1 overflow-y-auto pb-2">
            {groups.map((g) => (
              <li key={g.label} className="list-none">
                <ul>
                  {showGroups && <ListGroup count={g.items.length}>{g.label}</ListGroup>}
                  {g.items.map((i) => {
                    const m = p.meta?.(i);
                    return (
                      <li key={i.id}>
                        <ListItem to={path(`${p.base}/${i.id}`)} kind={p.kind} meta={m?.text} warn={m?.warn}>
                          <span className={cn('block truncate', p.mono && 'font-mono text-[13px]')}>{i.name}</span>
                          {sub(i) && <span className="block truncate text-xs font-normal text-muted-foreground">{sub(i)}</span>}
                        </ListItem>
                      </li>
                    );
                  })}
                </ul>
              </li>
            ))}
            {!p.loading && p.items.length === 0 && <li className={listEmpty}>{p.emptyText}</li>}
            {p.items.length > 0 && filtered.length === 0 && filtering && <li className={listEmpty}>Ничего не найдено</li>}
          </ul>
          {p.onCreate && (
            <CreateDialog
              open={creating}
              onOpenChange={setCreating}
              title={p.createTitle ?? ''}
              prefix={p.createPrefix}
              existingNames={p.items.map((i) => i.name)}
              withType={p.createWithType}
              onCreate={(n, kind) => p.onCreate!(n, kind).then((c) => navigate(path(`${p.base}/${c.id}`)))}
            />
          )}
        </>
      }
    >
      {selected ? (
        <DictEditor key={selected.id} item={selected} p={p} onRemoved={() => navigate(path(p.base))} />
      ) : p.loading ? null : p.items.length === 0 ? (
        <div className="mx-auto mt-10 max-w-sm text-center">
          <p className="text-balance text-base font-medium">{p.emptyText}</p>
          {p.onCreate && (
            <Button className="mt-4 h-10 md:h-9" onClick={() => setCreating(true)}>
              <Plus className="size-4" /> {p.createTitle ?? 'Создать'}
            </Button>
          )}
        </div>
      ) : (
        <EmptyDetail text="Выберите элемент слева" />
      )}
    </MasterDetail>
  );
}

function DictEditor<T extends DictItem>({ item, p, onRemoved }: { item: T; p: Props<T>; onRemoved: () => void }) {
  const [draft, setDraft] = useState<T>(item);
  const [confirm, setConfirm] = useState(false);
  const path = usePath();
  const patch = (x: Partial<T>) => setDraft((d) => ({ ...d, ...x }));
  const status = useAutosave(draft, async (d) => {
    if (!d.name.trim()) return;
    await p.onSave(d);
  });

  const usedIn: ScenarioRef[] =
    p.usedIn?.(item) ??
    [...new Map(item.used_by.filter((u) => u.scenario_id != null).map((u) => [u.scenario_id!, { id: u.scenario_id!, name: u.name }])).values()];
  const commentKey = p.commentKey;
  const comment = commentKey ? String((draft as Record<string, unknown>)[commentKey] ?? '') : '';

  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <div className="space-y-2">
        <div className="flex min-h-10 flex-wrap items-center justify-between gap-2">
          <span className={cn('inline-flex items-center rounded-[5px] px-2 py-0.5 text-xs font-semibold uppercase tracking-wide', CHIP[p.kind])}>
            {KIND_LABEL[p.kind]}
          </span>
          <span className="flex items-center gap-2">
            {p.headerExtra?.(draft, patch)}
            <SaveIndicator state={status} compact />
            <DropdownMenu>
              <DropdownMenuTrigger render={<Button variant="ghost" size="icon" className="size-10 md:size-8" aria-label="Действия" />}>
                <MoreHorizontal className="size-4" />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => setConfirm(true)}>
                  <Trash2 className="size-4" /> Удалить
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </span>
        </div>
        <Input
          className={cn(GHOST, 'h-11 w-full px-2 text-[22px] font-semibold leading-tight md:text-[22px]', p.mono && 'font-mono')}
          value={draft.name}
          onChange={(e) => patch({ name: e.target.value } as Partial<T>)}
          aria-label="Название"
        />
        <p className="flex flex-wrap items-center gap-x-2 gap-y-1 px-2 text-sm text-muted-foreground">
          {usedIn.length > 0 && <span>Используется в</span>}
          {usedIn.length === 0 && <span className="text-faint">Не используется в текущих сценариях</span>}
          {usedIn.map((s) => (
            <Link
              key={s.id}
              to={path(`/scenarios/${s.id}`)}
              className="inline-flex min-h-8 items-center rounded-md bg-muted px-2 text-[13px] text-foreground hover:bg-accent hover:text-accent-foreground focus-visible:outline-2 focus-visible:outline-ring md:min-h-6"
            >
              {s.name} →
            </Link>
          ))}
        </p>
        {commentKey && (
          <Textarea
            rows={1}
            className={cn(GHOST, 'min-h-9 resize-none px-2 py-1.5 text-sm')}
            placeholder="Добавить комментарий"
            aria-label="Комментарий"
            value={comment}
            onChange={(e) => patch({ [commentKey]: e.target.value } as unknown as Partial<T>)}
          />
        )}
      </div>
      {p.body(draft, patch)}
      <ConfirmDialog
        open={confirm}
        onOpenChange={setConfirm}
        title={p.deleteTitle(item)}
        description={p.deleteDescription?.(item)}
        onConfirm={() => {
          p.onRemove(item);
          onRemoved();
        }}
      />
    </div>
  );
}
