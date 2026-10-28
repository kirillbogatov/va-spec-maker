import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Background, MarkerType, ReactFlow, ReactFlowProvider, useReactFlow, useViewport, type Connection, type Edge, type Node } from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { LayoutDashboard, Maximize, Minus, Plus } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { layoutStateGraph, type LayoutResult } from '@/lib/elkLayout';
import { ENTRY_STATE, newTransition, removeState, renameState, uniqueStateName } from '@/lib/fsm';
import { splitNext, type Analysis } from '@/lib/states';
import type { Dependency, EntityListItem, IntentListItem, Layout, PromptListItem, StateInfo, Step } from '@/lib/types';
import { conditionLabel } from '../dependencies';
import { useProjectId } from '@/hooks/project';
import { useKeywords } from '@/lib/keywords';
import { EdgePanel } from './EdgePanel';
import { NodePanel } from './NodePanel';
import { StateNode, TransitionEdge, type EdgeCard, type StateNodeData, type TransitionEdgeData } from './StateNode';

const nodeTypes = { state: StateNode };
const edgeTypes = { transition: TransitionEdge };

type Selection = { type: 'node'; name: string } | { type: 'edge'; key: string } | null;

interface Props {
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
}

/** Параметры «вписать»: небольшие поля, текст остаётся читаемым, пока схема помещается. */
const FIT = { padding: 0.08, minZoom: 0.2, maxZoom: 1 } as const;

/** Редактор конечного автомата: узлы — состояния, рёбра — строки Transition table. */
export function StateEditor(props: Props) {
  return <ReactFlowProvider><StateEditorInner {...props} /></ReactFlowProvider>;
}

/** Зум и «Вписать» в панели инструментов. */
function ZoomControls() {
  const { zoomIn, zoomOut, fitView } = useReactFlow();
  const { zoom } = useViewport();
  return (
    <div className="flex items-center gap-0.5">
      <Button variant="ghost" size="icon" aria-label="Уменьшить" onClick={() => zoomOut({ duration: 150 })}><Minus className="size-4" /></Button>
      <span className="w-11 text-center text-xs tabular-nums text-muted-foreground">{Math.round(zoom * 100)}%</span>
      <Button variant="ghost" size="icon" aria-label="Увеличить" onClick={() => zoomIn({ duration: 150 })}><Plus className="size-4" /></Button>
      <Button variant="outline" size="sm" onClick={() => fitView({ ...FIT, duration: 200 })}><Maximize className="size-4" /> Вписать</Button>
    </div>
  );
}

