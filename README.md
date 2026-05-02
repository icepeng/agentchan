# agentchan

에이전트 기반 창작 도구. 스킬과 렌더러를 조합해 소설, 캐릭터 챗 등 다양한 워크플로우를 만들 수 있습니다.

모든 데이터는 파일시스템에 저장됩니다. 텍스트 에디터로 직접 고치거나, git으로 히스토리를 관리하거나, 폴더째 복사해서 간편하게 백업할 수 있습니다.

## 주요 기능

- [Agent Skills](https://agentskills.io/home) 스펙에 기반한 스킬로 캐릭터, 세계관, 로어북 등 다양한 기능을 추가할 수 있습니다.
- 프로젝트마다 렌더러를 작성해 에이전트 출력을 원하는 형태로 그릴 수 있습니다.
- 스킬과 렌더러를 라이브러리에 모아두고, 프로젝트에 복사해서 쓸 수 있습니다.

## 다운로드

[Releases](https://github.com/icepeng/agentchan/releases)에서 운영체제에 맞는 최신 버전을 다운받은 다음, 압축을 풀고 agentchan.exe를 실행합니다.

실행이 완료되면 localhost:3000으로 브라우저 탭이 열립니다.

## 개발

[Bun](https://bun.sh/) v1.3.11 이상, AI 프로바이더 API 키 최소 하나가 필요합니다.

```bash
git clone https://github.com/icepeng/agentchan.git
cd agentchan
bun install
```

### 개발 서버

```bash
bun run dev
```

브라우저에서 localhost:4100으로 접근할 수 있습니다.

### 예제 데이터

`example_data/`에 샘플 프로젝트, 스킬, 렌더러가 들어 있습니다.

```bash
cp -r example_data/ apps/webui/data/
```

개발 서버 사용시 위와 같이 복사해서 사용할 수 있습니다.

### 빌드

```bash
bun run build                # 프로덕션 빌드
bun run typecheck            # 타입 체크 (tsgo)

bun run build:exe            # 현재 플랫폼
bun run build:exe:win        # Windows
bun run build:exe:mac        # macOS (ARM64)
bun run build:exe:linux      # Linux (x64)
```
