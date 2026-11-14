import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useRealtime, useRealtimeConnectionState, useRpc } from "@get-bb/plugin-sdk/app";
import type { rpcContract } from "../server";
import type { ChatConnection } from "./chat-connection-store";
import { chatKey, vaultChatSession } from "./vault-chat";

type Rpc = ReturnType<typeof useRpc<typeof rpcContract>>;
const initial = { ready: false, error: null as string | null };
const states = new Map<string, typeof initial>();
const records = new Map<string, ChatConnection>();
const intents = new Map<string, { id: string | null; token: number }>();
const writes = new Map<string, Promise<void>>();
const reads = new Map<string, Promise<void>>();
const dirty = new Set<string>();
const listeners = new Set<() => void>();
let token = 0;
const subscribe = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; };
function status(key: string, next: typeof initial) {
  const before = states.get(key) ?? initial;
  if (before.ready === next.ready && before.error === next.error) return;
  states.set(key, next); listeners.forEach(listener => listener());
}
function accept(key: string, connection: ChatConnection) {
  if (connection.revision >= (records.get(key)?.revision ?? 0)) records.set(key, connection);
  if (!intents.has(key)) vaultChatSession.receive(key, records.get(key)!.threadId);
}
function save(key: string, projectId: string | null, rpc: Rpc, id: string | null) {
  const current = { id, token: ++token };
  intents.set(key, current);
  status(key, { ready: true, error: null });
  const operation = (writes.get(key) ?? Promise.resolve()).then(async () => {
    const result = await rpc.call("writeChatConnection", { projectId, threadId: id });
    accept(key, result);
    if (intents.get(key)?.token === current.token) {
      intents.delete(key); accept(key, result);
      status(key, { ready: true, error: null });
    }
  }).catch(cause => {
    if (intents.get(key)?.token === current.token) status(key, { ready: true, error: syncError(cause) });
  }).finally(() => { if (writes.get(key) === operation) writes.delete(key); });
  writes.set(key, operation);
  return operation;
}
function syncError(cause: unknown) {
  return `채팅 연결을 동기화하지 못했습니다: ${cause instanceof Error ? cause.message : String(cause)}`;
}
function refresh(key: string, projectId: string | null, rpc: Rpc): Promise<void> {
  dirty.add(key);
  const existing = reads.get(key);
  if (existing) return existing;
  const operation = (async () => {
    do {
      dirty.delete(key);
      try {
        const failed = intents.get(key);
        if (failed && states.get(key)?.error) await save(key, projectId, rpc, failed.id);
        await writes.get(key);
        let result = await rpc.call("readChatConnection", { projectId });
        // Only the old cache may seed an absent server record. Existing shared
        // choices, including explicit New chat, always take precedence.
        if (result === null && !intents.has(key) && vaultChatSession.hasCache(key)) result = await rpc.call("writeChatConnection", {
          projectId, threadId: vaultChatSession.read(key), onlyIfMissing: true,
        });
        if (result) accept(key, result);
        if (!intents.has(key)) status(key, { ready: true, error: null });
      } catch (cause) {
        status(key, { ready: states.get(key)?.ready ?? false, error: syncError(cause) });
      }
      // A signal received during the RPC still requires a later read.
    } while (dirty.has(key));
  })().finally(() => { if (reads.get(key) === operation) reads.delete(key); });
  reads.set(key, operation);
  return operation;
}

export function useVaultChatSync(projectId: string | null) {
  const rpc = useRpc<typeof rpcContract>();
  const key = chatKey(projectId);
  const connection = useRealtimeConnectionState();
  const previousConnection = useRef(connection);
  const [checkedKey, setCheckedKey] = useState<string | null>(null);
  const state = useSyncExternalStore(subscribe, () => states.get(key) ?? initial, () => initial);
  const retry = () => refresh(key, projectId, rpc);
  useRealtime("vault/chat-connection", payload => {
    if (typeof payload === "object" && payload !== null && "projectId" in payload && payload.projectId === projectId) void refresh(key, projectId, rpc);
  });
  useEffect(() => {
    let mounted = true;
    const unregister = vaultChatSession.registerWriter(key, id => { void save(key, projectId, rpc, id); });
    void refresh(key, projectId, rpc).then(() => { if (mounted) setCheckedKey(key); });
    const foreground = () => { if (document.visibilityState !== "hidden") void refresh(key, projectId, rpc); };
    window.addEventListener("focus", foreground);
    window.addEventListener("online", foreground);
    document.addEventListener("visibilitychange", foreground);
    return () => {
      mounted = false; unregister();
      window.removeEventListener("focus", foreground);
      window.removeEventListener("online", foreground);
      document.removeEventListener("visibilitychange", foreground);
    };
  }, [key, projectId, rpc]);
  useEffect(() => {
    const before = previousConnection.current;
    previousConnection.current = connection;
    if (connection === "connected" && before !== "connected") void refresh(key, projectId, rpc);
  }, [connection, key, projectId, rpc]);
  return { ready: checkedKey === key && state.ready, error: state.error, retry };
}
