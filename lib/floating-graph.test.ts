import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { clampCard, initialCard, resizeCard, documentTooltipIndex } from './floating-graph.ts';

describe('floating graph geometry', () => {
  const bounds = { width: 800, height: 600 };
  const card = { x: 100, y: 100, width: 320, height: 240 };
  it('starts at the bottom right with a margin', () => {
    assert.deepEqual(initialCard(bounds), { x: 528, y: 328, width: 260, height: 260 });
  });
  it('starts square within the smaller available axis', () => {
    assert.deepEqual(initialCard({ width: 200, height: 500 }), { x: 12, y: 312, width: 176, height: 176 });
    assert.deepEqual(initialCard({ width: 500, height: 150 }), { x: 362, y: 12, width: 126, height: 126 });
  });
  it('anchors the opposite corner for all four resize handles', () => {
    assert.deepEqual(resizeCard(card, bounds, 'nw', 20, 30), { x: 120, y: 130, width: 300, height: 210 });
    assert.deepEqual(resizeCard(card, bounds, 'ne', 20, 30), { x: 100, y: 130, width: 340, height: 210 });
    assert.deepEqual(resizeCard(card, bounds, 'sw', 20, 30), { x: 120, y: 100, width: 300, height: 270 });
    assert.deepEqual(resizeCard(card, bounds, 'se', 20, 30), { x: 100, y: 100, width: 340, height: 270 });
  });
  it('clamps state on shrink and does not restore it on expansion', () => {
    const shrunk = clampCard(card, { width: 200, height: 150 });
    assert.deepEqual(shrunk, { x: 12, y: 12, width: 176, height: 126 });
    assert.deepEqual(clampCard(shrunk, bounds), shrunk);
  });
  it('fits even when the parent is smaller than margins and minimum size', () => {
    assert.deepEqual(clampCard(card, { width: 15, height: 10 }), { x: 0, y: 0, width: 15, height: 10 });
  });
});

describe('document tooltip', () => {
  it('selects only the active path and hides when absent', () => {
    const nodes = [{ path: 'a' }, { path: 'b' }];
    assert.equal(documentTooltipIndex(nodes, 'b'), 1);
    assert.equal(documentTooltipIndex(nodes, 'missing'), -1);
    assert.equal(documentTooltipIndex(nodes, ''), -1);
  });
});
