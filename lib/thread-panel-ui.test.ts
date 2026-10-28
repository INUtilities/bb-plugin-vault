import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { it } from "node:test";

it("thread panel exposes a closed file drawer and an independent document and graph view", () => {
  const app = readFileSync(new URL("../app.tsx", import.meta.url), "utf8");
  assert.match(app, /<VaultScreen[^>]*surface="panel"/);
  assert.match(app, /\[panelTreeOpen, setPanelTreeOpen\] = useState\(false\)/);
  assert.match(app, /<Dialog\.Root open=\{panelTreeOpen\} onOpenChange=\{setPanelTreeOpen\}>/);
  assert.match(app, /setPanelTreeOpen\(false\);\s*goTo\(vaultId, item\.path\)/);
  assert.match(app, /aria-label="파일\+그래프 보기"/);
  assert.match(app, /surface === "panel"[\s\S]*?\{detailPane\}[\s\S]*?\{panelGraphOpen \?/);
  assert.match(app, /highlightPaths=\{highlightPaths\}/);
});
