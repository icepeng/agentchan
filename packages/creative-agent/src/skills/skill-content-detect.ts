import type { ContentBlock } from "../types.js";

/**
 * True if the given content block carries a `<skill_content>` payload.
 * Used by the chat UI to collapse the block into a short label and by
 * deriveConversation to skip it when picking a session title — both consumers
 * treat skill_content user nodes as system noise rather than user input.
 *
 * Lives in its own file so client hosts can import it without dragging in
 * `buildSkillContent`'s `node:path` dependency. Vite tree-shakes by module,
 * not by binding — same-file colocation would force the build chain to
 * evaluate `node:path` even when the client only wants the detect predicate.
 */
export function isSkillContentBlock(block: ContentBlock): boolean {
  return block.type === "text" && block.text.startsWith("<skill_content");
}
