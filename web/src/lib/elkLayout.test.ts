import { describe, expect, it } from 'vitest';
import { layoutStateGraph, simplify } from './elkLayout';

const node = (id: string) => ({ id, width: 190, height: 40 });
const edge = (id: string, source: string, target: string, label = true) => ({ id, source, target, label: label ? { width: 200, height: 40 } : null });

describe('layoutStateGraph', () => {
  it('рёбра ортогональны, параллельные и петли не пропадают', async () => {
    const r = await layoutStateGraph(
      ['A', 'B', 'C', 'D'].map(node),
      [edge('1', 'A', 'B'), edge('2', 'A', 'B'), edge('3', 'A', 'C'), edge('4', 'B', 'D'), edge('5', 'C', 'D'), edge('6', 'D', 'A'), edge('7', 'C', 'C')],
    );
    expect(r.nodes.size).toBe(4);
    expect(r.edges.size).toBe(7);
    for (const e of r.edges.values()) {
      expect(e.segments.length).toBeGreaterThan(0);
      for (const pts of e.segments) {
        expect(pts.length).toBeGreaterThanOrEqual(2);
        for (let i = 1; i < pts.length; i++) {
          const [a, b] = [pts[i - 1], pts[i]];
          expect(a.x === b.x || a.y === b.y).toBe(true);
        }
      }
      expect(e.label).not.toBeNull();
    }
  });
  it('карточки переходов не перекрываются', async () => {
    const ids = Array.from({ length: 8 }, (_, i) => `T${i}`);
    const r = await layoutStateGraph(
      ['S', ...ids].map(node),
      ids.map((t, i) => ({ id: `e${i}`, source: 'S', target: t, label: { width: 180, height: 50 + (i % 3) * 16 } })),
    );
    const boxes = [...r.edges.values()].map((e) => e.label!);
    for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) {
      const [a, b] = [boxes[i], boxes[j]];
      const overlap = a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
      expect(overlap).toBe(false);
    }
  });
  it('рёбра из одного состояния выходят общим стволом', async () => {
    const ids = Array.from({ length: 6 }, (_, i) => `T${i}`);
    const r = await layoutStateGraph(
      ['S', ...ids].map(node),
      ids.map((t, i) => ({ id: `e${i}`, source: 'S', target: t, label: { width: 180, height: 50 } })),
    );
    const starts = new Set([...r.edges.values()].map((e) => `${e.segments[0][0].x},${e.segments[0][0].y}`));
    expect(starts.size).toBe(1);
  });
  it('simplify убирает промежуточные точки на прямой', () => {
    expect(simplify([{ x: 0, y: 0 }, { x: 0, y: 5 }, { x: 0, y: 9 }, { x: 4, y: 9 }])).toEqual([{ x: 0, y: 0 }, { x: 0, y: 9 }, { x: 4, y: 9 }]);
  });
});
