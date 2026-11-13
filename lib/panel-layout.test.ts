import assert from "node:assert/strict";
import { test } from "node:test";
import { panelLayout } from "./panel-layout.ts";

test("좁은 패널은 문서가 없으면 목록을, 문서를 고르면 파일을 표시한다", () => {
  assert.deepEqual(panelLayout(320, false, false), { compact: true, showList: true });
  assert.deepEqual(panelLayout(320, true, false), { compact: true, showList: false });
  assert.deepEqual(panelLayout(320, true, true), { compact: true, showList: true });
});

test("창 너비와 무관하게 실제 패널의 640px 경계에서 전환한다", () => {
  assert.deepEqual(panelLayout(639, true, true), { compact: true, showList: true });
  assert.deepEqual(panelLayout(640, true, true), { compact: false, showList: false });
  assert.deepEqual(panelLayout(900, false, false), { compact: false, showList: false });
});

test("처음 측정하기 전에도 목록과 파일을 겹쳐 표시하지 않는다", () => {
  assert.deepEqual(panelLayout(null, false, false), { compact: true, showList: true });
  assert.deepEqual(panelLayout(null, true, false), { compact: true, showList: false });
});
