import { moveStateOrder } from './stateOrder';
import { readStateClipboard, writeStateClipboard, pasteState } from './stateClipboard';
import { createConditionStates } from './conditionStates';
import { BLOCK_W, CARD_W, stateBlock, transitionCard } from '@/lib/stateSvg';
import { PropertiesLayout } from './PropertiesLayout';
import { useQueries } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Background, MarkerType, ReactFlow, ReactFlowProvider, useReactFlow, useViewport, type Connection, type Edge, type Node } from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { Download, Expand, Minus, Plus, Shrink, PanelsTopLeft } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { layoutStateGraph, type LayoutResult } from '@/lib/elkLayout';
import { duplicateState, ENTRY_STATE, newTransition, removeState, renameState, uniqueStateName } from '@/lib/fsm';
import { splitNext, stepIntentLabel, type Analysis } from '@/lib/states';
import type { Dependency, EntityListItem, IntentListItem, Layout, PromptListItem, ScenarioPart, StateInfo, Step } from '@/lib/types';
import { conditionLabel } from '../dependencies';
import { useProjectId } from '@/hooks/project';
import { useKeywords } from '@/lib/keywords';
import { usePrefixes } from '@/lib/prefixes';
import { EdgePanel } from './EdgePanel';
import { exportScenarioSvg } from './exportSvg';
import { NodePanel } from './NodePanel';
import { StateNode, TransitionEdge, type EdgeCard, type StateNodeData, type TransitionEdgeData } from './StateNode';

const nodeTypes = { state: StateNode };
const edgeTypes = { transition: TransitionEdge };

type Selection = { type: 'node'; name: string } | { type: 'edge'; key: string } | null;

interface Props {
  /** Хранится в форме сценария, чтобы переключение подсценариев не сбрасывало полный экран. */
  wide: boolean;
  onWideChange: (wide: boolean) => void;
  /** Только переходы (kind = transition). */
  steps: Step[];
  layout: Layout;
  /** analyzeSteps по этим же строкам. */
  analysis: Analysis;
  intents: IntentListItem[];
  prompts: PromptListItem[];
  dependencies: Dependency[];
  entities: EntityListItem[];
  onChange: (next: { steps: Step[]; layout: Layout }) => void;
  /** Панель свойств вкладки: показывается справа, пока showPart и на схеме ничего не выбрано. */
  partPanel?: ReactNode;
  showPart?: boolean;
  /** Вкладки сценария — в панели инструментов холста. */
  tabs?: ReactNode;
  /** Состояние, которое нужно выделить при открытии (переход по ссылке из истории). */
  focusState?: string | null;
  /** Выбран узел или переход — панель вкладки уступает место. */
  onSelectElement?: () => void;
  /** Название и все вкладки сценария для экспорта в SVG. */
  exportMeta?: { title: string; parts: ScenarioPart[] };
}

/** Параметры «вписать»: небольшие поля, текст остаётся читаемым, пока схема помещается. */
const FIT = { padding: 0.08, minZoom: 0.2, maxZoom: 1 } as const;

/** Редактор конечного автомата: узлы — состояния, рёбра — строки Transition table. */
export function StateEditor(props: Props) {
  return <ReactFlowProvider><StateEditorInner {...props} /></ReactFlowProvider>;
}

/** Масштаб схемы. */
function ZoomControls() {
  const { zoomIn, zoomOut, fitView } = useReactFlow();
  const { zoom } = useViewport();
  return (
    <div className="flex items-center gap-0.5">
      <Button variant="ghost" size="icon" aria-label="Уменьшить" onClick={() => zoomOut({ duration: 150 })}><Minus className="size-4" /></Button>
      <span className="w-11 text-center text-xs tabular-nums text-muted-foreground">{Math.round(zoom * 100)}%</span>
      <Button variant="ghost" size="icon" aria-label="Увеличить" onClick={() => zoomIn({ duration: 150 })}><Plus className="size-4" /></Button>
      <Button variant="ghost" size="sm" onClick={() => fitView({ ...FIT, duration: 200 })}>Вся схема</Button>
    </div>
  );
}

