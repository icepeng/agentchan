#!/usr/bin/env bun
/**
 * BM25 기반 장기 기억 검색 도구.
 *
 * Bun 내장 sqlite (FTS5 + trigram tokenizer + bm25)로 `files/memory/journal*.md`를
 * 청크 단위로 인덱싱하고 키워드 검색을 수행한다. 의존성 0.
 *
 * 사용법 (프로젝트 루트 = cwd 에서 호출):
 *   bun skills/journal-search/assets/search.ts <쿼리>            # 검색 (필요 시 lazy 인덱싱)
 *   bun skills/journal-search/assets/search.ts --rebuild         # 인덱스 강제 재빌드
 *   bun skills/journal-search/assets/search.ts --rebuild <쿼리>  # 재빌드 후 검색
 *
 * 동작:
 *   - 검색 대상: <cwd>/files/memory/journal*.md (top-level만, 재귀 아님)
 *   - 인덱스 파일: <cwd>/files/memory/.journal-index.db (hidden sidecar)
 *   - mtime+size 비교로 변경된 파일만 재인덱싱
 *   - 한국어 1~2글자 토큰은 trigram이 못 잡으므로 자동으로 LIKE 폴백
 *   - 결과는 BM25 점수 기준 top-K
 */

import { Database } from "bun:sqlite";
import { mkdirSync } from "node:fs";
import { readFile, stat } from "node:fs/promises";
import { relative, resolve } from "node:path";

const MEMORY_DIR = resolve(process.cwd(), "files", "memory");
const INDEX_PATH = resolve(MEMORY_DIR, ".journal-index.db");

const FTS_TABLE = "chunks_fts";
const META_TABLE = "files_meta";
const TOP_K = 8;
const SNIPPET_TOKENS = 12;
const MAX_CHUNK_LINES = 30; // 헤딩 없이 길어지면 강제 분할

const TOKEN_RE = /[\p{L}\p{N}_]+/gu;
const SHORT_CJK_RE = /[\u3040-\u30ff\u3400-\u9fff\uac00-\ud7af\u3131-\u3163]/u;

type Cli = { query: string; rebuild: boolean };

function parseArgs(): Cli {
  const args = process.argv.slice(2);
  let rebuild = false;
  const queryParts: string[] = [];
  for (const a of args) {
    if (a === "--rebuild") rebuild = true;
    else queryParts.push(a);
  }
  return { query: queryParts.join(" ").trim(), rebuild };
}

