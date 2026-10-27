import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Clock, Route, Search, X } from 'lucide-react';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { TypeToken, type ObjectKind } from '@/components/TypeToken';
import { usePath, useProjectId } from '@/hooks/project';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';

type HitKind = ObjectKind | 'scenario' | 'command';
interface Hit {
  key: string; kind: HitKind; name: string; hint?: string; to?: string;
  /** Текст, по которому найдено совпадение (фраза, ответ): ищется наравне с именем. */
  text?: string; run?: () => void; recent?: boolean;
}
interface Recent { key: string; kind: HitKind; name: string; hint?: string; to: string }

const GROUPS: { kind: HitKind; title: string }[] = [
  { kind: 'scenario', title: 'Сценарии' },
  { kind: 'intent', title: 'Интенты' },
  { kind: 'entity', title: 'Сущности' },
  { kind: 'prompt', title: 'Промпты' },
  { kind: 'dependency', title: 'Зависимости' },
  { kind: 'keyword', title: 'Ключевые слова' },
];

/** Корни русских слов и их латинские соответствия в идентификаторах: «свет» находит LIGHT, «будил» — ALARM. */
const LEXICON: [string, string[]][] = [
  ['свет', ['light', 'lamp']], ['ламп', ['lamp', 'light']], ['будил', ['alarm']], ['темп', ['temp']], ['громк', ['volume', 'vol']],
  ['звук', ['sound', 'volume']], ['включ', ['on', 'enable', 'turn']], ['выключ', ['off', 'disable']], ['яркост', ['bright']],
  ['цвет', ['color', 'colour']], ['врем', ['time']], ['дат', ['date']], ['погод', ['weather']], ['музык', ['music']],
  ['таймер', ['timer']], ['дверь', ['door']], ['двер', ['door']], ['замок', ['lock']], ['штор', ['curtain', 'blind']],
  ['режим', ['mode']], ['значен', ['value']], ['установ', ['set']], ['измен', ['change']], ['отмен', ['cancel']],
  ['помощ', ['help']], ['подтвержд', ['confirm']], ['комнат', ['room']], ['поиск', ['search']], ['повтор', ['repeat']],
  ['ошибк', ['error', 'fail']], ['привет', ['hello', 'greeting']], ['пока', ['bye']], ['да', ['yes']], ['нет', ['no']],
  ['скорост', ['speed']], ['вентил', ['fan']], ['отоплен', ['heat']], ['охлажд', ['cool']], ['сцен', ['scene']],
];

const TRANSLIT: Record<string, string> = {
  а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'e', ж: 'zh', з: 'z', и: 'i', й: 'y', к: 'k', л: 'l', м: 'm', н: 'n', о: 'o',
  п: 'p', р: 'r', с: 's', т: 't', у: 'u', ф: 'f', х: 'h', ц: 'c', ч: 'ch', ш: 'sh', щ: 'sh', ъ: '', ы: 'y', ь: '', э: 'e', ю: 'u', я: 'ya',
};
// Те же буквы на английской раскладке: «ntvg» → «темп» набрано без переключения
const LAYOUT: Record<string, string> = {
  q: 'й', w: 'ц', e: 'у', r: 'к', t: 'е', y: 'н', u: 'г', i: 'ш', o: 'щ', p: 'з', a: 'ф', s: 'ы', d: 'в', f: 'а', g: 'п', h: 'р', j: 'о',
  k: 'л', l: 'д', z: 'я', x: 'ч', c: 'с', v: 'м', b: 'и', n: 'т', m: 'ь',
};

const translit = (s: string) => [...s].map((c) => TRANSLIT[c] ?? c).join('');
const hasCyrillic = (s: string) => /[а-яё]/.test(s);

