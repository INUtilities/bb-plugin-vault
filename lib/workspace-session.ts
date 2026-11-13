export type DocumentRef = { vaultId: string; path: string };
type Reading = { top: number; mode: "preview" | "source" };
type TreeState = { query: string; expanded: string[] };
type WorkspaceState = {
  tabs: DocumentRef[];
  active: DocumentRef | null;
  route: string;
  reading: Record<string, Reading>;
  trees: Record<string, TreeState>;
  graphOpen: boolean;
};
type SessionStorage = Pick<Storage, "getItem" | "setItem">;
const KEY = "bb-plugin-vault:workspace:v1";
const empty = (): WorkspaceState => ({ tabs: [], active: null, route: "", reading: {}, trees: {}, graphOpen: false });
export const documentKey = (doc: DocumentRef) => JSON.stringify([doc.vaultId, doc.path]);
const validDoc = (value: unknown): value is DocumentRef => {
  if (!value || typeof value !== "object") return false;
  const doc = value as DocumentRef;
  return typeof doc.vaultId === "string" && doc.vaultId.length > 0 && typeof doc.path === "string"
    && doc.path.length > 0 && !doc.path.startsWith("/") && !doc.path.split("/").includes("..");
};

// Only browser-session navigation metadata is stored; document bytes stay in the reader.
export function createWorkspaceSession(storage?: SessionStorage) {
  let state = empty();
  try {
    const value = JSON.parse(storage?.getItem(KEY) ?? "null") as WorkspaceState | null;
    if (value && Array.isArray(value.tabs) && value.tabs.every(validDoc) && typeof value.route === "string"
      && value.reading && value.trees && typeof value.reading === "object" && typeof value.trees === "object") {
      state = { ...value, tabs: value.tabs.filter((doc, i, all) => all.findIndex(other => documentKey(other) === documentKey(doc)) === i),
        active: validDoc(value.active) ? value.active : null, graphOpen: value.graphOpen === true };
    }
  } catch { /* A stale or unavailable browser session starts empty. */ }
  const listeners = new Set<() => void>();
  const save = (next: WorkspaceState, notify = true) => {
    state = next;
    try { storage?.setItem(KEY, JSON.stringify(state)); } catch { /* Memory survives remounts too. */ }
    if (notify) listeners.forEach(listener => listener());
  };
  return {
    read: () => state,
    subscribe: (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; },
    open(doc: DocumentRef) {
      if (!validDoc(doc)) return;
      const key = documentKey(doc), route = `${doc.vaultId}/${doc.path}`;
      if (state.active && documentKey(state.active) === key && state.route === route) return;
      save({ ...state, tabs: state.tabs.some(tab => documentKey(tab) === key) ? state.tabs : [...state.tabs, doc], active: doc, route });
    },
    close(doc: DocumentRef): DocumentRef | null {
      const key = documentKey(doc), index = state.tabs.findIndex(tab => documentKey(tab) === key);
      if (index < 0) return state.active;
      const tabs = state.tabs.filter(tab => documentKey(tab) !== key);
      const closingActive = state.active !== null && documentKey(state.active) === key;
      const active = closingActive ? tabs[Math.min(index, tabs.length - 1)] ?? null : state.active;
      const route = closingActive ? active ? `${active.vaultId}/${active.path}` : doc.vaultId : state.route;
      save({ ...state, tabs, active, route });
      return active;
    },
    setRoute(route: string) {
      if (state.route !== route || state.active) save({ ...state, route, active: null });
    },
    reading(doc: DocumentRef): Reading {
      const value = state.reading[documentKey(doc)];
      return { top: Number.isFinite(value?.top) ? Math.max(0, value.top) : 0, mode: value?.mode === "source" ? "source" : "preview" };
    },
    setReading(doc: DocumentRef, value: Reading) {
      save({ ...state, reading: { ...state.reading, [documentKey(doc)]: { top: Number.isFinite(value.top) ? Math.max(0, Math.round(value.top)) : 0, mode: value.mode } } }, false);
    },
    tree(vaultId: string): TreeState {
      const value = state.trees[vaultId];
      return { query: typeof value?.query === "string" ? value.query : "", expanded: Array.isArray(value?.expanded) ? value.expanded.filter(path => typeof path === "string") : [] };
    },
    setTree(vaultId: string, tree: TreeState) { save({ ...state, trees: { ...state.trees, [vaultId]: tree } }); },
    setGraphOpen(graphOpen: boolean) { if (graphOpen !== state.graphOpen) save({ ...state, graphOpen }); },
  };
}

export const workspaceSession = createWorkspaceSession(typeof sessionStorage === "undefined" ? undefined : sessionStorage);
