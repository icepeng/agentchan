# Pi session schema와 helper는 import가 아니라 vendored snapshot으로 소유한다

ADR-0004는 session 저장 wire format을 Pi-compatible SessionEntry JSONL로 잡고, 그 schema와 helper(parse · migrate · context build · latest-compaction lookup 등)를 `@mariozechner/pi-coding-agent`에서 *import해서* 쓰는 형태로 출발했다. 검증된 코드를 빌려 자체 구현을 줄이는 의도였다.

문제는 Pi가 *standalone CLI application*이라는 점이었다. executable build(packaged binary)로 묶을 때 Pi의 top-level module side effect — CLI entrypoint 초기화 시 실행되는 setup 코드 — 가 library 사용 맥락에서 깨졌다.

그래서 Pi schema와 helper를 *vendored snapshot*으로 소유한다 — agentchan 안에 코드로 들어와 있고, Pi 변화는 자동 추종이 아니라 *cherry-pick*이다. 저장 형식 자체는 ADR-0004 그대로 Pi-compatible로 유지한다 — 우리가 vendor한 건 *code*지 *format*이 아니다. 같은 JSONL 파일은 Pi가 만든 것이든 우리가 만든 것이든 양쪽이 모두 읽을 수 있다.

## Considered Options

- **Pi를 그대로 import, executable build 시 side effect만 우회** — 기각. side effect를 우회하는 wrapper가 Pi 내부 구조에 의존하므로 Pi 마이너 업데이트마다 깨질 자리가 생긴다. *원본의 변경*이 매번 우리 빌드의 위험이 된다.
- **Pi를 fork해 library-friendly fork로 유지** — 기각. fork 유지 부담이 vendor와 비슷하면서 *upstream sync 의무*만 추가된다. 우리의 사용 범위는 Pi 전체가 아니라 schema/helper subset이라 fork할 양이 과대하다.
- **자체 schema를 처음부터 새로 정의** — 기각. ADR-0004의 wire-format-compatibility 가치(*end-user가 Pi 도구로도 파일을 열 수 있음*)가 사라진다.
