import assert from "node:assert/strict";
import { it } from "node:test";
import { excerptTarget, vaultExcerptDirective, parseVaultExcerptAttributes, excerptFromContent } from "./vault-excerpt.ts";

it("round-trips Korean filenames, quotes and directive punctuation without inline content", () => {
  const target = { vaultId: "notes", path: 'wiki/관심사 "메모" {a}|b.md', startLine: 2, endLine: 4 };
  const directive = vaultExcerptDirective(target)!;
  const payload = directive.match(/^::vault-excerpt\{payload="([^"]+)"\}$/u)?.[1];
  assert.ok(payload);
  assert.deepEqual(parseVaultExcerptAttributes({ payload }), target);
  assert.equal(parseVaultExcerptAttributes({ payload: "%ZZ" }), null);
  assert.equal(parseVaultExcerptAttributes({ payload: encodeURIComponent('{"vaultId":"notes","path":"a.md","excerpt":"invented"}') }), null);
});

it("rejects unsafe paths and invalid or oversized line ranges", () => {
  const base = { vaultId: "notes", path: "a.md" };
  assert.deepEqual(excerptTarget({ ...base, startLine: 5, endLine: 24 }), { ...base, startLine: 5, endLine: 24 });
  for (const path of ["../a.md", "%252e%252e/a.md", "/etc/passwd", "%252Fetc/a.md", "%2F폴더/%bad.md", "C:\\notes\\a.md", "C%3A/notes/a.md", "a%00.md"]) assert.equal(excerptTarget({ ...base, path }), null);
  for (const range of [{ startLine: 0 }, { startLine: 1.5 }, { startLine: 1000001 }, { startLine: 5, endLine: 4 }, { startLine: 5, endLine: 25 }, { endLine: 21 }]) assert.equal(excerptTarget({ ...base, ...range }), null);
});

it("defaults to eight body lines while preserving source line numbers after frontmatter", () => {
  const source = '---\r\ntitle: test\r\n---\r\n\r\n' + Array.from({ length: 12 }, (_, i) => `본문 ${i + 1}`).join('\r\n');
  assert.deepEqual(excerptFromContent(source, "a.md"), { text: Array.from({ length: 8 }, (_, i) => `본문 ${i + 1}`).join('\n'), startLine: 5, endLine: 12, truncated: false });
  assert.equal(excerptFromContent(source, "a.txt").startLine, 1);
  assert.equal(excerptFromContent(source, "a.md", 1, 3).text, '---\ntitle: test\n---');
});

it("returns the requested actual lines, clamps the end, and rejects an absent range", () => {
  assert.deepEqual(excerptFromContent("one\ntwo\nthree", "a.txt", 2, 8), { text: "two\nthree", startLine: 2, endLine: 3, truncated: false });
  assert.throws(() => excerptFromContent("one", "a.txt", 2));
  assert.throws(() => excerptFromContent("one", "a.txt", 1, 21));
  assert.throws(() => excerptFromContent(" \n", "a.md"));
});

it("caps long excerpts without splitting emoji or changing quoted file content", () => {
  const source = '가'.repeat(1199) + '🙂' + '\nsecond';
  const result = excerptFromContent(source, "a.md", 1, 2);
  assert.equal(result.text, '가'.repeat(1199));
  assert.equal(result.endLine, 1);
  assert.equal(result.truncated, true);
  assert.equal(excerptFromContent('<script>alert("x")</script>', 'a.txt').text, '<script>alert("x")</script>');
});
