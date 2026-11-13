export function joinPreviewUrl(baseUrl: string, relative: string): string {
  const base = baseUrl.replace(/\/+$/u, "");
  const rest = relative
    .split("/")
    .filter((segment) => segment !== "")
    .map((segment) => encodeURIComponent(segment))
    .join("/");
  return rest === "" ? base : `${base}/${rest}`;
}

/** 이전 문서나 다른 vault의 preview URL로 HTML을 실행하지 않는다. */
export function htmlPreviewUrl(
  preview: { vaultId: string; baseUrl: string; expiresAtMs: number } | null,
  file: { vaultId: string; path: string },
  active: { vaultId: string | null; path: string },
  now = Date.now(),
): string | null {
  if (!preview || preview.expiresAtMs <= now || preview.vaultId !== active.vaultId
    || file.vaultId !== active.vaultId || file.path !== active.path) return null;
  return joinPreviewUrl(preview.baseUrl, file.path);
}
