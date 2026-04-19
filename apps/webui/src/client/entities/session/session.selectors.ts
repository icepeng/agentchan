import type { Message } from "@mariozechner/pi-ai";
import type { TreeNode } from "./session.types.js";

/**
 * activePath에 놓인 노드들을 pi `Message[]`로 평탄화한다.
 *
 * 메타 노드(`skill-load`, `compact-summary`)는 LLM 컨텍스트가 아니라 UI 알림용
 * marker라 결과에서 제외한다. 디스크 노드의 `message`는 pi-ai `Message` 그대로
 * 저장되므로 별도 변환 없이 통과시킨다.
 */
export function flattenActivePathToMessages(
  nodes: ReadonlyArray<TreeNode>,
  activePath: ReadonlyArray<string>,
): Message[] {
  const byId = new Map<string, TreeNode>();
  for (const n of nodes) byId.set(n.id, n);

  const messages: Message[] = [];
  for (const id of activePath) {
    const node = byId.get(id);
    if (!node) continue;
    if (node.meta === "skill-load" || node.meta === "compact-summary") continue;
    messages.push(node.message);
  }
  return messages;
}
