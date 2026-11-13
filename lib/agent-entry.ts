import { VAULT_PANEL_PATH, type PanelOpenRequest, type TextHighlight } from "./panel-open.ts";

const VAULT_DOCS_MARKER = "/plugins/vault/docs";

export type AgentEntry =
  | { action: "focus"; threadId: string; vaultId: string; path: string; highlights: TextHighlight[]; graphPaths?: string[]; nonce: string }
  | {
      action: "file";
      threadId: string;
      vaultId: string;
      path: string;
      nonce: string;
    }
  | {
      action: "graph";
      threadId: string;
      vaultId: string;
      paths: readonly string[];
      nonce: string;
    };

export type AgentSnapshot = {
  entry: AgentEntry | null;
  lights: Readonly<Record<string, readonly string[]>>;
};

type PendingRoute = { action: "file" | "graph" | "focus"; vaultId: string; path: string };

type ThreadState = { entry: AgentEntry | null; focus: Extract<AgentEntry, { action: "focus" }> | null; armedVaultId: string | null; pendingRoute: PendingRoute | null; lights: Map<string, readonly string[]> };
const states = new Map<string, ThreadState>();
let lastThread = "";
function state(threadId: string): ThreadState {
  let current = states.get(threadId);
  if (!current) { current = { entry: null, focus: null, armedVaultId: null, pendingRoute: null, lights: new Map() }; states.set(threadId, current); }
  return current;
}
const listeners = new Set<() => void>();

function publish(): void {
  for (const listener of listeners) listener();
}

function decodeSegment(segment: string): string {
  let current = segment;
  for (let i = 0; i < 3; i += 1) {
    if (!/%[0-9A-Fa-f]{2}/u.test(current)) break;
    try {
      const next = decodeURIComponent(current);
      if (next === current) break;
      current = next;
    } catch {
      break;
    }
  }
  return current.normalize("NFC");
}

function vaultDocsRest(pathname: string): string | null {
  const index = pathname.indexOf(VAULT_DOCS_MARKER);
  if (index === -1) return null;
  const rest = pathname.slice(index + VAULT_DOCS_MARKER.length).replace(/^\/+/u, "").replace(/\/+$/u, "");
  if (rest === "") return "";
  return rest.split("/").map(decodeSegment).join("/");
}

export function resetAgentEntry(): void { states.clear(); lastThread = ""; publish(); }
export function readAgentEntry(threadId = lastThread): AgentEntry | null { return state(threadId).entry; }
export function highlightPathsFor(vaultId: string, threadId = lastThread): readonly string[] { return state(threadId).lights.get(vaultId) ?? []; }
export function readAgentSnapshot(threadId = lastThread): AgentSnapshot { const current = state(threadId); return { entry: current.entry, lights: Object.fromEntries(current.lights) }; }
export function focusFor(threadId: string, vaultId: string | null, path: string): Extract<AgentEntry, { action: "focus" }> | null {
  const focus = state(threadId).focus;
  return focus && focus.vaultId === vaultId && focus.path === path ? focus : null;
}

export function subscribeAgentEntry(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function mergeHighlightPaths(existing: readonly string[], incoming: readonly string[]): string[] {
  const seen = new Set(existing);
  const next = [...existing];
  for (const path of incoming) {
    if (seen.has(path)) continue;
    seen.add(path);
    next.push(path);
  }
  return next;
}

export function applyAgentEntry(request: PanelOpenRequest): AgentEntry {
  lastThread = request.threadId;
  const current = state(request.threadId);
  if (request.action === "focus") {
    if (request.graphPaths !== undefined) current.lights.set(request.vaultId, request.graphPaths);
    current.focus = { ...request };
    current.entry = current.focus;
    if (request.graphPaths !== undefined || current.armedVaultId !== null) current.armedVaultId = request.vaultId;
    current.pendingRoute = { action: "focus", vaultId: request.vaultId, path: request.path };
  } else if (request.action === "file") {
    current.focus = null;
    current.armedVaultId = null;
    current.pendingRoute = { action: "file", vaultId: request.vaultId, path: request.path };
    current.entry = { ...request };
  } else {
    const merged = mergeHighlightPaths(current.lights.get(request.vaultId) ?? [], request.paths);
    current.lights.set(request.vaultId, merged);
    current.armedVaultId = request.vaultId;
    current.pendingRoute = { action: "graph", vaultId: request.vaultId, path: "" };
    current.entry = { ...request, paths: merged };
  }
  publish();
  return current.entry;
}
export function consumeAgentRoute(threadId = lastThread): PendingRoute | null {
  const current = state(threadId); const next = current.pendingRoute; current.pendingRoute = null; return next;
}
export function consumeGraphOpen(vaultId: string | null, threadId = lastThread): boolean {
  const current = state(threadId);
  if (vaultId === null || current.armedVaultId !== vaultId) return false;
  current.armedVaultId = null; return true;
}

export function vaultPanelSubPath(next: AgentEntry): string {
  if (next.action === "graph" || next.path === "") return next.vaultId;
  return `${next.vaultId}/${next.path}`;
}

export function shouldEnterVaultRoute(pathname: string, next: AgentEntry): boolean {
  const rest = vaultDocsRest(pathname);
  if (rest === null) return true;
  if (next.action === "file" || next.action === "focus") return rest !== vaultPanelSubPath(next);
  return !(rest === next.vaultId || rest.startsWith(`${next.vaultId}/`));
}

export function vaultNavigationFor(
  pathname: string,
  next: AgentEntry,
): { path: string; subPath: string } | null {
  if (!shouldEnterVaultRoute(pathname, next)) return null;
  return { path: VAULT_PANEL_PATH, subPath: vaultPanelSubPath(next) };
}
