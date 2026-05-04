# Renderer는 host React tree에 직접 mount되지 않는다

Renderer는 User가 오래 보는 Project의 표현 layer라, 작성 계약을 한 번 잘못 잡으면 나중에 옮기기 어렵다. 첫 V1 초안은 가장 단순한 길이었다. 작성자가 `renderer/index.tsx`에서 React component를 default export하면, host Web UI가 그걸 자기 React tree 안에 그대로 끼워 render한다. 작동했다. 단 작성 계약이 host의 React 인스턴스 · reconciler · dependency 해결 방식에 통째로 묶이는 형태가 된다. host가 그중 어느 하나라도 바꾸는 순간 — 다른 reconciler 도입, dependency resolver 확장 — 작성자 코드가 invalid hook call이나 reconciler mismatch로 깨진다.

정반대 끝은 격리를 V1부터 박는 길이었다 — iframe 문서, Project별 `package.json`, dependency install을 처음부터 필수 계약으로 올린다. 경계는 명쾌하지만 Author에게 package manager와 dependency 계약을 요구하고, User에게도 Project 실행 시 install 상태와 실패가 노출될 수 있어 구현 범위가 과대해진다. iframe 자체는 *언젠가는* 갈 길로 보이지만, V1 필수 계약으로 올릴 만큼 시급하지 않다.

가운데를 잡는다. 작성자는 host에 자기 component를 직접 꽂지 않는다. `@agentchan/renderer`가 제공하는 adapter로 한 번 감싸고, named export `renderer`로 내놓는다. Adapter가 host에 노출하는 건 component가 아니라 *lifecycle* — mount / update / unmount / theme(optional). 이게 V1 공개 작성 계약의 전부다. 그 안쪽에서 host가 어떻게 굴리는지 — 현재는 같은 페이지의 ShadowRoot 안에 *별도* React root를 띄우는 식 — 는 implementation detail이고 작성 계약 밖이다. 핵심은 작성자 코드가 host의 React 인스턴스를 *공유하지 않는다*는 점이며, 이 비공유가 향후 backend 전환의 여지를 만든다.

작성자가 의존할 수 있는 surface는 좁게 fix한다 — `@agentchan/renderer/{core,react}` subpath와 그 안의 helper · 타입, 그리고 `renderer/` 내부 relative + CSS import. 그 외 bare import는 build policy가 reject한다(`packages/renderer/src/build/policy.ts`).

## Considered Options

- **`agentchan:renderer/v1` 같은 virtual module specifier** — 기각. 작성자가 의존할 specifier는 실제 npm package 형태여야 future package 추출과 lockfile 관리가 자연스럽다.

## Consequences

- Renderer는 project page의 표현 layer이며, session · storage · routing 소유권은 host에 남긴다. Renderer는 host가 제공한 snapshot을 읽고 actions로 요청만 보낸다.
- iframe backend로 옮길 여지를 위해 작성자는 host document identity를 가정하지 않고 쓴다 — DOM 작업은 adapter가 준 container 기준, document API가 필요하면 거기서 거슬러 올라간 ownerDocument 기준. host의 `window.parent` · query selector · CSS variable에 손대지 않는다.
- Renderer가 참조하는 Project content asset URL은 host DOM이나 server path를 추측해 만들지 않고 helper를 거친다. backend 전환 시 URL 규칙을 host가 일괄로 바꿀 수 있어야 하기 때문이다.

## Reconsider When

- 위 작성 제약을 지킨 renderer가 source 변경 없이 iframe backend에서 실행되지 않을 때.
- 추가 npm package(예: `@react-three/fiber`, `three`)가 primary use case가 되어 stable dependency resolver나 project별 isolation이 필요해질 때.
