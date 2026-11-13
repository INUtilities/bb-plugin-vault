// Copied from BB shared-ui responsive-overlay.tsx: persistent drawer and its dependencies.
import * as React from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";

declare const __BB_PLUGIN_ID__: string | undefined;
function usePortalScopeProps() {
  const pluginId = typeof __BB_PLUGIN_ID__ === "string" ? __BB_PLUGIN_ID__ : undefined;
  return { "data-bb-portaled-overlay": "", "data-bb-plugin-root": "", ...(pluginId !== undefined ? { "data-bb-plugin": pluginId } : {}) };
}

const NON_TEXT_INPUT_TYPES = new Set(["button", "checkbox", "file", "hidden", "image", "radio", "range", "reset", "submit"]);

function isKeyboardInputElement(element: Element): element is HTMLElement {
  if (element instanceof HTMLTextAreaElement) return true;
  if (element instanceof HTMLInputElement) {
    return (
      !element.disabled &&
      !element.readOnly &&
      !NON_TEXT_INPUT_TYPES.has(element.type)
    );
  }
  if (!(element instanceof HTMLElement)) return false;

  return (
    element.isContentEditable ||
    element.closest("[contenteditable='true']") !== null
  );
}

export function blurActiveKeyboardInputWithin(container: Element | null): void {
  if (typeof document === "undefined") return;

  const activeElement = document.activeElement;
  if (!activeElement || !isKeyboardInputElement(activeElement)) return;
  if (container !== null && !container.contains(activeElement)) return;

  activeElement.blur();
}

const DRAWER_KEYBOARD_INSET_PROPERTY = "--bb-drawer-keyboard-inset";
const DRAWER_KEYBOARD_MIN_OVERLAP_PX = 80;

function resetDrawerKeyboardStyles(drawerElement: HTMLElement | null): void {
  if (drawerElement === null) return;

  drawerElement.style.height = "";
  drawerElement.style.bottom = "";
  drawerElement.style.removeProperty(DRAWER_KEYBOARD_INSET_PROPERTY);
}

export function measureDrawerKeyboardOverlap({
  layoutViewportHeight,
  visualViewportHeight,
  visualViewportOffsetTop,
}: {
  layoutViewportHeight: number;
  visualViewportHeight: number;
  visualViewportOffsetTop: number;
}): number {
  const overlap = Math.round(
    layoutViewportHeight - (visualViewportHeight + visualViewportOffsetTop),
  );
  return overlap >= DRAWER_KEYBOARD_MIN_OVERLAP_PX ? overlap : 0;
}

function useDrawerKeyboardInset(
  panelRef: React.RefObject<HTMLElement | null>,
  open: boolean,
): void {
  React.useEffect(() => {
    const panel = panelRef.current;
    const visualViewport = window.visualViewport;
    if (panel === null || !open || !visualViewport) return;

    let animationFrame: number | null = null;
    const applyInset = () => {
      animationFrame = null;
      if (visualViewport.scale !== 1) {
        resetDrawerKeyboardStyles(panel);
        return;
      }
      const overlap = measureDrawerKeyboardOverlap({
        layoutViewportHeight: panel.ownerDocument.documentElement.clientHeight,
        visualViewportHeight: visualViewport.height,
        visualViewportOffsetTop: visualViewport.offsetTop,
      });
      if (overlap === 0) {
        panel.style.bottom = "";
        panel.style.removeProperty(DRAWER_KEYBOARD_INSET_PROPERTY);
        return;
      }
      panel.style.bottom = `${overlap}px`;
      panel.style.setProperty(DRAWER_KEYBOARD_INSET_PROPERTY, `${overlap}px`);
    };
    const scheduleUpdate = () => {
      if (animationFrame !== null) {
        window.cancelAnimationFrame(animationFrame);
      }
      animationFrame = window.requestAnimationFrame(applyInset);
    };

    applyInset();
    visualViewport.addEventListener("resize", scheduleUpdate);
    visualViewport.addEventListener("scroll", scheduleUpdate);

    return () => {
      visualViewport.removeEventListener("resize", scheduleUpdate);
      visualViewport.removeEventListener("scroll", scheduleUpdate);
      if (animationFrame !== null) {
        window.cancelAnimationFrame(animationFrame);
      }
      resetDrawerKeyboardStyles(panel);
    };
  }, [open, panelRef]);
}

