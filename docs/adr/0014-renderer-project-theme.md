# Renderer theme contract boundary

Renderer와 Host의 theme 계약은 방향이 다른 두 계약으로 나뉜다. Host → Renderer는 iframe 안 `--agentchan-default-*` fallback token, Renderer → Host는 `theme(snapshot)` Project theme callback이다.

Fallback token은 Renderer가 iframe 안에서 App theme에 맞춰 보이도록 기본 color와 font를 제공한다. Renderer는 이 token을 읽기만 하고 선언하거나 override하지 않으며, 자기 CSS variable이 필요하면 `--agentchan-renderer-*` namespace를 쓴다. Host는 이 namespace를 해석하지 않는다.

Project theme callback은 Renderer가 Project 채팅 UI에 적용할 Theme을 Host에 제안하는 통로다. `setTheme()` 같은 imperative API는 두지 않는다. callback 형태로 두면 Author가 snapshot 구독, diff, cleanup 책임을 직접 지지 않아도 되고, Host는 snapshot 변화와 theme identity를 같은 presentation lifecycle에서 다룬다.

Host는 반환된 Project theme의 Color scheme을 다음처럼 해석한다.

- `light`와 `dark`가 모두 있으면 User의 Appearance preference에 맞는 Color scheme을 적용한다.
- 한쪽만 있으면 Project 채팅 UI를 그 Color scheme으로 고정한다.

Partial은 허용하지 않는다. Project theme이 invalid이거나 partial이면 Host는 일부 token만 적용하지 않고, Project theme이 없는 것으로 보고 App theme으로 돌아간다.

두 계약의 token 목록은 의도적으로 완전히 일치하지 않는다. Fallback token은 iframe 안 표시용이므로 font token을 포함하고, Project theme callback은 color token만 받는다. 양쪽에 모두 있는 `void`, `fg` 같은 이름은 같은 의미로 맞춘다. Web UI 내부 token(`--color-*`, `--font-family-*`)은 Renderer 계약이 아니다. App theme 구현이 바뀔 때 Renderer가 함께 깨지지 않게 하고, Author가 알아야 하는 표면을 Renderer와 Project theme에 필요한 범위로 좁히기 위해서다.

## Considered Options

- **Single bidirectional CSS variable contract**: Renderer CSS의 색을 callback에 다시 적지 않아도 되어 중복은 줄지만, Color scheme 제공 여부와 partial 거부 같은 의미를 cascade 위에 얹어야 하므로 결국 별도 message protocol을 만들게 된다.

## Consequences

- Renderer CSS와 `theme(snapshot)` 두 곳에 같은 색이 중복으로 적힐 수 있고, 이를 일치시키는 책임은 Author에게 있다.
