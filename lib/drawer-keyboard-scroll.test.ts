import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { it } from "node:test";

it("allows tab focus to scroll an offscreen drawer control into view", () => {
  const shell = readFileSync(new URL("../components/ui/persistent-drawer.tsx", import.meta.url), "utf8");
  const tabHandler = shell.slice(shell.indexOf("function handleDrawerTab"), shell.indexOf("function registerOpenDrawer"));
  assert.match(tabHandler, /event\.preventDefault\(\)/);
  assert.doesNotMatch(tabHandler.replace("panel.focus({ preventScroll: true })", ""), /preventScroll:\s*true/);
});
