/**
 * BM25 기반 장기 기억 검색 도구.
 *
 * sqlite (FTS5 + trigram tokenizer + bm25) 로 files/memory/journal*.md 를
 * 청크 단위로 인덱싱하고 키워드 검색을 수행한다.
 *
 * 사용법 (script tool):
 *   { file: "skills/journal-search/scripts/search.ts", args: ["<쿼리>"] }
 *   { file: "skills/journal-search/scripts/search.ts", args: ["--rebuild"] }
 *   { file: "skills/journal-search/scripts/search.ts", args: ["--rebuild", "<쿼리>"] }
 *
 * 동작:
 *   - 검색 대상: files/memory/journal*.md (top-level만)
 *   - 인덱스 파일: files/memory/.journal-index.db
 *   - mtime+size 비교로 변경된 파일만 재인덱싱
 *   - 한국어 1~2글자 토큰은 trigram이 못 잡으므로 LIKE 폴백
 */

import type { ScriptContext, SqliteHandle } from "@agentchan/creative-agent";

const MEMORY_DIR = "files/memory";
const INDEX_PATH = `${MEMORY_DIR}/.journal-index.db`;
const FTS_TABLE = "chunks_fts";
const META_TABLE = "files_meta";
const TOP_K = 8;
const SNIPPET_TOKENS = 12;
const MAX_CHUNK_LINES = 30;
const SNIPPET_WINDOW_CHARS = 60;

const TOKEN_RE = /[\p{L}\p{N}_]+/gu;
const SHORT_CJK_RE = /[\u3040-\u30ff\u3400-\u9fff\uac00-\ud7af\u3131-\u3163]/u;
const JOURNAL_FILE_RE = /^journal.*\.md$/;

type Cli = { query: string; rebuild: boolean };
type Chunk = { startLine: number; endLine: number; text: string };
type SyncResult = { totalFiles: number; changed: number; removed: number };
type SearchHit = {
  path: string;
  startLine: number;
  endLine: number;
  score: number | null;
  snippet: string;
};
type MetaRow = { path: string; mtime: number; size: number };
type FileRow = { text: string; path: string; start_line: number; end_line: number };
type SearchRow = FileRow & { rank: number; snip: string };

function parseCli(args: readonly string[], ctx: ScriptContext): Cli {
  const { values, positionals } = ctx.util.parseArgs({
    args: [...args],
    options: { rebuild: { type: "boolean" } },
    strict: true,
    allowPositionals: true,
  });
  return { query: positionals.join(" ").trim(), rebuild: Boolean(values.rebuild) };
}

function listJournalFiles(ctx: ScriptContext): string[] {
  if (!ctx.project.exists(MEMORY_DIR)) return [];
  return ctx.project
    .listDir(MEMORY_DIR)
    .filter((name) => JOURNAL_FILE_RE.test(name))
    .sort();
}

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

function ensureSchema(db: SqliteHandle): void {
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

function syncIndex(db: SqliteHandle, ctx: ScriptContext): SyncResult {
  ensureSchema(db);
  const files = listJournalFiles(ctx);

  const metaRows = db.all<MetaRow>(`SELECT path, mtime, size FROM ${META_TABLE}`);
  const metaMap = new Map(metaRows.map((r) => [r.path, r]));

  type Pending = { rel: string; mtime: number; size: number; chunks: Chunk[] };
  const seen = new Set<string>();
  const pending: Pending[] = [];

  for (const name of files) {
    const rel = name;
    seen.add(rel);
    const st = ctx.project.stat(`${MEMORY_DIR}/${rel}`);
    if (!st) continue;
    const prev = metaMap.get(rel);
    if (prev && prev.mtime === st.mtime && prev.size === st.size) continue;
    const text = ctx.project.readFile(`${MEMORY_DIR}/${rel}`);
    pending.push({ rel, mtime: st.mtime, size: st.size, chunks: chunkMarkdown(text) });
  }

  const removedPaths: string[] = [];
  for (const rel of metaMap.keys()) {
    if (!seen.has(rel)) removedPaths.push(rel);
  }

  db.batch(() => {
    for (const p of pending) {
      db.run(`DELETE FROM ${FTS_TABLE} WHERE path = ?`, [p.rel]);
      for (const c of p.chunks) {
        db.run(
          `INSERT INTO ${FTS_TABLE} (text, path, start_line, end_line) VALUES (?, ?, ?, ?)`,
          [c.text, p.rel, c.startLine, c.endLine],
        );
      }
      db.run(
        `INSERT INTO ${META_TABLE} (path, mtime, size) VALUES (?, ?, ?)
         ON CONFLICT(path) DO UPDATE SET mtime = excluded.mtime, size = excluded.size`,
        [p.rel, p.mtime, p.size],
      );
    }
    for (const rel of removedPaths) {
      db.run(`DELETE FROM ${FTS_TABLE} WHERE path = ?`, [rel]);
      db.run(`DELETE FROM ${META_TABLE} WHERE path = ?`, [rel]);
    }
  });

  return { totalFiles: files.length, changed: pending.length, removed: removedPaths.length };
}

type SearchPlan = { matchExpr: string | null; likeTerms: string[] };

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

function search(db: SqliteHandle, query: string): SearchHit[] {
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

  const rows = db.all<SearchRow>(sql, params);

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

export default function (args: readonly string[], ctx: ScriptContext): string {
  const cli = parseCli(args, ctx);
  if (!cli.query && !cli.rebuild) {
    throw new Error(
      "Usage: args=[\"<query>\"] or args=[\"--rebuild\"] or args=[\"--rebuild\", \"<query>\"]",
    );
  }

  const db = ctx.sqlite.open(INDEX_PATH);
  try {
    if (cli.rebuild) {
      db.exec(`DROP TABLE IF EXISTS ${FTS_TABLE}`);
      db.exec(`DROP TABLE IF EXISTS ${META_TABLE}`);
    }
    const sync = syncIndex(db, ctx);

    if (!cli.query) {
      return `indexed: ${sync.totalFiles} files (${sync.changed} updated, ${sync.removed} removed)`;
    }

    const hits = search(db, cli.query);
    const body = formatHits(hits);
    const summary = `[${sync.totalFiles} files indexed, ${sync.changed} updated, ${hits.length} hits]`;
    return `${body}\n\n${summary}`;
  } finally {
    db.close();
  }
}
