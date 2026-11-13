import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createWorkspaceSession, documentKey } from "./workspace-session.ts";

function storage() {
  const data = new Map<string, string>();
  return { getItem: (key: string) => data.get(key) ?? null, setItem: (key: string, value: string) => { data.set(key, value); } };
}
const a = { vaultId: "one", path: "folder/한글.md" };
const b = { vaultId: "two", path: a.path };

describe("Vault workspace documents", () => {
  it("uses vault and path identity, including delimiter-containing names", () => {
    const session = createWorkspaceSession(storage());
    session.open(a); session.open(a); session.open(b);
    assert.deepEqual(session.read().tabs, [a, b]);
    assert.notEqual(documentKey({ vaultId: "a:b", path: "c" }), documentKey({ vaultId: "a", path: "b:c" }));
    session.open(a);
    assert.deepEqual(session.read().active, a);
    assert.equal(session.read().tabs.length, 2);
  });
  it("closes to the adjacent document and reopens without losing reading position or mode", () => {
    const session = createWorkspaceSession(storage());
    session.open(a); session.setReading(a, { top: 720, mode: "source" }); session.open(b);
    assert.deepEqual(session.close(b), a);
    assert.deepEqual(session.read().active, a);
    assert.equal(session.close(a), null);
    assert.equal(session.read().route, "one");
    session.open(a);
    assert.deepEqual(session.reading(a), { top: 720, mode: "source" });
  });
  it("closing a background tab leaves the selected document in place", () => {
    const session = createWorkspaceSession(storage());
    session.open(a); session.open(b); session.close(a);
    assert.deepEqual(session.read().active, b);
  });
  it("restores tabs, last route, tree and reading state across page remounts in one browser session", () => {
    const saved = storage(), first = createWorkspaceSession(saved);
    first.open(a); first.open(b); first.open(a);
    first.setTree("one", { query: "한글", expanded: ["folder"] });
    first.setReading(a, { top: 320, mode: "preview" });
    first.setGraphOpen(true);
    const reopened = createWorkspaceSession(saved);
    assert.deepEqual(reopened.read().tabs, [a, b]);
    assert.deepEqual(reopened.read().active, a);
    assert.equal(reopened.read().route, "one/folder/한글.md");
    assert.deepEqual(reopened.tree("one"), { query: "한글", expanded: ["folder"] });
    assert.equal(reopened.reading(a).top, 320);
    assert.equal(reopened.read().graphOpen, true);
    assert.equal(createWorkspaceSession(storage()).read().tabs.length, 0);
  });
  it("tracks directory routes without treating a folder as a document", () => {
    const session = createWorkspaceSession(storage());
    session.open(a); session.setRoute("one/folder");
    assert.deepEqual(session.read().tabs, [a]);
    assert.equal(session.read().active, null);
    assert.equal(session.read().route, "one/folder");
  });
  it("preserves directory and root browsing routes when inactive document tabs close", () => {
    for (const route of ["two/folder", "two"]) {
      const saved = storage(), session = createWorkspaceSession(saved);
      session.open(a); session.open(b); session.setRoute(route);
      session.close(a);
      assert.equal(session.read().route, route);
      assert.equal(session.read().active, null);
      assert.deepEqual(session.read().tabs, [b]);
      assert.equal(createWorkspaceSession(saved).read().route, route);
      session.close(b);
      assert.equal(session.read().route, route);
      assert.equal(session.read().active, null);
      assert.deepEqual(session.read().tabs, []);
    }
  });
  it("rejects corrupted session state and remains usable when storage is unavailable", () => {
    const broken = { getItem: () => "{bad", setItem: () => { throw Error("unavailable"); } };
    const session = createWorkspaceSession(broken);
    session.open(a); session.setReading(a, { top: -20, mode: "preview" });
    assert.equal(session.read().tabs.length, 1);
    assert.equal(session.reading(a).top, 0);
  });
});
