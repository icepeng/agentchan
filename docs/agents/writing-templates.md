## 템플릿 저작 규칙

- 템플릿은 "평균적으로 무난한" 콘셉트보다 한 가지 감정·장르·상황을 강하게 밀어붙인다. 대중성이 필요하면 소재는 익숙하게, 연출은 치우치게 잡는다.
- 템플릿의 첫 화면은 사용자가 즉시 행동할 수 있어야 한다. 빈 대기 화면에도 2~3개의 starter choice를 제공한다.
- 대화형 템플릿은 각 주요 응답 말미에 다음 행동 선택지를 제공한다. 선택지는 이야기를 닫는 설명이 아니라 사용자의 다음 판단을 구체화해야 한다.
- `SYSTEM.md`와 template skill은 변천사·세계관 설명보다 실행 루프를 우선한다: 시작 장면, 증거 제시, 인물 반응, 선택지 생성, 결말 판정 같은 행동 규칙을 짧고 강하게 쓴다.

## Renderer 저작 규칙

- Renderer가 viewport를 소유한다. `RenderedView`가 외부 padding을 넣는다고 가정하지 않는다.
- Renderer import는 실제 사용하는 공개 API만 가져온다. 기본 시작점은 다음처럼 작게 둔다.

```ts
import {
  createRenderer,
  type AssistantContentBlock,
  type RendererProps,
  type ToolCall,
  type ToolResultMessage,
} from "@agentchan/renderer/react";
```

- Template을 외부 repo로 추출할 때는 renderer 전용 tsconfig를 둔다. 최소 패턴은 다음과 같다.

```json
{
  "extends": "./tsconfig.json",
  "compilerOptions": {
    "lib": ["ESNext", "DOM", "DOM.Iterable"],
    "jsx": "react-jsx",
    "types": [],
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "paths": {
      "@agentchan/renderer/core": ["./node_modules/@agentchan/renderer/src/core.ts"],
      "@agentchan/renderer/react": ["./node_modules/@agentchan/renderer/src/react.tsx"]
    }
  },
  "include": ["renderer/**/*.ts", "renderer/**/*.tsx"]
}
```

- 템플릿 renderer의 첫 viewport는 하나의 composition으로 읽혀야 한다. 정보 패널·카드·상태줄을 나열한 dashboard처럼 만들지 않는다.
- 브랜드/작품명은 hero-level signal이어야 한다. nav나 작은 eyebrow를 지웠을 때 다른 템플릿과 구분되지 않으면 브랜딩이 약한 것이다.
- 한국어가 노출될 수 있는 UI는 기본 제공 `Pretendard Variable`을 1순위로 쓴다. OS에 설치된 `Noto Serif KR`, `Nanum Myeongjo` 같은 폰트가 있다고 가정하지 않는다.
- 영문 전용 브랜드/라벨에는 앱이 제공하는 `Syne`, `Lexend`, `Fira Code`를 사용할 수 있다. 한국어가 섞일 가능성이 있으면 `Pretendard Variable`로 돌아온다.
- 한국어 가능 영역에서는 italic, monospace, 과한 letter-spacing을 강조 수단으로 쓰지 않는다. weight, color/opacity, serif/sans 페어링, 따옴표, border-left, 여백으로 구분한다.
- Web UI 확인 시 데스크톱과 모바일 폭에서 첫 화면, 선택지, 버튼 텍스트 overflow, 실제 computed font-family를 확인한다.

## 프롬프트/Skill 저작 규칙

- agentchan의 `SYSTEM.md`, `SYSTEM.meta.md`, `skills/*/SKILL.md`는 제품 런타임에서 LLM에 주입되는 실행 지침이다. 작성 시 변천사, deprecation 설명, 설계 합리화, 자기참조 재강조, 중복 guard를 제거한다.
- 문장을 지워도 LLM 행동이 동일하면 제거한다. 행동을 바꾸는 제약, 절차, 엣지케이스만 남긴다.
- Skill `scripts/*.ts`는 self-contained로 유지하고, 스킬 간 helper 공통화를 만들지 않는다.
