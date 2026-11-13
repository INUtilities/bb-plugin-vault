import assert from "node:assert/strict";
import { afterEach, beforeEach, it } from "node:test";
import { cleanup, fireEvent, waitFor } from "@testing-library/react";
import { renderSlot } from "@get-bb/plugin-sdk/testing/app";
import { VaultChatTab, registerVaultChatTab } from "./VaultChatTab";
import { chatKey, vaultChatSession } from "../lib/vault-chat";

afterEach(cleanup);
beforeEach(() => { vaultChatSession.connect(chatKey(null), null); vaultChatSession.connect(chatKey("p1"), null); });

it("registers Chat as a host-owned navigation panel tab", () => {
  const registrations: unknown[] = [];
  assert.equal(registerVaultChatTab({ experimental_tab: (item: unknown) => registrations.push(item) }), true);
  assert.equal(registerVaultChatTab({}), false);
  assert.deepEqual(registrations, [{ id: "chat", context: { kind: "nav-panel", panelId: "docs" }, availability: "fixed", title: "Chat", icon: "MessageSquare", layout: "flush", component: VaultChatTab }]);
});
it("opens an empty official composer, creates on submit, and keeps the same conversation on remount", async () => {
  const spawnCalls: unknown[] = [];
  const sdk = { threads: { spawn: async (request: unknown) => { spawnCalls.push(request); return { id: "created" }; }, update: async () => ({}) } };
  const view = renderSlot({ component: VaultChatTab }, {}, { sdk: sdk as never });
  const composer = await view.findByTestId("bb-new-thread-composer");
  assert.equal(spawnCalls.length, 0);
  assert.equal(composer.getAttribute("data-default-project-id"), "");
  assert.equal(composer.getAttribute("data-default-model"), "");
  assert.equal((view.getByRole("button", { name: "New chat" }) as HTMLButtonElement).disabled, true);
  const draftKey = composer.getAttribute("data-draft-key");
  fireEvent.change(view.getByTestId("bb-new-thread-composer-input"), { target: { value: "explicit user draft" } });
  fireEvent.click(view.getByTestId("bb-new-thread-composer-submit"));
  assert.equal((await view.findByTestId("bb-thread-chat")).getAttribute("data-thread-id"), "created");
  assert.equal(view.getByTestId("bb-thread-chat").getAttribute("data-permission-policy"), "inherit");
  assert.equal(view.getByTestId("bb-thread-chat").getAttribute("data-variant"), "compact");
  assert.equal(spawnCalls.length, 1);
  assert.equal((spawnCalls[0] as { input: { text: string }[] }).input[0].text, "explicit user draft");
  assert.equal((spawnCalls[0] as { visibility: string }).visibility, "hidden");
  view.unmount();
  const reopened = renderSlot({ component: VaultChatTab }, {}, { sdk: sdk as never });
  assert.equal(reopened.getByTestId("bb-thread-chat").getAttribute("data-thread-id"), "created");
  fireEvent.click(reopened.getByRole("button", { name: "Open thread" }));
  await waitFor(() => assert.equal(reopened.inspection.navigateCalls.length, 1));
  assert.equal(reopened.inspection.sdkCalls.at(-1)?.method, "threads.update");
  fireEvent.click(reopened.getByRole("button", { name: "New chat" }));
  assert.equal((await reopened.findByTestId("bb-new-thread-composer")).getAttribute("data-draft-key"), draftKey);
  assert.equal(spawnCalls.length, 1);
});
it("a failed Open thread keeps the current chat and reports the failure", async () => {
  vaultChatSession.connect(chatKey(null), "existing");
  const view = renderSlot({ component: VaultChatTab }, {}, { sdk: { threads: { update: async () => { throw Error("offline"); } } } as never });
  fireEvent.click(view.getByRole("button", { name: "Open thread" }));
  assert.match((await view.findByRole("alert")).textContent ?? "", /offline/);
  assert.equal(view.inspection.navigateCalls.length, 0);
  assert.equal(view.getByTestId("bb-thread-chat").getAttribute("data-thread-id"), "existing");
});
it("deduplicates Open thread and ignores its late navigation after the context unmounts", async () => {
  vaultChatSession.connect(chatKey(null), "hidden-thread");
  let finish!: () => void, calls = 0;
  const view = renderSlot({ component: VaultChatTab }, {}, { sdk: { threads: { update: () => {
    calls++;
    return new Promise<void>(resolve => { finish = resolve; });
  } } } as never });
  fireEvent.click(view.getByRole("button", { name: "Open thread" }));
  fireEvent.click(view.getByRole("button", { name: "Open thread" }));
  assert.equal(calls, 1);
  view.unmount();
  finish(); await Promise.resolve();
  assert.equal(view.inspection.navigateCalls.length, 0);
});
