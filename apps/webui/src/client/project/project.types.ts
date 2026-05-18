export interface Project {
  slug: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  notes?: string;
  hasCover?: boolean;
}

export interface ReadmeDoc {
  frontmatter: { name?: string; description?: string };
  body: string;
}
