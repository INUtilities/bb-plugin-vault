import { test } from "node:test";
import { strict as assert } from "node:assert";
import { graphLabelHidden } from "./graph-highlight.ts";

test("선택한 노트가 있어도 다른 hover 노트의 이름을 표시한다", () => {
  assert.equal(graphLabelHidden(1, -1, 0, 1), false);
  assert.equal(graphLabelHidden(2, -1, 0, 1), true);
  assert.equal(graphLabelHidden(1, 1, 0, 1), true);
});
