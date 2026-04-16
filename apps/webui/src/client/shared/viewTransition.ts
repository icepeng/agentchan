// Chromium/Safari만 지원. 미지원 브라우저(Firefox 등)는 즉시 실행.
// `.finished`를 기다려 연속 호출 시 뒤엣 놈이 앞의 애니메이션을 스킵시키지 않게 한다.
export function withViewTransition(update: () => void | Promise<void>): Promise<void> {
  if (typeof document.startViewTransition === "function") {
    return document.startViewTransition(update).finished;
  }
  return Promise.resolve(update());
}
