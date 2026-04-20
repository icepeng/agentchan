// innerHTML/Idiomorph morph로 삽입된 <script> 태그는 브라우저가 자동 실행하지
// 않는다. HTML 파서가 트리 생성 중 script를 만났을 때만 실행하는데, innerHTML
// 은 파서 경로를 타지 않기 때문. 새 <script> 요소를 생성해 attribute/textContent
// 를 옮겨 replaceWith하면 연결된 순간 브라우저가 실행한다.
//
// 새 script는 root의 ownerDocument에서 생성한다. root가 iframe 안에 있으면
// iframe realm에서 실행되어 script 안의 `document`/`window`가 iframe 쪽을
// 가리킨다 — 렌더러가 iframe DOM을 스캔하려는 의도에 맞음.
//
// 인라인 IIFE가 재실행되므로 리스너 등록을 여러 번 막는 가드는 렌더러 쪽에서
// 책임진다 (예: `if (form.dataset.bound === '1') return; form.dataset.bound = '1';`).
export function executeInlineScripts(root: HTMLElement): void {
  const doc = root.ownerDocument;
  const scripts = root.querySelectorAll("script");
  for (const oldScript of Array.from(scripts)) {
    const newScript = doc.createElement("script");
    for (const attr of Array.from(oldScript.attributes)) {
      newScript.setAttribute(attr.name, attr.value);
    }
    newScript.textContent = oldScript.textContent;
    oldScript.replaceWith(newScript);
  }
}
