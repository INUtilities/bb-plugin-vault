import { isImageFileName } from "./image-file.ts";

function decodeSegment(segment: string): string {
  let current = segment;
  for (let i = 0; i < 3; i += 1) {
    if (!/%[0-9A-Fa-f]{2}/u.test(current)) break;
    try {
      const next = decodeURIComponent(current);
      if (next === current) break;
      current = next;
    } catch {
      break;
    }
  }
  return current.normalize("NFC");
}

export function encodeRoute(vaultId: string, path: string): string {
  // toPluginPanel encodes the URL itself; pass the raw Hangul path.
  if (path === "") return vaultId;
  return `${vaultId}/${path}`;
}

export function decodeRoute(subPath: string): { vaultId: string | null; path: string } {
  const trimmed = subPath.replace(/^\/+/u, "").replace(/\/+$/u, "");
  if (trimmed === "") return { vaultId: null, path: "" };
  const parts = trimmed.split("/").map(decodeSegment);
  const vaultId = parts[0];
  if (vaultId === undefined || vaultId === "") return { vaultId: null, path: "" };
  return { vaultId, path: parts.slice(1).join("/") };
}

export function isProbablyFile(path: string): boolean {
  return /\.(md|markdown|html|htm|txt)$/iu.test(path) || isImageFileName(path);
}
