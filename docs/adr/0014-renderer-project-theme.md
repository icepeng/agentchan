# Renderer theme contract boundary

Renderer는 iframe 안에 격리되어 있지만, 어떤 Project는 iframe 밖 Project 채팅 UI까지 자기 분위기를 입히고 싶다. 또한 Project content나 Session 상태에 따라 표현을 바꾸려면 Renderer가 snapshot을 기준으로 Theme을 다시 제안할 수 있어야 한다.

## Decision

이 요구를 하나의 양방향 CSS variable 계약으로 풀지 않고, 방향이 다른 두 계약으로 나눈다.

- Host -> Renderer: iframe 안에서 읽는 `--agentchan-default-*` fallback token
- Renderer -> Host: Project 채팅 UI에 적용할 `theme(snapshot)` Project theme callback

두 계약은 같은 token 목록을 반대 방향으로 주고받는 mirror가 아니다.

## Host -> Renderer

Host fallback token은 Renderer가 iframe 안에서 App theme에 맞춰 보이도록 기본 color와 font를 제공한다. Renderer는 `--agentchan-default-*`를 읽을 수 있지만 선언하거나 override하지 않는다.

Renderer가 자기 CSS variable을 둘 때는 `--agentchan-renderer-*`를 사용한다. 이 값은 Renderer 내부에서만 의미를 갖고 Host가 해석하지 않는다.

## Renderer -> Host

Project theme callback은 Renderer가 iframe 밖 Project 채팅 UI에 적용할 Theme을 Host에 제안하는 통로다. `setTheme()` 같은 imperative API는 제공하지 않는다. callback 형태로 두면 Author가 snapshot 구독, diff, cleanup 책임을 직접 지지 않아도 되고, Host는 snapshot 변화와 theme identity를 같은 presentation lifecycle 안에서 다룰 수 있다.

Host는 Project theme의 Color scheme을 다음처럼 해석한다.

- `light`와 `dark`가 모두 있으면 User의 Appearance preference에 맞는 Color scheme을 적용한다.
- `light`만 있으면 Project 채팅 UI를 light로 고정한다.
- `dark`만 있으면 Project 채팅 UI를 dark로 고정한다.

Project theme은 partial을 허용하지 않는다. Renderer가 Project theme을 제공한다면 Host가 이해하는 color token 묶음을 Color scheme 단위로 완성해서 반환해야 한다. Project theme이 invalid이거나 partial이면 Host는 일부 token만 적용하지 않고, Project theme이 없는 것으로 보고 App theme으로 돌아간다.

## Boundary

두 계약의 token 목록은 의도적으로 완전히 일치하지 않는다. Host fallback token은 iframe 안의 Renderer 표시를 위한 값이므로 font token을 포함할 수 있다. Project theme callback은 Project 채팅 UI의 Theme을 바꾸는 값이므로 color token만 받는다.

다만 양쪽에 모두 존재하는 `void`, `fg` 같은 이름은 같은 의미로 맞춘다.

Agentchan UI 전체가 쓰는 token을 그대로 Renderer 계약으로 노출하지 않는다. Web UI 내부 구현 token인 `--color-*`, `--font-family-*`도 Renderer 작성 계약이 아니다. App theme 구현을 바꿀 때 Renderer가 함께 깨지는 결합을 피하고, Author가 알아야 하는 표면을 Renderer와 Project theme에 필요한 범위로 제한하기 위해서다.

## Considered Options

하나의 양방향 CSS variable 계약으로 Host와 Renderer의 theme 값을 주고받을 수도 있었다. 이 방식은 Renderer가 CSS에 선언한 색을 Project theme callback에 다시 적지 않아도 되므로 중복을 줄인다.

하지만 CSS variable은 cascade 결과이지 Theme message가 아니다. Renderer가 Host에 Project theme을 제안할 때는 어떤 Color scheme을 제공하는지, 한쪽 scheme만 제공해 Appearance preference를 고정하려는지, partial을 허용하지 않는지 같은 의미가 함께 전달돼야 한다. 이 의미를 CSS variable 위에 다시 얹으면 결국 별도 message protocol을 만들게 된다.

현재 설계의 약점은 Project theme을 Renderer CSS와 `theme(snapshot)`에 중복해서 적을 수 있다는 점이다. 대신 Host는 Project 채팅 UI에 적용할 Theme을 명시적인 callback 결과로 받고, Renderer iframe 안의 fallback token과 iframe 밖 Project theme의 책임을 섞지 않는다. 이 중복은 Author가 주의해야 하는 비용으로 받아들인다.
