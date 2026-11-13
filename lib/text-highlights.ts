export type TextSegment = { text: string; boundaryBefore?: boolean };
export type TextPoint = { segment: number; offset: number };
export type TextMatch = { start: TextPoint; end: TextPoint };

/** Match normalized whitespace while retaining UTF-16 offsets into the original segments. */
export function findTextRange(segments: readonly TextSegment[], quote: string, occurrence = 1): TextMatch | null {
  const needle = quote.replace(/\s+/gu, ' ').trim();
  if (!needle || !Number.isInteger(occurrence) || occurrence < 1) return null;

  let raw = '';
  const positions: { start: number; end: number; segment: number }[] = [];
  segments.forEach((segment, index) => {
    if (segment.boundaryBefore && raw) raw += ' ';
    const start = raw.length;
    raw += segment.text;
    if (segment.text) positions.push({ start, end: raw.length, segment: index });
  });

  let normalized = '';
  const runs: { normalizedStart: number; normalizedEnd: number; rawStart: number }[] = [];
  for (const part of raw.matchAll(/\s+|\S+/gu)) {
    const value = part[0];
    const start = normalized.length;
    if (/^\s/u.test(value)) normalized += ' ';
    else {
      normalized += value;
      runs.push({ normalizedStart: start, normalizedEnd: normalized.length, rawStart: part.index });
    }
  }
  let index = -1;
  for (let count = 0; count < occurrence; count++) {
    index = normalized.indexOf(needle, index + 1);
    if (index < 0) return null;
  }
  const endIndex = index + needle.length;
  const first = runs.find(run => run.normalizedStart <= index && index < run.normalizedEnd);
  const last = runs.find(run => run.normalizedStart < endIndex && endIndex <= run.normalizedEnd);
  if (!first || !last) return null;
  const rawStart = first.rawStart + index - first.normalizedStart;
  const rawEnd = last.rawStart + endIndex - last.normalizedStart;
  const startSegment = positions.find(pos => pos.start <= rawStart && rawStart < pos.end);
  const endSegment = positions.find(pos => pos.start < rawEnd && rawEnd <= pos.end);
  if (!startSegment || !endSegment) return null;
  return {
    start: { segment: startSegment.segment, offset: rawStart - startSegment.start },
    end: { segment: endSegment.segment, offset: rawEnd - endSegment.start },
  };
}
