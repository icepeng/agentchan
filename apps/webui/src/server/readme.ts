import { parseFrontmatter } from "@agentchan/creative-agent";

/**
 * Parse a README.md raw string and shape it for the client API. Both template
 * and project README routes use this so the response schema stays identical.
 */
export function readmeResponse(raw: string) {
  const { frontmatter, body } = parseFrontmatter(raw);
  return {
    frontmatter: {
      name: typeof frontmatter?.name === "string" ? frontmatter.name : undefined,
      description:
        typeof frontmatter?.description === "string" ? frontmatter.description : undefined,
    },
    body,
  };
}
