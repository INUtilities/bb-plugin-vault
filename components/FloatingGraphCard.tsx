import { useLayoutEffect, useRef, useState, type KeyboardEvent, type PointerEvent, type ReactNode } from 'react';
import { Icon } from '@/components/ui/icon';
import { EASE } from '@/lib/kit-motion';
import { graphCornerCursors } from '@/lib/graph-corner';
import { clampCard, initialCard, collapsedCard, resizeCard, type Bounds, type CardRect, type Corner } from '@/lib/floating-graph';

type Handle = Corner | 'move';
const corners: Corner[] = ['nw', 'ne', 'sw', 'se'];

export function FloatingGraphCard({ children, open, onOpenChange }: { children: ReactNode; open: boolean; onOpenChange: (open: boolean) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const focusOnOpen = useRef(false);
  const previousOpen = useRef(open);
  useLayoutEffect(() => {
    if (!previousOpen.current && open && focusOnOpen.current) ref.current?.querySelector<HTMLButtonElement>('[aria-label="그래프 닫기"]')?.focus({ preventScroll: true });
    if (previousOpen.current && !open) buttonRef.current?.focus({ preventScroll: true });
    focusOnOpen.current = false;
    previousOpen.current = open;
  }, [open]);
  const bounds = useRef<Bounds>({ width: 0, height: 0 });
  const [rect, setRect] = useState<CardRect | null>(null);
  const drag = useRef<{ id: number; handle: Handle; x: number; y: number } | null>(null);
  useLayoutEffect(() => {
    const parent = ref.current?.parentElement;
    if (!parent) return;
    const observer = new ResizeObserver(([entry]) => {
      // 숨긴 패널의 0 크기로 카드 상태를 덮어쓰지 않는다.
      if (entry.contentRect.width <= 0 || entry.contentRect.height <= 0) return;
      bounds.current = { width: entry.contentRect.width, height: entry.contentRect.height };
      setRect(current => current ? clampCard(current, bounds.current) : initialCard(bounds.current));
    });
    observer.observe(parent);
    return () => observer.disconnect();
  }, []);
  function change(handle: Handle, dx: number, dy: number) {
    setRect(current => current === null ? null : handle === 'move'
      ? clampCard({ ...current, x: current.x + dx, y: current.y + dy }, bounds.current)
      : resizeCard(current, bounds.current, handle, dx, dy));
  }
  function down(event: PointerEvent<HTMLButtonElement>, handle: Handle) {
    if (event.button !== 0 || !event.isPrimary || drag.current) return;
    event.preventDefault(); event.stopPropagation();
    drag.current = { id: event.pointerId, handle, x: event.clientX, y: event.clientY };
    event.currentTarget.setPointerCapture(event.pointerId);
  }
  function move(event: PointerEvent<HTMLButtonElement>) {
    const current = drag.current;
    if (!current || current.id !== event.pointerId) return;
    event.preventDefault(); event.stopPropagation();
    change(current.handle, event.clientX - current.x, event.clientY - current.y);
    current.x = event.clientX; current.y = event.clientY;
  }
  function end(event: PointerEvent<HTMLButtonElement>) {
    if (drag.current?.id !== event.pointerId) return;
    event.stopPropagation(); drag.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  }
  function key(event: KeyboardEvent<HTMLButtonElement>, handle: Handle) {
    const delta: Record<string, [number, number]> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
    if (!delta[event.key]) return;
    event.preventDefault(); event.stopPropagation();
    const [x, y] = delta[event.key]; change(handle, x * 10, y * 10);
  }
  function handlers(handle: Handle) {
    return { onPointerDown: (event: PointerEvent<HTMLButtonElement>) => down(event, handle), onPointerMove: move, onPointerUp: end, onPointerCancel: end, onLostPointerCapture: end, onKeyDown: (event: KeyboardEvent<HTMLButtonElement>) => key(event, handle), onClick: (event: React.MouseEvent) => { event.preventDefault(); event.stopPropagation(); } };
  }
  const collapsed = collapsedCard(bounds.current);
  return <>
    <div ref={ref} aria-label="그래프" aria-hidden={!open} inert={!open} className="absolute z-10 flex min-h-0 min-w-0 origin-top-left flex-col overflow-hidden rounded-[18px] border border-border/50 bg-background/75 pt-7 shadow-lg backdrop-blur-[14px] backdrop-saturate-[1.25] transition-[transform,opacity] duration-[460ms] motion-reduce:transition-none" style={rect ? {
      left: rect.x, top: rect.y, width: rect.width, height: rect.height, transitionTimingFunction: EASE.out,
      transform: open ? 'none' : `translate(${collapsed.x - rect.x}px, ${collapsed.y - rect.y}px) scale(${collapsed.width / Math.max(1, rect.width)}, ${collapsed.height / Math.max(1, rect.height)})`,
      opacity: open ? 1 : 0,
      pointerEvents: open ? undefined : 'none',
    } : { visibility: 'hidden' }}>
      <div className={`flex min-h-0 min-w-0 flex-1 flex-col transition-opacity duration-200 motion-reduce:transition-none ${open ? 'opacity-100' : 'opacity-0'}`}>{children}</div>
      <button type="button" aria-label="그래프 이동" {...handlers('move')} className="absolute left-1/2 top-0 z-30 flex h-5 w-12 -translate-x-1/2 cursor-grab touch-none items-center justify-center active:cursor-grabbing"><span className="h-1 w-7 rounded-full bg-muted-foreground/60" /></button>
      {corners.map(corner => <button key={corner} type="button" aria-label={`그래프 크기 ${corner}`} {...handlers(corner)} className="absolute z-30 size-5 touch-none" style={{ top: corner.includes('n') ? 0 : undefined, bottom: corner.includes('s') ? 0 : undefined, left: corner.includes('w') ? 0 : undefined, right: corner.includes('e') ? 0 : undefined, cursor: graphCornerCursors[corner] }} />)}
    </div>
    <button ref={buttonRef} type="button" aria-label="파일+그래프 보기" aria-hidden={open} aria-expanded={open} onClick={(event) => { focusOnOpen.current = true; event.currentTarget.blur(); onOpenChange(true); }} tabIndex={open ? -1 : 0} style={{ left: collapsed.x, top: collapsed.y, width: collapsed.width, height: collapsed.height }} className={`absolute z-20 flex items-center justify-center rounded-[18px] border border-border/50 bg-background/75 text-muted-foreground shadow-lg backdrop-blur-[14px] backdrop-saturate-[1.25] transition-opacity duration-200 hover:bg-state-hover hover:text-foreground motion-reduce:transition-none ${open ? 'pointer-events-none opacity-0' : 'opacity-100'}`}>
      <Icon name="GitBranch" className="size-3.5" />
    </button>
  </>;
}