type DrawerPointerDownOutsideEvent = CustomEvent<{
  originalEvent: PointerEvent;
}>;

interface DrawerDismissalHandlers {
  onEscapeKeyDown?: (event: KeyboardEvent) => void;
  onPointerDownOutside?: (event: DrawerPointerDownOutsideEvent) => void;
  onInteractOutside?: (event: DrawerPointerDownOutsideEvent) => void;
}

interface PersistentResponsiveDrawerShellProps extends DrawerDismissalHandlers {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  closeOnBackdropClick?: boolean;
  onAfterCloseAutoFocus?: () => void;
  srLabel?: string;
  labelledBy?: string;
  describedBy?: string;
  contentClassName?: string;
  motionDurationMs?: number;
  onContentAnimationEnd?: (open: boolean) => void;
  children: React.ReactNode;
}

const PERSISTENT_DRAWER_EASING = "cubic-bezier(0.32, 0.72, 0, 1)";
const PERSISTENT_DRAWER_CLOSE_RATIO = 0.25;
const PERSISTENT_DRAWER_CLOSE_VELOCITY_PX_PER_SEC = 450;
const PERSISTENT_DRAWER_FOCUSABLE_SELECTOR = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  '[tabindex]:not([tabindex="-1"])',
].join(",");

type PersistentDrawerStackEntry = {
  panel: () => HTMLElement | null;
  dismissOnEscape: (event: KeyboardEvent) => void;
};

type PersistentDrawerStack = {
  entries: PersistentDrawerStackEntry[];
  handleKeyDown: (event: KeyboardEvent) => void;
};

const PERSISTENT_DRAWER_STACK_KEY = Symbol.for("bb.persistent-drawer-stack.v1");

function isPersistentDrawerStack(
  value: unknown,
): value is PersistentDrawerStack {
  return (
    typeof value === "object" &&
    value !== null &&
    "entries" in value &&
    Array.isArray(value.entries) &&
    "handleKeyDown" in value &&
    typeof value.handleKeyDown === "function"
  );
}

function readPersistentDrawerStack(
  ownerDocument: Document,
): PersistentDrawerStack | undefined {
  const stack: unknown = Reflect.get(
    ownerDocument,
    PERSISTENT_DRAWER_STACK_KEY,
  );
  return isPersistentDrawerStack(stack) ? stack : undefined;
}

function getDrawerFocusableElements(panel: HTMLElement): HTMLElement[] {
  return Array.from(
    panel.querySelectorAll<HTMLElement>(PERSISTENT_DRAWER_FOCUSABLE_SELECTOR),
  ).filter(
    (element) => element.closest('[aria-hidden="true"], [inert]') === null,
  );
}

function activeElementIsInAnotherOverlay(
  activeElement: Element | null,
  panel: HTMLElement,
): boolean {
  const overlay = activeElement?.closest<HTMLElement>(
    "[data-bb-portaled-overlay]",
  );
  return overlay !== null && overlay !== undefined && overlay !== panel;
}

function handleDrawerTab(event: KeyboardEvent, panel: HTMLElement): void {
  const activeElement = panel.ownerDocument.activeElement;
  if (
    !panel.contains(activeElement) &&
    activeElementIsInAnotherOverlay(activeElement, panel)
  ) {
    return;
  }

  const focusable = getDrawerFocusableElements(panel);
  event.preventDefault();
  if (focusable.length === 0) {
    panel.focus({ preventScroll: true });
    return;
  }

  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  if (event.shiftKey) {
    if (
      !panel.contains(activeElement) ||
      activeElement === panel ||
      activeElement === first
    ) {
      last?.focus();
      return;
    }
    const index = focusable.indexOf(activeElement as HTMLElement);
    focusable[Math.max(0, index - 1)]?.focus();
    return;
  }

  if (
    !panel.contains(activeElement) ||
    activeElement === panel ||
    activeElement === last
  ) {
    first?.focus();
    return;
  }
  const index = focusable.indexOf(activeElement as HTMLElement);
  focusable[Math.min(focusable.length - 1, index + 1)]?.focus();
}

