import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import { graphNodeHitRadius } from "./graph-hit.ts";

describe("graphNodeHitRadius", () => {
  it("uses a higher floor than the old 12/22 so small dots stay easy to catch", () => {
    for (const radius of [1, 2, 3.2]) {
      assert.equal(graphNodeHitRadius(radius, false), 18);
      assert.equal(graphNodeHitRadius(radius, true), 28);
    }
    assert.ok(graphNodeHitRadius(1, false) > 12);
    assert.ok(graphNodeHitRadius(1, true) > 22);
  });

  it("grows with node radius once padding exceeds the floor", () => {
    assert.equal(graphNodeHitRadius(11, false), 19);
    assert.equal(graphNodeHitRadius(20, false), 28);
    assert.equal(graphNodeHitRadius(17, true), 29);
    assert.equal(graphNodeHitRadius(30, true), 42);
  });

  it("keeps touch targets wider than pointer targets", () => {
    for (const radius of [1, 3.2, 10, 25]) {
      assert.ok(graphNodeHitRadius(radius, true) > graphNodeHitRadius(radius, false));
    }
  });

  it("leaves a gap between neighbors farther than twice the floor", () => {
    // Centers 40px apart: midpoint is 20px from each — outside desktop floor 18.
    const hit = graphNodeHitRadius(2, false);
    assert.equal(hit, 18);
    assert.ok(20 > hit);
    // Centers 30px apart still overlap (15 <= 18); frontmost wins in GraphView order.
    assert.ok(15 <= hit);
  });
});

describe("GraphView hit wiring", () => {
  it("uses graphNodeHitRadius for the shared hover/click hit test", () => {
    const graph = readFileSync(new URL("../components/GraphView.tsx", import.meta.url), "utf8");
    assert.match(graph, /graphNodeHitRadius/);
    assert.match(graph, /function hit\(point: Point\)/);
    assert.doesNotMatch(graph, /largeHit \? 22 : 12/);
    assert.doesNotMatch(graph, /radius\(index\) \+ 3/);
  });
});
