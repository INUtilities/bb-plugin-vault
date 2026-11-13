import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  applyAgentEntry,
  consumeAgentRoute,
  consumeGraphOpen,
  highlightPathsFor,
  mergeHighlightPaths,
  readAgentEntry,
  resetAgentEntry,
  shouldEnterVaultRoute,
  vaultNavigationFor,
  vaultPanelSubPath,
} from "./agent-entry.ts";
import type { PanelOpenRequest } from "./panel-open.ts";

function graph(nonce: string, paths: string[], vaultId = "notes"): PanelOpenRequest {
  return {
    threadId: "thr_1",
    action: "graph",
    vaultId,
    paths,
    title: "3D 그래프",
    nonce,
  };
}

function file(nonce: string, path = "folder/a.md", vaultId = "notes"): PanelOpenRequest {
  return {
    threadId: "thr_1",
    action: "file",
    vaultId,
    path,
    title: "a",
    nonce,
  };
}

describe("agent entry", () => {
  it("appends graph lights per vault and leaves them on a file open", () => {
    resetAgentEntry();
    assert.deepEqual(mergeHighlightPaths(["a.md"], ["c.md", "a.md"]), ["a.md", "c.md"]);
    applyAgentEntry(graph("n1", ["a.md", "b.md"]));
    applyAgentEntry(graph("n2", ["c.md", "a.md"]));
    applyAgentEntry(graph("n3", ["z.md"], "other"));
    assert.deepEqual(highlightPathsFor("notes"), ["a.md", "b.md", "c.md"]);
    assert.deepEqual(highlightPathsFor("other"), ["z.md"]);
    applyAgentEntry(graph("n4", []));
    assert.deepEqual(highlightPathsFor("notes"), ["a.md", "b.md", "c.md"]);
    assert.equal(readAgentEntry()?.action, "graph");
    applyAgentEntry(file("n5"));
    assert.equal(readAgentEntry()?.action, "file");
    assert.deepEqual(highlightPathsFor("notes"), ["a.md", "b.md", "c.md"]);
    applyAgentEntry(graph("n6", ["a.md", "b.md"]));
    assert.deepEqual(highlightPathsFor("notes"), ["a.md", "b.md", "c.md"]);
  });

  it("arms the fullscreen graph once, and a file open disarms it", () => {
    resetAgentEntry();
    applyAgentEntry(graph("n1", ["a.md"]));
    assert.equal(consumeGraphOpen("other"), false);
    assert.equal(consumeGraphOpen("notes"), true);
    assert.equal(consumeGraphOpen("notes"), false);
    applyAgentEntry(graph("n2", ["b.md"]));
    assert.deepEqual(consumeAgentRoute(), { action: "graph", vaultId: "notes", path: "" });
    applyAgentEntry(file("n3", "folder/a.md"));
    assert.equal(consumeGraphOpen("notes"), false);
    assert.deepEqual(consumeAgentRoute(), { action: "file", vaultId: "notes", path: "folder/a.md" });
    assert.equal(consumeAgentRoute(), null);
  });

  it("skips navigation when the vault screen is already showing that place", () => {
    resetAgentEntry();
    const notesGraph = applyAgentEntry(graph("n1", ["a.md"]));
    assert.equal(vaultPanelSubPath(notesGraph), "notes");
    assert.equal(shouldEnterVaultRoute("/plugins/vault/docs/notes", notesGraph), false);
    assert.equal(shouldEnterVaultRoute("/plugins/vault/docs/notes/folder/a.md", notesGraph), false);
    assert.equal(shouldEnterVaultRoute("/plugins/vault/docs/notes-extra", notesGraph), true);
    assert.equal(shouldEnterVaultRoute("/threads/thr_1", notesGraph), true);
    const encoded = "/plugins/vault/docs/notes/wiki/%EA%B2%A9%EC%9E%90.md";
    const hangul = applyAgentEntry(file("n2", "wiki/격자.md"));
    assert.equal(shouldEnterVaultRoute(encoded, hangul), false);
    assert.equal(vaultNavigationFor("/plugins/vault/docs/notes/wiki/other.md", hangul)?.subPath, "notes/wiki/격자.md");
    assert.equal(vaultNavigationFor(encoded, hangul), null);
  });
});

describe("focus state", () => {
  it("isolates threads, replaces lights, and only highlights the matching file", async () => {
    const { focusFor, readAgentSnapshot } = await import("./agent-entry.ts");
    resetAgentEntry();
    const a = { threadId: "thr_1", action: "focus" as const, vaultId: "notes", path: "a.md", title: "a", nonce: "one", highlights: [{ text: "hello" }], graphPaths: ["a.md"] };
    applyAgentEntry(a);
    applyAgentEntry({ ...a, threadId: "thr_2", path: "b.md", graphPaths: ["b.md"] });
    assert.deepEqual(readAgentSnapshot("thr_1").lights.notes, ["a.md"]);
    assert.deepEqual(readAgentSnapshot("thr_2").lights.notes, ["b.md"]);
    assert.equal(focusFor("thr_1", "notes", "b.md"), null);
    assert.equal(focusFor("thr_1", "other", "a.md"), null);
    assert.equal(focusFor("thr_1", "notes", "a.md")?.nonce, "one");
    applyAgentEntry({ ...a, nonce: "repeat", graphPaths: undefined });
    assert.deepEqual(readAgentSnapshot("thr_1").lights.notes, ["a.md"]);
    assert.equal(focusFor("thr_1", "notes", "a.md")?.nonce, "repeat");
    applyAgentEntry({ ...a, nonce: "two", graphPaths: [] });
    assert.equal(focusFor("thr_1", "notes", "a.md")?.nonce, "two");
    assert.deepEqual(readAgentSnapshot("thr_1").lights.notes, []);
    applyAgentEntry(file("three"));
    assert.equal(focusFor("thr_1", "notes", "a.md"), null);
  });
});

it("preserves a pending graph open across an offscreen focus without graphPaths", () => {
  resetAgentEntry();
  applyAgentEntry({ threadId: "thr_1", action: "focus", vaultId: "notes", path: "a.md", title: "a", nonce: "one", highlights: [], graphPaths: ["a.md"] });
  applyAgentEntry({ threadId: "thr_1", action: "focus", vaultId: "notes", path: "b.md", title: "b", nonce: "two", highlights: [] });
  assert.deepEqual(highlightPathsFor("notes", "thr_1"), ["a.md"]);
  assert.equal(consumeGraphOpen("notes", "thr_1"), true);
  assert.equal(consumeGraphOpen("notes", "thr_1"), false);
});

it("keeps pending graph intents isolated and clears them for a plain file open", () => {
  resetAgentEntry();
  const first = { threadId: "thr_1", action: "focus" as const, vaultId: "notes", path: "a.md", title: "a", nonce: "one", highlights: [], graphPaths: [] };
  applyAgentEntry(first);
  applyAgentEntry({ ...first, threadId: "thr_2", nonce: "two" });
  applyAgentEntry({ ...first, vaultId: "other", path: "b.md", nonce: "three", graphPaths: undefined });
  assert.equal(consumeGraphOpen("notes", "thr_1"), false);
  assert.equal(consumeGraphOpen("other", "thr_1"), true);
  assert.equal(consumeGraphOpen("notes", "thr_2"), true);
  applyAgentEntry(first);
  applyAgentEntry(file("plain"));
  assert.equal(consumeGraphOpen("notes", "thr_1"), false);
});
