import assert from "node:assert/strict";
import { afterEach, it } from "node:test";
import { act, cleanup, fireEvent, waitFor } from "@testing-library/react";
import { renderSlot } from "@get-bb/plugin-sdk/testing/app";
import { DocsReaderPanel } from "../app";
import { workspaceSession } from "../lib/workspace-session";
import { writeSessionRoute } from "../lib/session-route";

afterEach(cleanup);
const vaults = [{ id: "test-one", name: "One", hostId: "host", rootPath: "/read-only-one" }, { id: "test-two", name: "Two", hostId: "host", rootPath: "/read-only-two" }];
const entries = [{ kind: "file", path: "Alpha.md", name: "Alpha" }, { kind: "file", path: "Beta.md", name: "Beta" }];
const rpc = {
  listVaults: () => ({ vaults }),
  listIndex: ({ vaultId }: { vaultId: string }) => ({ vaultId, entries, rawArchive: {} }),
  readDoc: ({ vaultId, path }: { vaultId: string; path: string }) => ({ vaultId, path, name: path, kind: "markdown", content: `# ${vaultId}/${path}\n\nRead-only fixture.` }),
  previewRoot: ({ vaultId }: { vaultId: string }) => ({ vaultId, baseUrl: "https://vault.test/preview", expiresAtMs: Date.now() + 3600000 }),
};
const ready = (view: ReturnType<typeof renderSlot>, path: string) => waitFor(() => assert.ok(view.getByTestId("vault-document-scroll").textContent?.includes(path)));

it("reuses the reader for routed document tabs, preserves positions and modes, and keeps vault identities distinct", async () => {
  const view = renderSlot({ component: DocsReaderPanel }, { subPath: "test-one/Alpha.md", surface: "workspace" as const }, { rpc: rpc as never });
  await ready(view, "test-one/Alpha.md");
  const scroller = view.getByTestId("vault-document-scroll");
  scroller.scrollTop = 240; fireEvent.scroll(scroller);
  fireEvent.click(view.getByRole("button", { name: "원문 보기" }));
  view.rerender(<DocsReaderPanel subPath="test-one/Beta.md" surface="workspace" />);
  await ready(view, "test-one/Beta.md");
  assert.equal(view.getAllByRole("tab").length, 2);
  view.rerender(<DocsReaderPanel subPath="test-one/Alpha.md" surface="workspace" />);
  await ready(view, "test-one/Alpha.md");
  assert.equal(view.getByTestId("vault-document-scroll").scrollTop, 240);
  assert.ok(view.getByRole("button", { name: "미리보기 보기" }));
  view.rerender(<DocsReaderPanel subPath="test-two/Alpha.md" surface="workspace" />);
  await ready(view, "test-two/Alpha.md");
  assert.equal(view.getAllByRole("tab").length, 3);
  assert.equal(view.getAllByRole("tab").filter(tab => tab.getAttribute("aria-selected") === "true").length, 1);
  const readsBefore = view.inspection.rpcCalls.filter(call => call.method === "readDoc").length;
  fireEvent.click(view.getAllByRole("tab", { name: "Alpha.md" }).at(-1)!);
  assert.equal(view.inspection.rpcCalls.filter(call => call.method === "readDoc").length, readsBefore);
  fireEvent.click(view.getAllByRole("button", { name: "문서 닫기: Alpha.md" }).at(-1)!);
  assert.equal(view.getAllByRole("tab").length, 2);
  assert.equal(view.inspection.navigateCalls.at(-1)?.method, "toPluginPanel");
});

it("keeps the existing tree in its sidebar, remembers search, and does not load document bodies there", async () => {
  const view = renderSlot({ component: DocsReaderPanel }, { subPath: "test-one/Alpha.md", surface: "sidebar" as const }, { rpc: rpc as never });
  await view.findByRole("treeitem", { name: "Alpha" });
  assert.equal(view.queryByTestId("vault-document-scroll"), null);
  assert.equal(view.inspection.rpcCalls.filter(call => call.method === "readDoc").length, 0);
  fireEvent.click(view.getByTestId("vault-filter"));
  fireEvent.change(view.getByTestId("vault-search"), { target: { value: "Alpha" } });
  assert.equal(view.getAllByRole("treeitem").length, 1);
  view.unmount();
  const reopened = renderSlot({ component: DocsReaderPanel }, { subPath: "test-one/Alpha.md", surface: "sidebar" as const }, { rpc: rpc as never });
  await act(async () => {});
  assert.equal((reopened.getByTestId("vault-search") as HTMLInputElement).value, "Alpha");
});

it("restores the navigation session independently from thread file-panel routes", async () => {
  workspaceSession.open({ vaultId: "test-one", path: "Beta.md" });
  writeSessionRoute("test-two/Alpha.md");
  const view = renderSlot({ component: DocsReaderPanel }, { subPath: "", surface: "workspace" as const }, { rpc: rpc as never });
  await waitFor(() => assert.ok(view.inspection.navigateCalls.some(call => JSON.stringify(call).includes("test-one/Beta.md"))));
  assert.equal(workspaceSession.read().route, "test-one/Beta.md");
});

it("closing a background document during directory browsing keeps the route for re-entry", async () => {
  workspaceSession.open({ vaultId: "test-one", path: "Alpha.md" });
  workspaceSession.open({ vaultId: "test-two", path: "Beta.md" });
  const view = renderSlot({ component: DocsReaderPanel }, { subPath: "test-two/folder", surface: "workspace" as const }, { rpc: rpc as never });
  await waitFor(() => assert.equal(workspaceSession.read().route, "test-two/folder"));
  fireEvent.click(view.getAllByRole("button", { name: "문서 닫기: Alpha.md" })[0]);
  assert.equal(workspaceSession.read().route, "test-two/folder");
  assert.equal(workspaceSession.read().active, null);
  assert.equal(view.inspection.navigateCalls.length, 0);
  view.unmount();
  const reopened = renderSlot({ component: DocsReaderPanel }, { subPath: "", surface: "workspace" as const }, { rpc: rpc as never });
  await waitFor(() => assert.ok(reopened.inspection.navigateCalls.some(call => JSON.stringify(call).includes("test-two/folder"))));
  assert.equal(reopened.getByTitle("test-two/Beta.md").getAttribute("role"), "tab");
});
