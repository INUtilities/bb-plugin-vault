/** Screen-pixel hit radius around a projected node, shared by hover and click. */
export function graphNodeHitRadius(nodeRadius: number, largeHit = false): number {
  return Math.max(nodeRadius + (largeHit ? 12 : 8), largeHit ? 28 : 18);
}
