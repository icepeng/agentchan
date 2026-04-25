#!/usr/bin/env bun
/**
 * Gemini Image Generator (single-shot).
 *
 * Usage:
 *   bun gen-image.ts <output.png> [--ref <ref.png>] [--aspect <ratio>] < prompt.txt
 *
 * Examples:
 *   echo "prompt..." | bun gen-image.ts avatar.png --aspect 3:4
 *   echo "prompt..." | bun gen-image.ts happy.png --ref avatar.png
 *
 * - Prompt is read from stdin (avoids shell escaping of long/multiline prompts).
 * - --ref: reference image for multimodal consistency (image-to-image).
 * - --aspect: aspect ratio. Supported: "1:1", "3:4", "4:3", "9:16", "16:9".
 *   Default: "3:4" (portrait, suits character avatars; prevents landscape crowding).
 * - Fixed generation settings (not CLI-exposed):
 *     imageSize=1K, temperature=1, thinkingLevel=MINIMAL,
 *     tools=[googleSearch{webSearch + imageSearch}] (grounding + image search).
 * - Exit 0 on success (writes to stdout: `saved: <path> (<bytes>B)`).
 *   If the model returns a mime type different from the output extension
 *   (e.g. requested `.png` but model returns `image/jpeg`), the file is saved
 *   with the correct extension instead and a `note:` line is written to stderr.
 *   Supported response mime types: image/png, image/jpeg. Anything else → exit 1.
 * - Exit 1 on failure (writes error to stderr).
 */

import { GoogleGenAI, ThinkingLevel } from "@google/genai";
import * as fs from "node:fs";
import * as path from "node:path";

const MODEL = "gemini-3.1-flash-image-preview";

// ── Args ─────────────────────────────────────

const VALID_ASPECT_RATIOS = new Set(["1:1", "3:4", "4:3", "9:16", "16:9"]);

const argv = process.argv.slice(2);
let outputPath: string | undefined;
let refPath: string | undefined;
let aspectRatio = "3:4";

for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (a === "--ref") {
    refPath = argv[++i];
  } else if (a === "--aspect" || a === "--aspect-ratio") {
    aspectRatio = argv[++i];
  } else if (!outputPath) {
    outputPath = a;
  }
}

if (!outputPath) {
  console.error(
    "Usage: bun gen-image.ts <output.png> [--ref <ref.png>] [--aspect <ratio>] < prompt.txt",
  );
  process.exit(1);
}

if (!VALID_ASPECT_RATIOS.has(aspectRatio)) {
  console.error(
    `error: invalid --aspect ${aspectRatio}. Supported: ${[...VALID_ASPECT_RATIOS].join(", ")}`,
  );
  process.exit(1);
}

// ── Env ──────────────────────────────────────

const apiKey = process.env.GEMINI_API_KEY ?? process.env.GOOGLE_API_KEY;
if (!apiKey) {
  console.error(
    "error: GEMINI_API_KEY or GOOGLE_API_KEY not set (check project .env)",
  );
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

try {
  const response = await ai.models.generateContent({
    model: MODEL,
    contents: parts as Parameters<
      typeof ai.models.generateContent
    >[0]["contents"],
    config: {
      temperature: 1,
      thinkingConfig: { thinkingLevel: ThinkingLevel.MINIMAL },
      imageConfig: { aspectRatio, imageSize: "1K" },
      tools: [
        {
          googleSearch: {
            searchTypes: { webSearch: {}, imageSearch: {} },
          },
        },
      ],
    },
  });

  const respParts = response.candidates?.[0]?.content?.parts ?? [];

  for (const part of respParts) {
    const data = part.inlineData?.data;
    if (data) {
      const mimeType = (part.inlineData?.mimeType ?? "").toLowerCase();
      const expectedExt =
        mimeType === "image/png"
          ? ".png"
          : mimeType === "image/jpeg"
            ? ".jpg"
            : null;
      if (!expectedExt) {
        console.error(
          `error: unsupported image mimeType from model: ${mimeType || "(missing)"}. Only image/png and image/jpeg are handled.`,
        );
        process.exit(1);
      }

      const currentExt = path.extname(outputPath).toLowerCase();
      const extMatches =
        expectedExt === ".png"
          ? currentExt === ".png"
          : currentExt === ".jpg" || currentExt === ".jpeg";

      let finalPath = outputPath;
      if (!extMatches) {
        const base = outputPath.slice(0, outputPath.length - currentExt.length);
        finalPath = base + expectedExt;
        console.error(
          `note: model returned ${mimeType}; saving as ${finalPath} (requested ${outputPath})`,
        );
      }

      const buffer: Uint8Array = new Uint8Array(Buffer.from(data, "base64"));
      fs.mkdirSync(path.dirname(finalPath), { recursive: true });
      fs.writeFileSync(finalPath, buffer);
      console.log(`saved: ${finalPath} (${buffer.byteLength}B)`);
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
