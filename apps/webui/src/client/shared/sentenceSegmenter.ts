/**
 * Sentence segmenter using Intl.Segmenter + newline boundaries.
 *
 * Splits on `\n` first (guaranteed boundary regardless of browser), then
 * applies Intl.Segmenter to each chunk for punctuation-aware splitting.
 */

const segmenter = new Intl.Segmenter("ko", { granularity: "sentence" });

export interface SentenceSegments {
  confirmed: string[];
  pending: string;
}

/**
 * Segment text into confirmed sentences and a pending tail.
 * All segments except the last are "confirmed" (boundary observed);
 * the last is "pending" since more text may still arrive.
 */
export function segmentSentences(text: string): SentenceSegments {
  if (!text) return { confirmed: [], pending: "" };

  const lines = text.split("\n");
  const allSegments: string[] = [];

  for (let li = 0; li < lines.length; li++) {
    const line = lines[li];
    if (!line) {
      if (li < lines.length - 1) {
        allSegments.push("\n");
      }
      continue;
    }

    const segs = [...segmenter.segment(line)].map((s) => s.segment);
    for (const seg of segs) {
      allSegments.push(seg);
    }

    if (li < lines.length - 1) {
      if (allSegments.length > 0) {
        allSegments[allSegments.length - 1] += "\n";
      } else {
        allSegments.push("\n");
      }
    }
  }

  if (allSegments.length === 0) return { confirmed: [], pending: "" };

  const confirmed = allSegments.slice(0, -1);
  const pending = allSegments[allSegments.length - 1];

  return { confirmed, pending };
}