function ensureSchema(db: Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS ${META_TABLE} (
      path TEXT PRIMARY KEY,
      mtime REAL NOT NULL,
      size INTEGER NOT NULL
    );
  `);
  db.exec(`
    CREATE VIRTUAL TABLE IF NOT EXISTS ${FTS_TABLE} USING fts5(
      text,
      path UNINDEXED,
      start_line UNINDEXED,
      end_line UNINDEXED,
      tokenize='trigram case_sensitive 0'
    );
  `);
}

async function listMarkdownFiles(root: string): Promise<string[]> {
  // `journal*.md` matches `journal.md` today and `journal-001.md` etc. if
  // sharding is introduced later. Non-recursive — top-level of MEMORY_DIR only.
  const glob = new Bun.Glob("journal*.md");
  const out: string[] = [];
  for await (const file of glob.scan({ cwd: root, absolute: true })) {
    out.push(file);
  }
  return out.sort();
}

type Chunk = { startLine: number; endLine: number; text: string };

/**
 * Markdown을 헤딩 단위로 청킹. 헤딩 없이 너무 길어지면 30줄 단위로 강제 분할.
 * 한 청크 = "# " 또는 "## " 등이 시작하는 의미 단위.
 */
function chunkMarkdown(text: string): Chunk[] {
  const lines = text.split("\n");
  const chunks: Chunk[] = [];
  let buf: string[] = [];
  let startLine = 1;

  const flush = (endLine: number): void => {
    const joined = buf.join("\n").trim();
    if (joined.length > 0) {
      chunks.push({ startLine, endLine, text: joined });
    }
    buf = [];
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? "";
    const lineNum = i + 1;
    const isHeading = /^#{1,6}\s/.test(line);

    if (isHeading && buf.length > 0) {
      flush(lineNum - 1);
      startLine = lineNum;
    }
    buf.push(line);
    if (buf.length >= MAX_CHUNK_LINES) {
      flush(lineNum);
      startLine = lineNum + 1;
    }
  }
  flush(lines.length);
  return chunks;
}

type SyncResult = { totalFiles: number; changed: number; removed: number };
type PendingFile = { rel: string; mtime: number; size: number; chunks: Chunk[] };

async function syncIndex(db: Database): Promise<SyncResult> {
  ensureSchema(db);
  const files = await listMarkdownFiles(MEMORY_DIR);

  const metaRows = db.prepare(`SELECT path, mtime, size FROM ${META_TABLE}`).all() as Array<{
    path: string;
    mtime: number;
    size: number;
  }>;
  const metaMap = new Map(metaRows.map((r) => [r.path, r]));

  // Phase 1: 변경 감지 + 파일 read (async I/O)
  const seen = new Set<string>();
  const pending: PendingFile[] = [];

  for (const filePath of files) {
    const rel = relative(MEMORY_DIR, filePath).replaceAll("\\", "/");
    seen.add(rel);
    const st = await stat(filePath);
    const prev = metaMap.get(rel);
    if (prev && prev.mtime === st.mtimeMs && prev.size === st.size) continue;
    const text = await readFile(filePath, "utf-8");
    pending.push({ rel, mtime: st.mtimeMs, size: st.size, chunks: chunkMarkdown(text) });
  }

  const removedPaths: string[] = [];
  for (const rel of metaMap.keys()) {
    if (!seen.has(rel)) removedPaths.push(rel);
  }

  // Phase 2: 모든 mutation을 단일 transaction에서 실행 (fsync 1회)
  const insertChunk = db.prepare(
    `INSERT INTO ${FTS_TABLE} (text, path, start_line, end_line) VALUES (?, ?, ?, ?)`,
  );
  const upsertMeta = db.prepare(
    `INSERT INTO ${META_TABLE} (path, mtime, size) VALUES (?, ?, ?)
     ON CONFLICT(path) DO UPDATE SET mtime = excluded.mtime, size = excluded.size`,
  );
  const deleteChunks = db.prepare(`DELETE FROM ${FTS_TABLE} WHERE path = ?`);
  const deleteMeta = db.prepare(`DELETE FROM ${META_TABLE} WHERE path = ?`);

  const flush = db.transaction(() => {
    for (const p of pending) {
      deleteChunks.run(p.rel);
      for (const c of p.chunks) {
        insertChunk.run(c.text, p.rel, c.startLine, c.endLine);
      }
      upsertMeta.run(p.rel, p.mtime, p.size);
    }
    for (const rel of removedPaths) {
      deleteChunks.run(rel);
      deleteMeta.run(rel);
    }
  });
  flush();

  return { totalFiles: files.length, changed: pending.length, removed: removedPaths.length };
}

type SearchPlan = { matchExpr: string | null; likeTerms: string[] };

/**
 * 쿼리를 trigram MATCH 가능 토큰과 LIKE 폴백 토큰으로 분리.
 * trigram 토크나이저는 3글자 미만 토큰을 인덱싱하지 않으므로
 * 짧은 한국어/일본어/중국어 토큰은 substring 검색으로 폴백한다.
 */
function planSearch(query: string): SearchPlan {
  const tokens = query.match(TOKEN_RE) ?? [];
  const matchTerms: string[] = [];
  const likeTerms: string[] = [];

  for (const t of tokens) {
    const charLen = Array.from(t).length;
    if (SHORT_CJK_RE.test(t) && charLen < 3) {
      likeTerms.push(t);
    } else {
      matchTerms.push(t);
    }
  }

  const matchExpr =
    matchTerms.length === 0
      ? null
      : matchTerms.map((t) => `"${t.replaceAll('"', "")}"`).join(" AND ");

  return { matchExpr, likeTerms };
}

/** SQLite FTS5 bm25() 점수는 보통 음수. 작을수록 더 관련 있음. [0,1]로 정규화. */
function normalizeBm25(rank: number): number {
  if (!Number.isFinite(rank)) return 0;
  if (rank < 0) {
    const r = -rank;
    return r / (1 + r);
  }
  return 1 / (1 + rank);
}

function escapeLike(s: string): string {
  return s.replaceAll("\\", "\\\\").replaceAll("%", "\\%").replaceAll("_", "\\_");
}

type SearchHit = {
  path: string;
  startLine: number;
  endLine: number;
  /** BM25 정규화 점수. LIKE-only 매칭은 점수가 의미 없으므로 null. */
  score: number | null;
  snippet: string;
};

const SNIPPET_WINDOW_CHARS = 60;

/**
 * LIKE 폴백 모드용 수동 snippet — SQLite snippet()은 FTS5 MATCH가 없으면 동작 안 함.
 * 청크 텍스트에서 첫 매칭 위치 주변을 잘라 << >> 마커로 강조한다.
 */
