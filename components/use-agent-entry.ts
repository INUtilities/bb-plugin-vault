import { useEffect, useState } from "react";
import { readAgentSnapshot, subscribeAgentEntry, type AgentSnapshot } from "@/lib/agent-entry";

export function useAgentSnapshot(threadId: string): AgentSnapshot {
  const [, setVersion] = useState(0);
  useEffect(() => subscribeAgentEntry(() => setVersion((version) => version + 1)), []);
  return readAgentSnapshot(threadId);
}
