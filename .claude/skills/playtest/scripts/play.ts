#!/usr/bin/env bun
// @ts-nocheck — self-contained Bun script; editor @types/node 없이도 런타임은 정상
/**
 * Agentchan playtest CLI — 템플릿 자가검증용 범용 CLI.
 * 서버 API에 직접 요청을 보내 UI 없이 플레이한다.
 *
 * Usage:
 *   bun play.ts templates                        사용 가능한 템플릿 목록
 *   bun play.ts new <template> [name]            프로젝트 + 세션 생성
 *   bun play.ts use <slug> [sessionId]           기존 프로젝트에 state 바인딩
 *   bun play.ts sess                             현재 프로젝트에 새 세션 생성
 *   bun play.ts send "<text>"                    메시지 전송 (SSE 실시간 출력)
 *   bun play.ts read <path>                      프로젝트 파일 읽기 (path=files/...)
 *   bun play.ts write <path> [content|@<file>]   프로젝트 파일 쓰기
 *   bun play.ts clear <path>                     프로젝트 파일 비우기
 *   bun play.ts tree                             프로젝트 파일 트리
 *   bun play.ts state                            현재 play state 출력
 *   bun play.ts config [k=v...]                  config 조회 / 수정
 *   bun play.ts raw                              activePath 순서로 node JSON 덤프
 *
 * Env:
 *   AGENTCHAN_URL         서버 BASE URL (기본 http://localhost:4244)
 *   PLAYTEST_STATE_FILE   state 파일 경로 (기본 ${SCRIPT_DIR}/.play-state.json)
 */

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const BASE = process.env.AGENTCHAN_URL ?? "http://localhost:4244";
const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const STATE_FILE = process.env.PLAYTEST_STATE_FILE
  ? resolve(process.env.PLAYTEST_STATE_FILE)
  : join(SCRIPT_DIR, ".play-state.json");

// localhost self-signed cert 우회
process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";

type State = {
  projectSlug: string;
  sessionId: string;
  lastNodeId?: string | null;
};

function loadState(): State | null {
  if (!existsSync(STATE_FILE)) return null;
  return JSON.parse(readFileSync(STATE_FILE, "utf8"));
}
function saveState(s: State) {
  writeFileSync(STATE_FILE, JSON.stringify(s, null, 2));
}
function requireState(): State {
  const s = loadState();
  if (!s) {
    console.error("no state. run `bun play.ts new <template>` first");
    process.exit(1);
  }
  return s;
}

async function api<T = unknown>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`HTTP ${res.status} ${path}\n${body}`);
  }
  return res.json() as Promise<T>;
}

const C = {
  dim: (s: string) => `\x1b[2m${s}\x1b[0m`,
  cyan: (s: string) => `\x1b[36m${s}\x1b[0m`,
  yellow: (s: string) => `\x1b[33m${s}\x1b[0m`,
  green: (s: string) => `\x1b[32m${s}\x1b[0m`,
  red: (s: string) => `\x1b[31m${s}\x1b[0m`,
  bold: (s: string) => `\x1b[1m${s}\x1b[0m`,
};

async function cmdTemplates() {
  const list = await api<unknown>(`/api/templates`);
  console.log(JSON.stringify(list, null, 2));
}

async function cmdNew(template?: string, name?: string) {
  if (!template) throw new Error("template 필수: `new <template> [name]`");
  name = name ?? `playtest-${template}-${Date.now()}`;
  const project = await api<{ slug: string }>(`/api/projects`, {
    method: "POST",
    body: JSON.stringify({ name, fromTemplate: template }),
  });
  console.log(C.green(`[ok] project: ${project.slug}`));

  const sessRes = await api<{ session: { id: string } }>(
    `/api/projects/${project.slug}/sessions`,
    { method: "POST", body: JSON.stringify({}) },
  );
  console.log(C.green(`[ok] session: ${sessRes.session.id}`));

  saveState({
    projectSlug: project.slug,
    sessionId: sessRes.session.id,
    lastNodeId: null,
  });
}

