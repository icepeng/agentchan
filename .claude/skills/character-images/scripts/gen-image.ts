#!/usr/bin/env bun
/**
 * Gemini Image Generator (single-shot) with optional background removal.
 *
 * Usage:
 *   bun gen-image.ts <output.png> [--ref <ref.png>] [--aspect <ratio>] [--rembg [model]] < prompt.txt
 *
 * Examples:
 *   echo "prompt..." | bun gen-image.ts avatar.png --aspect 3:4
 *   echo "prompt..." | bun gen-image.ts happy.png --ref avatar.png
 *   echo "prompt..." | bun gen-image.ts avatar.png --rembg --aspect 1:1
 *
 * - Prompt is read from stdin (avoids shell escaping of long/multiline prompts).
 * - --ref: reference image for multimodal consistency (image-to-image).
 * - --aspect: aspect ratio. Supported: "1:1", "3:4", "4:3", "9:16", "16:9".
 *   Default: "3:4" (portrait, suits character avatars; prevents landscape crowding).
 * - --rembg [model]: pipe the generated image through rembg before saving.
 *   Default model: isnet-anime (suits anime/illustration). Use birefnet-portrait
 *   for realistic photos.
 * - Exit 0 on success (writes to stdout: `saved: <path> (<bytes>B)`).
 * - Exit 1 on failure (writes error to stderr).
 */

import { GoogleGenAI } from "@google/genai";
import * as fs from "node:fs";
import * as path from "node:path";

const MODEL = "gemini-3.1-flash-image-preview";

// ── Args ─────────────────────────────────────

const VALID_ASPECT_RATIOS = new Set(["1:1", "3:4", "4:3", "9:16", "16:9"]);

const argv = process.argv.slice(2);
let outputPath: string | undefined;
let refPath: string | undefined;
let useRembg = false;
let rembgModel = "isnet-anime";
let aspectRatio = "3:4";

for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (a === "--ref") {
    refPath = argv[++i];
  } else if (a === "--aspect" || a === "--aspect-ratio") {
    aspectRatio = argv[++i];
  } else if (a === "--rembg") {
    useRembg = true;
    // Optional model name follows --rembg (must not start with "--" and not look like a filename)
    const next = argv[i + 1];
    if (next && !next.startsWith("--") && !next.includes("/") && !next.includes("\\") && !next.endsWith(".png")) {
      rembgModel = next;
      i++;
    }
  } else if (!outputPath) {
    outputPath = a;
  }
}

if (!outputPath) {
  console.error("Usage: bun gen-image.ts <output.png> [--ref <ref.png>] [--aspect <ratio>] [--rembg [model]] < prompt.txt");
  process.exit(1);
}

if (!VALID_ASPECT_RATIOS.has(aspectRatio)) {
  console.error(`error: invalid --aspect ${aspectRatio}. Supported: ${[...VALID_ASPECT_RATIOS].join(", ")}`);
  process.exit(1);
}

// ── Env ──────────────────────────────────────

const apiKey = process.env.GEMINI_API_KEY ?? process.env.GOOGLE_API_KEY;
if (!apiKey) {
  console.error("error: GEMINI_API_KEY or GOOGLE_API_KEY not set (check project .env)");
  process.exit(1);
}

// ── Prompt from stdin ────────────────────────

const prompt = (await Bun.stdin.text()).trim();
if (!prompt) {
  console.error("error: prompt is empty (pipe via stdin)");
  process.exit(1);
}

// ── Reference image (optional) ───────────────

function guessMimeType(p: string): string {
  const ext = path.extname(p).toLowerCase();
  switch (ext) {
    case ".png":
      return "image/png";
    case ".jpg":
    case ".jpeg":
      return "image/jpeg";
    case ".webp":
      return "image/webp";
    case ".gif":
      return "image/gif";
    default:
      return "image/png";
  }
}

interface InlineDataPart {
  inlineData: { mimeType: string; data: string };
}
interface TextPart {
  text: string;
}
type Part = InlineDataPart | TextPart;

const parts: Part[] = [];

if (refPath) {
  if (!fs.existsSync(refPath)) {
    console.error(`error: reference image not found: ${refPath}`);
    process.exit(1);
  }
  const refBuf = fs.readFileSync(refPath);
  parts.push({
    inlineData: {
      mimeType: guessMimeType(refPath),
      data: refBuf.toString("base64"),
    },
  });
}

parts.push({ text: prompt });

// ── Generate ─────────────────────────────────

const ai = new GoogleGenAI({ apiKey });

async function removeBackground(input: Uint8Array, model: string): Promise<Uint8Array> {
  const proc = Bun.spawn(["rembg", "i", "-m", model], {
    stdin: "pipe",
    stdout: "pipe",
    stderr: "pipe",
  });

  proc.stdin.write(input);
  await proc.stdin.end();

  const [stdoutBuf, stderrText, exitCode] = await Promise.all([
    new Response(proc.stdout).arrayBuffer(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);

  if (exitCode !== 0) {
    throw new Error(`rembg exit ${exitCode}: ${stderrText.trim() || "unknown error"}`);
  }
  const out = new Uint8Array(stdoutBuf);
  if (out.byteLength === 0) {
    throw new Error(`rembg produced empty output. stderr: ${stderrText.trim()}`);
  }
  return out;
}

try {
  const response = await ai.models.generateContent({
    model: MODEL,
    contents: parts as Parameters<typeof ai.models.generateContent>[0]["contents"],
    config: {
      imageConfig: { aspectRatio },
    },
  });

  const respParts = response.candidates?.[0]?.content?.parts ?? [];

  for (const part of respParts) {
    const data = part.inlineData?.data;
    if (data) {
      let buffer: Uint8Array = new Uint8Array(Buffer.from(data, "base64"));
      const rawSize = buffer.byteLength;

      if (useRembg) {
        try {
          buffer = await removeBackground(buffer, rembgModel);
        } catch (err) {
          console.error(`error: rembg failed — ${err instanceof Error ? err.message : String(err)}`);
          console.error(`hint: saving raw image without background removal`);
          // Continue with raw image as fallback
        }
      }

      fs.mkdirSync(path.dirname(outputPath), { recursive: true });
      fs.writeFileSync(outputPath, buffer);
      const suffix = useRembg ? ` (rembg ${rembgModel}, ${rawSize}B → ${buffer.byteLength}B)` : ` (${buffer.byteLength}B)`;
      console.log(`saved: ${outputPath}${suffix}`);
      process.exit(0);
    }
    const text = part.text;
    if (text) {
      console.error(`model text: ${text}`);
    }
  }

  console.error("error: no image returned in response");
  if (process.env.DEBUG) {
    console.error("--- debug: full response ---");
    console.error(JSON.stringify(response, null, 2).slice(0, 4000));
  }
  process.exit(1);
} catch (err) {
  console.error(`error: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
}
