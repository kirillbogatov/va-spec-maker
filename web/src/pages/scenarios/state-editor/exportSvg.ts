import { api } from '@/lib/api';
import { downloadBlob } from '@/lib/download';
import type { SchemeRule, SchemeState } from '@/lib/schemeSvg';
import { splitNext, type Analysis } from '@/lib/states';
import type { Dependency, EntityListItem, IntentListItem, Layout, PromptListItem, Step } from '@/lib/types';
import { conditionLabel } from '../dependencies';

export interface SchemeExportArgs {
  /** Название сценария и вкладки (вкладка — только если их несколько). */
  title: string; part: string | null;
  names: string[]; steps: Step[]; layout: Layout; analysis: Analysis;
  errors: Step[]; globals: Step[];
  intents: IntentListItem[]; prompts: PromptListItem[];
  dependencies: Dependency[]; entities: EntityListItem[]; keywords: { id: number; name: string }[];
}

/** Шрифты, которыми размечен файл: перед измерением текста они должны быть загружены. */
const FONTS = ["400 11px 'IBM Plex Sans'", "italic 400 11px 'IBM Plex Sans'", "500 11px 'IBM Plex Sans'", "600 11px 'IBM Plex Sans'", "400 11px 'IBM Plex Mono'", "500 11px 'IBM Plex Mono'"];

/** Собирает схему вкладки в SVG и скачивает файл. */
export async function exportSchemeSvg(a: SchemeExportArgs): Promise<void> {
  const [{ buildSchemeSvg }, { SCHEME_FONT_CSS }] = await Promise.all([import('@/lib/schemeSvg'), import('@/lib/schemeFonts')]);
  await Promise.all(FONTS.map((f) => document.fonts.load(f).catch(() => [])));

  // Пример запроса — первая фраза интента
  const used = [...new Set(a.steps.map((s) => s.intent_id).filter((id): id is number => id != null))];
  const phrases = new Map<number, string>(
    await Promise.all(used.map(async (id) => [id, (await api.intents.get(id).catch(() => null))?.phrases.find((p) => p.trim()) ?? ''] as [number, string])),
  );

  const intentName = (id: number | null) => (id == null ? null : a.intents.find((i) => i.id === id)?.name ?? null);
  const prompt = (id: number | null | undefined) => {
    const p = id == null ? undefined : a.prompts.find((x) => x.id === id);
    return p ? { name: p.name, text: p.hint } : null;
  };
  const conds = (s: Step) => [
    ...s.conditions.map((c) => conditionLabel(c, a.dependencies, a.entities, a.keywords)),
    ...s.condition.split('\n').map((l) => l.trim()).filter(Boolean),
  ];

  const hasOut = new Set(a.analysis.edges.map((e) => e.from));
  const unreachable = new Set(a.analysis.unreachable);
  const entry = a.analysis.states[0];
  const states: SchemeState[] = a.names.map((name, i) => ({
    name, number: i + 1,
    tag: unreachable.has(name) ? 'unreachable' : name === entry ? 'start' : !hasOut.has(name) ? 'end' : null,
    description: a.layout[name]?.description ?? '',
    prompt: prompt(a.layout[name]?.prompt_id),
    action: a.layout[name]?.system_action ?? '',
  }));
  const edges = a.analysis.edges.flatMap((e, i) => {
    const s = a.steps.find((x) => x.key === e.stepKey);
    if (!s) return [];
    return [{
      id: e.id, from: e.from, to: e.to, number: i + 1,
      intent: intentName(s.intent_id), conds: conds(s), mode: s.cond_mode ?? 'all',
      example: s.intent_id == null ? '' : phrases.get(s.intent_id) ?? '',
    }];
  });
  const rule = (s: Step, where: string): SchemeRule => ({
    rule: s.name ?? '',
    trigger: [intentName(s.intent_id) ?? 'любой интент', ...conds(s), where],
    prompt: prompt(s.prompt_id),
    action: s.system_action,
    targets: splitNext(s.next_states),
  });

  const ctx = document.createElement('canvas').getContext('2d')!;
  const svg = await buildSchemeSvg({
    title: a.title.trim() || 'Сценарий',
    subtitle: a.part ? `Вкладка «${a.part}»` : '',
    date: new Date().toLocaleDateString('ru-RU'),
    states, edges,
    errors: a.errors.map((s) => rule(s, s.state.trim() ? `в состоянии ${s.state.trim()}` : 'любое состояние')),
    globals: a.globals.map((s) => rule(s, 'любое состояние')),
    fontCss: SCHEME_FONT_CSS,
  }, (text, font) => { ctx.font = font; return ctx.measureText(text).width; });

  const file = [a.title.trim() || 'Сценарий', a.part].filter(Boolean).join(' — ').replace(/[\\/:*?"<>|]+/g, '_');
  downloadBlob(new Blob([svg], { type: 'image/svg+xml;charset=utf-8' }), `${file}.svg`);
}
