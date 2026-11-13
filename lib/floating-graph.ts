export type CardRect = { x: number; y: number; width: number; height: number };
export type Bounds = { width: number; height: number };
export type Corner = 'nw' | 'ne' | 'sw' | 'se';
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
function limits(size: number) {
  const margin = size >= 24 ? 12 : 0;
  return { start: margin, end: Math.max(margin, size - margin) };
}
export function clampCard(card: CardRect, bounds: Bounds): CardRect {
  const h = limits(bounds.width), v = limits(bounds.height);
  const width = clamp(card.width, 0, h.end - h.start), height = clamp(card.height, 0, v.end - v.start);
  return { x: clamp(card.x, h.start, h.end - width), y: clamp(card.y, v.start, v.end - height), width, height };
}
export function collapsedCard(bounds: Bounds): CardRect {
  return clampCard({ x: 12, y: bounds.height - 48, width: 36, height: 36 }, bounds);
}
export function initialCard(bounds: Bounds): CardRect {
  const side = Math.min(260, limits(bounds.width).end - limits(bounds.width).start, limits(bounds.height).end - limits(bounds.height).start);
  return clampCard({ x: 12, y: bounds.height - side - 12, width: side, height: side }, bounds);
}
export function resizeCard(card: CardRect, bounds: Bounds, corner: Corner, dx: number, dy: number): CardRect {
  const h = limits(bounds.width), v = limits(bounds.height);
  const left = card.x, right = left + card.width, top = card.y, bottom = top + card.height;
  const minWidth = Math.min(160, corner.includes('w') ? right - h.start : h.end - left);
  const minHeight = Math.min(120, corner.includes('n') ? bottom - v.start : v.end - top);
  const x1 = corner.includes('w') ? clamp(left + dx, h.start, right - minWidth) : left;
  const x2 = corner.includes('e') ? clamp(right + dx, left + minWidth, h.end) : right;
  const y1 = corner.includes('n') ? clamp(top + dy, v.start, bottom - minHeight) : top;
  const y2 = corner.includes('s') ? clamp(bottom + dy, top + minHeight, v.end) : bottom;
  return { x: x1, y: y1, width: x2 - x1, height: y2 - y1 };
}
export function documentTooltipIndex(nodes: readonly { path: string }[], activePath: string): number {
  return activePath ? nodes.findIndex(node => node.path === activePath) : -1;
}
