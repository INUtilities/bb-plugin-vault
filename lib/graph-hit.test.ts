import { test } from "node:test";
import { strict as assert } from "node:assert";
import { graphNodeHitRadius } from "./graph-hit.ts";

test("작은 노트는 pointer 18px, touch 28px까지 선택할 수 있다", () => {
  assert.equal(graphNodeHitRadius(2), 18);
  assert.equal(graphNodeHitRadius(2, true), 28);
});

test("큰 노트는 표시 반경에 맞춰 hit 영역도 커진다", () => {
  assert.equal(graphNodeHitRadius(20), 28);
  assert.equal(graphNodeHitRadius(20, true), 32);
});
