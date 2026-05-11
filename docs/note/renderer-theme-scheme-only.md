# Idea sketch: scheme-only Project theme

자체 palette를 만들지 않고 host default를 그대로 쓰면서 scheme만 강제하고 싶다는
use case가 생기면, `RendererTheme`을 discriminated union으로 확장하는 모양이
자연스럽다.

```ts
type RendererTheme =
  | { scheme: "light" | "dark" }                                  // host default + scheme 강제
  | { light?: RendererThemeTokens; dark?: RendererThemeTokens };  // custom palette
```

이 모양은 "양쪽 palette + 한쪽 잠금" 같은 의미 없는 조합을 문법적으로 막는다.
현재 시점에선 실제 수요가 없어 ADR-0014에 들이지 않았다.
