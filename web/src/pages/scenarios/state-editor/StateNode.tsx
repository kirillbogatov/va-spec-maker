import { BaseEdge, EdgeLabelRenderer, Handle, Position, type Edge, type EdgeProps, type Node, type NodeProps } from '@xyflow/react';
import { polylinePath, type Pt } from '@/lib/elkLayout';
import { cn } from '@/lib/utils';

export interface StateNodeData extends Record<string, unknown> {
  name: string; description: string; entry: boolean; terminal: boolean; unreachable: boolean; selected: boolean;
}

export function StateNode({ data }: NodeProps<Node<StateNodeData>>) {
  return (
    <div
      className={cn(
        'flex h-full w-full flex-col items-center justify-center rounded-lg border px-3 text-center font-mono text-xs',
        data.entry ? 'border-2 border-brand bg-brand/10' : data.unreachable ? 'border-dashed border-destructive bg-destructive/10' : data.terminal ? 'border-emerald-600 bg-emerald-50' : 'border-border bg-card',
        data.selected && 'ring-2 ring-brand/50',
      )}
      title={data.description ? `${data.name}\n${data.description}` : data.name}
    >
      <Handle type="target" position={Position.Left} />
      <span className="block break-all text-foreground">{data.name}</span>
      {data.description && (
        <span className="mt-0.5 line-clamp-4 break-words font-sans text-[11px] leading-[14px] text-muted-foreground" style={{ overflowWrap: 'anywhere' }}>
          {data.description}
        </span>
      )}
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
}

/** Ребро-переход: ортогональная ломаная, подпись с полным текстом условий; клик по линии или подписи выбирает переход. */
export function TransitionEdge({ data, markerEnd, selected }: EdgeProps<Edge<TransitionEdgeData>>) {
  if (!data || data.segments.length === 0) return null;
  const { segments, labelBox, card, bad, stepKey, onSelect } = data;
  return (
    <>
      <BaseEdge
        path={polylinePath(segments)} markerEnd={markerEnd} interactionWidth={20}
        className={cn(selected ? 'stroke-brand' : bad ? 'stroke-destructive' : 'stroke-muted-foreground')}
        style={{ strokeWidth: selected ? 2 : 1.3 }}
      />
      {labelBox && (
        <EdgeLabelRenderer>
          <div
            role="button" tabIndex={0} title="Изменить переход"
            onClick={() => stepKey && onSelect(stepKey)}
            onKeyDown={(e) => { if ((e.key === 'Enter' || e.key === ' ') && stepKey) onSelect(stepKey); }}
            style={{ transform: `translate(${labelBox.x}px, ${labelBox.y}px)`, width: labelBox.width, minHeight: labelBox.height }}
            className={cn(
              'nodrag nopan pointer-events-auto absolute cursor-pointer whitespace-normal rounded-md border bg-card px-2.5 py-1.5 text-[11px] leading-4 shadow-sm hover:border-brand',
              selected ? 'border-brand ring-2 ring-brand/30' : bad ? 'border-destructive/60' : 'border-border',
            )}
          >
            <div className={cn('break-words font-mono font-medium', selected ? 'text-brand' : 'text-foreground')} style={{ overflowWrap: 'anywhere' }}>{card.title}</div>
            {card.conds.length > 0 && (
              <ul className="mt-1 text-muted-foreground">
                {card.conds.map((c, i) => <li key={i} className="break-words" style={{ overflowWrap: 'anywhere' }}>{c}</li>)}
              </ul>
            )}
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  );
}