async function cmdUse(slug?: string, sessionId?: string) {
  if (!slug) throw new Error("slug 필수");
  if (!sessionId) {
    const sessions = await api<Array<{ id: string }>>(`/api/projects/${slug}/sessions`);
    if (!sessions.length) throw new Error(`no sessions in ${slug}; run \`sess\` to create one`);
    sessionId = sessions[0].id;
  }
  const sess = await api<{ activePath: string[] }>(`/api/projects/${slug}/sessions/${sessionId}`);
  const lastNodeId = sess.activePath[sess.activePath.length - 1] ?? null;
  saveState({ projectSlug: slug, sessionId, lastNodeId });
  console.log(C.green(`[ok] bound to ${slug} / ${sessionId} (lastNode=${lastNodeId})`));
}

async function cmdSess() {
  const s = requireState();
  const sessRes = await api<{ session: { id: string } }>(
    `/api/projects/${s.projectSlug}/sessions`,
    { method: "POST", body: JSON.stringify({}) },
  );
  s.sessionId = sessRes.session.id;
  s.lastNodeId = null;
  saveState(s);
  console.log(C.green(`[ok] new session: ${sessRes.session.id}`));
}

async function cmdSend(text: string) {
  if (!text) throw new Error("text required");
  const s = requireState();
  console.log(C.cyan(`> ${text}`));
  console.log("");

  const res = await fetch(
    `${BASE}/api/projects/${s.projectSlug}/sessions/${s.sessionId}/messages`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ parentNodeId: s.lastNodeId ?? null, text }),
    },
  );
  if (!res.ok || !res.body) {
    const body = await res.text().catch(() => "");
    throw new Error(`stream failed: ${res.status}\n${body}`);
  }

  const decoder = new TextDecoder();
  let buf = "";
  let finalNodes: Array<{ id: string }> = [];
  let currentToolName = "";

  // @ts-expect-error — Bun/Node streams
  for await (const chunk of res.body) {
    buf += decoder.decode(chunk, { stream: true });
    const blocks = buf.split("\n\n");
    buf = blocks.pop() ?? "";
    for (const block of blocks) {
      const lines = block.split("\n");
      let event = "";
      const dataLines: string[] = [];
      for (const line of lines) {
        if (line.startsWith("event: ")) event = line.slice(7).trim();
        else if (line.startsWith("data: ")) dataLines.push(line.slice(6));
      }
      if (!event) continue;
      let data: any = null;
      try {
        data = dataLines.length ? JSON.parse(dataLines.join("\n")) : null;
      } catch {
        data = dataLines.join("");
      }

      switch (event) {
        case "text_delta":
          process.stdout.write(data?.text ?? "");
          break;
        case "thinking_delta":
          process.stdout.write(C.dim(data?.text ?? ""));
          break;
        case "tool_use_start":
          currentToolName = data?.name ?? "?";
          process.stdout.write(`\n${C.yellow(`[tool] ${currentToolName}(`)}`);
          break;
        case "tool_use_delta":
          if (data?.input_json) process.stdout.write(C.yellow(data.input_json));
          break;
        case "tool_use_end":
          process.stdout.write(C.yellow(`)`));
          break;
        case "tool_exec_end":
          if (data?.is_error) process.stdout.write(C.red(` [error]`));
          process.stdout.write(`\n`);
          break;
        case "assistant_nodes":
          finalNodes = Array.isArray(data) ? data : [];
          break;
        case "usage_summary":
          console.log(
            C.dim(
              `\n[usage] in=${data?.input ?? "?"} out=${data?.output ?? "?"} cacheR=${data?.cacheRead ?? 0} cacheW=${data?.cacheCreation ?? 0}`,
            ),
          );
          break;
        case "error":
          console.error(C.red(`\n[error] ${JSON.stringify(data)}`));
          break;
        case "done":
          break;
      }
    }
  }

  if (finalNodes.length) {
    const lastNode = finalNodes[finalNodes.length - 1];
    s.lastNodeId = lastNode.id;
    saveState(s);
  }
  console.log("");
}

