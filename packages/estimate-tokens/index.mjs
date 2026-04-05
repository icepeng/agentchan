/**
 * Estimate token count using character-category heuristics.
 * Weights calibrated against Gemini (gemini-3-flash-preview) and
 * OpenAI (o200k_base) tokenizers on mixed Korean/English markdown
 * text (SKILL.md corpus).
 */
export function estimateTokens(text) {
  let tokens = 0;
  for (let i = 0; i < text.length; ) {
    const code = text.codePointAt(i);

    if (code > 0xffff) {
      tokens += 0.85;
      i += 2;
    } else if (code === 0x20 || code === 0x09) {
      tokens += 0.132;
      i += 1;
    } else if (code === 0x0a) {
      tokens += 0.1;
      i += 1;
    } else if (code < 0x80) {
      tokens += 0.235;
      i += 1;
    } else if (
      (code >= 0xac00 && code <= 0xd7af) || // Hangul syllables
      (code >= 0x4e00 && code <= 0x9fff) || // CJK Unified Ideographs
      (code >= 0x3400 && code <= 0x4dbf) || // CJK Extension A
      (code >= 0x3040 && code <= 0x309f) || // Hiragana
      (code >= 0x30a0 && code <= 0x30ff) // Katakana
    ) {
      tokens += 0.92;
      i += 1;
    } else {
      tokens += 0.85;
      i += 1;
    }
  }
  return Math.ceil(tokens);
}

export function estimateJsonTokens(value) {
  if (value == null) return 0;
  return estimateTokens(JSON.stringify(value));
}

export function formatTokens(n) {
  if (n < 1_000) return String(n);
  if (n < 10_000) return `${(n / 1_000).toFixed(1)}k`;
  if (n < 1_000_000) return `${Math.round(n / 1_000)}k`;
  return `${(n / 1_000_000).toFixed(1)}M`;
}
