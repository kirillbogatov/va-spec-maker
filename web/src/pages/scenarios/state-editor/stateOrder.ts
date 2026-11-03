import type { LayoutResult } from '@/lib/elkLayout';
import type { Layout } from '@/lib/types';

/** Меняет соседние состояния в одном слое, не меняя переходы и их приоритеты. */
export function moveStateOrder(layout: Layout, placed: LayoutResult, name: string, direction: -1 | 1): Layout | null {
  const layer = placed.layers.get(name);
  if (layer === undefined) return null;
  const siblings = [...placed.nodes.keys()].filter((id) => placed.layers.get(id) === layer)
    .sort((a, b) => placed.nodes.get(a)!.y - placed.nodes.get(b)!.y);
  const index = siblings.indexOf(name);
  const neighbor = siblings[index + direction];
  if (index < 0 || !neighbor) return null;
  const ordered = [...placed.nodes.keys()].sort((a, b) =>
    (placed.layers.get(a)! - placed.layers.get(b)!) || placed.nodes.get(a)!.y - placed.nodes.get(b)!.y);
  const a = ordered.indexOf(name);
  const b = ordered.indexOf(neighbor);
  [ordered[a], ordered[b]] = [ordered[b], ordered[a]];
  const next = { ...layout };
  ordered.forEach((id, order) => { next[id] = { ...(layout[id] ?? { x: 0, y: 0 }), order }; });
  return next;
}
