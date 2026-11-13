import { useEffect, useState } from "react";
import { Markdown, useBbNavigate, useRpc, type PluginMessageDirectiveProps } from "@get-bb/plugin-sdk/app";

import { BrandIcon } from "@/components/BrandIcon";
import { Icon } from "@/components/ui/icon";
import { applyAgentEntry } from "@/lib/agent-entry";
import { THREAD_VAULT_ACTION_ID, fileTitle, newPanelNonce } from "@/lib/panel-open";
import { excerptFromContent, parseVaultExcerptAttributes, type ExcerptTarget } from "@/lib/vault-excerpt";
import { useDeviceChrome } from "@/lib/use-device";
import type { rpcContract } from "@/server";

type Excerpt = ReturnType<typeof excerptFromContent>;

function ExcerptCard({ target, threadId }: { target: ExcerptTarget; threadId: string }) {
  const rpc = useRpc<typeof rpcContract>();
  const navigate = useBbNavigate();
  const { hitTarget } = useDeviceChrome();
  const [excerpt, setExcerpt] = useState<Excerpt | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const { vaultId, path, startLine, endLine } = target;

  useEffect(() => {
    let cancelled = false;
    setStatus("loading");
    setExcerpt(null);
    void rpc.call("readDoc", { vaultId, path }).then((doc) => {
      const result = excerptFromContent(doc.content, path, startLine, endLine);
      if (!cancelled) {
        setExcerpt(result);
        setStatus("ready");
      }
    }).catch(() => {
      if (!cancelled) setStatus("error");
    });
    return () => { cancelled = true; };
  }, [rpc, vaultId, path, startLine, endLine]);

  function open() {
    applyAgentEntry({ action: "file", threadId, vaultId, path, title: fileTitle(path), nonce: newPanelNonce() });
    navigate.openThreadPanel({ actionId: THREAD_VAULT_ACTION_ID, title: "Vault" });
  }

  return (
    <div className="my-2 max-w-full overflow-hidden rounded-lg border border-border bg-card p-3 text-foreground shadow-none">
      <div className="flex min-w-0 items-center gap-2">
        <BrandIcon className="size-3.5 shrink-0" />
        <span className="min-w-0 flex-1 truncate text-xs font-semibold" title={path}>{fileTitle(path)}</span>
        <button type="button" onClick={open} aria-label="Vault에서 열기" title="Vault에서 열기" className={`inline-flex shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-state-hover hover:text-foreground ${hitTarget === "large" ? "size-10" : "size-8"}`}>
          <Icon name="ExternalLink" className="size-4" />
        </button>
      </div>
      {status === "loading" ? <p role="status" className="mt-2 text-xs text-muted-foreground">내용을 불러오는 중…</p> : null}
      {status === "error" ? <p role="status" className="mt-2 text-xs text-muted-foreground">내용을 불러오지 못했습니다.</p> : null}
      {status === "ready" && excerpt ? (
        <div className="mt-2 max-h-56 overflow-auto break-words text-xs leading-relaxed [&_p]:text-xs [&_li]:text-xs [&_h1]:text-sm [&_h2]:text-[13px] [&_h3]:text-xs [&_pre]:text-[11px]">
          {/\.(md|markdown)$/iu.test(path) ? <Markdown content={excerpt.text} /> : <div className="whitespace-pre-wrap">{excerpt.text}</div>}
        </div>
      ) : null}
      <div role="group" aria-label="파일 정보" className="-mx-3 -mb-3 mt-3 flex min-w-0 items-center gap-3 border-t border-border bg-muted/30 px-3 py-2 text-[11px] leading-4 text-muted-foreground">
        <span className="min-w-0 flex-1 truncate font-mono" title={path}>{path}</span>
        {status === "ready" && excerpt ? <span className="shrink-0 whitespace-nowrap tabular-nums">{excerpt.startLine}–{excerpt.endLine}줄{excerpt.truncated ? " · 일부만 표시" : ""}</span> : null}
      </div>
    </div>
  );
}

export function VaultExcerptDirective({ attributes, source, message }: PluginMessageDirectiveProps) {
  const target = parseVaultExcerptAttributes(attributes);
  if (target === null) return <span>{source}</span>;
  return <ExcerptCard key={JSON.stringify(target)} target={target} threadId={message.threadId} />;
}