function registerOpenDrawer(
  ownerDocument: Document,
  entry: PersistentDrawerStackEntry,
): () => void {
  let stack = readPersistentDrawerStack(ownerDocument);
  if (stack === undefined) {
    const entries: PersistentDrawerStackEntry[] = [];
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented) {
        return;
      }
      const topEntry = entries[entries.length - 1];
      const panel = topEntry?.panel() ?? null;
      if (topEntry === undefined || panel === null) {
        return;
      }
      if (event.key === "Escape") {
        topEntry.dismissOnEscape(event);
        event.preventDefault();
      } else if (event.key === "Tab") {
        handleDrawerTab(event, panel);
      }
    };
    stack = { entries, handleKeyDown };
    Reflect.set(ownerDocument, PERSISTENT_DRAWER_STACK_KEY, stack);
    ownerDocument.addEventListener("keydown", handleKeyDown);
  }
  stack.entries.push(entry);

  return () => {
    const currentStack = readPersistentDrawerStack(ownerDocument);
    if (currentStack === undefined) {
      return;
    }
    const index = currentStack.entries.indexOf(entry);
    if (index >= 0) {
      currentStack.entries.splice(index, 1);
    }
    if (currentStack.entries.length === 0) {
      ownerDocument.removeEventListener("keydown", currentStack.handleKeyDown);
      Reflect.deleteProperty(ownerDocument, PERSISTENT_DRAWER_STACK_KEY);
    }
  };
}

interface UsePersistentOverlayFocusArgs {
  onAfterCloseAutoFocus?: () => void;
  onBeforeCloseAutoFocus?: () => void;
  onEscapeKeyDown?: (event: KeyboardEvent) => void;
  open: boolean;
  panelRef: React.RefObject<HTMLElement | null>;
  requestClose: () => void;
}

export function usePersistentOverlayFocus({
  onAfterCloseAutoFocus,
  onBeforeCloseAutoFocus,
  onEscapeKeyDown,
  open,
  panelRef,
  requestClose,
}: UsePersistentOverlayFocusArgs): void {
  const returnFocusRef = React.useRef<HTMLElement | null>(null);
  const onEscapeKeyDownRef = React.useRef(onEscapeKeyDown);
  React.useLayoutEffect(() => {
    onEscapeKeyDownRef.current = onEscapeKeyDown;
  }, [onEscapeKeyDown]);

  React.useLayoutEffect(() => {
    if (!open) return;
    const panel = panelRef.current;
    if (panel === null) return;
    const ownerDocument = panel.ownerDocument;
    const previousFocus = ownerDocument.activeElement;
    returnFocusRef.current =
      previousFocus instanceof HTMLElement &&
      previousFocus !== ownerDocument.body
        ? previousFocus
        : null;
    const unregister = registerOpenDrawer(ownerDocument, {
      panel: () => panelRef.current,
      dismissOnEscape: (event) => {
        onEscapeKeyDownRef.current?.(event);
        if (!event.defaultPrevented) requestClose();
      },
    });
    panel.focus({ preventScroll: true });
    return unregister;
  }, [open, panelRef, requestClose]);

  const previousOpenRef = React.useRef(open);
  React.useLayoutEffect(() => {
    let cancelDeferredFocus: (() => void) | undefined;
    if (previousOpenRef.current && !open) {
      onBeforeCloseAutoFocus?.();
      const returnFocus = returnFocusRef.current;
      if (
        returnFocus?.isConnected &&
        returnFocus.closest('[aria-hidden="true"], [inert]') === null
      ) {
        returnFocus.focus({ preventScroll: true });
        if (returnFocus.ownerDocument.activeElement !== returnFocus) {
          const ownerWindow = returnFocus.ownerDocument.defaultView;
          if (ownerWindow !== null) {
            const frame = ownerWindow.requestAnimationFrame(() => {
              if (
                returnFocus.isConnected &&
                returnFocus.closest('[aria-hidden="true"], [inert]') === null
              ) {
                returnFocus.focus({ preventScroll: true });
              }
              onAfterCloseAutoFocus?.();
            });
            cancelDeferredFocus = () => ownerWindow.cancelAnimationFrame(frame);
          }
        }
      }
      returnFocusRef.current = null;
      if (cancelDeferredFocus === undefined) {
        onAfterCloseAutoFocus?.();
      }
    }
    previousOpenRef.current = open;
    return cancelDeferredFocus;
  }, [onAfterCloseAutoFocus, onBeforeCloseAutoFocus, open]);
}

