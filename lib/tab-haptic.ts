// Same capability contract as Codes' drawer-haptic; never use browser vibration.
interface HapticBridge {
  post(message: unknown): void;
  capabilities?: readonly string[];
}
export function postImpact(bridge: HapticBridge | null): boolean {
  if (!bridge?.capabilities?.includes("haptic")) return false;
  bridge.post({ type: "haptic", kind: "impact-light" });
  return true;
}
export function readHapticBridge(root: unknown): HapticBridge | null {
  if (typeof root !== "object" || root === null) return null;
  const native = (root as { bb?: { native?: Partial<HapticBridge> } }).bb?.native;
  if (!native || typeof native.post !== "function") return null;
  return native as HapticBridge;
}
