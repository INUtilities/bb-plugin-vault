import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore, type KeyboardEvent, type MouseEvent, type PointerEvent, type ReactNode } from "react";
import {
  Markdown,
  definePluginApp,
  experimental_useAppPanel,
  experimental_SourceCode as SourceCode,
  useBbNavigate,
  useRpc,
  type PluginNavPanelProps,
  type PluginThreadPanelProps,
} from "@get-bb/plugin-sdk/app";
import { toast } from "sonner";
import * as Dialog from "@radix-ui/react-dialog";

import { BrandIcon } from "@/components/BrandIcon";
import { TextHighlights } from "@/components/TextHighlights";
import { GraphView } from "@/components/GraphView";
import { FloatingGraphCard } from "@/components/FloatingGraphCard";
import { PanelOpenBridge } from "@/components/PanelOpenBridge";
import { withPanelSplash } from "@/components/PanelSplash";
import { useAgentSnapshot } from "@/components/use-agent-entry";
import { VaultFileDirective, VaultGraphDirective, VaultFocusDirective } from "@/components/VaultDirective";
import { VaultExcerptDirective } from "@/components/VaultExcerptDirective";
import { DocViewToggle, type DocViewMode } from "@/components/DocViewToggle";
import { registerVaultChatTab } from "@/components/VaultChatTab";
import { VaultDocumentTabs } from "@/components/VaultDocumentTabs";
import { documentKey, workspaceSession, type DocumentRef } from "@/lib/workspace-session";
import { useVaultHeaderAlignment } from "@/lib/vault-header-alignment";
import { fitVaultSidebar } from "@/lib/sidebar-layout";
import "./workspace.css";
import { DocumentEndSpace } from "@/components/DocumentEndSpace";
import { FrontmatterPanel, PropertiesDock, PropertiesSheet, readFrontmatterOpen, storeFrontmatterOpen } from "@/components/FrontmatterPanel";
import { ImagePreview } from "@/components/ImagePreview";
import { HiddenFilesSettings } from "@/components/HiddenFilesSettings";
import { SettingsSection } from "@/components/SettingsSection";
import { Toolbar } from "@/components/Toolbar";
import { Button } from "@/components/ui/button";
import { Icon, preloadExtendedIcons } from "@/components/ui/icon";
import {
  COARSE_POINTER_HEADER_BAR_CLASS,
  COARSE_POINTER_HEADER_TITLE_CLASS,
  COARSE_POINTER_ICON_BUTTON_GROW_CLASS,
  COARSE_POINTER_MARKDOWN_BODY_CLASS,
  COARSE_POINTER_TEXT_BASE_CLASS,
  COARSE_POINTER_TEXT_SM_CLASS,
  COARSE_POINTER_TREE_ICON_CLASS,
  COARSE_POINTER_TREE_ROW_SIZE_CLASS,
} from "@/components/ui/coarse-pointer-sizing";
import { consumeAgentRoute, consumeGraphOpen, focusFor } from "@/lib/agent-entry";
import { isImageFileName } from "@/lib/image-file";
import { queryBoldSpans } from "@/lib/query-highlight";
import { cn } from "@/lib/utils";
import { publishVaults, rememberedVaults, subscribeVaults, type Vault } from "@/lib/vault-list";
import { parseFrontmatterFields, splitMarkdownFrontmatter, type FrontmatterField } from "@/lib/frontmatter";
import { listedEntryVisible } from "@/lib/hidden-files";
import { useHiddenPrefs } from "@/lib/hidden-prefs";
import { propertiesUseSheet } from "@/lib/properties-layout";
import { useVaultChrome } from "@/lib/use-vault-chrome";
import { desktopPanel, phoneMetrics, stackedLayout } from "@/lib/vault-chrome";
import { listScrollKey, readListScroll, writeListScroll } from "@/lib/session-list-scroll";
import { THREAD_VAULT_ACTION_ID } from "@/lib/panel-open";
import { panelLayout } from "@/lib/panel-layout";
import { readSessionRoute, writeSessionRoute } from "@/lib/session-route";
import { rewriteVaultMarkdown } from "@/lib/vault-markdown";
import { graphCornerCursor, graphCornerResize } from "@/lib/graph-corner";
import type { GraphEdge, GraphNode } from "@/lib/note-graph";
import { decodeRoute, encodeRoute, isProbablyFile } from "@/lib/vault-route";
import { htmlPreviewUrl } from "@/lib/preview-url";
import { parseVaultLinkHref } from "@/lib/wiki-links";
import type { rpcContract } from "./server";

const PANEL_PATH = "docs";
const LIST_WIDTH_KEY = "vault-list-width";
const LIST_WIDTH_DEFAULT = 320;
const LIST_WIDTH_MIN = 200;
const LIST_WIDTH_MAX = 560;
const LIST_WIDTH_STEP = 16;
const LIST_COLLAPSED_KEY = "vault-list-collapsed";
const GRAPH_SPLIT_KEY = "vault-graph-split";
const GRAPH_SPLIT_DEFAULT = 0.55;
const GRAPH_SPLIT_MIN = 0.2;
const GRAPH_SPLIT_MAX = 0.8;
const GRAPH_SPLIT_STEP = 0.04;
const PANEL_WIDTH_MOTION =
  "transition-[width] duration-[420ms] ease-[cubic-bezier(0.32,0.72,0,1)] motion-reduce:transition-none";
const EMPTY_HIGHLIGHTS: readonly string[] = [];

function clampListWidth(width: number, max = LIST_WIDTH_MAX): number {
  const ceiling = Math.max(LIST_WIDTH_MIN, max);
  return Math.min(ceiling, Math.max(LIST_WIDTH_MIN, Math.round(width)));
}

function readStoredListWidth(): number {
  try {
    const parsed = Number(localStorage.getItem(LIST_WIDTH_KEY));
    if (!Number.isFinite(parsed)) return LIST_WIDTH_DEFAULT;
    return clampListWidth(parsed);
  } catch {
    return LIST_WIDTH_DEFAULT;
  }
}

function storeListWidth(width: number): void {
  try {
    localStorage.setItem(LIST_WIDTH_KEY, String(width));
  } catch {
    // ignore quota / private mode
  }
}

function clampGraphSplit(split: number): number {
  return Math.min(GRAPH_SPLIT_MAX, Math.max(GRAPH_SPLIT_MIN, Math.round(split * 1000) / 1000));
}

function readStoredGraphSplit(): number {
  try {
    const parsed = Number(localStorage.getItem(GRAPH_SPLIT_KEY));
    if (!Number.isFinite(parsed)) return GRAPH_SPLIT_DEFAULT;
    return clampGraphSplit(parsed);
  } catch {
    return GRAPH_SPLIT_DEFAULT;
  }
}

function storeGraphSplit(split: number): void {
  try {
    localStorage.setItem(GRAPH_SPLIT_KEY, String(split));
  } catch {
    // ignore quota / private mode
  }
}

function readListCollapsed(): boolean {
  try {
    return localStorage.getItem(LIST_COLLAPSED_KEY) === "1";
  } catch {
    return false;
  }
}

function storeListCollapsed(collapsed: boolean): void {
  try {
    localStorage.setItem(LIST_COLLAPSED_KEY, collapsed ? "1" : "0");
  } catch {
    // ignore quota / private mode
  }
}

type DocEntry = {
  kind: "file" | "directory";
  path: string;
  name: string;
};

type VaultIndex = {
  entries: DocEntry[];
  rawArchive: Record<string, string>;
};

type DocBody =
  | {
      vaultId: string;
      path: string;
      name: string;
      content: string;
      kind: "markdown" | "html" | "text";
    }
  | {
      vaultId: string;
      path: string;
      name: string;
      url: string;
      kind: "image";
    };

function errorText(cause: unknown, fallback: string): string {
  return cause instanceof Error ? cause.message : fallback;
}

function fileLabel(pathOrName: string): string {
  const cut = pathOrName.lastIndexOf("/");
  const name = cut === -1 ? pathOrName : pathOrName.slice(cut + 1);
  return name.replace(/\.(md|markdown|html|htm|txt)$/iu, "");
}

