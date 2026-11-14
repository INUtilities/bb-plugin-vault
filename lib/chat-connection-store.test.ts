import assert from "node:assert/strict";
import { it } from "node:test";
import { createChatConnectionStore } from "./chat-connection-store.ts";

it("serializes simultaneous writes and migrations, preserves explicit null, isolates projects and persists across loads", async () => {
  const values = new Map<string, unknown>(), signals: unknown[] = [];
  const kv = { get: async (key: string) => values.get(key), set: async (key: string, value: unknown) => { await Promise.resolve(); values.set(key, value); } };
  const store = createChatConnectionStore(kv, project => { assert.ok(values.has(`chat-connection:${project ?? "none"}`)); signals.push(project); });
  assert.equal(await store.read("p1"), null);
  const [a, b, c] = await Promise.all([store.write("p1", "desktop", true), store.write("p1", "stale", true), store.write("p1", null)]);
  assert.deepEqual(a, { threadId: "desktop", revision: 1 });
  assert.deepEqual(b, a);
  assert.deepEqual(c, { threadId: null, revision: 2 });
  assert.deepEqual(await store.write("p1", "another-stale", true), c);
  await store.write("p2", "second");
  await store.write(null, "global");
  assert.deepEqual(await createChatConnectionStore(kv, () => {}).read("p1"), c);
  assert.deepEqual(await store.read("p2"), { threadId: "second", revision: 1 });
  assert.deepEqual(await store.read(null), { threadId: "global", revision: 1 });
  assert.deepEqual(signals, ["p1", "p1", "p2", null]);
});

it("does not publish failed saves and lets the next queued write recover", async () => {
  const values = new Map<string, unknown>(); let fail = true, published = 0;
  const store = createChatConnectionStore({ get: async key => values.get(key), set: async (key, value) => {
    if (fail) { fail = false; throw Error("offline"); } values.set(key, value);
  } }, () => { published++; });
  const first = store.write("p", "created");
  const retry = store.write("p", "created");
  await assert.rejects(first, /offline/);
  assert.deepEqual(await retry, { threadId: "created", revision: 1 });
  assert.equal(published, 1);
});