/** Варианты написания одного слова запроса: оно само, транслитерация, словарь и обратная раскладка. */
function variants(token: string): string[] {
  const out = new Set([token]);
  if (hasCyrillic(token)) {
    out.add(translit(token));
    for (const [root, latin] of LEXICON) {
      if (token.length >= 2 && (token.startsWith(root) || (token.length >= 3 && root.startsWith(token)))) latin.forEach((l) => out.add(l));
    }
  } else if (/^[a-z]+$/.test(token) && token.length >= 3) {
    out.add([...token].map((c) => LAYOUT[c] ?? c).join(''));
  }
  return [...out];
}

const normalize = (s: string) => s.toLowerCase().replace(/[_\-]+/g, ' ');

/** 0 — совпало имя, 1 — совпал текст, null — не найдено. Все слова запроса должны совпасть. */
function score(h: Hit, tokens: string[][]): number | null {
  const name = normalize(h.name);
  const text = h.text ? normalize(h.text) : '';
  let best = 0;
  for (const vs of tokens) {
    if (vs.some((v) => name.includes(v))) continue;
    if (text && vs.some((v) => text.includes(v))) { best = 1; continue; }
    return null;
  }
  return best;
}

const snippet = (text: string, tokens: string[][]) => {
  const t = normalize(text);
  const hit = tokens.flat().find((v) => t.includes(v));
  const i = hit ? t.indexOf(hit) : 0;
  const s = Math.max(0, i - 12);
  return `${s ? '…' : ''}«${text.slice(s, s + 48)}${text.length > s + 48 ? '…' : ''}»`;
};

