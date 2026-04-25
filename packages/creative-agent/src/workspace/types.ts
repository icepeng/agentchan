export interface TextFile {
  type: "text";
  path: string;
  content: string;
  frontmatter: Record<string, unknown> | null;
  modifiedAt: number;
  /**
   * Opaque renderer cache identity. It changes when Agentchan detects a file
   * version change, but callers must not parse it or assume a hash algorithm.
   */
  digest: string;
}

export interface DataFile {
  type: "data";
  path: string;
  content: string;
  data: unknown;
  format: "yaml" | "json";
  modifiedAt: number;
  /**
   * Opaque renderer cache identity. It changes when Agentchan detects a file
   * version change, but callers must not parse it or assume a hash algorithm.
   */
  digest: string;
}

export interface BinaryFile {
  type: "binary";
  path: string;
  modifiedAt: number;
  /**
   * Opaque renderer cache identity. It changes when Agentchan detects a file
   * version change, but callers must not parse it or assume a hash algorithm.
   */
  digest: string;
}

export type ProjectFile = TextFile | DataFile | BinaryFile;
