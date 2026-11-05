import { BaseEdge, EdgeLabelRenderer, Handle, Position, type Edge, type EdgeProps, type Node, type NodeProps } from '@xyflow/react';
import { polylinePath, type Pt } from '@/lib/elkLayout';
import { cn } from '@/lib/utils';

export interface StateNodeData extends Record<string, unknown> {
  name: string; description: string; /** Название промпта-ответа состояния. */ prompt: string; entry: boolean; terminal: boolean; unreachable: boolean; selected: boolean;
  expanded?: { svg: string; width: number; height: number };
}

/** Разметка общего SVG-рендерера: пользовательский текст экранируется в stateSvg. */
function ExpandedBlock({ block }: { block: { svg: string; width: number; height: number } }) {
  return <svg className="pointer-events-none block h-full w-full overflow-visible" viewBox={`0 0 ${block.width} ${block.height}`} dangerouslySetInnerHTML={{ __html: block.svg }} />;
}

/** Узел-состояние: метка старта/конца, имя (моно, цвет st), подпись и промпт-ответ. */
export function StateNode({ data }: NodeProps<Node<StateNodeData>>) {
  const tag = data.unreachable ? 'НЕДОСТИЖИМО' : data.entry ? 'СТАРТ' : data.terminal ? 'КОНЕЦ' : '';
  return (
    <div
      className={cn(
        'flex h-full w-full flex-col rounded-[9px] text-left',
        !data.expanded && 'border bg-card px-3 py-2 [&>span]:shrink-0',
        !data.expanded && (data.entry ? 'border-brand' : data.unreachable ? 'border-dashed border-destructive' : data.terminal ? 'border-ent/60' : 'border-st/40'),
        data.selected && 'ring-2 ring-brand',
      )}
      title={data.description ? `${data.name}\n${data.description}` : data.name}
    >
      <Handle type="target" position={Position.Left} />
      {data.expanded ? <ExpandedBlock block={data.expanded} /> : <>
      {tag && (
        <span className={cn('text-[10px] font-semibold uppercase leading-3 tracking-wide', data.unreachable ? 'text-destructive' : data.entry ? 'text-brand' : 'text-ent')}>{tag}</span>
      )}
      <span className="block break-all font-mono text-[13px] font-medium leading-4 text-st">{data.name}</span>
      {data.description && (
        <span className="line-clamp-2 break-words text-xs leading-4 text-muted-foreground" style={{ overflowWrap: 'anywhere' }}>{data.description}</span>
      )}
      {data.prompt && <span className="truncate font-mono text-xs leading-4 text-prm">{data.prompt}</span>}
      </>}
      <Handle type="source" position={Position.Right} />
    </div>
  );
}

/** Содержимое карточки перехода: интент и условия по одному на строку. */
export interface EdgeCard { title: string; conds: string[] }

export interface TransitionEdgeData extends Record<string, unknown> {
  stepKey: string | undefined; card: EdgeCard; bad: boolean;
  /** Линия и рамка подписи посчитаны раскладкой: только горизонтальные и вертикальные отрезки. */
  segments: Pt[][]; labelBox: { x: number; y: number; width: number; height: number } | null;
  onSelect: (key: string) => void;
  expanded?: { svg: string; width: number; height: number };
}

/** Ребро-переход: ортогональная ломаная и синяя пилюля с интентом; условия — в подсказке и инспекторе. */
export function TransitionEdge({ data, markerEnd, selected }: EdgeProps<Edge<TransitionEdgeData>>) {
  if (!data || data.segments.length === 0) return null;
  const { segments, labelBox, card, bad, stepKey, onSelect } = data;
  return (
    <>
      <BaseEdge
        path={polylinePath(segments)} markerEnd={markerEnd} interactionWidth={20}
        className={cn(selected ? 'stroke-brand' : bad ? 'stroke-destructive' : 'stroke-faint')}
        style={{ strokeWidth: selected ? 2.2 : 1.4 }}
      />
      {labelBox && (
        <EdgeLabelRenderer>
          <button
            type="button" title={[card.title, ...card.conds].join('\n')}
            onClick={() => stepKey && onSelect(stepKey)}
            style={{ transform: `translate(${labelBox.x}px, ${labelBox.y}px)`, width: labelBox.width, height: labelBox.height }}
            className={cn(
              'nodrag nopan pointer-events-auto absolute flex cursor-pointer items-center justify-center font-mono text-xs font-medium focus-visible:outline-2 focus-visible:outline-ring',
              data.expanded ? 'rounded-lg hover:ring-1 hover:ring-int' : 'gap-1 rounded-full px-2.5',
              data.expanded ? selected && 'ring-2 ring-brand' : selected ? 'bg-primary text-primary-foreground' : bad ? 'bg-destructive-bg text-destructive ring-1 ring-destructive' : 'bg-int-bg text-int hover:ring-1 hover:ring-int',
            )}
          >
            {data.expanded ? <ExpandedBlock block={data.expanded} /> : <>
            <span className="truncate">{card.title}</span>
            {card.conds.length > 0 && <span className="shrink-0 font-sans font-normal opacity-80">· {card.conds.length} усл.</span>}
            </>}
          </button>
        </EdgeLabelRenderer>
      )}
    </>
  );
}
