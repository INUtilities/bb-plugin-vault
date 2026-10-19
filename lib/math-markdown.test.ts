import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { segmentMathMarkdown } from "./math-markdown.ts";

describe("math markdown", () => {
    it("leaves prose without dollars as one markdown block", () => {
        assert.deepEqual(segmentMathMarkdown("재현율은 비율이다."), [
            { kind: "markdown", text: "재현율은 비율이다." },
        ]);
    });

    it("lifts a display formula out of the surrounding prose", () => {
        const blocks = segmentMathMarkdown("앞\n$$\\frac{a}{b}$$\n뒤");
        assert.deepEqual(blocks, [
            { kind: "markdown", text: "앞\n" },
            { kind: "display", tex: "\\frac{a}{b}" },
            { kind: "markdown", text: "\n뒤" },
        ]);
    });

    it("keeps an inline formula inside the sentence", () => {
        assert.deepEqual(segmentMathMarkdown("값은 $a/b$ 이다."), [
            {
                kind: "mixed",
                parts: [
                    { kind: "text", text: "값은 " },
                    { kind: "inline", tex: "a/b" },
                    { kind: "text", text: " 이다." },
                ],
            },
        ]);
    });

    it("does not treat a fenced dollar as math", () => {
        const source = "```\n$a$\n```";
        assert.deepEqual(segmentMathMarkdown(source), [{ kind: "markdown", text: source }]);
    });
});
