export interface TextFile {
  type: "text";
  path: string;
  content: string;
  frontmatter: Record<string, unknown> | null;
  modifiedAt: number;
}

export interface BinaryFile {
  type: "binary";
  path: string;
  modifiedAt: number;
}

export type ProjectFile = TextFile | BinaryFile;