async function cmdRead(path?: string) {
  if (!path) throw new Error("path required");
  const s = requireState();
  const res = await fetch(
    `${BASE}/api/projects/${s.projectSlug}/file?path=${encodeURIComponent(path)}`,
  );
  if (!res.ok) {
    console.error(C.red(`${path}: HTTP ${res.status}`));
    return;
  }
  const { content } = (await res.json()) as { content: string };
  console.log(C.bold(`--- ${path} ---`));
  console.log(content || C.dim("(empty)"));
}

async function cmdWrite(path?: string, content?: string) {
  if (!path) throw new Error("path required");
  const s = requireState();
  let body = content ?? "";
  if (body.startsWith("@")) {
    const file = body.slice(1);
    body = readFileSync(resolve(file), "utf8");
  }
  const res = await fetch(
    `${BASE}/api/projects/${s.projectSlug}/file?path=${encodeURIComponent(path)}`,
    {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: body }),
    },
  );
  console.log(
    `${res.ok ? C.green("[ok]") : C.red("[fail]")} ${res.ok ? "wrote" : "write failed"} ${path}`,
  );
}

async function cmdTree() {
  const s = requireState();
  const res = await api<{ entries: Array<{ path: string; type: string }> }>(
    `/api/projects/${s.projectSlug}/tree`,
  );
  for (const e of res.entries) console.log(`${e.type === "dir" ? "[d]" : "   "} ${e.path}`);
}

async function cmdConfig(kvs: string[]) {
  if (kvs.length === 0) {
    const cfg = await api(`/api/config`);
    console.log(JSON.stringify(cfg, null, 2));
    return;
  }
  const body: Record<string, unknown> = {};
  for (const kv of kvs) {
    const [k, ...rest] = kv.split("=");
    const v = rest.join("=");
    body[k] = v === "true" ? true : v === "false" ? false : isNaN(Number(v)) ? v : Number(v);
  }
  const res = await api(`/api/config`, { method: "PUT", body: JSON.stringify(body) });
  console.log(JSON.stringify(res, null, 2));
}

async function cmdRaw() {
  const s = requireState();
  const sess = await api<{ nodes: any[]; activePath: string[] }>(
    `/api/projects/${s.projectSlug}/sessions/${s.sessionId}`,
  );
  const byId = new Map(sess.nodes.map((n) => [n.id, n]));
  for (const id of sess.activePath) {
    const n = byId.get(id);
    if (!n) continue;
    console.log(C.bold(`--- node ${n.id} (parent=${n.parentId}) ---`));
    console.log(JSON.stringify(n.message, null, 2));
  }
}

// main
const [, , cmd, ...args] = process.argv;
try {
  switch (cmd) {
    case "templates":
      await cmdTemplates();
      break;
    case "new":
      await cmdNew(args[0], args[1]);
      break;
    case "use":
      await cmdUse(args[0], args[1]);
      break;
    case "sess":
      await cmdSess();
      break;
    case "send":
      await cmdSend(args.join(" "));
      break;
    case "read":
      await cmdRead(args[0]);
      break;
    case "write":
      await cmdWrite(args[0], args.slice(1).join(" "));
      break;
    case "clear":
      await cmdWrite(args[0], "");
      break;
    case "tree":
      await cmdTree();
      break;
    case "state":
      console.log(JSON.stringify(loadState(), null, 2));
      break;
    case "config":
      await cmdConfig(args);
      break;
    case "raw":
      await cmdRaw();
      break;
    default:
      console.error(
        `unknown cmd: ${cmd ?? "(none)"}\nsee header comment for usage`,
      );
      process.exit(1);
  }
} catch (e: any) {
  console.error(C.red(`error: ${e.message ?? e}`));
  process.exit(1);
}
