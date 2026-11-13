import { useLayoutEffect, type RefObject } from "react";
import { useVaultChrome } from "./use-vault-chrome";

/** Reserve the native frame inset before any asynchronously loaded toolbar. */
export function alignVaultHeaderFrame(root: HTMLElement) {
  const view = root.ownerDocument.defaultView!;
  const frameTop = parseFloat(view.getComputedStyle(root).getPropertyValue("--bb-window-frame-top"));
  // The native page title bar ends with a 1px seam. Its frame offset is
  // available on mount, without waiting for the page's file data or DOM.
  const offset = frameTop + 1 - root.getBoundingClientRect().top;
  if (frameTop > 0 && Math.abs(offset) <= 48) {
    const value = `${offset}px`;
    if (root.style.getPropertyValue("--vault-header-offset") !== value) root.style.setProperty("--vault-header-offset", value);
  } else root.style.removeProperty("--vault-header-offset");
}

export function useVaultHeaderAlignment(root: RefObject<HTMLElement | null>) {
  const { device } = useVaultChrome();
  useLayoutEffect(() => {
    const element = root.current;
    if (!element || device !== "desktop") return;
    const measure = () => alignVaultHeaderFrame(element);
    measure();
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(measure);
    observer?.observe(element);
    window.addEventListener("resize", measure);
    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", measure);
      element.style.removeProperty("--vault-header-offset");
    };
  }, [root, device]);
}
