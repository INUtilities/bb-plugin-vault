import assert from "node:assert/strict";
import { test } from "node:test";
import { htmlPreviewUrl, joinPreviewUrl } from "./preview-url.ts";

const preview = { vaultId: "a", baseUrl: "https://preview.test/root/", expiresAtMs: 2000 };
const file = { vaultId: "a", path: "notes/내 문서.html" };

test("preview URL은 한글과 공백을 포함한 각 경로 조각을 인코딩한다", () => {
  assert.equal(joinPreviewUrl(preview.baseUrl, file.path), "https://preview.test/root/notes/%EB%82%B4%20%EB%AC%B8%EC%84%9C.html");
});

test("선택한 문서와 vault가 일치하는 HTML만 실행한다", () => {
  assert.equal(htmlPreviewUrl(preview, file, file, 1000), joinPreviewUrl(preview.baseUrl, file.path));
  assert.equal(htmlPreviewUrl(preview, file, { ...file, vaultId: "b" }, 1000), null);
  assert.equal(htmlPreviewUrl({ ...preview, vaultId: "b" }, file, { ...file, vaultId: "b" }, 1000), null);
  assert.equal(htmlPreviewUrl(preview, file, { ...file, path: "next.html" }, 1000), null);
});

test("다른 vault의 preview URL과 이전 문서를 조합하지 않는다", () => {
  assert.equal(htmlPreviewUrl({ ...preview, vaultId: "b" }, file, file, 1000), null);
  assert.equal(htmlPreviewUrl(preview, file, { ...file, vaultId: null }, 1000), null);
});

test("아직 없거나 만료된 preview URL은 실행하지 않는다", () => {
  assert.equal(htmlPreviewUrl(null, file, file, 1000), null);
  assert.equal(htmlPreviewUrl(preview, file, file, 2000), null);
  assert.equal(htmlPreviewUrl(preview, file, file, 2001), null);
});
