import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { it } from "node:test";

it("thread panel exposes a closed file drawer and an independent document and graph view", () => {
  const app = readFileSync(new URL("../app.tsx", import.meta.url), "utf8");
  assert.match(app, /<VaultScreen[^>]*surface="panel"/);
  assert.match(app, /\[panelTreeOpen, setPanelTreeOpen\] = useState\(false\)/);
  assert.match(app, /<Dialog\.Root open=\{panelTreeOpen\} onOpenChange=\{setPanelTreeOpen\}>/);
  assert.match(app, /setPanelTreeOpen\(false\);\s*goTo\(vaultId, item\.path\)/);
  const card = readFileSync(new URL("../components/FloatingGraphCard.tsx", import.meta.url), "utf8");
  assert.match(card, /aria-label="파일\+그래프 보기"/);
  assert.match(app, /if \(isDesktopPanel\)[\s\S]*?\{detailPane\}[\s\S]*?<FloatingGraphCard open=\{panelGraphOpen\}/);
  assert.match(app, /highlightPaths=\{highlightPaths\}/);
});