const recentKey = (pid: number) => `va-recent-${pid}`;
function loadRecent(pid: number): Recent[] {
  try {
    const v = JSON.parse(localStorage.getItem(recentKey(pid)) ?? '[]');
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}
function pushRecent(pid: number, h: Recent) {
  try {
    const list = [h, ...loadRecent(pid).filter((r) => r.key !== h.key)].slice(0, 6);
    localStorage.setItem(recentKey(pid), JSON.stringify(list));
  } catch {
    /* хранилище недоступно: недавние просто не запомнятся */
  }
}

interface DumpTables {
  intents?: { id: number }[];
  intent_phrases?: { intent_id: number; text: string }[];
  prompts?: { id: number; full_answers: string }[];
}

const parseList = (s: string): string[] => {
  try {
    const v = JSON.parse(s);
    return Array.isArray(v) ? v.filter((x) => typeof x === 'string') : [];
  } catch {
    return [];
  }
};

function Kbd({ children }: { children: ReactNode }) {
  return <kbd className="rounded border bg-muted px-1.5 py-0.5 font-sans text-[11px] font-medium text-muted-foreground">{children}</kbd>;
}

function HitIcon({ h }: { h: Hit }) {
  if (h.kind === 'scenario') return <Route className="size-4 text-muted-foreground" aria-hidden />;
  return null;
}

/** Глобальный поиск по «/»: сценарии, интенты, сущности, промпты и зависимости, в том числе по текстам фраз и ответов. */
export function CommandPalette({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const projectId = useProjectId();
  const navigate = useNavigate();
  const path = usePath();
  const [q, setQ] = useState('');
  const [cursor, setCursor] = useState(0);
  const [recent, setRecent] = useState<Recent[]>([]);
  const activeRef = useRef<HTMLButtonElement>(null);
  const enabled = { enabled: open, staleTime: 10_000 };
  const scenarios = useQuery({ queryKey: ['scenarios', projectId], queryFn: () => api.scenarios.list(projectId), ...enabled });
  const intents = useQuery({ queryKey: ['intents', projectId], queryFn: () => api.intents.list(projectId), ...enabled });
  const prompts = useQuery({ queryKey: ['prompts', projectId], queryFn: () => api.prompts.list(projectId), ...enabled });
  const entities = useQuery({ queryKey: ['entities', projectId], queryFn: () => api.entities.list(projectId), ...enabled });
  const deps = useQuery({ queryKey: ['dependency-dictionary', projectId], queryFn: () => api.dependencyDictionary.list(projectId), ...enabled });
  const keywords = useQuery({ queryKey: ['keywords', projectId], queryFn: () => api.keywords.list(projectId), ...enabled });
  // Тексты фраз и ответов берём из выгрузки проекта: одним запросом вместо запроса на каждый объект
  const dump = useQuery({ queryKey: ['palette-dump', projectId], queryFn: () => api.projects.dump(projectId), ...enabled, gcTime: 0 });

  useEffect(() => {
    if (open) setRecent(loadRecent(projectId));
  }, [open, projectId]);

  const all = useMemo<Hit[]>(() => {
    const tables = ((dump.data as { tables?: DumpTables } | undefined)?.tables ?? {}) as DumpTables;
    const phrases = new Map<number, string>();
    for (const f of tables.intent_phrases ?? []) phrases.set(f.intent_id, `${phrases.get(f.intent_id) ?? ''}\n${f.text}`);
    const answers = new Map<number, string>();
    for (const p of tables.prompts ?? []) answers.set(p.id, parseList(p.full_answers).join('\n'));
    return [
      ...(scenarios.data ?? []).map((s): Hit => ({ key: `s${s.id}`, kind: 'scenario', name: s.name, hint: `${s.step_count} строк`, to: path(`/scenarios/${s.id}`) })),
      ...(intents.data ?? []).map((i): Hit => ({
        key: `i${i.id}`, kind: 'intent', name: i.name, hint: i.scenarios.map((s) => s.name).join(', ') || undefined, text: phrases.get(i.id),
        to: path(`/lists/intents/${i.id}`),
      })),
      ...(entities.data ?? []).map((e): Hit => ({ key: `e${e.id}`, kind: 'entity', name: e.name, hint: `${e.value_count} знач.`, to: path(`/entities/${e.id}`) })),
      ...(prompts.data ?? []).map((p): Hit => ({
        key: `p${p.id}`, kind: 'prompt', name: p.name, hint: p.scenarios.map((s) => s.name).join(', ') || undefined, text: answers.get(p.id),
        to: path(`/lists/prompts/${p.id}`),
      })),
      ...(deps.data ?? []).map((d): Hit => ({ key: `d${d.id}`, kind: 'dependency', name: d.name, hint: `${d.values.length} знач.`, to: path(`/dependencies/${d.id}`) })),
      ...(keywords.data ?? []).map((k): Hit => ({ key: `k${k.id}`, kind: 'keyword', name: k.name, hint: `${k.synonyms.length} син.`, text: k.synonyms.join('\n'), to: path(`/lists/keywords/${k.id}`) })),
    ];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scenarios.data, intents.data, prompts.data, entities.data, deps.data, keywords.data, dump.data]);

  const tokens = useMemo(() => normalize(q.trim()).split(/\s+/).filter(Boolean).map(variants), [q]);
  const sections = useMemo(() => {
    if (tokens.length === 0) {
      const known = new Set(all.map((h) => h.key));
      const rec = recent.filter((r) => known.has(r.key) || all.length === 0).slice(0, 5).map((r): Hit => ({ ...r, recent: true }));
      return rec.length ? [{ title: 'Недавние', hits: rec }] : [];
    }
    const hits = all
      .map((h) => ({ h, s: score(h, tokens) }))
      .filter((x): x is { h: Hit; s: number } => x.s !== null)
      .map(({ h, s }) => (s === 1 && h.text ? { h: { ...h, hint: snippet(h.text, tokens) }, s } : { h, s }));
    return GROUPS.map((g) => ({
      title: g.title,
      hits: hits.filter((x) => x.h.kind === g.kind).sort((a, b) => a.s - b.s).slice(0, 8).map((x) => x.h),
    })).filter((g) => g.hits.length > 0);
  }, [tokens, all, recent]);
  const flat = useMemo(() => sections.flatMap((s) => s.hits), [sections]);

  useEffect(() => { setCursor(0); }, [q, open]);
  useEffect(() => { activeRef.current?.scrollIntoView({ block: 'nearest' }); }, [cursor, sections]);

  const go = (h: Hit | undefined) => {
    if (!h) return;
    onOpenChange(false);
    setQ('');
    if (h.run) { h.run(); return; }
    if (!h.to) return;
    if (h.kind !== 'command') pushRecent(projectId, { key: h.key, kind: h.kind, name: h.name, hint: h.hint, to: h.to });
    navigate(h.to);
  };

  let index = -1;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent showCloseButton={false} className="top-[6%] max-w-[calc(100%-1rem)] translate-y-0 gap-0 p-0 sm:top-[14%] sm:max-w-xl">
        <DialogTitle className="sr-only">Поиск по проекту</DialogTitle>
        <div className="flex items-center gap-2 border-b px-3">
          <Search className="size-4 shrink-0 text-muted-foreground" aria-hidden />
          <input
            spellCheck={false}
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Найти сценарий, интент, сущность, фразу…"
            aria-label="Поиск"
            className="h-12 min-w-0 flex-1 bg-transparent text-base outline-none placeholder:text-faint sm:h-11 sm:text-sm"
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') { e.preventDefault(); setCursor((c) => Math.min(c + 1, flat.length - 1)); }
              else if (e.key === 'ArrowUp') { e.preventDefault(); setCursor((c) => Math.max(c - 1, 0)); }
              else if (e.key === 'Enter') { e.preventDefault(); go(flat[cursor]); }
            }}
          />
          <button type="button" onClick={() => onOpenChange(false)} aria-label="Закрыть" className="grid size-10 place-items-center rounded-md text-muted-foreground hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring sm:hidden">
            <X className="size-4" />
          </button>
          <span className="hidden sm:block"><Kbd>Esc</Kbd></span>
        </div>
        <div className="max-h-[min(24rem,60dvh)] overflow-y-auto py-1" role="listbox" aria-label="Результаты">
          {sections.map((sec) => (
            <div key={sec.title} role="group" aria-label={sec.title}>
              <div className="flex items-center gap-1.5 px-3 pb-1 pt-2 text-xs font-medium text-muted-foreground">
                {sec.title === 'Недавние' && <Clock className="size-3" aria-hidden />}
                {sec.title}
              </div>
              {sec.hits.map((h) => {
                const i = ++index;
                const active = i === cursor;
                return (
                  <button
                    key={`${sec.title}-${h.key}`}
                    ref={active ? activeRef : undefined}
                    role="option"
                    aria-selected={active}
                    type="button"
                    onMouseMove={() => setCursor(i)}
                    onClick={() => go(h)}
                    className={cn('flex min-h-10 w-full items-center gap-3 px-3 py-1.5 text-left text-sm sm:min-h-9', active && 'bg-accent')}
                  >
                    <span className="flex min-w-0 flex-1 items-center gap-2">
                      <HitIcon h={h} />
                      {h.kind === 'scenario' || h.kind === 'command'
                        ? <span className="truncate font-medium">{h.name}</span>
                        : <TypeToken kind={h.kind}>{h.name}</TypeToken>}
                    </span>
                    {h.hint && <span className="max-w-[45%] shrink-0 truncate text-xs text-muted-foreground">{h.hint}</span>}
                    {active && <span className="hidden shrink-0 text-xs text-muted-foreground sm:inline" aria-hidden>↵</span>}
                  </button>
                );
              })}
            </div>
          ))}
          {flat.length === 0 && (
            <p className="px-3 py-8 text-center text-sm text-muted-foreground">
              {tokens.length ? <>Ничего не найдено по запросу «{q.trim()}»</> : all.length === 0 ? 'Загрузка…' : 'Начните вводить запрос'}
            </p>
          )}
        </div>
        <div className="hidden items-center gap-4 border-t px-3 py-2 text-xs text-muted-foreground sm:flex">
          <span className="flex items-center gap-1.5"><Kbd>↑↓</Kbd> выбор</span>
          <span className="flex items-center gap-1.5"><Kbd>↵</Kbd> открыть</span>
          <span className="flex items-center gap-1.5"><Kbd>Esc</Kbd> закрыть</span>
          <span className="ml-auto">Ищет по названиям, фразам и ответам</span>
        </div>
      </DialogContent>
    </Dialog>
  );
}
