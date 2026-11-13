/** 패널 너비는 표시 밀도만 결정하며 기기 판정에는 사용하지 않는다. */
export function panelLayout(width: number | null, viewingFile: boolean, listOpen: boolean) {
  const compact = width === null || width < 640;
  return { compact, showList: compact && (!viewingFile || listOpen) };
}
