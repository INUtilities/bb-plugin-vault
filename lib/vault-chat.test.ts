import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createChatSession, resolveChatSeeds } from "./vault-chat.ts";

describe("Vault sidebar chat", () => {
  it("starts with no thread and spawns only on first submit, preserving selections with hidden visibility", async () => {
    const chat = createChatSession();
    let calls = 0, received: unknown;
    assert.equal(chat.read("page"), null);
    const request = { input: { text: "explicit user draft" }, permissionMode: "plan", environment: { type: "reuse", environmentId: "env" }, executionInputSources: { model: "explicit" } };
    const spawn = async (value: typeof request) => { calls++; received = value; return { id: "thread-1" }; };
    const first = chat.submit("page", request, spawn);
    const duplicate = chat.submit("page", request, spawn);
    assert.equal(first, duplicate);
    await first;
    assert.equal(calls, 1);
    assert.deepEqual(received, { ...request, visibility: "hidden" });
    assert.equal((received as typeof request).input, request.input);
    assert.equal((received as typeof request).environment, request.environment);
    assert.equal((received as typeof request).executionInputSources, request.executionInputSources);
    assert.equal("visibility" in request, false);
    assert.equal(chat.read("page"), "thread-1");
    chat.connect("page", null);
    assert.equal(chat.read("page"), null);
  });
  it("rejects creation failures so the native composer preserves its draft and can retry", async () => {
    const chat = createChatSession(), request = { input: "draft" };
    await assert.rejects(chat.submit("one", request, async () => { throw Error("offline"); }), /offline/);
    assert.equal(chat.read("one"), null);
    assert.equal(request.input, "draft");
    await chat.submit("one", request, async () => ({ id: "retry" }));
    assert.equal(chat.read("one"), "retry");
  });
  it("keeps late results in their original context and restores only session connections", async () => {
    const values = new Map<string, string>();
    const storage = { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); }, removeItem: (key: string) => { values.delete(key); } };
    const chat = createChatSession(storage);
    let done!: (thread: { id: string }) => void;
    const first = chat.submit("one", {}, () => new Promise(resolve => { done = resolve; }));
    await chat.submit("two", {}, async () => ({ id: "second" }));
    done({ id: "first" }); await first;
    assert.equal(chat.read("two"), "second");
    assert.equal(createChatSession(storage).read("one"), "first");
    assert.equal(createChatSession().read("one"), null);
  });
});

describe("Vault chat metadata boundary", () => {
  const project = { id: "p1", sources: [{ hostId: "h1", path: "/project" }] };
  const sdk = (thread = { projectId: "p1", environmentId: "e1" }, environment = { id: "e1", projectId: "p1", hostId: "h1", status: "ready" }) => ({
    projects: { get: async () => project }, threads: { get: async () => thread }, environments: { get: async () => environment },
  });
  it("does not infer a BB project from a registered vault or source path", async () => {
    const never = { projects: { get: async () => { throw Error("must not infer"); } } };
    assert.deepEqual(await resolveChatSeeds(never as never, { projectId: null, threadId: null }), {});
  });
  it("seeds a confirmed project and exact matching environment", async () => {
    assert.deepEqual(await resolveChatSeeds(sdk(), { projectId: "p1", threadId: "t1" }), { defaultProjectId: "p1", defaultEnvironment: { type: "reuse", environmentId: "e1" } });
    assert.deepEqual(await resolveChatSeeds(sdk(), { projectId: "p1", threadId: null }), { defaultProjectId: "p1" });
  });
  it("rejects a different project, host, stale environment or lookup failure", async () => {
    for (const env of [{ id: "e1", projectId: "other", hostId: "h1", status: "ready" }, { id: "e1", projectId: "p1", hostId: "other", status: "ready" }, { id: "e1", projectId: "p1", hostId: "h1", status: "destroyed" }]) {
      assert.deepEqual(await resolveChatSeeds(sdk(undefined, env), { projectId: "p1", threadId: "t1" }), { defaultProjectId: "p1" });
    }
    assert.deepEqual(await resolveChatSeeds(sdk({ projectId: "other", environmentId: "e1" }), { projectId: "p1", threadId: "t1" }), { defaultProjectId: "p1" });
    assert.deepEqual(await resolveChatSeeds({ projects: { get: async () => { throw Error("offline"); } } } as never, { projectId: "p1", threadId: null }), {});
  });
});

it("does not echo remote updates and saves a successful late spawn after its view unmounts", async () => {
  const chat = createChatSession(); const saved: unknown[] = [];
  const unregister = chat.registerWriter("one", id => { saved.push(id); });
  chat.receive("one", "remote"); assert.deepEqual(saved, []);
  chat.connect("one", null); assert.deepEqual(saved, [null]);
  let finish!: (thread: { id: string }) => void;
  const operation = chat.submit("one", {}, () => new Promise(resolve => { finish = resolve; }));
  unregister(); finish({ id: "already-created" }); await operation;
  assert.deepEqual(saved, [null, "already-created"]);
  assert.equal(chat.read("one"), "already-created");
});