function StateEditorInner({ wide, onWideChange: setWide, steps, layout, analysis, intents, prompts, dependencies, entities, onChange, partPanel, showPart, tabs, onSelectElement, focusState, exportMeta }: Props) {
  const canvas = useRef<HTMLDivElement>(null);
  const projectId = useProjectId();
  const keywords = useKeywords(projectId);
  const statePrefix = usePrefixes(projectId).state;
  const [expanded, setExpanded] = useState(false);
  const examples = useQueries({ queries: expanded ? [...new Set(steps.map((step) => step.intent_id).filter((id): id is number => id !== null))].map((id) => ({ queryKey: ['intents', 'phrases', id], queryFn: () => api.intents.get(id) })) : [] });
  const [selected, setSelectedRaw] = useState<Selection>(null);
  const setSelected = (s: Selection) => {
    setSelectedRaw(s);
    if (s) onSelectElement?.();
  };
  useEffect(() => { if (showPart) setSelectedRaw(null); }, [showPart]);

  const names = useMemo(() => {
    const out = [...analysis.states];
    for (const e of analysis.edges) if (!out.includes(e.to)) out.push(e.to);
    for (const k of Object.keys(layout)) if (!out.includes(k)) out.push(k);
    return out;
  }, [analysis, layout]);

  useEffect(() => {
    if (focusState && names.includes(focusState)) setSelected({ type: 'node', name: focusState });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusState]);

  const intentTitle = (s: Step) => stepIntentLabel(s, (id) => intents.find((i) => i.id === id)?.name ?? null);
  const condsOf = (s: Step) => [...s.conditions.map((c) => conditionLabel(c, dependencies, entities, keywords)), ...s.condition.split('\n').map((l) => l.trim())].filter(Boolean);
  const edgeText = (s: Step) => {
    const conds = condsOf(s);
    const to = splitNext(s.next_states)[0];
    const text = conds.length ? `${intentTitle(s)} [${conds.join(', ')}]` : intentTitle(s);
    return to ? `${text} → ${to}` : text;
  };
  /** Подпись перехода: интент и условия (условия — в подсказке и инспекторе). */
  const edgeCard = (s: Step): EdgeCard => ({ title: intentTitle(s), conds: condsOf(s) });

  const hasOut = useMemo(() => new Set(analysis.edges.map((e) => e.from)), [analysis.edges]);
  const unreachable = useMemo(() => new Set(analysis.unreachable), [analysis.unreachable]);

  // Подписи рёбер и размеры узлов определяют раскладку; выделение на неё не влияет.
  const labels = useMemo(
    () => new Map<string, EdgeCard>(analysis.edges.map((e) => [e.id, (() => { const st = steps.find((s) => s.key === e.stepKey); return st ? edgeCard(st) : { title: e.label, conds: [] }; })()])),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [analysis.edges, steps, intents, dependencies, entities],
  );
  const promptName = (name: string) => {
    const id = layout[name]?.prompt_id;
    return id == null ? '' : prompts.find((p) => p.id === id)?.name ?? '';
  };
  const expandedNodes = useMemo(() => {
    if (!expanded) return new Map<string, { svg: string; width: number; height: number }>();
    const scheme = {
      entry: analysis.states[0], unreachable, hasOut, info: layout,
      promptOf: (name: string) => { const p = prompts.find((p) => p.id === layout[name]?.prompt_id); return p ? { name: p.name, text: p.hint } : null; },
    };
    return new Map(names.map((name, i) => { const block = stateBlock(scheme, name, i + 1); return [name, { svg: block.svg, width: BLOCK_W, height: block.h }]; }));
  }, [expanded, names, layout, prompts, analysis.states, unreachable, hasOut]);
  const expandedEdges = useMemo(() => {
    if (!expanded) return new Map<string, { svg: string; width: number; height: number }>();
    return new Map(analysis.edges.map((edge, i) => {
      const st = steps.find((s) => s.key === edge.stepKey);
      const block = transitionCard({ ...(labels.get(edge.id) ?? { title: '', conds: [] }), example: examples.find((query) => query.data?.id === st?.intent_id)?.data?.phrases.find((phrase) => phrase.trim()) ?? '', any: st?.cond_mode === 'any', bad: (analysis.issues.get(edge.stepKey ?? '') ?? []).some((issue) => issue.level === 'error') }, i + 1);
      return [edge.id, { svg: block.svg, width: CARD_W, height: block.h }];
    }));
  }, [expanded, analysis, steps, labels, examples]);
  const sizes = useMemo(
    () => new Map(names.map((n) => [n, expandedNodes.get(n) ?? nodeSize(n, layout[n]?.description ?? '', promptName(n), n === analysis.states[0] || !hasOut.has(n) || unreachable.has(n))])),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [names, layout, prompts, analysis.states, hasOut, unreachable, expandedNodes],
  );
  const graphKey = JSON.stringify([names.map((n) => [n, sizes.get(n), layout[n]?.order]), analysis.edges.map((e) => [e.id, e.from, e.to, labels.get(e.id), expandedEdges.get(e.id)])]);
  const [placed, setPlaced] = useState<LayoutResult | null>(null);
  const [placedKey, setPlacedKey] = useState('');
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (!expanded) return;
    let stale = false;
    void document.fonts.ready.then(() => { if (!stale) setTick((value) => value + 1); });
    return () => { stale = true; };
  }, [expanded]);
  const { fitView, viewportInitialized } = useReactFlow();
  useEffect(() => {
    let stale = false;
    layoutStateGraph(
      names.map((n) => ({ id: n, ...sizes.get(n)!, order: layout[n]?.order })),
      analysis.edges.map((e) => ({ id: e.id, source: e.from, target: e.to, label: expandedEdges.get(e.id) ?? labelSize(labels.get(e.id)) })),
    ).then((r) => { if (!stale) { setPlaced(r); setPlacedKey(`${graphKey}:${tick}`); } }, () => { if (!stale) toast.error('Не удалось разложить схему'); });
    return () => { stale = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [graphKey, tick]);

  // Масштаб подстраивается после первой раскладки, изменения топологии и переключения вида блоков.
  const topoKey = JSON.stringify([names, analysis.edges.map((e) => [e.id, e.from, e.to])]);
  const fitted = useRef('');
  const [viewportReady, setViewportReady] = useState(false);
  useEffect(() => {
    if (!placed || placedKey !== `${graphKey}:${tick}` || !viewportInitialized) return;
    if (names.length === 0) { setViewportReady(true); return; }
    const key = `${topoKey}:${tick}`;
    if (fitted.current === key) return;
    let stale = false;
    const id = requestAnimationFrame(async () => {
      // Первый кадр показываем сразу в рассчитанной позиции, без пролёта из (0, 0).
      const duration = viewportReady ? 200 : 0;
      // На узком экране сначала показываем крупно входное состояние; общий вид доступен уменьшением масштаба.
      const entry = analysis.states[0];
      if (window.matchMedia('(max-width: 639px)').matches && names.length > 3 && entry) await fitView({ nodes: [{ id: entry }], minZoom: 0.7, maxZoom: 0.8, padding: 0.3, duration: 0 });
      else {
        const positions = names.flatMap((name) => {
          const position = placed.nodes.get(name);
          const size = sizes.get(name);
          return position && size ? [{ ...position, ...size }] : [];
        });
        const graphWidth = positions.length ? Math.max(...positions.map((n) => n.x + n.width)) - Math.min(...positions.map((n) => n.x)) : 0;
        const graphHeight = positions.length ? Math.max(...positions.map((n) => n.y + n.height)) - Math.min(...positions.map((n) => n.y)) : 0;
        const viewport = canvas.current?.querySelector('.react-flow');
        const readable = viewport && graphWidth && graphHeight
          ? Math.min(viewport.clientWidth / graphWidth, viewport.clientHeight / graphHeight) >= 0.6
          : true;
        if (!readable && entry) await fitView({ nodes: [{ id: entry }], minZoom: 0.7, maxZoom: 0.85, padding: 0.25, duration });
        else await fitView({ ...FIT, duration });
      }
      if (!stale) { fitted.current = key; setViewportReady(true); }
    });
    return () => { stale = true; cancelAnimationFrame(id); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [placed, placedKey, graphKey, topoKey, tick, viewportInitialized]);

  const nodes = useMemo<Node<StateNodeData>[]>(
    () =>
      placed ? names.filter((name) => placed.nodes.has(name)).map((name) => ({
        id: name,
        type: 'state',
        position: placed.nodes.get(name)!,
        ...sizes.get(name)!,
        draggable: false,
        data: {
          name, description: layout[name]?.description ?? '', prompt: promptName(name), entry: name === analysis.states[0], terminal: !hasOut.has(name), unreachable: unreachable.has(name),
          selected: selected?.type === 'node' && selected.name === name,
          expanded: expandedNodes.get(name),
        },
      })) : [],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [placed, names, sizes, layout, prompts, analysis.states, hasOut, unreachable, selected, expandedNodes],
  );

  const edges = useMemo<Edge<TransitionEdgeData>[]>(() => {
    if (!placed) return [];
    return analysis.edges.flatMap((e) => {
      const route = placed.edges.get(e.id);
      if (!route) return [];
      const sel = selected?.type === 'edge' && selected.key === e.stepKey;
      const bad = (analysis.issues.get(e.stepKey ?? '') ?? []).some((i) => i.level === 'error');
      return [{
        id: e.id, source: e.from, target: e.to, type: 'transition',
        selected: sel,
        markerEnd: { type: MarkerType.ArrowClosed, color: sel ? 'var(--brand)' : bad ? 'var(--destructive)' : 'var(--faint)' },
        data: {
          stepKey: e.stepKey, card: labels.get(e.id) ?? { title: '', conds: [] }, labelBox: route.label, segments: route.segments,
          bad,
          expanded: expandedEdges.get(e.id),
          onSelect: (key: string) => setSelected({ type: 'edge', key }),
        },
      }];
    });
  }, [placed, analysis, labels, selected, expandedEdges]);

  /** Раскладка автоматическая; layout хранит только множество состояний (в том числе без переходов). */
  const commit = (next: Step[], nextLayout?: Layout) => onChange({ steps: next, layout: nextLayout ?? layout });

  const onConnect = (c: Connection) => {
    if (!c.source || !c.target) return;
    const step = newTransition(c.source, c.target);
    commit([...steps, step]);
    setSelected({ type: 'edge', key: step.key! });
  };
  const parent = selected?.type === 'node' && names.includes(selected.name) ? selected.name : null;
  const addNode = () => {
    const name = uniqueStateName(names, names.length ? `${statePrefix}NEW` : ENTRY_STATE);
    const nextLayout = { ...layout, [name]: { x: 0, y: 0 } };
    // Если выбрано состояние, новое становится дочерним: от выбранного к нему сразу ведёт переход.
    onChange({ steps: parent ? [...steps, newTransition(parent, name)] : steps, layout: nextLayout });
    setSelected({ type: 'node', name });
  };
  const rename = (from: string, raw: string) => {
    const to = raw.trim();
    if (!to || to === from) return;
    if (names.includes(to)) {
      toast.error(`Состояние «${to}» уже есть`);
      return;
    }
    onChange(renameState(steps, layout, from, to));
    setSelected({ type: 'node', name: to });
  };
  const undoable = (message: string, next: { steps: Step[]; layout: Layout }) => {
    const prev = { steps, layout };
    onChange(next);
    toast(message, { action: { label: 'Отменить', onClick: () => onChange(prev) } });
  };
  const removeNode = (name: string) => {
    setSelected(null);
    undoable(`Состояние «${name}» удалено вместе с переходами`, removeState(steps, layout, name));
  };
  const duplicateNode = (source: string) => {
    const { name, ...next } = duplicateState(steps, layout, source);
    undoable(`Создана копия «${name}»`, next);
    setSelected({ type: 'node', name });
  };
  const removeEdge = (key: string) => {
    setSelected(null);
    undoable('Переход удалён', { steps: steps.filter((s) => s.key !== key), layout });
  };
  const patchState = (name: string, p: Partial<StateInfo>) =>
    onChange({ steps, layout: { ...layout, [name]: { ...(layout[name] ?? { x: 0, y: 0 }), ...p } } });
  const patchEdge = (key: string, p: Partial<Step>) => commit(steps.map((s) => (s.key === key ? { ...s, ...p } : s)));

  // Развёрнутая схема занимает весь экран: остаются только холст и панель свойств; Esc сворачивает.
  useEffect(() => {
    if (!wide) return;
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape' && !e.defaultPrevented) setWide(false); };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [wide]);
  const firstExpand = useRef(true);
  useEffect(() => {
    if (firstExpand.current) { firstExpand.current = false; return; }
    const id = requestAnimationFrame(() => fitView({ ...FIT, duration: 200 }));
    return () => cancelAnimationFrame(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wide]);

  const [exporting, setExporting] = useState(false);
  const exportSvg = async () => {
    if (!exportMeta) return;
    setExporting(true);
    try {
      await exportScenarioSvg({ ...exportMeta, intents, prompts, dependencies, entities, keywords });
    } catch {
      toast.error('Не удалось выгрузить схему в SVG');
    } finally {
      setExporting(false);
    }
  };

  const isEditingText = (target: EventTarget | null) => target instanceof HTMLElement && !!target.closest('input, textarea, select, [contenteditable]:not([contenteditable="false"]), [role="textbox"], [role="combobox"], [role="dialog"]');

  const selectedStep = selected?.type === 'edge' ? steps.find((s) => s.key === selected.key) : undefined;
  const orphans = steps.filter((s) => !s.state.trim());

  const inspector = (
    <>
      {selected?.type === 'node' && (
        <NodePanel
          key={selected.name}
          name={selected.name}
          info={layout[selected.name]}
          prompts={prompts}
          onPatchInfo={(p) => patchState(selected.name, p)}
          isEntry={selected.name === analysis.states[0]}
          isTerminal={!hasOut.has(selected.name)}
          entryName={ENTRY_STATE}
          onRename={(to) => rename(selected.name, to)}
          onDuplicate={() => duplicateNode(selected.name)}
          onRemove={() => removeNode(selected.name)}
        />
      )}
      {selectedStep && (
        <EdgePanel
          key={selectedStep.key}
          step={selectedStep}
          steps={steps}
          states={names}
          descriptions={Object.fromEntries(names.map((n) => [n, layout[n]?.description ?? '']))}
          intents={intents}
          dependencies={dependencies}
          entities={entities}
          issues={analysis.issues.get(selectedStep.key ?? '') ?? []}
          targetPrompt={promptName(splitNext(selectedStep.next_states)[0] ?? '')}
          onSelectState={(name) => setSelected({ type: 'node', name })}
          onPatch={(p) => patchEdge(selectedStep.key!, p)}
          onCreateConditionStates={() => {
            try {
              const { count, ...next } = createConditionStates(steps, layout, selectedStep.key!, dependencies, entities, keywords, statePrefix);
              if (!count) return;
              undoable(`Создано состояний: ${count}`, next);
            } catch (error) {
              toast.error(error instanceof Error ? error.message : 'Не удалось создать состояния');
            }
          }}
          onRemove={() => removeEdge(selectedStep.key!)}
        />
      )}
      {!selected && showPart && partPanel}
      {!selected && !showPart && (
        <div className="space-y-2 text-sm">
          {!names.length && <p className="font-medium">Схема пока пуста</p>}
          <p className="text-muted-foreground">
            {names.length ? 'Выберите состояние или переход на схеме, чтобы изменить его.' : 'Добавьте первое состояние кнопкой «Состояние».'}
          </p>
          {unreachable.size > 0 && <p className="text-destructive">Недостижимых состояний: {unreachable.size}</p>}
        </div>
      )}
      {orphans.length > 0 && (
        <div className="mt-4 border-t pt-3">
          <p className="mb-1 text-xs font-medium text-destructive">Строки без состояния ({orphans.length}) — их нет на схеме</p>
          <ul className="space-y-1">
            {orphans.map((s) => (
              <li key={s.key}>
                <button type="button" className="min-h-8 w-full truncate rounded bg-muted px-2 py-1 text-left text-sm hover:bg-muted/70" onClick={() => setSelected({ type: 'edge', key: s.key! })}>
                  {edgeText(s)}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </>
  );

  return (
    <PropertiesLayout wide={wide} inspector={inspector}>
      <div
        ref={canvas} tabIndex={0} role="region" aria-label="Редактор схемы"
        onPointerDownCapture={(e) => {
          const target = e.target as HTMLElement;
          if (target.closest('.react-flow') && !target.closest('input, textarea, button, [contenteditable="true"]')) canvas.current?.focus({ preventScroll: true });
        }}
        onCopyCapture={(e) => {
          if (isEditingText(e.target) || selected?.type !== 'node') return;
          e.preventDefault();
          e.clipboardData.setData('text/plain', writeStateClipboard(selected.name, layout[selected.name]));
        }}
        onPasteCapture={(e) => {
          if (isEditingText(e.target)) return;
          const copied = readStateClipboard(e.clipboardData.getData('text/plain'));
          if (!copied) return;
          e.preventDefault();
          const { name, ...next } = pasteState(copied, steps, layout);
          undoable(`Вставлено состояние «${name}»`, next);
          setSelected({ type: 'node', name });
        }}
        onKeyDownCapture={(e) => {
          if (!e.defaultPrevented && !e.ctrlKey && !e.metaKey && !e.altKey && !e.shiftKey && !e.nativeEvent.isComposing && !isEditingText(e.target) && selected?.type === 'node' && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
            e.preventDefault();
            e.stopPropagation();
            if (!placed || placedKey !== `${graphKey}:${tick}`) return;
            const nextLayout = moveStateOrder(layout, placed, selected.name, e.key === 'ArrowUp' ? -1 : 1);
            if (nextLayout) onChange({ steps, layout: nextLayout });
            return;
          }
          if (e.defaultPrevented || e.key !== 'Delete' || e.ctrlKey || e.metaKey || e.altKey || e.shiftKey || e.repeat || e.nativeEvent.isComposing || isEditingText(e.target) || selected?.type !== 'node') return;
          e.preventDefault();
          e.stopPropagation();
          removeNode(selected.name);
        }}
        className={cn('flex min-w-0 flex-col overflow-hidden rounded-xl border bg-card focus-visible:outline-2 focus-visible:outline-ring', wide ? 'h-full min-h-0' : 'h-[65dvh] min-h-80 lg:h-full')}>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b px-2 py-1.5">
          <Button size="sm" onClick={addNode}><Plus className="size-4" /> Состояние</Button>
          {exportMeta && (
            <Button variant="outline" size="sm" onClick={exportSvg} disabled={exporting} title="Скачать все вкладки сценария в SVG">
              <Download className="size-4" /> SVG
            </Button>
          )}
          <Button variant="outline" size="sm" aria-pressed={expanded} onClick={() => { setExpanded((value) => !value); setTick((value) => value + 1); }}><PanelsTopLeft className="size-4" /> {expanded ? 'Свернуть блоки' : 'Развернуть блоки'}</Button>
          {tabs}
          <div className="ml-auto flex items-center gap-2">
            <ZoomControls />
            <Button variant="outline" size="sm" onClick={() => setWide(!wide)} aria-pressed={wide} title={wide ? 'Свернуть схему (Esc)' : 'Развернуть схему на весь экран'}>
              {wide ? <Shrink className="size-4" /> : <Expand className="size-4" />} {wide ? 'Свернуть' : 'Развернуть'}
            </Button>
          </div>
        </div>
        <div className="relative min-h-0 flex-1 bg-background">
          {placed ? <ReactFlow
            style={{ opacity: viewportReady ? 1 : 0, pointerEvents: viewportReady ? 'auto' : 'none' }}
            nodes={nodes}
            edges={edges}
            nodeTypes={nodeTypes}
            edgeTypes={edgeTypes}
            nodesDraggable={false}
            onConnect={onConnect}
            onNodeClick={(_, n) => setSelected({ type: 'node', name: n.id })}
            onEdgeClick={(_, e) => e.data?.stepKey && setSelected({ type: 'edge', key: e.data.stepKey })}
            onPaneClick={() => setSelected(null)}
            deleteKeyCode={null}
            nodesFocusable
            minZoom={0.15}
            maxZoom={1.6}
            proOptions={{ hideAttribution: true }}
          >
            <Background gap={22} size={1} color="var(--border)" />
          </ReactFlow> : <p className="p-4 text-sm text-muted-foreground">Раскладываю схему…</p>}
          {placed && !viewportReady && <p role="status" className="absolute inset-0 p-4 text-sm text-muted-foreground">Подготовка схемы…</p>}
        </div>
        <p className="border-t px-3 py-1.5 text-xs text-muted-foreground md:hidden">Для редактирования схемы удобнее экран шире 900px; панорама и зум работают пальцами.</p>
      </div>
    </PropertiesLayout>
  );
}

/** Размер узла: ширина по имени; высота — метка, имя, подпись (до двух строк) и промпт. */
function nodeSize(name: string, description: string, prompt: string, tagged: boolean): { width: number; height: number } {
  const width = Math.min(260, Math.max(140, Math.round(Math.max(name.length, prompt.length) * 7.8 + 28)));
  const text = description.trim();
  const perLine = Math.max(10, Math.floor((width - 24) / 6.4));
  const lines = text ? Math.min(2, text.split(/\r?\n/).reduce((n, l) => n + Math.max(1, Math.ceil(l.length / perLine)), 0)) : 0;
  return { width, height: 16 + 16 + (tagged ? 12 : 0) + lines * 16 + (prompt ? 16 : 0) };
}

const CHAR_W = 7.3;
/** Пилюля перехода: одна строка — интент и число условий. */
function labelSize(card: EdgeCard | undefined): { width: number; height: number } | null {
  if (!card || (!card.title && !card.conds.length)) return null;
  const extra = card.conds.length ? 62 : 0;
  return { width: Math.min(300, Math.ceil(card.title.length * CHAR_W) + 24 + extra), height: 26 };
}
