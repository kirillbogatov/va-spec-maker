import { describe, expect, it } from 'vitest';
import { layoutStateGraph } from '@/lib/elkLayout';
import { moveStateOrder } from './stateOrder';

const nodes = ['START', 'A', 'B', 'C'].map((id) => ({ id, width: 160, height: 60 }));
const edges = ['A', 'B', 'C'].map((target) => ({ id: target, source: 'START', target, label: { width: 180, height: 40 } }));
describe('перестановка состояний', () => {
  it('меняет соседей в одном слое и перестраивает маршруты без смены переходов', async () => {
    const before = await layoutStateGraph(nodes, edges);
    expect(before.layers.get('A')).toBe(before.layers.get('B'));
    expect(before.layers.get('START')).not.toBe(before.layers.get('B'));
    const siblings = ['A', 'B', 'C'].sort((a, b) => before.nodes.get(a)!.y - before.nodes.get(b)!.y);
    const selected = siblings[1];
    const layout = moveStateOrder({}, before, selected, -1)!;
    expect(layout).not.toBeNull();
    const after = await layoutStateGraph(nodes.map((n) => ({ ...n, order: layout[n.id].order })), edges);
    expect(after.nodes.get(selected)!.y).toBeLessThan(after.nodes.get(siblings[0])!.y);
    expect(after.edges.size).toBe(edges.length);
    expect(moveStateOrder({}, before, siblings[0], -1)).toBeNull();
    expect(moveStateOrder({}, before, 'START', 1)).toBeNull();
  });
});
