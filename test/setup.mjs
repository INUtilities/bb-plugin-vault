import { registerHooks } from "node:module";
import { JSDOM } from "jsdom";

registerHooks({ load(url, context, next) { return url.endsWith(".css") ? { format: "module", source: "export {};", shortCircuit: true } : next(url, context); } });
const dom = new JSDOM("<!doctype html><html><body></body></html>", { url: "https://vault.test/" });
for (const key of ["window", "document", "HTMLElement", "Element", "Node", "MutationObserver", "localStorage", "sessionStorage"])
  globalThis[key] = dom.window[key];
Object.defineProperty(globalThis, "navigator", { value: dom.window.navigator, configurable: true });
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
globalThis.getComputedStyle = dom.window.getComputedStyle;
globalThis.requestAnimationFrame = callback => setTimeout(callback, 0);
globalThis.cancelAnimationFrame = clearTimeout;
dom.window.requestAnimationFrame = globalThis.requestAnimationFrame;
dom.window.cancelAnimationFrame = globalThis.cancelAnimationFrame;
globalThis.ResizeObserver = class { observe() {} disconnect() {} unobserve() {} };
globalThis.CSS = { escape: value => String(value).replaceAll('"', '\\"') };
dom.window.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
dom.window.HTMLElement.prototype.scrollIntoView = function () {};
