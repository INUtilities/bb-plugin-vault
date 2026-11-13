import assert from "node:assert/strict";
import { it } from "node:test";
import { registerVaultAgentTools } from "./agent-tools.ts";

it("registers a bounded excerpt tool and resolves files without opening the panel", async () => {
  const tools = new Map<string, any>();
  let publishes = 0;
  registerVaultAgentTools({ agents: { registerTool: (tool: any) => tools.set(tool.name, tool) }, realtime: { publish: () => { publishes++; } } } as any, {
    loadVaults: async () => [{ id: "notes", name: "Notes" }],
    listEntries: async () => [
      { kind: "file", path: '폴더/"노트".md', name: '"노트"' },
      { kind: "file", path: "image.png", name: "image.png" },
      { kind: "file", path: "page.html", name: "page" },
    ],
  });
  const tool = tools.get("vault_show_excerpt");
  assert.ok(tool);
  for (const bad of [{ path: "a.md", startLine: 0 }, { path: "a.md", startLine: 1, endLine: 21 }, { path: "a.md", startLine: 3, endLine: 2 }, { path: "a.md", extra: 1 }, { path: "a.md", endLine: 1000001 }, { path: "a.md", startLine: 1.5 }, { path: "a.md", vaultId: "x".repeat(257) }, { path: "x".repeat(4097) }]) {
    assert.equal(tool.parameters.safeParse(bad).success, false);
    assert.equal((await tool.execute(bad, { threadId: "t" })).isError, true);
  }
  for (const bad of [{ path: "../secret.md" }, { path: "/폴더/\"노트\".md" }, { path: "%2F폴더/\"노트\".md" }, { path: "missing.md" }, { path: "image.png" }, { path: "page.html" }, { vaultId: "unknown", path: '폴더/"노트".md' }]) {
    assert.equal((await tool.execute(bad, { threadId: "t" })).isError, true);
  }
  const result = await tool.execute({ path: '폴더/"노트".md', startLine: 2, endLine: 21 }, { threadId: "t" });
  assert.equal(typeof result, "string");
  const payload = /::vault-excerpt\{payload="([^"]+)"\}/u.exec(result)?.[1];
  assert.ok(payload);
  assert.deepEqual(JSON.parse(decodeURIComponent(payload)), { vaultId: "notes", path: '폴더/"노트".md', startLine: 2, endLine: 21 });
  assert.equal(tool.parameters.safeParse({ path: "a.md", startLine: 999981, endLine: 1000000 }).success, true);
  assert.equal(publishes, 0);
});
