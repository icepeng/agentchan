# Session schema와 helper는 Pi에서 분리해 Agentchan이 소유한다

ADR-0004의 Pi-compatible JSONL wire format은 유지하지만, schema와 helper 구현은 `@mariozechner/pi-coding-agent` import가 아니라 Agentchan vendored snapshot으로 소유한다.
Pi는 standalone CLI application이라 executable build에서 top-level module side effect가 깨졌고, 앞으로 Pi 변화는 자동 추종이 아니라 Agentchan에 의미 있는 interface와 learning만 cherry-pick한다.
