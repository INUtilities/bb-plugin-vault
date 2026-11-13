import { useEffect, useRef, useState, useSyncExternalStore, type ComponentProps } from "react";
import { experimental_NewThreadComposer as NewThreadComposer, experimental_useSidebarThreads, ThreadChat, useBbContext, useBbNavigate, useSdk } from "@get-bb/plugin-sdk/app";
import { chatKey, resolveChatSeeds, vaultChatSession, type ChatSeeds } from "@/lib/vault-chat";
import { useVaultHeaderAlignment } from "@/lib/vault-header-alignment";
import { useVaultChrome } from "@/lib/use-vault-chrome";
import { cn } from "@/lib/utils";
import { Icon } from "./ui/icon";

export function VaultChatTab() {
  const context = useBbContext();
  const key = chatKey(context.projectId);
  const threadId = useSyncExternalStore(vaultChatSession.subscribe, () => vaultChatSession.read(key), () => null);
  return <VaultConversation key={key} scopeKey={key} context={context} threadId={threadId} />;
}

function VaultConversation({ scopeKey, context, threadId }: {
  scopeKey: string; context: { projectId: string | null; threadId: string | null }; threadId: string | null;
}) {
  const sdk = useSdk(), navigate = useBbNavigate();
  const sdkRef = useRef(sdk);
  sdkRef.current = sdk;
  const { threads } = experimental_useSidebarThreads();
  const root = useRef<HTMLDivElement>(null);
  useVaultHeaderAlignment(root);
  const large = useVaultChrome().hitTarget === "large";
  const mounted = useRef(true), opening = useRef(false);
  const [isOpening, setIsOpening] = useState(false);
  const [seeds, setSeeds] = useState<ChatSeeds | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  useEffect(() => {
    let active = true;
    void resolveChatSeeds(sdkRef.current, context).then(value => { if (active) setSeeds(value); });
    return () => { active = false; };
  }, [context.projectId, context.threadId]);
  const submit: ComponentProps<typeof NewThreadComposer>["onSubmit"] = request => {
    setError(null);
    return vaultChatSession.submit(scopeKey, request, value => sdk.threads.spawn(value)).catch(cause => {
      if (mounted.current) setError(cause instanceof Error ? cause.message : String(cause));
      throw cause; // The native composer keeps its complete draft on failure.
    });
  };
  const openThread = async () => {
    if (!threadId || opening.current) return;
    opening.current = true; setIsOpening(true); setError(null);
    try {
      await sdk.threads.update({ threadId, visibility: "visible" });
      if (mounted.current) navigate.toThread(threadId);
    } catch (cause) {
      if (mounted.current) setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      opening.current = false;
      if (mounted.current) setIsOpening(false);
    }
  };
  const thread = threads.find(value => value.id === threadId);
  const actionClass = cn("flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-state-hover hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:opacity-40", large && "size-9");
  return <div ref={root} className="vault-chat flex h-full min-h-0 min-w-0 flex-col">
    <div className="vault-chat-header flex h-10 shrink-0 items-center gap-2 border-b border-border px-3 text-xs">
      <span className="min-w-0 flex-1 truncate">{threadId ? thread?.displayTitle ?? "Chat" : "New chat"}</span>
      <button type="button" aria-label="New chat" title="New chat" disabled={!threadId || isOpening} className={actionClass}
        onClick={() => { setError(null); vaultChatSession.connect(scopeKey, null); }}><Icon name="MessageSquarePlus" aria-hidden className="size-3.5" /></button>
      <button type="button" aria-label="Open thread" title="Open thread" disabled={!threadId || isOpening} aria-busy={isOpening || undefined}
        className={actionClass} onClick={() => void openThread()}><Icon name="ExternalLink" aria-hidden className="size-3.5" /></button>
    </div>
    {error ? <p role="alert" className="px-3 pt-2 text-xs text-destructive">{error}</p> : null}
    {threadId ? <ThreadChat key={threadId} threadId={threadId} variant={thread?.isArchived ? "timeline" : "compact"} permissionPolicy="inherit" className="min-h-0 flex-1" />
      : seeds ? <NewThreadComposer {...seeds} draftKey={`${scopeKey}:draft`} layout="contained" placeholder="대화를 시작하세요…" onSubmit={submit} className="min-h-0 min-w-0 flex-1 px-4 pb-4 pt-2" />
        : <p role="status" className="p-3 text-xs text-muted-foreground">불러오는 중…</p>}
  </div>;
}

// Keep the existing SDK pin while using the current host's public navigation tab.
export function registerVaultChatTab(hostSlots: unknown): boolean {
  const slots = hostSlots as { experimental_tab?: (registration: {
    id: string; context: { kind: "nav-panel"; panelId: string }; availability: "fixed";
    title: string; icon: string; layout: "flush"; component: typeof VaultChatTab;
  }) => void };
  if (!slots.experimental_tab) return false;
  slots.experimental_tab({ id: "chat", context: { kind: "nav-panel", panelId: "docs" }, availability: "fixed", title: "Chat", icon: "MessageSquare", layout: "flush", component: VaultChatTab });
  return true;
}
