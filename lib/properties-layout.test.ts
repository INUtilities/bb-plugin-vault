import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import { propertiesUseSheet } from "./properties-layout.ts";

describe("properties layout", () => {
  it("rises from the bottom only on a narrow phone", () => {
    assert.equal(propertiesUseSheet({ device: "phone", viewport: "narrow" }), true);
    assert.equal(propertiesUseSheet({ device: "phone", viewport: "medium" }), false);
    assert.equal(propertiesUseSheet({ device: "phone", viewport: "wide" }), false);
    assert.equal(propertiesUseSheet({ device: "desktop", viewport: "narrow" }), false);
    assert.equal(propertiesUseSheet({ device: "desktop", viewport: "wide" }), false);
    assert.equal(propertiesUseSheet({ device: "tablet", viewport: "narrow" }), false);
  });

  it("docks flat on desktop and uses the shared persistent drawer on phone", () => {
    const app = readFileSync(new URL("../app.tsx", import.meta.url), "utf8");
    const panel = readFileSync(new URL("../components/FrontmatterPanel.tsx", import.meta.url), "utf8");
    const dock = panel.slice(panel.indexOf("export function PropertiesDock"));
    const dockBody = dock.slice(0, dock.indexOf("export function PropertiesSheet"));

    assert.match(app, /propertiesUseSheet\(\{ device: chrome\.device, viewport: chrome\.viewport \}\)/);
    assert.doesNotMatch(app, /contentWidth/);
    assert.doesNotMatch(app, /vault-properties-rail/);
    assert.match(app, /data-testid="vault-properties-dock"|<PropertiesDock/);
    assert.match(dockBody, /data-testid="vault-properties-dock"/);
    assert.match(dockBody, /max-h-\[66\.666%\]/);
    assert.match(dockBody, /border-t/);
    assert.match(dockBody, /aria-label="닫기"/);
    assert.doesNotMatch(dockBody, /transition/);
    assert.doesNotMatch(dockBody, /translate/);
    assert.match(panel, /<PersistentResponsiveDrawerShell/);
    assert.doesNotMatch(panel, /max-h-\[45%\]|translate-y-full/);
    assert.match(app, /showProps && propsSheet \? \(/);
    assert.match(app, /<PropertiesSheet open=\{propsOpen\}/);
  });

  it("keeps the mobile sheet closable by touch and assistive technology without a visible X", () => {
    const app = readFileSync(new URL("../app.tsx", import.meta.url), "utf8");
    const panel = readFileSync(new URL("../components/FrontmatterPanel.tsx", import.meta.url), "utf8");
    const sheet = panel.slice(panel.indexOf("export function PropertiesSheet"), panel.indexOf("export function FrontmatterPanel"));

    assert.match(app, /aria-pressed=\{propsOpen\}[\s\S]*?aria-label="속성"[\s\S]*?onClick=\{\(\) => setPropertiesOpen\(!propsOpen\)\}/);
    assert.match(sheet, /aria-label="닫기"/);
    assert.match(sheet, /className="sr-only focus:not-sr-only/);
    assert.match(sheet, /onClick=\{onClose\}/);
    assert.doesNotMatch(sheet, /<Icon name="X"/);
  });

  it("keeps phone property text and actionable values readable inside the portaled drawer", () => {
    const panel = readFileSync(new URL("../components/FrontmatterPanel.tsx", import.meta.url), "utf8");
    const sheet = panel.slice(panel.indexOf("export function PropertiesSheet"), panel.indexOf("export function FrontmatterPanel"));
    assert.match(sheet, /data-vault-properties-sheet=""/);
    assert.match(sheet, /data-phone-metrics=""/);
    assert.match(sheet, /text-\[16px\] leading-\[24px\] font-semibold/);
    assert.match(panel, /in-data-\[vault-properties-sheet\]:text-\[13px\]!/);
    assert.match(panel, /in-data-\[vault-properties-sheet\]:font-semibold/);
    assert.match(panel, /in-data-\[vault-properties-sheet\]:px-4/);
    assert.match(panel, /in-data-\[vault-properties-sheet\]:text-\[14px\]/);
    assert.match(panel, /in-data-\[vault-properties-sheet\]:min-h-9/);
  });

  it("wraps long phone links and resets expanded values when the drawer closes", () => {
    const panel = readFileSync(new URL("../components/FrontmatterPanel.tsx", import.meta.url), "utf8");
    const app = readFileSync(new URL("../app.tsx", import.meta.url), "utf8");
    assert.match(panel, /in-data-\[vault-properties-sheet\]:whitespace-normal/);
    assert.match(panel, /in-data-\[vault-properties-sheet\]:break-all/);
    assert.match(panel, /if \(!drawerOpen\) setExpanded\(new Set\(\)\)/);
    assert.match(app, /<PropertiesSheet open=\{propsOpen\}[\s\S]*?<FrontmatterPanel\s+drawerOpen=\{propsOpen\}/);
  });

  it("caps the initial properties drawer without limiting the expansion stage", () => {
    const panel = readFileSync(new URL("../components/FrontmatterPanel.tsx", import.meta.url), "utf8");
    const css = readFileSync(new URL("../components/properties-sheet.css", import.meta.url), "utf8");
    assert.match(panel, /contentClassName="vault-properties-drawer"/);
    assert.match(css, /--bb-drawer-initial-max-height:\s*66\.666dvh/);
    assert.doesNotMatch(css, /!important|data-bb-mobile-sheet-stage|\n\s*max-height\s*:/);
  });
});
