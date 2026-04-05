import { readdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { encoding_for_model } from "tiktoken";
import { GoogleGenAI } from "@google/genai";
import { estimateTokens } from "./index.mjs";

const SKILLS_DIR = join(import.meta.dir, "../../example_data/library/skills");
const BASELINE_PATH = join(import.meta.dir, "benchmark-baseline.json");
const GEMINI_MODEL = "gemini-3-flash-preview";

async function loadSkillFiles() {
  const entries = await readdir(SKILLS_DIR, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const skillPath = join(SKILLS_DIR, entry.name, "SKILL.md");
    try {
      const content = await readFile(skillPath, "utf-8");
      files.push({ name: entry.name, content });
    } catch {
      // skip if no SKILL.md
    }
  }
  return files;
}

async function countGeminiTokens(ai, content) {
  const resp = await ai.models.countTokens({ model: GEMINI_MODEL, contents: content });
  return resp.totalTokens;
}

function printTable(label, refName, results, totalRef, totalEst) {
  console.log(`\n=== ${label} ===\n`);
  console.log(
    "File".padEnd(30), refName.padStart(8), "estimate".padStart(8),
    "error".padStart(8), "error%".padStart(8)
  );
  console.log("-".repeat(62));
  for (const r of results) {
    console.log(
      r.name.padEnd(30), String(r.ref).padStart(8), String(r.est).padStart(8),
      String(r.error).padStart(8), r.errorPct.padStart(8)
    );
  }
  console.log("-".repeat(62));
  const totalError = ((totalEst - totalRef) / totalRef * 100).toFixed(1);
  console.log(
    "TOTAL".padEnd(30), String(totalRef).padStart(8), String(totalEst).padStart(8),
    String(totalEst - totalRef).padStart(8), `${totalError}%`.padStart(8)
  );
}

function computeStats(rows, refKey) {
  let totalRef = 0, totalEst = 0, totalAbsErr = 0;
  const results = [];
  for (const r of rows) {
    const ref = r[refKey];
    const error = r.est - ref;
    const absErrPct = Math.abs(error / ref) * 100;
    totalRef += ref; totalEst += r.est; totalAbsErr += absErrPct;
    results.push({
      name: r.name, ref, est: r.est, error,
      errorPct: `${(error / ref * 100).toFixed(1)}%`,
    });
  }
  const avgAbsError = totalAbsErr / rows.length;
  const totalError = (totalEst - totalRef) / totalRef * 100;
  return { results, totalRef, totalEst, avgAbsError, totalError };
}

async function loadBaseline() {
  try { return JSON.parse(await readFile(BASELINE_PATH, "utf-8")); }
  catch { return null; }
}

async function saveBaseline(data) {
  await writeFile(BASELINE_PATH, JSON.stringify(data, null, 2) + "\n");
}

// --- main ---
const ai = new GoogleGenAI({});
const enc = encoding_for_model("gpt-4o");
const skills = await loadSkillFiles();

// Collect token counts (Gemini API calls in parallel)
const rows = await Promise.all(
  skills.map(async ({ name, content }) => {
    const gemini = await countGeminiTokens(ai, content);
    const openai = enc.encode(content).length;
    const est = estimateTokens(content);
    return { name, gemini, openai, est };
  })
);
enc.free();

const gem = computeStats(rows, "gemini");
const oai = computeStats(rows, "openai");

printTable(`vs Gemini (${GEMINI_MODEL})`, "gemini", gem.results, gem.totalRef, gem.totalEst);
console.log(`\nAvg absolute error: ${gem.avgAbsError.toFixed(1)}%`);

printTable(`vs OpenAI (o200k_base)`, "openai", oai.results, oai.totalRef, oai.totalEst);
console.log(`\nAvg absolute error: ${oai.avgAbsError.toFixed(1)}%`);

// Combined summary
const combinedAvg = (gem.avgAbsError + oai.avgAbsError) / 2;
console.log(`\n=== Combined ===`);
console.log(`Gemini avg abs error: ${gem.avgAbsError.toFixed(1)}%`);
console.log(`OpenAI avg abs error: ${oai.avgAbsError.toFixed(1)}%`);
console.log(`Combined avg:         ${combinedAvg.toFixed(1)}%`);

// Baseline comparison
const baseline = await loadBaseline();
const cmd = process.argv[2];

if (cmd === "--save-baseline") {
  await saveBaseline({
    geminiAvgAbsError: gem.avgAbsError, geminiTotalError: gem.totalError,
    openaiAvgAbsError: oai.avgAbsError, openaiTotalError: oai.totalError,
    combinedAvg, timestamp: new Date().toISOString(),
  });
  console.log(`\n✓ Baseline saved: combined=${combinedAvg.toFixed(1)}%`);
} else if (baseline) {
  const cmp = (cur, prev) => cur < prev ? "BETTER" : cur > prev ? "WORSE" : "SAME";
  console.log(`\n--- vs Baseline ---`);
  console.log(`Gemini:   ${baseline.geminiAvgAbsError.toFixed(1)}% → ${gem.avgAbsError.toFixed(1)}% (${cmp(gem.avgAbsError, baseline.geminiAvgAbsError)})`);
  console.log(`OpenAI:   ${baseline.openaiAvgAbsError.toFixed(1)}% → ${oai.avgAbsError.toFixed(1)}% (${cmp(oai.avgAbsError, baseline.openaiAvgAbsError)})`);
  console.log(`Combined: ${baseline.combinedAvg.toFixed(1)}% → ${combinedAvg.toFixed(1)}% (${cmp(combinedAvg, baseline.combinedAvg)})`);
  if (combinedAvg <= 10) console.log(`\n🎯 Target reached! Combined avg error is within 10%.`);
} else {
  console.log(`\nNo baseline. Run with --save-baseline to save.`);
}
