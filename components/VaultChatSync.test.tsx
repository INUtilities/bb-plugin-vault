import assert from "node:assert/strict";
import { afterEach, it } from "node:test";
import { useSyncExternalStore } from "react";
import { act, cleanup, waitFor } from "@testing-library/react";
import { renderSlot } from "@get-bb/plugin-sdk/testing/app";
import { useVaultChatSync } from "../lib/vault-chat-sync";
import { chatKey, vaultChatSession } from "../lib/vault-chat";

afterEach(cleanup);
function Probe({ projectId }: { projectId: string | null }) {
  const sync = useVaultChatSync(projectId);
  const thread = useSyncExternalStore(vaultChatSession.subscribe, () => vaultChatSession.read(chatKey(projectId)), () => null);
  return <div data-testid="sync" data-ready={sync.ready} data-thread={thread ?? "null"} data-error={sync.error ?? ""} />;
}
const ready = (view: ReturnType<typeof renderSlot>) => waitFor(() => assert.equal(view.container.querySelector("[data-testid=sync]")!.getAttribute("data-ready"), "true"));
const deferred = <T,>() => { let resolve!: (value: T) => void; const promise = new Promise<T>(done => { resolve = done; }); return { promise, resolve }; };

it("honors shared null over old caches and migrates a missing record with an atomic onlyIfMissing write", async () => {
  vaultChatSession.receive(chatKey("shared-null"), "old-device");
  const existing = renderSlot({ component: Probe }, { projectId: "shared-null" }, { rpc: { readChatConnection: () => ({ threadId: null, revision: 2 }) } as never });
  await ready(existing);
  assert.equal(vaultChatSession.read(chatKey("shared-null")), null);
  assert.deepEqual(existing.inspection.rpcCalls.map(c => c.method), ["readChatConnection"]);
  vaultChatSession.receive(chatKey("migration-race"), "local");
  const migration = renderSlot({ component: Probe }, { projectId: "migration-race" }, { rpc: {
    readChatConnection: () => null,
    writeChatConnection: () => ({ threadId: "other-device-won", revision: 1 }),
  } as never });
  await ready(migration);
  assert.equal(vaultChatSession.read(chatKey("migration-race")), "other-device-won");
  assert.deepEqual(migration.inspection.rpcCalls.at(-1)?.input, { projectId: "migration-race", threadId: "local", onlyIfMissing: true });
});

it("does not turn an empty first visit into a choice that blocks legacy migration", async () => {
  const view = renderSlot({ component: Probe }, { projectId: "empty-first" }, { rpc: { readChatConnection: () => null } as never });
  await ready(view);
  assert.deepEqual(view.inspection.rpcCalls.map(c => c.method), ["readChatConnection"]);
});

it("does not lose a realtime signal received while an earlier read is in flight, and ignores other projects", async () => {
  const pending = deferred<{ threadId: string; revision: number }>(); let reads = 0;
  const view = renderSlot({ component: Probe }, { projectId: "signals" }, { rpc: {
    readChatConnection: () => ++reads === 1 ? pending.promise : { threadId: "latest", revision: 2 },
  } as never });
  await view.behavior.emitRealtime("vault/chat-connection", { projectId: "other-project" });
  assert.equal(reads, 1);
  await view.behavior.emitRealtime("vault/chat-connection", { projectId: "signals" });
  await act(async () => { pending.resolve({ threadId: "old", revision: 1 }); });
  await ready(view);
  assert.equal(reads, 2);
  assert.equal(vaultChatSession.read(chatKey("signals")), "latest");
});

it("rejects late lower revisions and serializes rapid local choices", async () => {
  const key = chatKey("ordered"), late = deferred<{ threadId: string; revision: number }>(); let reads = 0;
  const first = deferred<{ threadId: string; revision: number }>(); const writes: (string | null)[] = [];
  const view = renderSlot({ component: Probe }, { projectId: "ordered" }, { rpc: {
    readChatConnection: () => ++reads === 1 ? { threadId: "old", revision: 1 } : late.promise,
    writeChatConnection: ({ threadId }: { threadId: string | null }) => { writes.push(threadId); return writes.length === 1 ? first.promise : { threadId, revision: 4 }; },
  } as never });
  await ready(view);
  await view.behavior.emitRealtime("vault/chat-connection", { projectId: "ordered" });
  act(() => { vaultChatSession.connect(key, "created"); vaultChatSession.connect(key, null); });
  await waitFor(() => assert.deepEqual(writes, ["created"]));
  await act(async () => { first.resolve({ threadId: "created", revision: 3 }); });
  await waitFor(() => assert.deepEqual(writes, ["created", null]));
  await act(async () => { late.resolve({ threadId: "late-old", revision: 2 }); });
  assert.equal(vaultChatSession.read(key), null);
});

it("refetches on socket reconnect, focus, online and foreground visibility without crossing scopes", async t => {
  t.mock.getter(document, "visibilityState", () => "visible");
  let revision = 1;
  const view = renderSlot({ component: Probe }, { projectId: "foreground" }, { rpc: {
    readChatConnection: () => ({ threadId: `remote-${revision}`, revision }),
  } as never });
  await ready(view);
  for (const event of ["focus", "online", "visibilitychange"]) {
    revision++;
    act(() => (event === "visibilitychange" ? document : window).dispatchEvent(new window.Event(event)));
    await waitFor(() => assert.equal(vaultChatSession.read(chatKey("foreground")), `remote-${revision}`));
  }
  await view.behavior.setRealtimeConnectionState("reconnecting"); revision++;
  await view.behavior.setRealtimeConnectionState("connected");
  await waitFor(() => assert.equal(vaultChatSession.read(chatKey("foreground")), `remote-${revision}`));
  view.unmount(); const count = view.inspection.rpcCalls.length;
  act(() => window.dispatchEvent(new window.Event("focus")));
  assert.equal(view.inspection.rpcCalls.length, count);
});
