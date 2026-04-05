export interface Project {
  slug: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  outputDir?: string;
  notes?: string;
}

export interface OutputFile {
  path: string;
  content: string;
  modifiedAt: number;
}

export interface RenderContext {
  outputFiles: OutputFile[];
  skills: {
    name: string;
    description: string;
    metadata?: Record<string, string>;
  }[];
  baseUrl: string;
}
