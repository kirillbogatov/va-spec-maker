import ELK from 'elkjs/lib/elk.bundled.js';

export interface LayoutNodeIn { id: string; width: number; height: number }
export interface LayoutEdgeIn { id: string; source: string; target: string; label: { width: number; height: number } | null }
export interface Pt { x: number; y: number }
export interface LayoutResult {
  nodes: Map<string, Pt>;
  /**
   * Линия перехода в координатах схемы: ломаные только из горизонтальных и вертикальных отрезков.
   * С карточкой — два участка (до карточки и от неё); сама карточка лежит между ними.
   */
  edges: Map<string, { segments: Pt[][]; label: (Pt & { width: number; height: number }) | null }>;
}

const elk = new ELK();

/** Убирает точки, лежащие на одной прямой, и нулевые отрезки. */
export function simplify(points: Pt[]): Pt[] {
  const out: Pt[] = [];
  for (const p of points) {
    const last = out.at(-1);
    if (last && last.x === p.x && last.y === p.y) continue;
    out.push(p);
  }
  return out.filter((p, i) => {
    const a = out[i - 1];
    const b = out[i + 1];
    if (!a || !b) return true;
    return !((a.x === p.x && p.x === b.x) || (a.y === p.y && p.y === b.y));
  });
}

/**
 * Слоистая раскладка слева направо с ортогональной маршрутизацией рёбер (ELK).
 * Карточка перехода — полноценный узел между состояниями (источник → карточка → цель):
 * карточки не могут перекрываться, а рёбра из одного состояния ELK сливает в общий ствол
 * (mergeEdges), так что из узла выходит одна линия, а не веер.
 */
export async function layoutStateGraph(nodes: LayoutNodeIn[], edges: LayoutEdgeIn[]): Promise<LayoutResult> {
  const cardId = (id: string) => `card:${id}`;
  const children = [
    ...nodes.map((n) => ({ id: n.id, width: n.width, height: n.height })),
    ...edges.filter((e) => e.label).map((e) => ({ id: cardId(e.id), width: e.label!.width, height: e.label!.height })),
  ];
  const elkEdges = edges.flatMap((e) =>
    e.label
      ? [
          { id: `${e.id}#a`, sources: [e.source], targets: [cardId(e.id)] },
          { id: `${e.id}#b`, sources: [cardId(e.id)], targets: [e.target] },
        ]
      : [{ id: e.id, sources: [e.source], targets: [e.target] }],
  );
  const graph = await elk.layout({
    id: 'root',
    layoutOptions: {
      'elk.algorithm': 'layered',
      'elk.direction': 'RIGHT',
      'elk.edgeRouting': 'ORTHOGONAL',
      'elk.layered.mergeEdges': 'true',
      'elk.layered.considerModelOrder.strategy': 'NODES_AND_EDGES',
      'elk.layered.crossingMinimization.strategy': 'LAYER_SWEEP',
      'elk.layered.spacing.nodeNodeBetweenLayers': '70',
      'elk.layered.spacing.edgeNodeBetweenLayers': '24',
      'elk.layered.spacing.edgeEdgeBetweenLayers': '14',
      'elk.spacing.nodeNode': '24',
      'elk.spacing.edgeEdge': '14',
      'elk.spacing.edgeNode': '24',
      'elk.padding': '[top=20,left=20,bottom=20,right=20]',
    },
    children,
    edges: elkEdges,
  });

  const result: LayoutResult = { nodes: new Map(), edges: new Map() };
  const boxes = new Map<string, Pt>();
  for (const n of graph.children ?? []) boxes.set(n.id, { x: n.x ?? 0, y: n.y ?? 0 });
  for (const n of nodes) result.nodes.set(n.id, boxes.get(n.id) ?? { x: 0, y: 0 });

  const route = new Map<string, Pt[]>();
  for (const e of graph.edges ?? []) {
    const section = (e as { sections?: { startPoint: Pt; bendPoints?: Pt[]; endPoint: Pt }[] }).sections?.[0];
    if (!section) continue;
    // Округление нужно, чтобы соседние точки одного отрезка не расходились в последнем знаке.
    route.set(e.id, simplify([section.startPoint, ...(section.bendPoints ?? []), section.endPoint].map((p) => ({ x: Math.round(p.x), y: Math.round(p.y) }))));
  }
  for (const e of edges) {
    if (!e.label) {
      const points = route.get(e.id);
      if (points) result.edges.set(e.id, { segments: [points], label: null });
      continue;
    }
    const pos = boxes.get(cardId(e.id));
    const a = route.get(`${e.id}#a`);
    const b = route.get(`${e.id}#b`);
    if (!pos || !a || !b) continue;
    result.edges.set(e.id, { segments: [a, b], label: { x: pos.x, y: pos.y, width: e.label.width, height: e.label.height } });
  }
  return result;
}

/** Путь SVG по ломаной. */
export const polylinePath = (segments: Pt[][]) => segments.map((pts) => pts.map((p, i) => `${i ? 'L' : 'M'}${p.x} ${p.y}`).join(' ')).join(' ');
