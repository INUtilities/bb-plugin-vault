import { splitMarkdownFrontmatter } from "./frontmatter.ts";
import { normalizeVaultPath } from "./panel-open.ts";

export type ExcerptTarget = { vaultId: string; path: string; startLine?: number; endLine?: number };
const MAX_LINES = 20;
const MAX_CHARS = 1200;

function validRange(startLine: unknown, endLine: unknown): boolean {
  for (const line of [startLine, endLine]) {
    if (line !== undefined && (typeof line !== "number" || !Number.isSafeInteger(line) || line < 1 || line > 1_000_000)) return false;
  }
  const start = (startLine as number | undefined) ?? 1;
  return endLine === undefined || ((endLine as number) >= start && (endLine as number) - start < MAX_LINES);
}

export function excerptTarget(value: unknown): ExcerptTarget | null {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return null;
  const input = value as Record<string, unknown>;
  if (Object.keys(input).some(key => !["vaultId", "path", "startLine", "endLine"].includes(key))) return null;
  if (typeof input.vaultId !== "string" || !input.vaultId.trim() || input.vaultId.length > 256 || /[\u0000-\u001f]/u.test(input.vaultId)) return null;
  if (typeof input.path !== "string" || input.path.length > 4096) return null;
  // Match the normalizer's per-segment decoding before it removes leading slashes.
  const decoded = input.path.trim().replaceAll("\\", "/").split("/").map(segment => {
    let part = segment;
    for (let pass = 0; pass < 3; pass += 1) {
      try { part = decodeURIComponent(part); } catch { break; }
    }
    return part;
  }).join("/");
  if (/^(?:[/\\]|[a-z]:)/iu.test(decoded.trim())) return null;
  const path = normalizeVaultPath(input.path);
  if (!path || /[\u0000-\u001f]/u.test(path) || !validRange(input.startLine, input.endLine)) return null;
  return {
    vaultId: input.vaultId.trim(), path,
    ...(input.startLine === undefined ? {} : { startLine: input.startLine as number }),
    ...(input.endLine === undefined ? {} : { endLine: input.endLine as number }),
  };
}

export function vaultExcerptDirective(value: ExcerptTarget): string | null {
  const target = excerptTarget(value);
  return target ? `::vault-excerpt{payload="${encodeURIComponent(JSON.stringify(target))}"}` : null;
}

export function parseVaultExcerptAttributes(attributes: Readonly<Record<string, string>>): ExcerptTarget | null {
  if (!attributes.payload || attributes.payload.length > 60000) return null;
  try { return excerptTarget(JSON.parse(decodeURIComponent(attributes.payload))); }
  catch { return null; }
}

export function excerptFromContent(content: string, path: string, startLine?: number, endLine?: number): {
  text: string; startLine: number; endLine: number; truncated: boolean;
} {
  if (!validRange(startLine, endLine)) throw new Error("발췌할 줄 범위가 올바르지 않습니다.");
  const source = content.replace(/^\uFEFF/u, "").replace(/\r\n?/gu, "\n");
  let start = startLine ?? 1;
  if (startLine === undefined && endLine === undefined && /\.(md|markdown)$/iu.test(path)) {
    const parsed = splitMarkdownFrontmatter(source);
    if (parsed.frontmatter !== null) start = source.slice(0, source.length - parsed.body.length).split("\n").length;
  }
  const lines = source.split("\n");
  if (start > lines.length) throw new Error("요청한 줄이 파일에 없습니다.");
  const end = Math.min(endLine ?? start + 7, lines.length);
  const selected = lines.slice(start - 1, end).join("\n");
  if (!selected.trim()) throw new Error("표시할 본문이 없습니다.");
  const truncated = selected.length > MAX_CHARS;
  const text = truncated ? selected.slice(0, MAX_CHARS).replace(/[\uD800-\uDBFF]$/u, "") : selected;
  return { text, startLine: start, endLine: start + text.split("\n").length - 1, truncated };
}
