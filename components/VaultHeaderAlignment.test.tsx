import assert from "node:assert/strict";
import { afterEach, it } from "node:test";
import { act, cleanup } from "@testing-library/react";
import { renderSlot } from "@get-bb/plugin-sdk/testing/app";
import { DocsReaderPanel } from "../app";
import { VaultChatTab } from "./VaultChatTab";

afterEach(cleanup);

it("aligns only the workspace sidebar and chat before data arrives, remeasures and cleans up", async t => {
  let frameTop = 44;
  const original = window.getComputedStyle;
  t.mock.method(window, "getComputedStyle", (element: Element) => {
    const style = original.call(window, element);
    style.setProperty("--bb-window-frame-top", `${frameTop}px`);
    return style;
  });
  t.mock.method(HTMLElement.prototype, "getBoundingClientRect", function (this: HTMLElement) {
    return { top: this.classList.contains("vault-workspace-sidebar") ? 53 : 48, width: 320 } as DOMRect;
  });
  let observed = 0, disconnected = 0;
  const originalObserver = globalThis.ResizeObserver;
  t.after(() => { globalThis.ResizeObserver = originalObserver; });
  globalThis.ResizeObserver = class {
    observe() { observed++; }
    disconnect() { disconnected++; }
    unobserve() {}
  };
  const rpc = { listVaults: () => new Promise(() => {}) };
  const sidebar = renderSlot({ component: DocsReaderPanel }, { subPath: "", surface: "sidebar" as const }, { rpc: rpc as never });
  const chat = renderSlot({ component: VaultChatTab }, {}, {});
  const center = renderSlot({ component: DocsReaderPanel }, { subPath: "", surface: "workspace" as const }, { rpc: rpc as never });
  const left = sidebar.container.querySelector<HTMLElement>(".vault-workspace-sidebar")!;
  const right = chat.container.querySelector<HTMLElement>(".vault-chat")!;
  const middle = center.container.querySelector<HTMLElement>(".vault-workspace")!;
  assert.equal(left.style.getPropertyValue("--vault-header-offset"), "-8px");
  assert.equal(right.style.getPropertyValue("--vault-header-offset"), "-3px");
  assert.equal(middle.style.getPropertyValue("--vault-header-offset"), "");
  assert.ok(observed >= 2);
  frameTop = 0;
  act(() => window.dispatchEvent(new window.Event("resize")));
  assert.equal(left.style.getPropertyValue("--vault-header-offset"), "");
  assert.equal(right.style.getPropertyValue("--vault-header-offset"), "");
  frameTop = 44;
  act(() => window.dispatchEvent(new window.Event("resize")));
  assert.equal(right.style.getPropertyValue("--vault-header-offset"), "-3px");
  frameTop = 200;
  act(() => window.dispatchEvent(new window.Event("resize")));
  assert.equal(left.style.getPropertyValue("--vault-header-offset"), "");
  frameTop = 44;
  act(() => window.dispatchEvent(new window.Event("resize")));
  sidebar.unmount(); chat.unmount(); center.unmount();
  assert.equal(left.style.getPropertyValue("--vault-header-offset"), "");
  assert.equal(right.style.getPropertyValue("--vault-header-offset"), "");
  assert.ok(disconnected >= 2);
  await act(async () => {});
});

it("leaves phone panels unadjusted even when a frame inset is present", async t => {
  const media = window.matchMedia;
  t.mock.method(window, "matchMedia", (query: string) => ({ ...media(query), matches: /hover: none|pointer: coarse/.test(query) }));
  const original = window.getComputedStyle;
  t.mock.method(window, "getComputedStyle", (element: Element) => {
    const style = original.call(window, element);
    style.setProperty("--bb-window-frame-top", "44px");
    return style;
  });
  const sidebar = renderSlot({ component: DocsReaderPanel }, { subPath: "", surface: "sidebar" as const }, { rpc: { listVaults: () => new Promise(() => {}) } as never });
  const chat = renderSlot({ component: VaultChatTab }, {}, {});
  assert.equal(sidebar.container.querySelector<HTMLElement>(".vault-workspace-sidebar")!.style.getPropertyValue("--vault-header-offset"), "");
  assert.equal(chat.container.querySelector<HTMLElement>(".vault-chat")!.style.getPropertyValue("--vault-header-offset"), "");
  await act(async () => {});
});
