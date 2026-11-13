import { test } from 'node:test';
import { deepStrictEqual, strictEqual } from 'node:assert';
import { findTextRange } from './text-highlights.ts';

test('treats regex metacharacters as literal text', () => {
  deepStrictEqual(findTextRange([{ text: 'a.*(b) [c] aZZb' }], '.*(b) [c]'), { start: { segment: 0, offset: 1 }, end: { segment: 0, offset: 10 } });
});

test('uses UTF-16 offsets for Korean and emoji', () => {
  deepStrictEqual(findTextRange([{ text: '앞😀한글 뒤' }], '😀한글'), { start: { segment: 0, offset: 1 }, end: { segment: 0, offset: 5 } });
});

test('normalizes whitespace across segments and block boundaries', () => {
  deepStrictEqual(findTextRange([{ text: '하나 \n' }, { text: '둘' }, { text: '셋', boundaryBefore: true }], '하나 둘\n셋'), { start: { segment: 0, offset: 0 }, end: { segment: 2, offset: 1 } });
});

test('selects a 1-based occurrence and reports missing quotes', () => {
  const segments = [{ text: 'one one one' }];
  deepStrictEqual(findTextRange(segments, 'one', 2), { start: { segment: 0, offset: 4 }, end: { segment: 0, offset: 7 } });
  strictEqual(findTextRange(segments, 'one', 4), null);
  strictEqual(findTextRange(segments, 'absent'), null);
  strictEqual(findTextRange(segments, '  '), null);
});

test('maps exact boundaries across inline segments', () => {
  const segments = [{ text: 'before ' }, { text: 'strong' }, { text: ' link' }];
  deepStrictEqual(findTextRange(segments, 'strong link'), { start: { segment: 1, offset: 0 }, end: { segment: 2, offset: 5 } });
  deepStrictEqual(findTextRange(segments, 'before strong'), { start: { segment: 0, offset: 0 }, end: { segment: 1, offset: 6 } });
});
