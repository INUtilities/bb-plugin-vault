export type InlinePart = { kind: "text"; text: string } | { kind: "inline"; tex: string };

export type MathBlock =
    | { kind: "markdown"; text: string }
    | { kind: "display"; tex: string }
    | { kind: "mixed"; parts: InlinePart[] };

function lineStart(source: string, index: number): boolean {
    return index === 0 || source[index - 1] === "\n";
}

function fenceOpen(source: string, index: number): string | null {
    if (!lineStart(source, index)) return null;
    if (source.startsWith("```", index)) return "```";
    if (source.startsWith("~~~", index)) return "~~~";
    return null;
}

function consumeFence(source: string, index: number, open: string): number {
    const closer = `\n${open}`;
    const end = source.indexOf(closer, index + open.length);
    if (end === -1) return source.length;
    let j = end + closer.length;
    while (j < source.length && source[j] !== "\n") j += 1;
    return j;
}

function consumeDisplay(source: string, index: number): { tex: string; next: number } | null {
    if (!source.startsWith("$$", index)) return null;
    const end = source.indexOf("$$", index + 2);
    if (end === -1) return null;
    return { tex: source.slice(index + 2, end).trim(), next: end + 2 };
}

function consumeInline(source: string, index: number): { tex: string; next: number } | null {
    if (source[index] !== "$" || source[index + 1] === "$") return null;
    if (index > 0 && source[index - 1] === "\\") return null;
    const end = source.indexOf("$", index + 1);
    if (end === -1 || source[end - 1] === "\\") return null;
    const tex = source.slice(index + 1, end);
    if (tex === "" || tex.startsWith(" ") || tex.endsWith(" ") || tex.includes("\n")) return null;
    return { tex, next: end + 1 };
}

function splitInline(text: string): InlinePart[] | null {
    const parts: InlinePart[] = [];
    let i = 0;
    let plain = "";
    let found = false;
    const pushPlain = () => {
        if (plain === "") return;
        parts.push({ kind: "text", text: plain });
        plain = "";
    };
    while (i < text.length) {
        const open = fenceOpen(text, i);
        if (open !== null) {
            const next = consumeFence(text, i, open);
            plain += text.slice(i, next);
            i = next;
            continue;
        }
        if (text[i] === "`") {
            let ticks = 1;
            while (i + ticks < text.length && text[i + ticks] === "`") ticks += 1;
            const close = text.indexOf("`".repeat(ticks), i + ticks);
            const next = close === -1 ? text.length : close + ticks;
            plain += text.slice(i, next);
            i = next;
            continue;
        }
        const inline = text[i] === "$" ? consumeInline(text, i) : null;
        if (inline === null) {
            plain += text[i];
            i += 1;
            continue;
        }
        found = true;
        pushPlain();
        parts.push({ kind: "inline", tex: inline.tex });
        i = inline.next;
    }
    if (!found) return null;
    pushPlain();
    return parts;
}

/** Split markdown into host-rendered text and KaTeX blocks. Code fences stay text. */
export function segmentMathMarkdown(source: string): MathBlock[] {
    const blocks: MathBlock[] = [];
    let buffer = "";
    let i = 0;
    const flush = () => {
        if (buffer === "") return;
        const mixed = splitInline(buffer);
        blocks.push(mixed === null ? { kind: "markdown", text: buffer } : { kind: "mixed", parts: mixed });
        buffer = "";
    };
    while (i < source.length) {
        const open = fenceOpen(source, i);
        if (open !== null) {
            const next = consumeFence(source, i, open);
            buffer += source.slice(i, next);
            i = next;
            continue;
        }
        const display = source.startsWith("$$", i) ? consumeDisplay(source, i) : null;
        if (display !== null) {
            flush();
            blocks.push({ kind: "display", tex: display.tex });
            i = display.next;
            continue;
        }
        buffer += source[i];
        i += 1;
    }
    flush();
    return blocks;
}