type PersistentDrawerDrag = {
  pointerId: number;
  startY: number;
  lastY: number;
  lastTimeMs: number;
  velocityY: number;
  height: number;
};

export function PersistentResponsiveDrawerShell({
  open,
  onOpenChange,
  onAfterCloseAutoFocus,
  closeOnBackdropClick = true,
  srLabel,
  labelledBy,
  describedBy,
  contentClassName,
  motionDurationMs = 220,
  onContentAnimationEnd,
  onEscapeKeyDown,
  onPointerDownOutside,
  onInteractOutside,
  children,
}: PersistentResponsiveDrawerShellProps) {
  const panelRef = React.useRef<HTMLDivElement>(null);
  const backdropRef = React.useRef<HTMLDivElement>(null);
  const backdropPointerDownRef = React.useRef<PointerEvent | null>(null);
  const dragRef = React.useRef<PersistentDrawerDrag | null>(null);
  const settledStateRef = React.useRef<boolean | null>(null);
  const labelId = React.useId();
  const portalScopeProps = usePortalScopeProps();
  const transition = `transform ${motionDurationMs}ms ${PERSISTENT_DRAWER_EASING}`;
  const backdropTransition = `opacity ${motionDurationMs}ms ${PERSISTENT_DRAWER_EASING}`;
  const onOpenChangeRef = React.useRef(onOpenChange);
  React.useLayoutEffect(() => {
    onOpenChangeRef.current = onOpenChange;
  }, [onOpenChange]);
  const requestClose = React.useCallback(() => {
    blurActiveKeyboardInputWithin(panelRef.current);
    resetDrawerKeyboardStyles(panelRef.current);
    onOpenChangeRef.current(false);
  }, []);
  const prepareCloseAutoFocus = React.useCallback(() => {
    blurActiveKeyboardInputWithin(panelRef.current);
    resetDrawerKeyboardStyles(panelRef.current);
  }, []);

  usePersistentOverlayFocus({
    onAfterCloseAutoFocus,
    onBeforeCloseAutoFocus: prepareCloseAutoFocus,
    onEscapeKeyDown,
    open,
    panelRef,
    requestClose,
  });

  const handleBackdropClick = () => {
    const originalEvent = backdropPointerDownRef.current;
    backdropPointerDownRef.current = null;
    if (!closeOnBackdropClick) return;
    if (originalEvent !== null) {
      const outsideEvent: DrawerPointerDownOutsideEvent = new CustomEvent(
        "dismissableLayer.pointerDownOutside",
        { cancelable: true, detail: { originalEvent } },
      );
      onPointerDownOutside?.(outsideEvent);
      onInteractOutside?.(outsideEvent);
      if (outsideEvent.defaultPrevented) return;
    }
    requestClose();
  };

  useDrawerKeyboardInset(panelRef, open);

  const reportSettled = React.useCallback(
    (settledOpen: boolean) => {
      if (settledStateRef.current === settledOpen) {
        return;
      }
      settledStateRef.current = settledOpen;
      onContentAnimationEnd?.(settledOpen);
    },
    [onContentAnimationEnd],
  );

  React.useEffect(() => {
    settledStateRef.current = null;
    const timeout = window.setTimeout(
      () => reportSettled(open),
      motionDurationMs + 50,
    );
    return () => window.clearTimeout(timeout);
  }, [motionDurationMs, open, reportSettled]);

  const setDragPosition = React.useCallback(
    (offsetY: number, height: number, animate: boolean) => {
      const panel = panelRef.current;
      const backdrop = backdropRef.current;
      if (panel === null || backdrop === null) {
        return;
      }
      panel.style.transition = animate ? transition : "none";
      panel.style.transform = `translate3d(0, ${offsetY}px, 0)`;
      backdrop.style.transition = animate ? backdropTransition : "none";
      backdrop.style.opacity = String(
        Math.max(0, Math.min(1, 1 - offsetY / height)),
      );
    },
    [backdropTransition, transition],
  );

  const handleDragStart = React.useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (!open || event.button !== 0) {
        return;
      }
      event.currentTarget.setPointerCapture(event.pointerId);
      const nowMs = Date.now();
      const height = Math.max(panelRef.current?.clientHeight ?? 0, 1);
      dragRef.current = {
        pointerId: event.pointerId,
        startY: event.clientY,
        lastY: event.clientY,
        lastTimeMs: nowMs,
        velocityY: 0,
        height,
      };
      setDragPosition(0, height, false);
      event.preventDefault();
    },
    [open, setDragPosition],
  );

  const handleDragMove = React.useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      const drag = dragRef.current;
      if (drag === null || drag.pointerId !== event.pointerId) {
        return;
      }
      const nowMs = Date.now();
      const elapsedMs = nowMs - drag.lastTimeMs;
      if (elapsedMs > 0) {
        drag.velocityY = ((event.clientY - drag.lastY) / elapsedMs) * 1000;
        drag.lastY = event.clientY;
        drag.lastTimeMs = nowMs;
      }
      setDragPosition(
        Math.max(0, event.clientY - drag.startY),
        drag.height,
        false,
      );
      event.preventDefault();
    },
    [setDragPosition],
  );

  const finishDrag = React.useCallback(
    (event: React.PointerEvent<HTMLDivElement>, cancelled: boolean) => {
      const drag = dragRef.current;
      if (drag === null || drag.pointerId !== event.pointerId) {
        return;
      }
      dragRef.current = null;
      const offsetY = Math.max(0, event.clientY - drag.startY);
      const shouldClose =
        !cancelled &&
        (offsetY >= drag.height * PERSISTENT_DRAWER_CLOSE_RATIO ||
          drag.velocityY >= PERSISTENT_DRAWER_CLOSE_VELOCITY_PX_PER_SEC);
      if (shouldClose) {
        setDragPosition(drag.height, drag.height, true);
        requestClose();
      } else {
        setDragPosition(0, drag.height, true);
      }
      event.preventDefault();
    },
    [requestClose, setDragPosition],
  );

  const portalTarget = typeof document === "undefined" ? null : document.body;
  if (portalTarget === null) {
    return null;
  }

  return createPortal(
    <>
      <div
        ref={backdropRef}
        {...portalScopeProps}
        aria-hidden="true"
        data-persistent-drawer-backdrop=""
        data-state={open ? "open" : "closed"}
        className="fixed inset-0 z-50 bg-black/40"
        style={{
          opacity: open ? 1 : 0,
          pointerEvents: open ? "auto" : "none",
          transition: backdropTransition,
        }}
        onPointerDown={(event) => {
          backdropPointerDownRef.current = event.nativeEvent;
        }}
        onClick={handleBackdropClick}
        onTouchMove={(event) => event.preventDefault()}
      />
      <div
        ref={panelRef}
        {...portalScopeProps}
        aria-hidden={!open}
        aria-labelledby={
          labelledBy ?? (srLabel === undefined ? undefined : labelId)
        }
        aria-describedby={describedBy}
        aria-modal={open || undefined}
        data-bb-portaled-overlay=""
        data-persistent-drawer-content=""
        data-state={open ? "open" : "closed"}
        inert={!open}
        role="dialog"
        tabIndex={-1}
        className={cn(
          "fixed inset-x-0 bottom-0 z-50 mt-24 flex max-h-[calc(92dvh-var(--bb-drawer-keyboard-inset,0px))] flex-col rounded-t-xl border bg-background pb-[var(--bb-safe-area-bottom,env(safe-area-inset-bottom))] outline-none",
          contentClassName,
        )}
        style={{
          transform: open ? "translate3d(0, 0, 0)" : "translate3d(0, 100%, 0)",
          transition,
          willChange: open ? "transform" : undefined,
        }}
        onTransitionEnd={(event) => {
          if (
            event.currentTarget === event.target &&
            event.propertyName === "transform"
          ) {
            reportSettled(open);
          }
        }}
      >
        <div
          data-persistent-drawer-handle=""
          className="mx-auto flex h-8 w-16 shrink-0 touch-none cursor-grab items-center justify-center active:cursor-grabbing"
          onPointerDown={handleDragStart}
          onPointerMove={handleDragMove}
          onPointerUp={(event) => finishDrag(event, false)}
          onPointerCancel={(event) => finishDrag(event, true)}
        >
          <div className="h-1 w-10 rounded-full bg-muted-foreground/20" />
        </div>
        {srLabel === undefined ? null : (
          <h2 id={labelId} className="sr-only">
            {srLabel}
          </h2>
        )}
        {children}
      </div>
    </>,
    portalTarget,
  );
}
