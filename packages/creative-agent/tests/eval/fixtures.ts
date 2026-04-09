import { mkdtemp, cp, mkdir, writeFile, rm } from "node:fs/promises";
import { join, dirname } from "node:path";
import { tmpdir } from "node:os";

export interface FixtureOptions {
  skillNames?: string[];
  prePopulate?: Record<string, string>;
}

/**
 * A fixture is a temp `projectsDir` containing one project at `slug`. The
 * shape mirrors production storage so the harness can hand `projectsDir` to
 * `createAgentContext` and `slug` to `createConversation` — i.e. exercise
 * the same code path the webui uses.
 */
export interface Fixture {
  projectsDir: string;
  slug: string;
  /** Convenience: `join(projectsDir, slug)`. */
  projectDir: string;
}

const MONOREPO_ROOT = join(import.meta.dir, "..", "..", "..", "..");

export async function createFixture(options: FixtureOptions): Promise<Fixture> {
  const projectsDir = await mkdtemp(join(tmpdir(), "eval-"));
  const slug = "test";
  const projectDir = join(projectsDir, slug);

  const names = options.skillNames ?? [];
  for (const name of names) {
    const skillSrc = join(MONOREPO_ROOT, "example_data", "library", "skills", name);
    const skillDst = join(projectDir, "skills", name);
    await cp(skillSrc, skillDst, { recursive: true });
  }
  await mkdir(join(projectDir, "output"), { recursive: true });

  if (options.prePopulate) {
    for (const [relPath, content] of Object.entries(options.prePopulate)) {
      const absPath = join(projectDir, relPath);
      await mkdir(dirname(absPath), { recursive: true });
      await writeFile(absPath, content, "utf-8");
    }
  }

  return { projectsDir, slug, projectDir };
}

export async function cleanupFixture(fixture: Fixture): Promise<void> {
  await rm(fixture.projectsDir, { recursive: true, force: true });
}

// --- Pre-populate stub data for later stages ---

const OUTLINE_STUB = `# 아웃라인: 마지막 문

> **장르**: 판타지
> **로그라인**: 견습 마법사가 세계를 풀어버리는 금지된 주문을 발동했을 때, 그녀는 현실이 무너지기 전에 세 죽어가는 왕국을 횡단하여 해주를 찾아야 한다.
> **주제**: 지식의 대가
> **목표 분량**: 80,000 단어

## 1막: 설정 (1-8장)

### 오프닝 이미지
리라는 금지된 서고에서 주문서를 발견한다.

### 촉매 사건
주문이 실수로 발동되어 현실의 균열이 나타나기 시작한다.

### 1막 전환점
리라는 해주를 찾기 위해 왕국을 떠나야 한다는 것을 깨닫는다.

## 2막 전반: 시련 (9-16장)

### B 스토리
현자 엘로웬이 리라의 안내자로 합류한다.

### 재미와 게임
세 왕국을 횡단하며 각 왕국의 고유한 위험에 직면한다.

### 미드포인트
보라스의 정체가 드러난다 — 그는 같은 주문을 의도적으로 사용하려 한다.

## 2막 후반: 위기 (17-24장)

### 악당의 반격
보라스가 두 번째 왕국의 해주 단서를 파괴한다.

### 모든 것을 잃다
엘로웬이 리라를 보호하다 쓰러진다.

### 영혼의 어둠
리라는 주문을 사용한 자신의 책임과 마주한다.

## 3막: 해결 (25-32장)

### 3막 전환점
리라는 해주가 주문 자체 안에 있다는 것을 깨닫는다.

### 클라이맥스
리라와 보라스의 최종 대결.

### 파이널 이미지
현실이 복구되지만, 리라는 마법 능력을 잃는다 — 지식의 대가.
`;

const CHARACTER_STUB_LIRA = `# 캐릭터 시트: 리라

## 정체성
- **이름**: 리라 (Lira)
- **나이**: 19세
- **역할**: 주인공
- **아키타입**: 순진한 자 → 영웅

## 동기
- **욕망** (외적): 금지된 주문을 되돌리고 현실을 복구한다
- **필요** (내적): 실수를 인정하고 책임을 지는 법을 배운다

## 성격
호기심 많고 충동적이며, 지식에 대한 끝없는 갈증이 있다.
`;

const CHARACTER_STUB_VORATH = `# 캐릭터 시트: 보라스

## 정체성
- **이름**: 보라스 (Vorath)
- **나이**: 52세
- **역할**: 적대자
- **아키타입**: 타락한 현자

## 동기
- **욕망** (외적): 금지된 주문으로 현실을 재구성하여 "완벽한 세계"를 만든다
- **필요** (내적): 과거의 상실을 받아들인다

## 성격
냉정하고 계산적이지만, 잃어버린 제자에 대한 죄책감이 있다.
`;

const WORLD_STUB = `# 세계관: 삼왕국

## 시대 및 지리
세 왕국이 마력선(레이라인)으로 연결된 대륙. 마력선은 현실의 구조를 유지한다.

## 사회 구조
- 각 왕국은 고유한 마법 전통을 가진다
- 마법사 길드가 왕국 간 외교를 담당

## 규칙
- 마법은 마력선에서 에너지를 끌어온다
- 금지된 주문은 마력선 자체를 풀어버린다

## 감각 팔레트
마력선이 풀리는 곳에서는 공기가 유리처럼 깨지는 소리가 나고, 색이 빠져나간다.
`;

const CHAPTER_STUB = `# 1장: 금지된 서고

리라는 학원의 지하 서고에서 먼지 쌓인 주문서를 발견했다. 오래된 양피지에서 은은한 빛이 새어 나왔다.

"이건 뭐지?" 그녀는 주문서의 첫 페이지를 조심스럽게 넘겼다.

문자들이 공중에 떠올랐다. 리라가 무의식적으로 첫 구절을 읽는 순간, 서고의 벽에 가느다란 균열이 나타났다.

---

균열에서 차가운 바람이 불어왔다. 리라는 뒤로 물러섰지만, 주문은 이미 발동된 후였다.

"누가 거기 있어?" 복도에서 감시관의 목소리가 들렸다.

리라는 주문서를 품에 안고 어둠 속으로 뛰어들었다.
`;

export const OUTLINE_ONLY_FIXTURES: Record<string, string> = {
  "output/outline.md": OUTLINE_STUB,
};

/** Pre-populate data for stage 3 (needs outline + characters + world) */
export const STAGE_3_FIXTURES: Record<string, string> = {
  "output/outline.md": OUTLINE_STUB,
  "output/characters/lira.md": CHARACTER_STUB_LIRA,
  "output/characters/vorath.md": CHARACTER_STUB_VORATH,
  "output/world.md": WORLD_STUB,
};

/** Pre-populate data for stage 4 (needs everything + chapters) */
export const STAGE_4_FIXTURES: Record<string, string> = {
  ...STAGE_3_FIXTURES,
  "output/chapters/01-forbidden-library.md": CHAPTER_STUB,
};
