/** Пометка в углу экрана для live-демо. */
export function DemoBadge() {
  return (
    <div className="pointer-events-none fixed bottom-16 right-2 z-50 max-w-[calc(100vw-1rem)] rounded-md border bg-background/90 px-2.5 py-1 text-[11px] text-muted-foreground shadow-sm backdrop-blur md:bottom-3 md:right-3">
      <b className="font-semibold text-foreground">Live-демо.</b> Данные сохраняются только для текущей сессии
    </div>
  );
}
