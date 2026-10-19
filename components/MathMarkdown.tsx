import { Markdown } from "@get-bb/plugin-sdk/app";
import katex from "katex";
import { useMemo } from "react";

import { segmentMathMarkdown, type InlinePart } from "@/lib/math-markdown";

function renderTex(tex: string, displayMode: boolean): string {
    return katex.renderToString(tex, {
        displayMode,
        output: "mathml",
        throwOnError: false,
        strict: "ignore",
    });
}

function InlineRun({ parts }: { parts: readonly InlinePart[] }) {
    return (
        <p>
            {parts.map((part, index) =>
                part.kind === "text" ? (
                    <span key={index} className="[&_p]:my-0 [&_p]:inline">
                        <Markdown content={part.text} />
                    </span>
                ) : (
                    <span key={index} dangerouslySetInnerHTML={{ __html: renderTex(part.tex, false) }} />
                ),
            )}
        </p>
    );
}

export function MathMarkdown({ content }: { content: string }) {
    const blocks = useMemo(() => segmentMathMarkdown(content), [content]);
    return (
        <>
            {blocks.map((block, index) => {
                if (block.kind === "display") {
                    return (
                        <div
                            key={index}
                            className="my-4 overflow-x-auto text-center"
                            dangerouslySetInnerHTML={{ __html: renderTex(block.tex, true) }}
                        />
                    );
                }
                if (block.kind === "mixed") return <InlineRun key={index} parts={block.parts} />;
                return <Markdown key={index} content={block.text} />;
            })}
        </>
    );
}
