import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import { joinPreviewUrl } from "./preview-url.ts";

describe("joinPreviewUrl", () => {
  it("joins a vault-relative HTML path under the preview root", () => {
    assert.equal(
      joinPreviewUrl("http://127.0.0.1:9/preview/", "lessons/0003-tcn-past-window.html"),
      "http://127.0.0.1:9/preview/lessons/0003-tcn-past-window.html",
    );
  });

  it("encodes path segments so spaces and unicode stay addressable", () => {
    assert.equal(
      joinPreviewUrl("http://example.test/v", "notes/내 수업.html"),
      "http://example.test/v/notes/%EB%82%B4%20%EC%88%98%EC%97%85.html",
    );
  });
});

describe("html preview iframe", () => {
  it("loads the file preview URL so relative assets resolve, with scripts but not same-origin", () => {
    const app = readFileSync(new URL("../app.tsx", import.meta.url), "utf8");
    assert.match(app, /joinPreviewUrl\(previewBaseUrl,\s*doc\.path\)/);
    assert.match(app, /sandbox="allow-scripts"/);
    assert.doesNotMatch(app, /srcDoc=/);
    assert.doesNotMatch(app, /allow-same-origin/);
  });
});
