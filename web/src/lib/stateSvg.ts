import { BW, CW, stateBox, edgeBox, type Measure } from './schemeSvg';

/** Развёрнутый редактор использует ту же отрисовку и измерение текста, что экспорт этой версии приложения. */
let context: CanvasRenderingContext2D | null = null;
const measure: Measure = (text, font) => {
  context ??= document.createElement('canvas').getContext('2d');
  if (!context) return text.length * 7;
  context.font = font;
  return context.measureText(text).width;
};
export const BLOCK_W = BW;
export const CARD_W = CW;
export function stateBlock(scheme: {
  entry: string | undefined; unreachable: Set<string>; hasOut: Set<string>;
  info: Record<string, { description?: string; system_action?: string }>;
  promptOf: (name: string) => { name: string; text: string } | null;
}, name: string, number: number) {
  const box = stateBox(measure, { name, number,
    tag: scheme.unreachable.has(name) ? 'unreachable' : scheme.entry === name ? 'start' : !scheme.hasOut.has(name) ? 'end' : null,
    description: scheme.info[name]?.description ?? '', action: scheme.info[name]?.system_action ?? '', prompt: scheme.promptOf(name),
  });
  return { h: box.height, svg: box.svg(0, 0) };
}
export function transitionCard(card: { title: string; conds: string[]; any: boolean; bad: boolean; example?: string }, number: number) {
  const box = edgeBox(measure, { id: '', from: '', to: '', number, intent: card.title, conds: card.conds, mode: card.any ? 'any' : 'all', example: card.example ?? '' });
  return { h: box.height, svg: box.svg(0, 0) };
}