function boldQuery(text: string, query: string): ReactNode {
  const spans = queryBoldSpans(text, query);
  if (!spans.some((span) => span.match)) return text;
  return spans.map((span, index) => (
    span.match ? <strong key={index} className="font-bold">{span.text}</strong> : span.text
  ));
}

const rememberedIndex: Record<string, VaultIndex> = {};

function nameRank(name: string): number {
  const n = name.trim().toLowerCase();
  if (n === "memex") return 0;
  if (n === "scratch") return 1;
  return 2;
}

function compareNames(a: string, b: string): number {
  const ranked = nameRank(a) - nameRank(b);
  if (ranked !== 0) return ranked;
  return a.localeCompare(b, "ko");
}

function relativePath(folder: string, path: string): string {
  if (folder === "") return path;
  const prefix = `${folder}/`;
  return path.startsWith(prefix) ? path.slice(prefix.length) : path;
}

function matchesDocQuery(entry: DocEntry, needle: string): boolean {
  const name = entry.name.normalize("NFC").toLowerCase();
  const label = fileLabel(entry.name).normalize("NFC").toLowerCase();
  const base = fileLabel(relativePath("", entry.path)).normalize("NFC").toLowerCase();
  return name.includes(needle) || label.includes(needle) || base.includes(needle);
}

const TREE_INDENT = 16;
const TREE_BASE = 8;
const TREE_GUIDE_X = 7;

type TreeRow = {
  entry: DocEntry;
  depth: number;
};

function visibleTreeRows(
  entries: readonly DocEntry[],
  expanded: ReadonlySet<string>,
  query: string,
): TreeRow[] {
  const needle = query.trim().normalize("NFC").toLowerCase();
  const rows: TreeRow[] = [];

  function walk(folder: string, depth: number): boolean {
    let any = false;
    for (const child of childrenOf(entries, folder)) {
      if (child.kind === "directory") {
        const start = rows.length;
        rows.push({ entry: child, depth });
        const open = needle !== "" || expanded.has(child.path);
        const childHit = open ? walk(child.path, depth + 1) : false;
        const selfHit = needle === "" || matchesDocQuery(child, needle);
        if (needle !== "" && !selfHit && !childHit) {
          rows.splice(start);
          continue;
        }
        any = true;
        continue;
      }
      if (needle !== "" && !matchesDocQuery(child, needle)) continue;
      rows.push({ entry: child, depth });
      any = true;
    }
    return any;
  }

  walk("", 0);
  return rows;
}

function childrenOf(entries: readonly DocEntry[], folder: string): DocEntry[] {
  const prefix = folder === "" ? "" : `${folder}/`;
  const dirs = new Map<string, DocEntry>();
  const files: DocEntry[] = [];
  for (const entry of entries) {
    if (entry.path === folder) continue;
    if (prefix !== "" && !entry.path.startsWith(prefix)) continue;
    const rest = prefix === "" ? entry.path : entry.path.slice(prefix.length);
    if (rest === "") continue;
    const slash = rest.indexOf("/");
    if (slash === -1) {
      if (entry.kind === "directory") dirs.set(entry.path, entry);
      else files.push(entry);
      continue;
    }
    const childPath = `${prefix}${rest.slice(0, slash)}`;
    if (!dirs.has(childPath)) {
      dirs.set(childPath, {
        kind: "directory",
        path: childPath,
        name: rest.slice(0, slash),
      });
    }
  }
  const folders = [...dirs.values()].sort((a, b) => compareNames(a.name, b.name));
  files.sort((a, b) => compareNames(a.name, b.name));
  return [...folders, ...files];
}

