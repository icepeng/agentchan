export interface TemplateMeta {
  slug: string;
  name: string;
  description?: string;
  hasCover?: boolean;
  trusted: boolean;
  builtin: boolean;
}

export interface ReadmeDoc {
  frontmatter: { name?: string; description?: string };
  body: string;
}
