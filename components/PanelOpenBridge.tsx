import { useEffect } from "react";
import { useBbNavigate, useRealtime } from "@get-bb/plugin-sdk/app";

import { applyAgentEntry, readAgentEntry } from "@/lib/agent-entry";
import { PANEL_OPEN_CHANNEL, THREAD_VAULT_ACTION_ID, parsePanelOpenRequest } from "@/lib/panel-open";
import { useAgentSnapshot } from "@/components/use-agent-entry";

// Keep delivered requests across thread header remounts in this app session.
const openedRequests = new Map<string, string>();

/** Own panel navigation inside the header's thread context. */
export function PanelOpenBridge({ threadId }: { threadId: string }) {
  const navigate = useBbNavigate();
  const agent = useAgentSnapshot(threadId);

  useRealtime(PANEL_OPEN_CHANNEL, (payload) => {
    const request = parsePanelOpenRequest(payload);
    if (request && readAgentEntry(request.threadId)?.nonce !== request.nonce) {
      applyAgentEntry(request);
    }
  });

  useEffect(() => {
    const request = agent.entry;
    if (!request || openedRequests.get(threadId) === request.nonce) return;
    if (navigate.openThreadPanel({ actionId: THREAD_VAULT_ACTION_ID, title: "Vault" })) {
      openedRequests.set(threadId, request.nonce);
    }
  }, [agent.entry, navigate, threadId]);

  return null;
}