export function DocsReaderPanel({
  subPath,
  onRoute,
  surface = "nav",
  threadId = "",
}: PluginNavPanelProps & { onRoute?: (subPath: string) => void; surface?: "nav" | "panel" | "workspace" | "sidebar"; threadId?: string }) {
  const rpc = useRpc<typeof rpcContract>();
  const navigate = useBbNavigate();
  const appPanel = experimental_useAppPanel() as unknown as { openTab?: (options: { tab: { id: string; context: { kind: "nav-panel"; panelId: string }; availability: "fixed" } }) => boolean };
  const workspace = useSyncExternalStore(workspaceSession.subscribe, workspaceSession.read, workspaceSession.read);
  const workspaceMain = surface === "workspace";
  const workspaceSidebar = surface === "sidebar";
  const workspaceSurface = workspaceMain || workspaceSidebar;
  const documentPanelId = useId();
  const sidebarRef = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => workspaceSidebar && sidebarRef.current ? fitVaultSidebar(sidebarRef.current) : undefined, [workspaceSidebar]);
  useVaultHeaderAlignment(sidebarRef);
  const chrome = useVaultChrome();
  const isDesktopPanel = desktopPanel(surface === "panel" ? "panel" : "nav", chrome);
  const panelRef = useRef<HTMLDivElement>(null);
  const panelListButtonRef = useRef<HTMLButtonElement>(null);
  const focusFileOnSelect = useRef(false);
  const [panelWidth, setPanelWidth] = useState<number | null>(null);
  useLayoutEffect(() => {
    if (!isDesktopPanel || !panelRef.current) return;
    const node = panelRef.current;
    const update = () => {
      const width = node.getBoundingClientRect().width;
      if (width > 0) setPanelWidth(width);
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(node);
    return () => observer.disconnect();
  }, [isDesktopPanel]);
  const stacked = stackedLayout(chrome);
  const phoneSized = phoneMetrics(chrome);
  const route = decodeRoute(subPath);
  const [listWidth, setListWidth] = useState(readStoredListWidth);
  const [listCollapsed, setListCollapsed] = useState(readListCollapsed);
  const [graphSplit, setGraphSplit] = useState(readStoredGraphSplit);
  const [resizing, setResizing] = useState(false);
  const resizeDrag = useRef<{ startX: number; startWidth: number; max: number } | null>(null);
  const graphSplitDrag = useRef<{ startY: number; startSplit: number; height: number } | null>(null);
  const cornerDrag = useRef<{
    startX: number;
    startY: number;
    startWidth: number;
    startSplit: number;
    maxWidth: number;
    height: number;
  } | null>(null);
  const listScrollerRef = useRef<HTMLDivElement>(null);

  const applyListWidth = useCallback((width: number, max?: number) => {
    const next = clampListWidth(width, max);
    setListWidth(next);
    storeListWidth(next);
    return next;
  }, []);

  const applyGraphSplit = useCallback((split: number) => {
    const next = clampGraphSplit(split);
    setGraphSplit(next);
    storeGraphSplit(next);
    return next;
  }, []);

  const collapseList = useCallback((collapsed: boolean) => {
    setListCollapsed(collapsed);
    storeListCollapsed(collapsed);
  }, []);

  function onResizePointerDown(event: PointerEvent<HTMLDivElement>) {
    if (event.button !== 0) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    const card = event.currentTarget.parentElement;
    const panel = card?.parentElement?.parentElement;
    const startWidth = card?.getBoundingClientRect().width ?? listWidth;
    const max = panel ? panel.clientWidth - LIST_WIDTH_MIN : LIST_WIDTH_MAX;
    resizeDrag.current = { startX: event.clientX, startWidth, max };
    setResizing(true);
  }

  function onResizePointerMove(event: PointerEvent<HTMLDivElement>) {
    const drag = resizeDrag.current;
    if (drag === null) return;
    applyListWidth(drag.startWidth + (event.clientX - drag.startX), drag.max);
  }

  function onResizePointerUp(event: PointerEvent<HTMLDivElement>) {
    if (resizeDrag.current === null) return;
    resizeDrag.current = null;
    setResizing(false);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }

  function onGraphSplitPointerDown(event: PointerEvent<HTMLDivElement>) {
    if (event.button !== 0) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    const column = event.currentTarget.parentElement;
    const height = column?.getBoundingClientRect().height ?? 0;
    graphSplitDrag.current = { startY: event.clientY, startSplit: graphSplit, height };
    setResizing(true);
  }

  function onGraphSplitPointerMove(event: PointerEvent<HTMLDivElement>) {
    const drag = graphSplitDrag.current;
    if (drag === null || drag.height <= 0) return;
    applyGraphSplit(drag.startSplit - (event.clientY - drag.startY) / drag.height);
  }

  function onGraphSplitPointerUp(event: PointerEvent<HTMLDivElement>) {
    if (graphSplitDrag.current === null) return;
    graphSplitDrag.current = null;
    setResizing(false);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }

  function onGraphSplitKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === "ArrowUp") {
      event.preventDefault();
      applyGraphSplit(graphSplit + GRAPH_SPLIT_STEP);
    } else if (event.key === "ArrowDown") {
      event.preventDefault();
      applyGraphSplit(graphSplit - GRAPH_SPLIT_STEP);
    } else if (event.key === "Home") {
      event.preventDefault();
      applyGraphSplit(GRAPH_SPLIT_MIN);
    } else if (event.key === "End") {
      event.preventDefault();
      applyGraphSplit(GRAPH_SPLIT_MAX);
    }
  }

  function onCornerPointerDown(event: PointerEvent<HTMLDivElement>) {
    if (event.button !== 0) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    const graphPane = event.currentTarget.parentElement;
    const column = graphPane?.parentElement;
    const card = column?.parentElement;
    const panel = card?.parentElement?.parentElement;
    const startWidth = card?.getBoundingClientRect().width ?? listWidth;
    const maxWidth = panel ? panel.clientWidth - LIST_WIDTH_MIN : LIST_WIDTH_MAX;
    const height = column?.getBoundingClientRect().height ?? 0;
    cornerDrag.current = {
      startX: event.clientX,
      startY: event.clientY,
      startWidth,
      startSplit: graphSplit,
      maxWidth,
      height,
    };
    setResizing(true);
  }

  function onCornerPointerMove(event: PointerEvent<HTMLDivElement>) {
    const drag = cornerDrag.current;
    if (drag === null) return;
    const next = graphCornerResize(drag, { x: event.clientX, y: event.clientY });
    applyListWidth(next.width, drag.maxWidth);
    applyGraphSplit(next.split);
  }

  function onCornerPointerUp(event: PointerEvent<HTMLDivElement>) {
    if (cornerDrag.current === null) return;
    cornerDrag.current = null;
    setResizing(false);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }

  function onCornerKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === "ArrowLeft") {
      event.preventDefault();
      applyListWidth(listWidth - LIST_WIDTH_STEP);
    } else if (event.key === "ArrowRight") {
      event.preventDefault();
      applyListWidth(listWidth + LIST_WIDTH_STEP);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      applyGraphSplit(graphSplit + GRAPH_SPLIT_STEP);
    } else if (event.key === "ArrowDown") {
      event.preventDefault();
      applyGraphSplit(graphSplit - GRAPH_SPLIT_STEP);
    } else if (event.key === "Home") {
      event.preventDefault();
      applyListWidth(LIST_WIDTH_DEFAULT);
      applyGraphSplit(GRAPH_SPLIT_DEFAULT);
    }
  }

  function onResizeKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === "ArrowLeft") {
      event.preventDefault();
      applyListWidth(listWidth - LIST_WIDTH_STEP);
    } else if (event.key === "ArrowRight") {
      event.preventDefault();
      applyListWidth(listWidth + LIST_WIDTH_STEP);
    } else if (event.key === "Home") {
      event.preventDefault();
      applyListWidth(LIST_WIDTH_MIN);
    } else if (event.key === "End") {
      event.preventDefault();
      applyListWidth(LIST_WIDTH_MAX);
    }
  }

  const [vaults, setVaults] = useState<Vault[]>(() => rememberedVaults());
  const [indexByVault, setIndexByVault] = useState<Record<string, VaultIndex>>(() => ({
    ...rememberedIndex,
  }));
  const [query, setQuery] = useState(() => workspaceSurface ? workspaceSession.tree(route.vaultId ?? "").query : "");
  const [filterFocusTick, setFilterFocusTick] = useState(0);
  const [doc, setDoc] = useState<DocBody | null>(null);
  const [loadingVaults, setLoadingVaults] = useState(() => rememberedVaults().length === 0);
  const [loadingIndex, setLoadingIndex] = useState(false);
  const [loadingDoc, setLoadingDoc] = useState(false);
  const [previewRoot, setPreviewRoot] = useState<{ vaultId: string; baseUrl: string; expiresAtMs: number } | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [previewRetry, setPreviewRetry] = useState(0);
  const [viewMode, setViewMode] = useState<DocViewMode>("preview");
  const [localGraphOpen, setLocalGraphOpen] = useState(false);
  const graphOpen = workspaceMain ? workspace.graphOpen : localGraphOpen;
  const setGraphOpen = (value: boolean | ((open: boolean) => boolean)) => {
    if (workspaceMain) workspaceSession.setGraphOpen(typeof value === "function" ? value(workspaceSession.read().graphOpen) : value);
    else setLocalGraphOpen(value);
  };
  const [graphPeek, setGraphPeek] = useState(!isDesktopPanel && !workspaceSurface);
  const [panelTreeOpen, setPanelTreeOpen] = useState(false);
  const panelGraphOpen = graphOpen;
  const [propsOpen, setPropsOpen] = useState(readFrontmatterOpen);
  const [expandedFolders, setExpandedFolders] = useState<ReadonlySet<string>>(() => new Set(workspaceSurface ? workspaceSession.tree(route.vaultId ?? "").expanded : []));
  const [graph, setGraph] = useState<{ nodes: GraphNode[]; edges: GraphEdge[] } | null>(null);
  const [loadingGraph, setLoadingGraph] = useState(false);
  const agent = useAgentSnapshot(threadId);
  const loadedVaultRef = useRef<string | null>(null);
  const appliedNonceRef = useRef("");

  const vaultId = route.vaultId ?? vaults[0]?.id ?? null;
  const previewBaseUrl = previewRoot?.vaultId === vaultId ? previewRoot.baseUrl : null;
  const activePath = route.path;
  const htmlSrc = doc?.kind === "html" ? htmlPreviewUrl(previewRoot, doc, { vaultId, path: activePath }) : null;
  const focus = isDesktopPanel && doc?.vaultId === vaultId && doc.path === activePath ? focusFor(threadId, vaultId, activePath) : null;
  const highlightPaths = vaultId === null ? EMPTY_HIGHLIGHTS : agent.lights[vaultId] ?? EMPTY_HIGHLIGHTS;

  useEffect(() => {
    setViewMode(workspaceMain && vaultId ? workspaceSession.reading({ vaultId, path: activePath }).mode : "preview");
  }, [activePath, vaultId, workspaceMain]);

  useEffect(() => {
    void preloadExtendedIcons();
  }, []);

  useEffect(() => {
    if (agent.entry?.action === "focus" && !isDesktopPanel) return;
    const pending = consumeAgentRoute(threadId);
    if (pending?.action === "focus") {
      const current = agent.entry;
      if (current?.action === "focus") {
        appliedNonceRef.current = current.nonce;
        setViewMode("preview");
        if (consumeGraphOpen(pending.vaultId, threadId)) setGraphOpen(true);
      }
      goToRef.current(pending.vaultId, pending.path);
      return;
    }
    if (pending?.action === "file") {
      appliedNonceRef.current = agent.entry?.nonce ?? appliedNonceRef.current;
      if (!isDesktopPanel) setGraphOpen(false);
      goToRef.current(pending.vaultId, pending.path);
      return;
    }
    if (pending?.action === "graph" && pending.vaultId !== vaultId) {
      goToRef.current(pending.vaultId, "");
      return;
    }
    const switchedVault = loadedVaultRef.current !== vaultId;
    if (switchedVault) {
      loadedVaultRef.current = vaultId;
      setGraph(null);
    }
    const current = agent.entry;
    if (current?.action === "focus") {
      if (consumeGraphOpen(vaultId, threadId)) setGraphOpen(true);
      return;
    }
    if (current?.action === "graph" && current.vaultId === vaultId) {
      const fresh = consumeGraphOpen(vaultId, threadId);
      if (fresh || (!switchedVault && current.nonce !== appliedNonceRef.current)) {
        appliedNonceRef.current = current.nonce;
        setGraphOpen(true);
        return;
      }
      if (switchedVault && !isDesktopPanel) setGraphOpen(false);
      return;
    }
    if (current?.action === "file" && current.vaultId === vaultId && current.nonce !== appliedNonceRef.current) {
      appliedNonceRef.current = current.nonce;
      if (!isDesktopPanel) setGraphOpen(false);
      return;
    }
    if (switchedVault && !isDesktopPanel) setGraphOpen(false);
  }, [agent.entry, vaultId, threadId, isDesktopPanel]);

  useEffect(() => {
    if (workspaceSidebar || (!graphOpen && !graphPeek) || vaultId === null || graph !== null) return;
    let cancelled = false;
    setLoadingGraph(true);
    void rpc
      .call("graph", { vaultId })
      .then((result) => {
        if (!cancelled) setGraph({ nodes: result.nodes, edges: result.edges });
      })
      .catch((cause: unknown) => {
        if (!cancelled) toast.error(errorText(cause, "그래프를 만들지 못했습니다."));
      })
      .finally(() => {
        if (!cancelled) setLoadingGraph(false);
      });
    return () => {
      cancelled = true;
    };
  }, [graph, graphOpen, graphPeek, rpc, vaultId, workspaceSidebar]);
  const viewingFile = activePath !== "" && isProbablyFile(activePath);
  const openFilePath = viewingFile ? activePath : "";
  const routeFolder = viewingFile
    ? activePath.includes("/")
      ? activePath.slice(0, activePath.lastIndexOf("/"))
      : ""
    : activePath;
  const listFolder = routeFolder;
  const vaultIndex = vaultId === null ? undefined : indexByVault[vaultId];
  const index = vaultIndex?.entries ?? [];
  const rawArchive = vaultIndex?.rawArchive ?? {};
  const markdown = useMemo(() => {
    if (doc === null || doc.kind !== "markdown") {
      return { body: "", fields: [] as FrontmatterField[] };
    }
    const split = splitMarkdownFrontmatter(doc.content);
    return {
      body: rewriteVaultMarkdown(split.body, {
        entries: index,
        docPath: doc.path,
        previewBaseUrl,
      }),
      fields: split.frontmatter === null ? [] : parseFrontmatterFields(split.frontmatter),
    };
  }, [doc, index, previewBaseUrl]);
  const hiddenPrefs = useHiddenPrefs();
  const shownIndex = useMemo(
    () => index.filter((entry) => listedEntryVisible(entry.path, hiddenPrefs)),
    [hiddenPrefs, index],
  );
  const treeRows = useMemo(
    () => visibleTreeRows(shownIndex, expandedFolders, query),
    [expandedFolders, query, shownIndex],
  );
  const panelView = panelLayout(panelWidth, viewingFile, panelTreeOpen);
  useLayoutEffect(() => {
    if (!panelView.showList && focusFileOnSelect.current) {
      panelListButtonRef.current?.focus({ preventScroll: true });
      focusFileOnSelect.current = false;
    }
  }, [panelView.showList]);
  const showList = isDesktopPanel ? panelView.showList || panelTreeOpen : !stacked || !viewingFile;
  const propsSheet = propertiesUseSheet({ device: chrome.device, viewport: chrome.viewport });

  useEffect(() => {
    const tree = workspaceSurface && vaultId ? workspaceSession.tree(vaultId) : { query: "", expanded: [] };
    setExpandedFolders(new Set(tree.expanded));
    if (workspaceSurface) setQuery(tree.query);
  }, [vaultId, workspaceSurface]);

  function changeQuery(next: string) {
    setQuery(next);
    if (workspaceSurface && vaultId) workspaceSession.setTree(vaultId, { query: next, expanded: [...expandedFolders] });
  }

  function toggleFolder(path: string) {
    const next = new Set(expandedFolders);
    if (next.has(path)) next.delete(path);
    else next.add(path);
    setExpandedFolders(next);
    if (workspaceSurface && vaultId) workspaceSession.setTree(vaultId, { query, expanded: [...next] });
  }

  const folderScrollKey = listScrollKey(vaultId, "");

  useLayoutEffect(() => {
    const el = listScrollerRef.current;
    if (el === null) return;
    if (query.trim() === "") el.scrollTop = readListScroll(folderScrollKey);
    return () => {
      if (query.trim() === "") writeListScroll(folderScrollKey, el.scrollTop);
    };
  }, [folderScrollKey, query, showList, treeRows.length]);

  useEffect(() => {
    if (activePath === "") return;
    listScrollerRef.current
      ?.querySelector(`[data-vault-path="${CSS.escape(activePath)}"]`)
      ?.scrollIntoView({ block: "nearest" });
  }, [activePath]);

  const goTo = useCallback(
    (nextVault: string, nextPath: string, replace = false) => {
      const encoded = encodeRoute(nextVault, nextPath);
      if (workspaceSurface && !replace && isProbablyFile(nextPath)) workspaceSession.setGraphOpen(false);
      if (onRoute !== undefined) {
        onRoute(encoded);
        return;
      }
      navigate.toPluginPanel(PANEL_PATH, {
        subPath: encoded,
        replace,
      });
    },
    [navigate, onRoute, workspaceSurface],
  );
  const goToRef = useRef(goTo);
  goToRef.current = goTo;

  const onWikiClick = useCallback(
    (event: MouseEvent<HTMLDivElement>) => {
      if (event.defaultPrevented || event.button !== 0) return;
      if (event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) return;
      if (vaultId === null) return;
      const node = event.target;
      if (!(node instanceof Element)) return;
      const anchor = node.closest("a");
      if (anchor === null) return;
      const path = parseVaultLinkHref(anchor.getAttribute("href"));
      if (path === null) return;
      event.preventDefault();
      goTo(vaultId, path);
    },
    [goTo, vaultId],
  );

  useEffect(() => {
    if (workspaceSidebar || vaultId === null) {
      setPreviewRoot(null);
      return;
    }
    let cancelled = false;
    let refreshTimer: ReturnType<typeof setTimeout> | undefined;
    setPreviewError(null);
    void rpc
      .call("previewRoot", { vaultId })
      .then((result) => {
        if (cancelled) return;
        setPreviewRoot(result);
        refreshTimer = setTimeout(() => {
          setPreviewRoot(current => current && current.expiresAtMs <= Date.now() ? null : current);
          setPreviewRetry(value => value + 1);
        }, Math.max(1000, result.expiresAtMs - Date.now() - 15_000));
      })
      .catch(() => {
        if (!cancelled) {
          setPreviewRoot(null);
          setPreviewError(vaultId);
        }
      });
    return () => {
      cancelled = true;
      clearTimeout(refreshTimer);
    };
  }, [rpc, vaultId, activePath, previewRetry, workspaceSidebar]);

  useEffect(() => {
    const remembered = rememberedVaults();
    if (remembered.length > 0) {
      setVaults(remembered);
      setLoadingVaults(false);
    } else {
      setLoadingVaults(true);
    }
    let cancelled = false;
    void rpc
      .call("listVaults")
      .then((result) => {
        if (cancelled) return;
        publishVaults(result.vaults);
        setVaults(result.vaults);
      })
      .catch((cause: unknown) => {
        if (!cancelled) toast.error(errorText(cause, "볼트 목록을 읽지 못했습니다."));
      })
      .finally(() => {
        if (!cancelled) setLoadingVaults(false);
      });
    const unsub = subscribeVaults((next) => {
      setVaults(next);
      setIndexByVault((current) => {
        const keep: Record<string, VaultIndex> = {};
        for (const vault of next) {
          const listed = current[vault.id];
          if (listed !== undefined) keep[vault.id] = listed;
        }
        return keep;
      });
      for (const key of Object.keys(rememberedIndex)) {
        if (!next.some((vault) => vault.id === key)) delete rememberedIndex[key];
      }
    });
    return () => {
      cancelled = true;
      unsub();
    };
  }, [rpc]);

  useEffect(() => {
    if (vaults[0] === undefined) return;
    const known = route.vaultId !== null && vaults.some((vault) => vault.id === route.vaultId);
    if (known && route.vaultId !== null) {
      if (workspaceSurface) {
        if (viewingFile) workspaceSession.open({ vaultId: route.vaultId, path: route.path });
        else workspaceSession.setRoute(encodeRoute(route.vaultId, route.path));
      } else writeSessionRoute(encodeRoute(route.vaultId, route.path));
      return;
    }
    const last = decodeRoute(workspaceSurface ? workspaceSession.read().route : readSessionRoute());
    if (last.vaultId !== null && vaults.some((vault) => vault.id === last.vaultId)) {
      goTo(last.vaultId, last.path, true);
      return;
    }
    goTo(vaults[0].id, "", true);
  }, [goTo, route.path, route.vaultId, vaults, viewingFile, workspaceSurface]);

  useEffect(() => {
    if (vaultId === null) return;
    const cached = indexByVault[vaultId] ?? rememberedIndex[vaultId];
    if (cached !== undefined) {
      if (indexByVault[vaultId] === undefined) {
        setIndexByVault((current) => ({ ...current, [vaultId]: cached }));
      }
      return;
    }
    let cancelled = false;
    setLoadingIndex(true);
    void rpc
      .call("listIndex", { vaultId })
      .then((result) => {
        if (cancelled) return;
        const listed: VaultIndex = { entries: result.entries, rawArchive: result.rawArchive };
        rememberedIndex[vaultId] = listed;
        setIndexByVault((current) => ({ ...current, [vaultId]: listed }));
      })
      .catch((cause: unknown) => {
        if (!cancelled) toast.error(errorText(cause, "문서를 나열하지 못했습니다."));
      })
      .finally(() => {
        if (!cancelled) setLoadingIndex(false);
      });
    return () => {
      cancelled = true;
    };
  }, [indexByVault, rpc, vaultId]);

  useEffect(() => {
    if (workspaceSidebar || vaultId === null || !viewingFile) {
      setDoc(null);
      setLoadingDoc(false);
      return;
    }
    let cancelled = false;
    if (workspaceMain) setDoc(null);
    setLoadingDoc(true);
    const request = isImageFileName(activePath)
      ? rpc.call("previewImage", { vaultId, path: activePath }).then((result) => ({
          ...result,
          kind: "image" as const,
        }))
      : rpc.call("readDoc", { vaultId, path: activePath });
    void request
      .then((result) => {
        if (!cancelled) setDoc(result);
      })
      .catch((cause: unknown) => {
        if (cancelled) return;
        toast.error(errorText(cause, "문서를 열지 못했습니다."));
        setDoc(null);
      })
      .finally(() => {
        if (!cancelled) setLoadingDoc(false);
      });
    return () => {
      cancelled = true;
    };
  }, [activePath, rpc, vaultId, viewingFile, workspaceSidebar]);

  const documentScrollerRef = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const element = documentScrollerRef.current;
    if (!workspaceMain || !element || !doc || doc.vaultId !== vaultId || doc.path !== activePath) return;
    const target = { vaultId: doc.vaultId, path: doc.path };
    element.scrollTop = workspaceSession.reading(target).top;
    return () => { workspaceSession.setReading(target, { top: element.scrollTop, mode: viewMode }); };
  }, [doc, workspaceMain, vaultId, activePath, viewMode, graphOpen]);

  const activeVault = vaults.find((vault) => vault.id === vaultId);
  const listPane = (
    <div
      className="flex h-full min-h-0 min-w-0 w-full flex-col"
      onKeyDown={(event) => {
        if (
          (event.ctrlKey || event.metaKey) &&
          !event.shiftKey &&
          !event.altKey &&
          (event.key === "f" || event.key === "F")
        ) {
          event.preventDefault();
          setFilterFocusTick((tick) => tick + 1);
        }
      }}
    >
      <Toolbar
        rootLabel={activeVault?.name ?? "Vault"}
        query={query}
        onQueryChange={changeQuery}
        filterFocusTick={filterFocusTick}
        graphOpen={graphPeek}
        onOpenGraph={workspaceSidebar ? undefined : isDesktopPanel ? undefined : stacked ? () => setGraphOpen(true) : undefined}
        onToggleGraph={workspaceSurface || isDesktopPanel || stacked ? undefined : () => setGraphPeek((open) => !open)}
        vaults={vaults}
        vaultId={vaultId}
        onSelectVault={(id) => goTo(id, "")}
        className={workspaceSidebar ? undefined : isDesktopPanel ? panelView.compact ? undefined : "pr-9" : !stacked ? "pr-9" : undefined}
      />
      <div
        ref={listScrollerRef}
        className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto overscroll-contain"
        onScroll={(event) => {
          if (query.trim() !== "") return;
          writeListScroll(folderScrollKey, event.currentTarget.scrollTop);
        }}
      >
        {loadingVaults || (loadingIndex && index.length === 0) ? (
          <p className={cn("p-4 text-muted-foreground", COARSE_POINTER_TEXT_BASE_CLASS)}>불러오는 중…</p>
        ) : null}
        {!loadingIndex && treeRows.length === 0 ? (
          <p className={cn("p-4 text-muted-foreground", COARSE_POINTER_TEXT_BASE_CLASS)}>
            {query.trim() ? "검색과 맞는 이름이 없습니다." : "이 볼트가 비어 있습니다."}
          </p>
        ) : null}
        <ul className="py-1" role="tree">
          {treeRows.map((row) => {
            const item = row.entry;
            const selected = item.path === activePath;
            const expanded = item.kind === "directory" && (query.trim() !== "" || expandedFolders.has(item.path));
            return (
              <li key={item.path} role="none">
                <button
                  type="button"
                  role="treeitem"
                  aria-selected={selected}
                  aria-expanded={item.kind === "directory" ? expanded : undefined}
                  data-vault-path={item.path}
                  title={item.path}
                  style={{ paddingLeft: TREE_BASE + row.depth * TREE_INDENT }}
                  className={cn(
                    "relative flex w-full min-w-0 items-center gap-1.5 pr-2 text-left",
                    COARSE_POINTER_TREE_ROW_SIZE_CLASS,
                    selected ? "bg-accent text-accent-foreground" : "hover:bg-state-hover",
                  )}
                  onClick={() => {
                    if (item.kind === "directory") {
                      toggleFolder(item.path);
                      return;
                    }
                    if (vaultId === null) return;
                    focusFileOnSelect.current = isDesktopPanel && panelView.compact;
                    setPanelTreeOpen(false);
                    goTo(vaultId, item.path);
                  }}
                >
                  {row.depth > 0
                    ? Array.from({ length: row.depth }, (_, level) => (
                        <span
                          key={level}
                          aria-hidden
                          className="pointer-events-none absolute top-0 bottom-0 w-px bg-border"
                          style={{ left: TREE_BASE + level * TREE_INDENT + TREE_GUIDE_X }}
                        />
                      ))
                    : null}
                  <Icon
                    name={
                      item.kind === "directory" ? "Folder" : isImageFileName(item.path) ? "File" : "FileText"
                    }
                    className={COARSE_POINTER_TREE_ICON_CLASS}
                  />
                  <span className="min-w-0 flex-1 truncate">
                    {boldQuery(item.kind === "file" ? fileLabel(item.name) : item.name, query)}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );

  const showProps = doc !== null && doc.kind === "markdown" && viewMode === "preview" && markdown.fields.length > 0;
  function setPropertiesOpen(open: boolean) {
    setPropsOpen(open);
    storeFrontmatterOpen(open);
  }

  const detailPane = (
    <div className="relative flex min-h-0 min-w-0 flex-1 flex-col">
      {!workspaceSurface && !isDesktopPanel && stacked && viewingFile ? (
        <div className="flex items-center gap-2 border-b border-border px-3 py-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className={cn("in-data-[phone-metrics]:h-8 in-data-[phone-metrics]:px-2.5", COARSE_POINTER_HEADER_TITLE_CLASS)}
            onClick={() => {
              if (vaultId === null) return;
              goTo(vaultId, listFolder);
            }}
          >
            <Icon name="ChevronLeft" className="size-4" />
            목록
          </Button>
          <span className="min-w-0 flex-1" />
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className={cn("h-7 w-7 p-0", COARSE_POINTER_ICON_BUTTON_GROW_CLASS)}
            aria-label="그래프 보기"
            onClick={() => setGraphOpen(true)}
          >
            <Icon name="GitBranch" className="size-3.5" />
          </Button>
        </div>
      ) : null}
      {!viewingFile ? (
        <div
          className="flex flex-1 items-center justify-center p-6"
          role="status"
          aria-label="문서를 고르세요"
        >
          <Icon name="FolderOpen" className="size-10 text-muted-foreground opacity-40" />
        </div>
      ) : loadingDoc && doc === null ? (
        <p className={cn("p-4 text-muted-foreground", COARSE_POINTER_TEXT_BASE_CLASS)}>여는 중…</p>
      ) : doc === null ? (
        <p className={cn("p-4 text-muted-foreground", COARSE_POINTER_TEXT_BASE_CLASS)}>이 문서를 찾지 못했습니다.</p>
      ) : (
        <>
          {!workspaceMain ? <div
            className={cn(
              "flex shrink-0 items-center gap-2 border-b border-border pr-2 transition-[padding] duration-[420ms] ease-[cubic-bezier(0.32,0.72,0,1)] motion-reduce:transition-none",
              COARSE_POINTER_HEADER_BAR_CLASS,
              !isDesktopPanel && !stacked && listCollapsed ? "pl-12" : "pl-3",
            )}
          >
            <h1 className={cn("min-w-0 flex-1 truncate font-medium", COARSE_POINTER_HEADER_TITLE_CLASS)}>{fileLabel(doc.name)}</h1>
            {showProps ? (
              <button
                type="button"
                className={cn(
                  "inline-flex size-8 shrink-0 items-center justify-center rounded-md",
                  propsOpen
                    ? "bg-state-active text-foreground"
                    : "text-muted-foreground hover:bg-state-hover hover:text-foreground",
                )}
                aria-pressed={propsOpen}
                aria-label="속성"
                onClick={() => setPropertiesOpen(!propsOpen)}
              >
                <Icon name="SlidersHorizontal" className="size-3.5 in-data-[phone-metrics]:size-4" />
              </button>
            ) : null}
            {doc.kind === "markdown" || doc.kind === "html" ? (
              <DocViewToggle mode={viewMode} onChange={setViewMode} />
            ) : null}
          </div> : null}
          <div className="flex min-h-0 min-w-0 flex-1">
            {doc.kind === "image" ? (
              <div className="min-h-0 min-w-0 flex-1">
                <ImagePreview url={doc.url} name={fileLabel(doc.name)} />
              </div>
            ) : (
            <div ref={documentScrollerRef} data-testid="vault-document-scroll" data-vault-document={`${doc.vaultId}/${doc.path}`} className="min-h-0 min-w-0 flex-1 overflow-x-hidden overflow-y-auto overscroll-contain"
              onScroll={event => { if (workspaceMain && doc.vaultId === vaultId && doc.path === activePath) workspaceSession.setReading(doc, { top: event.currentTarget.scrollTop, mode: viewMode }); }}>
              {doc.kind === "html" && viewMode === "preview" ? (
                htmlSrc !== null ? <div className="m-4 flex min-h-[24rem] flex-1 flex-col">
                  <div className="mb-1 flex justify-end">
                    <Button variant="ghost" size="icon" aria-label="HTML 미리보기 새로고침" onClick={() => { setPreviewRoot(null); setPreviewRetry(value => value + 1); }}>
                      <Icon name="RotateCcw" className="size-4" />
                    </Button>
                  </div>
                  <iframe
                    title={doc.name}
                    sandbox="allow-scripts"
                    src={htmlSrc}
                    onError={() => { setPreviewRoot(null); setPreviewError(vaultId); }}
                    className="h-full min-h-[24rem] w-full flex-1 rounded-md border border-border bg-background"
                  />
                </div> : <div role={previewError === vaultId ? "alert" : "status"} className="m-4 flex flex-col items-start gap-2 text-sm text-muted-foreground">
                  <p>{previewError === vaultId ? "HTML 미리보기를 불러오지 못했습니다." : "HTML 미리보기를 불러오는 중…"}</p>
                  {previewError === vaultId ? <Button variant="outline" size="sm" onClick={() => setPreviewRetry(value => value + 1)}>다시 시도</Button> : null}
                </div>
              ) : doc.kind === "markdown" && viewMode === "preview" ? (
                <div className={cn("flex w-full justify-center px-4 pt-6 sm:px-8 sm:pt-8", !workspaceMain && COARSE_POINTER_MARKDOWN_BODY_CLASS)}>
                  <div className="w-full min-w-0 max-w-prose" onClickCapture={onWikiClick}>
                    {isDesktopPanel ? <TextHighlights ranges={focus?.highlights ?? []} requestKey={focus?.nonce ?? ""}><Markdown content={markdown.body} /></TextHighlights> : <Markdown content={markdown.body} />}
                  </div>
                </div>
              ) : doc.kind === "markdown" || doc.kind === "html" || doc.kind === "text" ? (
                <div className="p-4">
                  {doc.kind !== "html" && isDesktopPanel ? <TextHighlights ranges={focus?.highlights ?? []} requestKey={focus?.nonce ?? ""}><SourceCode content={doc.content} path={doc.path} overflow="wrap" /></TextHighlights> : <SourceCode content={doc.content} path={doc.path} overflow="wrap" />}
                </div>
              ) : (
                <pre className={cn("whitespace-pre-wrap break-all p-4 font-mono leading-6", COARSE_POINTER_TEXT_BASE_CLASS)}>{doc.content}</pre>
              )}
              {!(doc.kind === "html" && viewMode === "preview") ? <DocumentEndSpace /> : null}
            </div>
            )}
          </div>
          {showProps && !propsSheet && propsOpen ? (
            <PropertiesDock onClose={() => setPropertiesOpen(false)}>
              <FrontmatterPanel
                fields={markdown.fields}
                docPath={doc.path}
                index={index}
                vaultId={vaultId}
                rawByHash={rawArchive}
                onOpen={goTo}
              />
            </PropertiesDock>
          ) : null}
          {showProps && propsSheet ? (
            <PropertiesSheet open={propsOpen} onClose={() => setPropertiesOpen(false)}>
              <FrontmatterPanel
                drawerOpen={propsOpen}
                fields={markdown.fields}
                docPath={doc.path}
                index={index}
                vaultId={vaultId}
                rawByHash={rawArchive}
                onOpen={goTo}
              />
            </PropertiesSheet>
          ) : null}
        </>
      )}
    </div>
  );

  const showDetail = !stacked || viewingFile;

  if (workspaceSidebar) return <div ref={sidebarRef} data-phone-metrics={phoneSized ? "" : undefined}
    className="vault-workspace-sidebar flex min-h-0 min-w-0 flex-col overflow-hidden bg-background text-foreground">{listPane}</div>;

  if (workspaceMain) {
    const selected = workspace.active;
    const activeTabIndex = workspace.tabs.findIndex(tab => selected && documentKey(tab) === documentKey(selected));
    const openDocument = (target: DocumentRef) => { setGraphOpen(false); goTo(target.vaultId, target.path); };
    const closeDocument = (target: DocumentRef) => {
      const wasActive = workspaceSession.read().active;
      const next = workspaceSession.close(target);
      if (wasActive && documentKey(wasActive) === documentKey(target)) {
        if (next) goTo(next.vaultId, next.path);
        else goTo(target.vaultId, "");
      }
    };
    return <div className="vault-workspace flex h-full min-h-0 min-w-0 flex-col overflow-hidden bg-background text-foreground" data-phone-metrics={phoneSized ? "" : undefined}>
      <div data-testid="vault-workspace-header" className="flex h-10 min-h-10 shrink-0 items-center border-b border-border">
        <VaultDocumentTabs tabs={workspace.tabs} active={selected} panelId={documentPanelId} onSelect={openDocument} onClose={closeDocument} />
        <div data-vault-document-actions className="flex shrink-0 items-center gap-0.5 px-1">
          {showProps ? <button type="button" aria-label="속성" title="속성" aria-pressed={propsOpen} onClick={() => setPropertiesOpen(!propsOpen)}
            className="flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-state-hover aria-pressed:bg-state-active in-data-[phone-metrics]:size-8"><Icon name="SlidersHorizontal" aria-hidden className="size-3.5" /></button> : null}
          {doc?.kind === "markdown" || doc?.kind === "html" ? <DocViewToggle compact mode={viewMode} onChange={setViewMode} /> : null}
          <button type="button" aria-label={graphOpen ? "문서 보기" : "그래프 보기"} title={graphOpen ? "문서 보기" : "그래프 보기"} aria-pressed={graphOpen} onClick={() => setGraphOpen(open => !open)}
            className="flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-state-hover in-data-[phone-metrics]:size-8"><Icon name={graphOpen ? "FileText" : "GitBranch"} aria-hidden className="size-3.5" /></button>
          <button type="button" aria-label="Chat 열기" title="Chat 열기" onClick={() => appPanel.openTab?.({ tab: { id: "chat", context: { kind: "nav-panel", panelId: "docs" }, availability: "fixed" } })}
            className="flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-state-hover in-data-[phone-metrics]:size-8"><Icon name="MessageSquare" aria-hidden className="size-3.5" /></button>
        </div>
      </div>
      <div id={documentPanelId} role={selected && !graphOpen ? "tabpanel" : undefined} aria-labelledby={selected && !graphOpen ? `${documentPanelId}-tab-${activeTabIndex}` : undefined} className="flex min-h-0 min-w-0 flex-1 flex-col">
        {graphOpen ? <GraphView nodes={graph?.nodes ?? []} edges={graph?.edges ?? []} activePath={activePath} highlightPaths={highlightPaths} onOpen={path => { if (vaultId) openDocument({ vaultId, path }); }} /> : detailPane}
      </div>
    </div>;
  }

  if (isDesktopPanel) {
    return (
      <div ref={panelRef} data-testid="vault-panel" data-phone-metrics={phoneSized ? "" : undefined} className="flex h-full min-h-0 min-w-0 flex-col bg-background text-foreground" onKeyDown={(event) => {
        if (event.key !== "Escape" || !panelView.showList || !viewingFile) return;
        event.preventDefault(); event.stopPropagation();
        setPanelTreeOpen(false);
        panelListButtonRef.current?.focus({ preventScroll: true });
      }}>
        <div className="flex shrink-0 items-center gap-1 border-b border-border px-2 py-1">
          {panelView.compact ? (
            viewingFile ? <Button ref={panelListButtonRef} type="button" variant="ghost" size="sm" aria-label={panelView.showList ? "파일로 돌아가기" : "파일 목록 열기"} onClick={() => setPanelTreeOpen(open => !open)} className="h-7 gap-1 px-2">
              <Icon name={panelView.showList ? "ChevronRight" : "PanelLeft"} className="size-3.5" />
              {panelView.showList ? "문서" : "목록"}
            </Button> : <span className="px-2 text-xs text-muted-foreground">파일 목록</span>
          ) : <Dialog.Root open={panelTreeOpen} onOpenChange={setPanelTreeOpen}>
            <Dialog.Trigger asChild>
              <Button type="button" variant="ghost" size="sm" aria-label="파일 목록 열기" className={cn("h-7 w-7 p-0", COARSE_POINTER_ICON_BUTTON_GROW_CLASS)}>
                <Icon name="PanelLeft" className="size-3.5" />
              </Button>
            </Dialog.Trigger>
            <Dialog.Portal>
              <Dialog.Overlay className="fixed inset-0 z-50 bg-background/60" />
              <Dialog.Content data-phone-metrics={phoneSized ? "" : undefined} style={{ width: "min(24rem, 90vw)" }} className="fixed inset-y-0 right-0 z-50 flex min-w-0 flex-col border-l border-border bg-background text-foreground shadow-lg outline-none">
                <Dialog.Title className="sr-only">파일 목록</Dialog.Title>
                <Dialog.Description className="sr-only">열 문서를 선택하세요.</Dialog.Description>
                <Dialog.Close asChild>
                  <Button type="button" variant="ghost" size="sm" aria-label="파일 목록 닫기" className={cn("absolute right-1 top-1 z-10 h-7 w-7 p-0", COARSE_POINTER_ICON_BUTTON_GROW_CLASS)}><Icon name="X" className="size-3.5" /></Button>
                </Dialog.Close>
                {listPane}
              </Dialog.Content>
            </Dialog.Portal>
          </Dialog.Root>}
        </div>
        {panelView.showList ? <section aria-label="파일 목록" className="flex min-h-0 min-w-0 flex-1 flex-col">{listPane}</section> : null}
        <div className={cn("relative min-h-0 min-w-0 flex-1 flex-col", panelView.showList ? "hidden" : "flex")}>
          {detailPane}
          <FloatingGraphCard open={panelGraphOpen} onOpenChange={setGraphOpen}>
              <Button type="button" variant="ghost" size="icon" aria-label="그래프 닫기" onClick={() => setGraphOpen(false)} className={cn("absolute left-2 top-2 z-30 size-6", COARSE_POINTER_ICON_BUTTON_GROW_CLASS)}>
                <Icon name="X" className="size-3.5" />
              </Button>
              {loadingGraph && graph === null ? (
                <p className={cn("p-4 pt-10 text-muted-foreground", COARSE_POINTER_TEXT_BASE_CLASS)}>그래프를 그리는 중…</p>
              ) : (
                <GraphView transparent documentMode nodes={graph?.nodes ?? []} edges={graph?.edges ?? []} activePath={activePath} highlightPaths={highlightPaths} onOpen={(path) => {
                  if (vaultId !== null) goTo(vaultId, path);
                }} />
              )}
          </FloatingGraphCard>
        </div>
      </div>
    );
  }

  if (graphOpen) {
    return (
      <div
        data-phone-metrics={phoneSized ? "" : undefined}
        className="flex h-full min-h-0 flex-col bg-background text-foreground"
      >
        <div className="flex items-center gap-2 border-b border-border px-3 py-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className={cn("in-data-[phone-metrics]:h-8 in-data-[phone-metrics]:px-2.5", COARSE_POINTER_HEADER_TITLE_CLASS)}
            onClick={() => setGraphOpen(false)}
          >
            <Icon name="ChevronLeft" className="size-4" />
            닫기
          </Button>
          <h1 className={cn("min-w-0 flex-1 truncate font-medium", COARSE_POINTER_HEADER_TITLE_CLASS)}>3D 그래프</h1>
        </div>
        {loadingGraph && graph === null ? (
          <p className={cn("p-6 text-muted-foreground", COARSE_POINTER_TEXT_BASE_CLASS)}>그래프를 그리는 중…</p>
        ) : (
          <GraphView
            nodes={graph?.nodes ?? []}
            edges={graph?.edges ?? []}
            activePath={activePath}
            highlightPaths={highlightPaths}
            onOpen={(path) => {
              if (vaultId === null) return;
              setGraphOpen(false);
              goTo(vaultId, path);
            }}
          />
        )}
      </div>
    );
  }

  return (
    <div
      data-phone-metrics={phoneSized ? "" : undefined}
      className={cn(
        "relative flex h-full min-h-0 bg-background text-foreground",
        resizing ? "select-none" : "",
      )}
      style={cornerDrag.current !== null ? { cursor: graphCornerCursor } : undefined}
    >
      {stacked ? (
        showList ? listPane : null
      ) : showList ? (
        <div
          className={cn(
            "relative h-full max-w-[70%] shrink-0 overflow-hidden",
            resizing ? "" : PANEL_WIDTH_MOTION,
          )}
          style={{ width: listCollapsed ? 0 : listWidth }}
        >
          <div
            data-testid="vault-list-card"
            aria-hidden={listCollapsed}
            inert={listCollapsed}
            className="absolute inset-y-0 left-0 flex flex-col bg-background"
            style={{ width: listWidth }}
          >
            <div className="flex min-h-0 flex-1 flex-col">
              <div
                className="flex min-h-0 flex-col"
                style={{ flexGrow: graphPeek ? 1 - graphSplit : 1, flexBasis: 0 }}
              >
                {listPane}
              </div>
              {graphPeek ? (
                <div
                  role="separator"
                  aria-orientation="horizontal"
                  aria-label="그래프 높이"
                  aria-valuemin={Math.round(GRAPH_SPLIT_MIN * 100)}
                  aria-valuemax={Math.round(GRAPH_SPLIT_MAX * 100)}
                  aria-valuenow={Math.round(graphSplit * 100)}
                  tabIndex={0}
                  className={cn(
                    "relative z-10 h-px shrink-0 cursor-row-resize touch-none before:absolute before:inset-x-0 before:-top-1.5 before:h-3 before:content-['']",
                    resizing && (graphSplitDrag.current !== null || cornerDrag.current !== null)
                      ? "bg-primary"
                      : "bg-border",
                  )}
                  onPointerDown={onGraphSplitPointerDown}
                  onPointerMove={onGraphSplitPointerMove}
                  onPointerUp={onGraphSplitPointerUp}
                  onPointerCancel={onGraphSplitPointerUp}
                  onDoubleClick={() => applyGraphSplit(GRAPH_SPLIT_DEFAULT)}
                  onKeyDown={onGraphSplitKeyDown}
                />
              ) : null}
              {graphPeek ? (
                <div
                  className="relative flex min-h-0 flex-col"
                  style={{ flexGrow: graphSplit, flexBasis: 0 }}
                  aria-label="그래프"
                >
                  {loadingGraph && graph === null ? (
                    <p className={cn("p-4 text-muted-foreground", COARSE_POINTER_TEXT_BASE_CLASS)}>그래프를 그리는 중…</p>
                  ) : (
                    <GraphView
                      nodes={graph?.nodes ?? []}
                      edges={graph?.edges ?? []}
                      activePath={activePath}
                      highlightPaths={highlightPaths}
                      onFullscreen={() => setGraphOpen(true)}
                      onOpen={(path) => {
                        if (vaultId === null) return;
                        goTo(vaultId, path);
                      }}
                    />
                  )}
                  <div
                    data-testid="vault-graph-corner"
                    role="separator"
                    aria-label="그래프 크기"
                    aria-orientation="horizontal"
                    aria-valuemin={LIST_WIDTH_MIN}
                    aria-valuemax={LIST_WIDTH_MAX}
                    aria-valuenow={listWidth}
                    aria-valuetext={`너비 ${listWidth}픽셀, 높이 ${Math.round(graphSplit * 100)}퍼센트`}
                    tabIndex={0}
                    className="absolute top-0 right-0 z-20 size-10 touch-none outline-none focus-visible:ring-1 focus-visible:ring-ring"
                    style={{ cursor: graphCornerCursor }}
                    onPointerDown={onCornerPointerDown}
                    onPointerMove={onCornerPointerMove}
                    onPointerUp={onCornerPointerUp}
                    onPointerCancel={onCornerPointerUp}
                    onDoubleClick={() => {
                      applyListWidth(LIST_WIDTH_DEFAULT);
                      applyGraphSplit(GRAPH_SPLIT_DEFAULT);
                    }}
                    onKeyDown={onCornerKeyDown}
                  />
                </div>
              ) : null}
            </div>
            <div
              role="separator"
              aria-orientation="vertical"
              aria-label="사이드바 너비"
              aria-valuemin={LIST_WIDTH_MIN}
              aria-valuemax={LIST_WIDTH_MAX}
              aria-valuenow={listWidth}
              tabIndex={listCollapsed ? -1 : 0}
              className={cn(
                "absolute inset-y-0 right-0 z-10 w-px cursor-col-resize touch-none before:absolute before:inset-y-0 before:-left-1.5 before:w-3 before:content-['']",
                resizing && (resizeDrag.current !== null || cornerDrag.current !== null) ? "bg-primary" : "bg-border",
              )}
              onPointerDown={onResizePointerDown}
              onPointerMove={onResizePointerMove}
              onPointerUp={onResizePointerUp}
              onPointerCancel={onResizePointerUp}
              onDoubleClick={() => applyListWidth(LIST_WIDTH_DEFAULT)}
              onKeyDown={onResizeKeyDown}
            />
          </div>
        </div>
      ) : null}
      {showDetail ? detailPane : null}
      {!stacked ? (
        <button
          type="button"
          aria-label={listCollapsed ? "파일 목록 펼치기" : "파일 목록 접기"}
          aria-pressed={!listCollapsed}
          data-testid="vault-list-collapse"
          className={cn(
            "absolute top-1 z-30 inline-flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-state-hover hover:text-foreground",
            resizing
              ? ""
              : "transition-[left] duration-[420ms] ease-[cubic-bezier(0.32,0.72,0,1)] motion-reduce:transition-none",
          )}
          style={{ left: listCollapsed ? 8 : Math.max(8, listWidth - 36) }}
          onClick={() => collapseList(!listCollapsed)}
        >
          <Icon name="PanelLeft" className="size-3.5" />
        </button>
      ) : null}
    </div>
  );
}

const VaultScreen = withPanelSplash("Vault", <BrandIcon className="size-9" />, DocsReaderPanel);
const VaultWorkspaceScreen = withPanelSplash("Vault", <BrandIcon className="size-9" />, (props: PluginNavPanelProps) => <DocsReaderPanel {...props} surface="workspace" />);
const VaultSidebar = (props: PluginNavPanelProps) => <DocsReaderPanel {...props} surface="sidebar" />;

function ThreadVaultPanel(props: PluginThreadPanelProps) {
  const [subPath, setSubPath] = useState(readSessionRoute);
  return <VaultScreen subPath={subPath} onRoute={setSubPath} surface="panel" threadId={props.threadId} />;
}

export default definePluginApp((app) => {
  const workspaceSupported = registerVaultChatTab(app.slots);
  app.slots.navPanel({
    id: "docs",
    title: "Vault",
    icon: "vault/amethyst",
    path: PANEL_PATH,
    component: workspaceSupported ? VaultWorkspaceScreen : VaultScreen,
    ...(workspaceSupported ? { experimental_sidebar: VaultSidebar } : {}),
  });

  app.slots.threadPanelAction({
    id: THREAD_VAULT_ACTION_ID,
    title: "Vault",
    icon: "FileText",
    layout: "flush",
    component: ThreadVaultPanel,
  });

  app.slots.settingsSection({
    id: "vaults",
    title: "볼트",
    description: "패널에 보여줄 폴더를 넣고, 끌어다 놓아 순서를 바꿉니다.",
    component: SettingsSection,
  });

  app.slots.settingsSection({
    id: "hidden-files",
    title: "숨김 파일",
    description: "점으로 시작하는 파일과 폴더를 숨깁니다. 다른 이름도 더할 수 있습니다.",
    component: HiddenFilesSettings,
  });

  app.slots.messageDirective({ id: "vault-excerpt", component: VaultExcerptDirective });
  app.slots.messageDirective({ id: "vault-focus", component: VaultFocusDirective });
  app.slots.messageDirective({ id: "vault-file", component: VaultFileDirective });
  app.slots.messageDirective({ id: "vault-graph", component: VaultGraphDirective });

  app.slots.experimental_threadHeaderAction({ id: "panel-open", title: "Vault 표시 연결", component: PanelOpenBridge });
});
