/** Estimate token count using character-category heuristics. */
export declare function estimateTokens(text: string): number;

/** Estimate tokens for a JSON-serializable value. */
export declare function estimateJsonTokens(value: unknown): number;

/** Human-readable token count (e.g. 1.2k, 35k, 1.1M). */
export declare function formatTokens(n: number): string;