function manualSnippet(text: string, terms: string[]): string {
  const flat = text.replaceAll(/\s+/g, " ").trim();
  let firstHit = -1;
  for (const t of terms) {
    const idx = flat.indexOf(t);
    if (idx >= 0 && (firstHit < 0 || idx < firstHit)) firstHit = idx;
  }
  if (firstHit < 0) {
    return flat.length <= SNIPPET_WINDOW_CHARS * 2
      ? flat
      : flat.slice(0, SNIPPET_WINDOW_CHARS * 2) + "...";
  }
  const start = Math.max(0, firstHit - SNIPPET_WINDOW_CHARS);
  const end = Math.min(flat.length, firstHit + SNIPPET_WINDOW_CHARS);
  let slice = flat.slice(start, end);
  for (const t of terms) {
    slice = slice.replaceAll(t, `<<${t}>>`);
  }
  return (start > 0 ? "..." : "") + slice + (end < flat.length ? "..." : "");
}

function search(db: Database, query: string): SearchHit[] {
  const plan = planSearch(query);
  if (!plan.matchExpr && plan.likeTerms.length === 0) return [];

  const params: (string | number)[] = [];
  let where: string;
  let rankExpr: string;

  if (plan.matchExpr) {
    where = `${FTS_TABLE} MATCH ?`;
    params.push(plan.matchExpr);
    rankExpr = `bm25(${FTS_TABLE})`;
  } else {
    where = "1=1";
    rankExpr = "0";
  }

  for (const t of plan.likeTerms) {
    where += " AND text LIKE ? ESCAPE '\\'";
    params.push(`%${escapeLike(t)}%`);
  }

  // FTS5 snippet()은 MATCH가 있어야만 동작. LIKE-only 모드는 text를 가져와 수동 처리.
  const useFtsSnippet = plan.matchExpr !== null;
  const snippetCol = useFtsSnippet
    ? `snippet(${FTS_TABLE}, 0, '<<', '>>', '...', ${SNIPPET_TOKENS}) AS snip, '' AS text`
    : `'' AS snip, text`;

  const sql =
    `SELECT path, start_line, end_line,\n` +
    `       ${rankExpr} AS rank,\n` +
    `       ${snippetCol}\n` +
    `  FROM ${FTS_TABLE}\n` +
    ` WHERE ${where}\n` +
    ` ORDER BY rank ASC\n` +
    ` LIMIT ?`;
  params.push(TOP_K);

  const rows = db.prepare(sql).all(...params) as Array<{
    path: string;
    start_line: number;
    end_line: number;
    rank: number;
    snip: string;
    text: string;
  }>;

  return rows.map((r) => ({
    path: r.path,
    startLine: r.start_line,
    endLine: r.end_line,
    score: useFtsSnippet ? normalizeBm25(r.rank) : null,
    snippet: useFtsSnippet ? r.snip : manualSnippet(r.text, plan.likeTerms),
  }));
}

function formatHits(hits: SearchHit[]): string {
  if (hits.length === 0) return "(no matches)";
  return hits
    .map((h) => {
      const score = h.score === null ? "[like]" : `[${h.score.toFixed(3)}]`;
      const range = `${h.path}:${h.startLine}-${h.endLine}`;
      return `${score} ${range}\n   ${h.snippet}`;
    })
    .join("\n\n");
}

async function main(): Promise<void> {
  const cli = parseArgs();
  if (!cli.query && !cli.rebuild) {
    console.error("Usage: bun skills/journal-search/assets/search.ts <query>");
    console.error("       bun skills/journal-search/assets/search.ts --rebuild");
    process.exit(1);
  }

  // sqlite can create the db file but not its parent directory. On first run
  // (before any journal.md exists) files/memory/ may not yet be present.
  mkdirSync(MEMORY_DIR, { recursive: true });

  const db = new Database(INDEX_PATH);
  try {
    if (cli.rebuild) {
      db.exec(`DROP TABLE IF EXISTS ${FTS_TABLE}`);
      db.exec(`DROP TABLE IF EXISTS ${META_TABLE}`);
    }
    const sync = await syncIndex(db);

    if (!cli.query) {
      console.error(
        `indexed: ${sync.totalFiles} files (${sync.changed} updated, ${sync.removed} removed)`,
      );
      return;
    }

    const hits = search(db, cli.query);
    console.log(formatHits(hits));
    console.error(
      `\n[${sync.totalFiles} files indexed, ${sync.changed} updated, ${hits.length} hits]`,
    );
  } finally {
    db.close();
  }
}

main();
