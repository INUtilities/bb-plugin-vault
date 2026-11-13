import { useLayoutEffect, useRef } from "react";
import { documentKey, type DocumentRef } from "@/lib/workspace-session";
import { cn } from "@/lib/utils";
import { postImpact, readHapticBridge } from "@/lib/tab-haptic";
import { Icon } from "./ui/icon";

export function VaultDocumentTabs({ tabs, active, panelId, onSelect, onClose }: {
  tabs: DocumentRef[]; active: DocumentRef | null; panelId: string;
  onSelect: (doc: DocumentRef) => void; onClose: (doc: DocumentRef) => void;
}) {
  const root = useRef<HTMLDivElement>(null);
  const lastImpact = useRef(new WeakMap<HTMLButtonElement, number>());
  const pulse = (button: HTMLButtonElement) => {
    const now = performance.now(), previous = lastImpact.current.get(button);
    if (previous !== undefined && now - previous < 400) return;
    if (postImpact(readHapticBridge(window))) lastImpact.current.set(button, now);
  };
  const selectedKey = active && documentKey(active);
  useLayoutEffect(() => { root.current?.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: "nearest", inline: "nearest" }); }, [selectedKey, tabs.length]);
  return <div ref={root} role="tablist" aria-label="열린 문서" className="vault-document-tabs flex h-full min-w-0 flex-1 overflow-x-auto">
    {tabs.map((doc, index) => {
      const selected = documentKey(doc) === selectedKey;
      const label = doc.path.split("/").at(-1) ?? doc.path;
      const focusTab = (next: number) => root.current?.querySelectorAll<HTMLButtonElement>('[role="tab"]')[next]?.focus();
      const select = (next: number) => { onSelect(tabs[next]); focusTab(next); };
      return <div key={documentKey(doc)} className={cn("flex h-full max-w-64 min-w-20 shrink-0 items-center border-r border-border", selected && "bg-surface-selected")}>
        <button type="button" role="tab" id={`${panelId}-tab-${index}`} aria-controls={panelId} aria-selected={selected}
          title={`${doc.vaultId}/${doc.path}`} tabIndex={selected || (!active && index === 0) ? 0 : -1}
          className="h-full min-w-0 flex-1 truncate px-3 text-left text-xs text-muted-foreground aria-selected:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-ring"
          onClick={event => { pulse(event.currentTarget); onSelect(doc); }} onKeyDown={event => {
            const next = event.key === "Home" ? 0 : event.key === "End" ? tabs.length - 1
              : event.key === "ArrowRight" ? (index + 1) % tabs.length : event.key === "ArrowLeft" ? (index + tabs.length - 1) % tabs.length : null;
            if (next !== null) { event.preventDefault(); pulse(event.currentTarget); select(next); }
            if (event.key === "Delete") { event.preventDefault(); pulse(event.currentTarget); if (tabs.length > 1) focusTab(index === tabs.length - 1 ? index - 1 : index + 1); onClose(doc); }
          }}>{label}</button>
        <button type="button" aria-label={`문서 닫기: ${label}`} title="문서 닫기" tabIndex={selected ? 0 : -1}
          className="mr-1 flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-state-hover hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring in-data-[phone-metrics]:size-8"
          onClick={event => { pulse(event.currentTarget); if (selected && tabs.length > 1) focusTab(index === tabs.length - 1 ? index - 1 : index + 1); onClose(doc); }}><Icon name="X" aria-hidden className="size-3" /></button>
      </div>;
    })}
    {tabs.length === 0 ? <span className="flex items-center px-3 text-xs text-muted-foreground">문서를 고르세요</span> : null}
  </div>;
}
