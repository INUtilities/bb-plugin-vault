import assert from "node:assert/strict";
import { afterEach, it } from "node:test";
import { cleanup, fireEvent, render } from "@testing-library/react";
import { VaultDocumentTabs } from "./VaultDocumentTabs";

afterEach(() => { cleanup(); delete (window as unknown as { bb?: unknown }).bb; });
const doc = { vaultId: "test", path: "Alpha.md" };
it("uses the native impact-light capability once per button in a 400ms interval", () => {
  const messages: unknown[] = [], selections: unknown[] = [], closes: unknown[] = [];
  (window as unknown as { bb: unknown }).bb = { native: { capabilities: ["haptic"], post: (message: unknown) => messages.push(message) } };
  const descriptor = Object.getOwnPropertyDescriptor(performance, "now");
  let now = 1000;
  Object.defineProperty(performance, "now", { value: () => now, configurable: true });
  try {
    const view = render(<VaultDocumentTabs tabs={[doc]} active={doc} panelId="viewer" onSelect={value => selections.push(value)} onClose={value => closes.push(value)} />);
    fireEvent.click(view.getByRole("tab")); fireEvent.click(view.getByRole("tab"));
    assert.equal(selections.length, 2);
    assert.deepEqual(messages, [{ type: "haptic", kind: "impact-light" }]);
    now += 401; fireEvent.click(view.getByRole("tab"));
    fireEvent.click(view.getByRole("button", { name: "문서 닫기: Alpha.md" }));
    assert.equal(messages.length, 3);
    assert.equal(closes.length, 1);
  } finally { if (descriptor) Object.defineProperty(performance, "now", descriptor); else delete (performance as unknown as { now?: unknown }).now; }
});
it("keeps keyboard activation and closing available without a native bridge", () => {
  const next = { vaultId: "test", path: "Beta.md" }, selected: unknown[] = [], closed: unknown[] = [];
  const view = render(<VaultDocumentTabs tabs={[doc, next]} active={doc} panelId="viewer" onSelect={value => selected.push(value)} onClose={value => closed.push(value)} />);
  fireEvent.keyDown(view.getByRole("tab", { name: "Alpha.md" }), { key: "ArrowRight" });
  assert.deepEqual(selected, [next]);
  assert.equal(document.activeElement, view.getByRole("tab", { name: "Beta.md" }));
  fireEvent.keyDown(view.getByRole("tab", { name: "Beta.md" }), { key: "Delete" });
  assert.deepEqual(closed, [next]);
});
