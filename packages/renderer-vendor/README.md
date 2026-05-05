# `@agentchan/renderer-vendor`

baseline React vendor fixture **builder**다. Renderer bundle이 inline하지 않고
host document의 importmap으로 공유할 5개 specifier(`react`, `react-dom/client`,
`react/jsx-runtime`, `react/jsx-dev-runtime`, `scheduler`)에 해당하는 ESM
module 파일을 dev/prod 두 모드로 emit한다.

`private: true`. monorepo 내부 빌드 도구다.

## 왜 별도 패키지인가

`@agentchan/renderer`는 작성자 surface(`/core`, `/react`)와 호스트 빌드
파이프라인(`/build`)을 소유한다. vendor fixture는 **author도 host build도
아닌 install-wide artifact**라, lockfile에 고정된 react 사본을 한 번 굽고
모든 Renderer bundle이 그 사본을 importmap으로 공유한다는 별도의 책임이다.
같은 패키지 안에 두면 호스트 빌드와 vendor 산출물의 lifecycle이 섞인다.

## 모듈

```ts
import { buildVendorFixtures, ensureVendorFixtures } from "@agentchan/renderer-vendor";

// 무조건 새로 빌드 (CLI / release builder가 사용)
await buildVendorFixtures({
  outDir: "/abs/path/to/apps/webui/public/vendor/dev",
  mode: "development",
});

// 같은 inputs로 이미 빌드된 fixture가 있으면 skip (dev server가 사용)
await ensureVendorFixtures({
  outDir: "/abs/path/to/apps/webui/public/vendor/dev",
  mode: "development",
  inputs: defaultVendorInputs(), // [<repo>/bun.lock, <pkg>/src/build.ts]
});
```

5개 specifier마다 한 파일을 emit한다. 각 fixture는 valid ESM module이며,
`createElement`/`useState`/`createRoot` 같은 핵심 named export를 그대로
import할 수 있다. CJS→ESM 변환 시 Bun 출력은 `export default <expr>;`만
남기므로, 빌더가 default export를 evaluate해 키를 enumerate한 뒤 explicit
`export const X = __vendor_default.X;` 라인을 facade로 덧붙인다.

`ensureVendorFixtures`는 outDir 안에 `.vendor-cache.json` marker를 써서
inputs(lockfile + builder source) 내용 hash를 기록한다. 다음 호출에서 hash가
맞고 fixture 파일 5개가 모두 존재하면 rebuild를 skip한다. inputs가 바뀌면
stale로 판단해 outDir을 비우고 다시 build한다.

## CLI

```sh
bun run --cwd packages/renderer-vendor build:fixtures
# → apps/webui/public/vendor/{dev,prod}/*.js
```

옵션:

- `--out-dir=<dir>` — 기본 `apps/webui/public/vendor`
- `--dev` / `--prod` — 한쪽 모드만 빌드
- `--clean` — 출력 루트를 먼저 비우고 다시 빌드

CLI는 내부적으로 `ensureVendorFixtures`를 호출하므로, fixture가 이미 fresh
하면 skip 한다. 강제로 다시 빌드하려면 `--clean`을 쓰거나 marker 파일
(`.vendor-cache.json`)을 지운다.

`bun run dev`는 vite plugin (`apps/webui/vite.config.ts`의
`rendererVendorDevPrep`)에서 dev fixture를 자동으로 준비한다. Release
executable build는 `apps/webui/scripts/build-exe.ts`가 vite build 이전에
이 builder를 production mode로 호출해 prod fixture만 static asset tree에
emit한다.

## 산출물 디렉토리

| Mode | URL prefix (host doc importmap이 가리키는 경로) |
| --- | --- |
| development | `/vendor/dev/` |
| production | `/vendor/prod/` |

산출물은 git에 들어가지 않는다. lockfile만 commit한다.

## 테스트

```sh
bun run --cwd packages/renderer-vendor test
```

`tests/build.test.ts`가 5개 fixture 생성, 핵심 named export 노출, NODE_ENV
inlining, 동일 URL 재import 시 module identity 공유를 검증한다.
