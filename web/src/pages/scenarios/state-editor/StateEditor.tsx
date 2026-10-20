import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Background, Controls, MarkerType, ReactFlow, type Connection, type Edge, type Node } from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { useQuery } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import { toast } from 'sonner';
import { Section } from '@/components/Section';
import { useProjectId } from '@/hooks/project';
import { api } from '@/lib/api';
import { layoutStateGraph, type LayoutResult } from '@/lib/elkLayout';
import { ENTRY_STATE, newTransition, removeState, renameState, uniqueStateName } from '@/lib/fsm';
import { splitNext, type Analysis } from '@/lib/states';
import type { Dependency, EntityListItem, IntentListItem, Layout, PromptListItem, StateInfo, Step } from '@/lib/types';
import { conditionLabel } from '../dependencies';
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
  /** Вкладки сценария — в той же карточке, над схемой. */
  tabs?: ReactNode;
  /** Выбран узел или переход — панель вкладки уступает место. */
  onSelectElement?: () => void;
}

/** Редактор конечного автомата: узлы — состояния, рёбра — строки Transition table. */
export function StateEditor({ steps, layout, analysis, intents, prompts, dependencies, entities, onChange, partPanel, showPart, tabs, onSelectElement }: Props) {
  const [selected, setSelectedRaw] = useState<Selection>(null);
  const setSelected = (s: Selection) => {
    setSelectedRaw(s);
    if (s) onSelectElement?.();
  };
  useEffect(() => { if (showPart) setSelectedRaw(null); }, [showPart]);
  const projectId = useProjectId();
  const { data: codes = [] } = useQuery({ queryKey: ['result-codes', projectId], queryFn: () => api.resultCodes.list(projectId) });
  const resultCodes = useMemo(() => codes.map((c) => c.name), [codes]);

  const names = useMemo(() => {
    const out = [...analysis.states];
    for (const e of analysis.edges) if (!out.includes(e.to)) out.push(e.to);
    for (const k of Object.keys(layout)) if (!out.includes(k)) out.push(k);
    return out;
  }, [analysis, layout]);

  const edgeText = (s: Step) => {
    const intent = (s.any_intent ? 'Любой интент' : intents.find((i) => i.id === s.intent_id)?.name) ?? 'без интента';
    const conds = [...s.conditions.map((c) => conditionLabel(c, dependencies, entities)), ...s.condition.split('\n').map((l) => l.trim())].filter(Boolean);
    const to = splitNext(s.next_states)[0];
    const text = conds.length ? `${intent} [${conds.join(', ')}]` : intent;
    return to ? `${text} → ${to}` : text;
  };
  /** Карточка перехода: интент и по строке на каждое условие. */
  const edgeCard = (s: Step): EdgeCard => ({
    title: (s.any_intent ? 'Любой интент' : intents.find((i) => i.id === s.intent_id)?.name) ?? 'без интента',
    conds: [...s.conditions.map((c) => conditionLabel(c, dependencies, entities)), ...s.condition.split('\n').map((l) => l.trim())].filter(Boolean),
  });

  const hasOut = useMemo(() => new Set(analysis.edges.map((e) => e.from)), [analysis.edges]);
  const unreachable = useMemo(() => new Set(analysis.unreachable), [analysis.unreachable]);

  // Подписи рёбер и размеры узлов определяют раскладку; выделение на неё не влияет.
  const labels = useMemo(
    () => new Map<string, EdgeCard>(analysis.edges.map((e) => [e.id, (() => { const st = steps.find((s) => s.key === e.stepKey); return st ? edgeCard(st) : { title: e.label, conds: [] }; })()])),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [analysis.edges, steps, intents, dependencies, entities],
  );
  const sizes = useMemo(() => new Map(names.map((n) => [n, nodeSize(n, layout[n]?.description ?? '')])), [names, layout]);
  const graphKey = JSON.stringify([names.map((n) => [n, sizes.get(n)]), analysis.edges.map((e) => [e.id, e.from, e.to, labels.get(e.id)])]);
  const [placed, setPlaced] = useState<LayoutResult | null>(null);
  useEffect(() => {
    let stale = false;
    layoutStateGraph(
      names.map((n) => ({ id: n, ...sizes.get(n)! })),
      analysis.edges.map((e) => ({ id: e.id, source: e.from, target: e.to, label: labelSize(labels.get(e.id)) })),
    ).then((r) => { if (!stale) setPlaced(r); }, () => { if (!stale) toast.error('Не удалось разложить схему'); });
    return () => { stale = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [graphKey]);

  const nodes = useMemo<Node<StateNodeData>[]>(
    () =>
      placed ? names.filter((name) => placed.nodes.has(name)).map((name) => ({
        id: name,
        type: 'state',
        position: placed.nodes.get(name)!,
        ...sizes.get(name)!,
        draggable: false,
        data: {
          name, description: layout[name]?.description ?? '', entry: name === analysis.states[0], terminal: !hasOut.has(name), unreachable: unreachable.has(name),
          selected: selected?.type === 'node' && selected.name === name,
        },
      })) : [],
    [placed, names, sizes, layout, analysis.states, hasOut, unreachable, selected],
  );

  const edges = useMemo<Edge<TransitionEdgeData>[]>(() => {
    if (!placed) return [];
    return analysis.edges.flatMap((e) => {
      const route = placed.edges.get(e.id);
      if (!route) return [];
      return [{
        id: e.id, source: e.from, target: e.to, type: 'transition',
        selected: selected?.type === 'edge' && selected.key === e.stepKey,
        markerEnd: { type: MarkerType.ArrowClosed },
        data: {
          stepKey: e.stepKey, card: labels.get(e.id) ?? { title: '', conds: [] }, labelBox: route.label, segments: route.segments,
          bad: (analysis.issues.get(e.stepKey ?? '') ?? []).some((i) => i.level === 'error'),
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

  return (
    <Section>
      {tabs}
      <div className="mb-3 flex items-start justify-between gap-4">
        <h2 className="text-lg font-semibold">Схема переходов</h2>
        <button type="button" onClick={addNode} className="inline-flex shrink-0 items-center gap-1.5 text-sm text-brand hover:underline">
          <Plus className="size-4" /> {parent ? 'Добавить дочернее состояние' : 'Добавить состояние'}
        </button>
      </div>
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="h-[65vh] min-h-96 overflow-hidden rounded-md border bg-background">
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
            fitView
            proOptions={{ hideAttribution: true }}
          >
            <Background />
            <Controls showInteractive={false} />
          </ReactFlow> : <p className="p-4 text-sm text-muted-foreground">Раскладываю схему…</p>}
        </div>
        <div className="min-w-0 rounded-md border p-4">
          {selected?.type === 'node' && (
            <NodePanel
              key={selected.name}
              name={selected.name}
              info={layout[selected.name]}
              prompts={prompts}
              resultCodes={resultCodes}
              onPatchInfo={(p) => patchState(selected.name, p)}
              isEntry={selected.name === analysis.states[0]}
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
              intents={intents}
              dependencies={dependencies}
              entities={entities}
              issues={analysis.issues.get(selectedStep.key ?? '') ?? []}
              onSelectState={(name) => setSelected({ type: 'node', name })}
              onPatch={(p) => patchEdge(selectedStep.key!, p)}
              onRemove={() => removeEdge(selectedStep.key!)}
              onClose={() => setSelected(null)}
            />
          )}
          {!selected && showPart && partPanel}
          {!selected && !showPart && <p className="text-sm text-muted-foreground">Выберите состояние или переход на схеме, чтобы изменить его; название и описание вкладки — по клику на вкладку.</p>}
          {orphans.length > 0 && (
            <div className="mt-4 border-t pt-3">
              <p className="mb-1 text-xs font-medium text-destructive">Строки без состояния ({orphans.length}) — их нет на схеме</p>
              <ul className="space-y-1">
                {orphans.map((s) => (
                  <li key={s.key}>
                    <button type="button" className="w-full truncate rounded bg-muted px-2 py-1 text-left text-sm hover:bg-muted/70" onClick={() => setSelected({ type: 'edge', key: s.key! })}>
                      {edgeText(s)}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>
    </Section>
  );
}

const NODE_LINE_H = 14;
const NODE_MAX_LINES = 4;
/** Размер узла: ширина по имени, высота растёт с описанием (на схеме — не больше четырёх строк). */
function nodeSize(name: string, description: string): { width: number; height: number } {
  const width = Math.min(360, Math.max(190, name.length * 8 + 32));
  const text = description.trim();
  if (!text) return { width, height: 44 };
  const perLine = Math.max(10, Math.floor((width - 24) / 5.6));
  const lines = Math.min(NODE_MAX_LINES, text.split(/\r?\n/).reduce((n, l) => n + Math.max(1, Math.ceil(l.length / perLine)), 0));
  return { width, height: 44 + 4 + lines * NODE_LINE_H };
}

const LABEL_MAX = 300;
const LABEL_MIN = 120;
const CHAR_W = 6.8;
const LINE_H = 16;
/** Размер карточки: ширина по самой длинной строке, строки переносятся по словам, высота — с запасом. */
function labelSize(card: EdgeCard | undefined): { width: number; height: number } | null {
  if (!card || (!card.title && !card.conds.length)) return null;
  const rows = [card.title, ...card.conds];
  const width = Math.min(LABEL_MAX, Math.max(LABEL_MIN, Math.ceil(Math.max(...rows.map((t) => t.length)) * CHAR_W) + 24));
  const perLine = Math.floor((width - 24) / CHAR_W);
  const lines = rows.reduce((n, t) => n + Math.max(1, Math.ceil(t.length / perLine)), 0);
  return { width, height: lines * LINE_H + 14 + (card.conds.length ? 4 : 0) };
}