function StateEditorInner({ steps, layout, analysis, intents, prompts, dependencies, entities, onChange, partPanel, showPart, tabs, onSelectElement, focusState }: Props) {
  const keywords = useKeywords(useProjectId());
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

  const intentTitle = (s: Step) => intents.find((i) => i.id === s.intent_id)?.name ?? 'без интента';
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
  const sizes = useMemo(
    () => new Map(names.map((n) => [n, nodeSize(n, layout[n]?.description ?? '', promptName(n), n === analysis.states[0] || !hasOut.has(n) || unreachable.has(n))])),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [names, layout, prompts, analysis.states, hasOut, unreachable],
  );
  const graphKey = JSON.stringify([names.map((n) => [n, sizes.get(n)]), analysis.edges.map((e) => [e.id, e.from, e.to, labels.get(e.id)])]);
  const [placed, setPlaced] = useState<LayoutResult | null>(null);
  const [tick, setTick] = useState(0);
  const { fitView } = useReactFlow();
  useEffect(() => {
    let stale = false;
    layoutStateGraph(
      names.map((n) => ({ id: n, ...sizes.get(n)! })),
      analysis.edges.map((e) => ({ id: e.id, source: e.from, target: e.to, label: labelSize(labels.get(e.id)) })),
    ).then((r) => { if (!stale) setPlaced(r); }, () => { if (!stale) toast.error('Не удалось разложить схему'); });
    return () => { stale = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [graphKey, tick]);

  // Вписываем схему после первой раскладки, при смене набора состояний и переходов и по «Расставить»; правка текста масштаб не трогает.
  const topoKey = JSON.stringify([names, analysis.edges.map((e) => [e.id, e.from, e.to])]);
  const fitted = useRef('');
  useEffect(() => {
    if (!placed) return;
    const key = `${topoKey}:${tick}`;
    if (fitted.current === key) return;
    fitted.current = key;
    const id = requestAnimationFrame(() => {
      // На узком экране вся схема нечитаема: показываем крупно входное состояние, «Вписать» вернёт общий вид.
      const entry = analysis.states[0];
      if (window.matchMedia('(max-width: 639px)').matches && names.length > 3 && entry) fitView({ nodes: [{ id: entry }], minZoom: 0.7, maxZoom: 0.8, padding: 0.3, duration: 0 });
      else fitView({ ...FIT, duration: 200 });
    });
    return () => cancelAnimationFrame(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [placed, topoKey, tick]);

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
        },
      })) : [],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [placed, names, sizes, layout, prompts, analysis.states, hasOut, unreachable, selected],
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
          onSelect: (key: string) => setSelected({ type: 'edge', key }),
        },
      }];
    });
  }, [placed, analysis, labels, selected]);

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
    const name = uniqueStateName(names, names.length ? 'ST_NEW' : ENTRY_STATE);
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
  const removeEdge = (key: string) => {
    setSelected(null);
    undoable('Переход удалён', { steps: steps.filter((s) => s.key !== key), layout });
  };
  const patchState = (name: string, p: Partial<StateInfo>) =>
    onChange({ steps, layout: { ...layout, [name]: { ...(layout[name] ?? { x: 0, y: 0 }), ...p } } });
  const patchEdge = (key: string, p: Partial<Step>) => commit(steps.map((s) => (s.key === key ? { ...s, ...p } : s)));

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
          onRemove={() => removeNode(selected.name)}
          onClose={() => setSelected(null)}
        />
      )}
      {selectedStep && (
        <EdgePanel
          key={selectedStep.key}
          step={selectedStep}
          states={names}
          descriptions={Object.fromEntries(names.map((n) => [n, layout[n]?.description ?? '']))}
          intents={intents}
          dependencies={dependencies}
          entities={entities}
          issues={analysis.issues.get(selectedStep.key ?? '') ?? []}
          targetPrompt={promptName(splitNext(selectedStep.next_states)[0] ?? '')}
          onSelectState={(name) => setSelected({ type: 'node', name })}
          onPatch={(p) => patchEdge(selectedStep.key!, p)}
          onRemove={() => removeEdge(selectedStep.key!)}
          onClose={() => setSelected(null)}
        />
      )}
      {!selected && showPart && partPanel}
      {!selected && !showPart && (
        <div className="space-y-2 text-sm">
          <p className="font-medium tabular-nums">{names.length ? `Состояний: ${names.length}, переходов: ${analysis.edges.length}` : 'Схема пока пуста'}</p>
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
    <div className="grid gap-3 lg:h-[calc(100dvh-10rem)] lg:min-h-[28rem] lg:grid-cols-[minmax(0,1fr)_290px]">
      <div className="flex h-[65dvh] min-h-80 min-w-0 flex-col overflow-hidden rounded-xl border bg-card lg:h-full">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b px-2 py-1.5">
          <Button size="sm" onClick={addNode}><Plus className="size-4" /> {parent ? 'Дочернее состояние' : 'Состояние'}</Button>
          <Button variant="outline" size="sm" onClick={() => setTick((t) => t + 1)}><LayoutDashboard className="size-4" /> Расставить</Button>
          {tabs}
          <div className="ml-auto"><ZoomControls /></div>
        </div>
        <div className="relative min-h-0 flex-1 bg-background">
          {placed ? <ReactFlow
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
        </div>
        <p className="border-t px-3 py-1.5 text-xs text-muted-foreground md:hidden">Для редактирования схемы удобнее экран шире 900px; панорама и зум работают пальцами.</p>
      </div>
      <aside aria-label="Свойства" className="min-w-0 overflow-y-auto rounded-xl border bg-card p-4 lg:h-full">{inspector}</aside>
    </div>
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
