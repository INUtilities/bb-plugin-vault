import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { it } from "node:test";

it("opts the graph help tooltip itself into the shared frost surface", () => {
  const graph = readFileSync(new URL("../components/GraphView.tsx", import.meta.url), "utf8");
  const help = graph.slice(graph.indexOf("export function GraphHelp"), graph.indexOf("export function GraphView"));
  assert.match(help, /<p\s+role="tooltip"\s+data-bb-frost-surface="tooltip"/);
});
