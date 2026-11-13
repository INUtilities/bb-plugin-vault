/** Measure only our sidebar box; the BB sidebar keeps ownership of its frame. */
export function fitVaultSidebar(root: HTMLElement): () => void {
  const view = root.ownerDocument.defaultView!;
  let container = root.parentElement;
  while (container && view.getComputedStyle(container).display === "contents") container = container.parentElement;
  if (!container) return () => {};
  let viewport = container;
  while (viewport.parentElement && !/auto|scroll|hidden|clip/.test(view.getComputedStyle(viewport).overflowY)) viewport = viewport.parentElement;
  const frame = container;
  const measure = () => {
    const padding = view.getComputedStyle(frame);
    root.style.setProperty("--vault-sidebar-inset-start", padding.paddingInlineStart);
    root.style.setProperty("--vault-sidebar-inset-end", padding.paddingInlineEnd);
    root.style.setProperty("--vault-sidebar-inset-bottom", padding.paddingBottom);
    const bounds = viewport.getBoundingClientRect();
    const bottom = Math.min(view.innerHeight, bounds.top + viewport.clientTop + viewport.clientHeight);
    const top = root.getBoundingClientRect().top + viewport.scrollTop;
    root.style.setProperty("--vault-sidebar-height", `${Math.max(0, bottom - top)}px`);
  };
  measure();
  const observer = new ResizeObserver(measure);
  observer.observe(frame);
  if (viewport !== frame) observer.observe(viewport);
  view.addEventListener("resize", measure);
  return () => { observer.disconnect(); view.removeEventListener("resize", measure); };
}
