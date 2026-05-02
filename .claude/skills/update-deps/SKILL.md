---
name: update-deps
description: |
  Monorepo 의존성을 최신 버전으로 업데이트. Changelog 분석, 리스크 평가, 검증까지 포함.
disable-model-invocation: true
---

# 의존성 업데이트

Monorepo 전체 의존성을 최신화한다. Changelog 기반 리스크 평가 → 사용자 확인 → 업데이트 → 검증 순서.

## Phase 1: 현황 파악

```bash
bun outdated --filter='*'
```

출력 테이블에서 각 행을 파싱한다:
- **Package**: 패키지명
- **Current**: 현재 설치 버전
- **Update**: caret 범위 내 최신 (in-range)
- **Latest**: npm registry 최신
- **Workspace**: 해당 workspace 이름

두 가지 tier로 분류:
- **Tier 1 (in-range)**: `Update == Latest` — `bun update`로 해결
- **Tier 2 (out-of-range)**: `Update != Latest` — `bun add <pkg>@latest`가 필요 (package.json range 변경)

`workspace:*` 내부 패키지는 건드리지 않는다.

## Phase 2: Changelog 분석

각 outdated 패키지에 대해 릴리스 노트를 가져온다. **patch 업데이트(x.y.Z만 변경)는 건너뛴다.**

### 방법 1: GitHub Releases API (우선)

```bash
# 1. repo URL 확인
npm view <pkg> repository.url --json

# 2. owner/repo 추출 후 릴리스 조회 (per_page는 URL 쿼리 파라미터로 전달)
gh api "repos/{owner}/{repo}/releases?per_page=20" -q '.[].tag_name'
```

Current → Latest 범위의 릴리스만 확인. 각 릴리스 body에서:
- `breaking`, `BREAKING CHANGE`, `migration`, `deprecated` 키워드 탐지
- 주요 변경사항 1-2줄 요약

### 방법 2: WebFetch fallback

GitHub releases가 없으면:
```
WebFetch("https://raw.githubusercontent.com/{owner}/{repo}/main/CHANGELOG.md")
```

### 방법 3: WebSearch (최후 수단)

위 둘 다 실패 시 `WebSearch("{package-name} changelog {version}")`.

**같은 org 묶기**: `@scope/` 접두사가 같은 패키지는 한번에 조회 (예: `@mariozechner/pi-ai` + `@mariozechner/pi-agent-core`는 같은 repo).

## Phase 3: 리스크 평가

각 패키지를 리스크 등급으로 분류:

| 등급 | 기준 | 예시 |
|------|------|------|
| **LOW** | patch (x.y.**Z**) | 4.12.9 → 4.12.12 |
| **MEDIUM** | minor (x.**Y**.0), major version >= 1 | 1.7.0 → 1.8.0 |
| **HIGH** | major (**X**.0.0), 또는 0.x minor bump, 또는 changelog에 breaking 키워드 | 0.64.0 → 0.66.1 |

0.x 패키지의 minor bump은 semver 관례상 breaking으로 간주한다.

## Phase 4: 사용자에게 요약 제시

아래 형식으로 테이블을 출력하고 사용자 확인을 받는다:

```
### 의존성 업데이트 요약

#### HIGH 리스크
| 패키지 | 현재 → 최신 | Workspace | 비고 |
|--------|-------------|-----------|------|
| @mariozechner/pi-ai | 0.64.0 → 0.66.1 | creative-agent | 0.x minor bump |

#### MEDIUM 리스크
...

#### LOW 리스크
(patch 목록 — 간략히)

HIGH 항목 changelog 요약:
- **@mariozechner/pi-ai 0.65.0**: (요약)
- **@mariozechner/pi-ai 0.66.0**: (요약)

진행할까요? (전체 / HIGH 제외 / 취소)
```

사용자 응답에 따라:
- **전체**: 모든 업데이트 진행
- **HIGH 제외**: Tier 1 + MEDIUM 이하만 진행
- **취소**: 중단

## Phase 5: 업데이트 실행

### Step 1: Tier 1 (in-range) 일괄 업데이트

```bash
bun update
```

빠른 검증:

```bash
bun run typecheck
```

실패 시 원인 분석 후 수정.

### Step 2: Tier 2 (out-of-range) 개별 업데이트

같은 scope의 패키지는 함께 업데이트한다:

```bash
# 예: @mariozechner 패키지 묶음
bun add @mariozechner/pi-ai@latest @mariozechner/pi-agent-core@latest --cwd packages/creative-agent
```

각 업데이트 후 즉시 type-check:

```bash
bun run typecheck:packages
```

실패 시:
1. 에러 메시지 분석
2. API 변경사항은 changelog에서 migration guide 확인
3. 코드 수정 후 재검증
4. 수정 불가하면 사용자에게 보고하고 해당 패키지 업데이트 revert:
   ```bash
   git checkout -- packages/creative-agent/package.json && bun install
   ```

## Phase 6: 최종 검증 & 커밋

### 검증

```bash
# Type-check (전체 슬라이스: packages + scripts)
bun run typecheck

# Lint
bun run lint

# Build
bun run build
```

모든 검증 통과 후 커밋.

### 커밋 전략

**Tier 1 커밋** (in-range 일괄):
```
chore(deps): update in-range dependencies

- pkg1 x.y.z → x.y.w
- pkg2 ...
```

**Tier 2 커밋** (out-of-range, scope별 묶음):
```
chore(deps): update {package-name} {current} → {latest}

{changelog 요약 1-2줄}
{breaking change 대응 내역 (있으면)}
```

## 주의사항

- 타입 체크는 `bun run typecheck` (tsgo 기반). `npx tsc` 사용 금지
- `@typescript/native-preview`는 exact pin 유지. bump는 별도 PR로 분리해서 회귀 추적 용이하게 한다.
- `workspace:*` 내부 패키지는 업데이트 대상 아님
- devDependencies도 동일하게 처리 (type 안전성에 영향)
- `bun.lock` 변경은 자동으로 따라옴 — 별도 처리 불필요
- 검증 실패 시 무작정 재시도하지 말고 원인 파악
