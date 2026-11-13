import { useEffect, useId, useRef, type ReactNode } from 'react';
import { toast } from 'sonner';
import { findTextRange, type TextSegment } from '../lib/text-highlights';

type Quote = { text: string; occurrence?: number };

function visibleText(root: HTMLElement): { nodes: Text[]; segments: TextSegment[] } {
  const nodes: Text[] = [];
  const segments: TextSegment[] = [];
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT);
  let previousBlock: Element | null = null;
  let lineBreak = false;
  let node: Node | null;
  while ((node = walker.nextNode())) {
    if (node.nodeType === Node.ELEMENT_NODE) {
      const element = node as Element;
      if (element.tagName === 'BR' && !element.closest('script, style, button, input, textarea, select, [hidden], [aria-hidden="true"]')) {
        let ancestor: Element | null = element;
        let visible = true;
        while (ancestor && ancestor !== root) {
          const style = getComputedStyle(ancestor);
          if (style.display === 'none' || style.visibility === 'hidden' || style.visibility === 'collapse') {
            visible = false;
            break;
          }
          ancestor = ancestor.parentElement;
        }
        if (visible) lineBreak = true;
      }
      continue;
    }
    const text = node as Text;
    let element = text.parentElement;
    if (!element || !text.data || element.closest('script, style, button, input, textarea, select, [hidden], [aria-hidden="true"]')) continue;
    let block: Element | null = null;
    let hidden = false;
    while (element && element !== root) {
      const style = getComputedStyle(element);
      if (style.display === 'none' || style.visibility === 'hidden' || style.visibility === 'collapse') {
        hidden = true;
        break;
      }
      if (!block && /^(block|flow-root|list-item|table|table-row|table-cell|flex|grid)/.test(style.display)) block = element;
      element = element.parentElement;
    }
    if (hidden) continue;
    block ||= root;
    nodes.push(text);
    segments.push({ text: text.data, boundaryBefore: previousBlock !== null && (lineBreak || previousBlock !== block) });
    previousBlock = block;
    lineBreak = false;
  }
  return { nodes, segments };
}

function scrollWithinPanel(root: HTMLElement, range: Range) {
  let container = root.parentElement;
  while (container && container !== document.body && container !== document.documentElement) {
    const style = getComputedStyle(container);
    if (/(auto|scroll)/.test(style.overflowY) && container.scrollHeight > container.clientHeight) {
      const rect = range.getBoundingClientRect();
      const viewport = container.getBoundingClientRect();
      container.scrollTo({
        top: container.scrollTop + rect.top + rect.height / 2 - viewport.top - container.clientHeight / 2,
        behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth',
      });
      return;
    }
    container = container.parentElement;
  }
}

export function TextHighlights({ children, ranges, requestKey }: {
  children: ReactNode;
  ranges: readonly Quote[];
  requestKey: string;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const name = `vault-highlight-${useId().replace(/[^a-zA-Z0-9_-]/g, '-')}`;
  const rangesKey = JSON.stringify(ranges);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const quotes = JSON.parse(rangesKey) as Quote[];
    if (!quotes.length) return;
    if (!window.Highlight || !window.CSS?.highlights) {
      toast.error('이 환경에서는 텍스트 강조를 지원하지 않습니다.');
      return;
    }

    // DOM.Iterable is not enabled in this project, so the registry's map methods
    // are absent from its TypeScript declaration.
    const registry = CSS.highlights as unknown as { set(name: string, highlight: Highlight): void; delete(name: string): boolean };
    let scrolled = false;
    let notified = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const update = () => {
      const { nodes, segments } = visibleText(root);
      const matched: Range[] = [];
      for (const quote of quotes) {
        const match = findTextRange(segments, quote.text, quote.occurrence);
        if (!match) continue;
        const range = document.createRange();
        range.setStart(nodes[match.start.segment], match.start.offset);
        range.setEnd(nodes[match.end.segment], match.end.offset);
        matched.push(range);
      }
      registry.set(name, new Highlight(...matched));
      if (!scrolled && matched.length) {
        scrollWithinPanel(root, matched[0]);
        scrolled = true;
      }
      clearTimeout(timer);
      if (!notified && matched.length < quotes.length) {
        const missing = quotes.length - matched.length;
        timer = setTimeout(() => {
          notified = true;
          toast.error(`강조할 문구 ${missing}개를 찾지 못했습니다.`);
        }, 1500);
      }
    };
    const observer = new MutationObserver(update);
    observer.observe(root, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ['hidden', 'aria-hidden', 'class', 'style'] });
    update();
    return () => {
      observer.disconnect();
      clearTimeout(timer);
      registry.delete(name);
    };
  }, [name, rangesKey, requestKey]);

  return <div ref={rootRef}><style>{`::highlight(${name}) { background-color: var(--primary); color: var(--primary-foreground); }`}</style>{children}</div>;
}
