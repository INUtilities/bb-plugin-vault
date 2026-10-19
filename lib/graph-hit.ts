/** Screen-pixel hit radius around a projected node (hover and click share this). */
export function graphNodeHitRadius(nodeRadius: number, largeHit = false): number {
  // Visible dots are ~1–3.2px; floor dominates so a near miss still counts.
  // Padding grows with drawn radius when zoom/size ever exceeds the floor.
  const padding = largeHit ? 12 : 8;
  const floor = largeHit ? 28 : 18;
  return Math.max(nodeRadius + padding, floor);
}
