import assert from "node:assert/strict";
import { it } from "node:test";
import { decodeRoute, encodeRoute, isProbablyFile } from "./vault-route.ts";

it("restores direct links and browser history with the complete vault plus file identity", () => {
  assert.deepEqual(decodeRoute("/one/folder/%ED%95%9C%EA%B8%80.md/"), { vaultId: "one", path: "folder/한글.md" });
  assert.deepEqual(decodeRoute(encodeRoute("two", "folder/한글.md")), { vaultId: "two", path: "folder/한글.md" });
  assert.deepEqual(decodeRoute(""), { vaultId: null, path: "" });
  assert.equal(isProbablyFile("folder/한글.md"), true);
  assert.equal(isProbablyFile("image.webp"), true);
  assert.equal(isProbablyFile("folder"), false);
});
