import { describe, test, expect } from "bun:test";
import {
  computeActivePath,
  flattenPathToMessages,
  pathToNode,
  switchBranch,
  generateTitle,
} from "../../src/session/tree.js";
import type { TreeNodeWithChildren } from "../../src/types.js";

// --- Helpers ---

function makeNode(
  id: string,
  parentId: string | null,
  children: string[] = [],
  activeChildId?: string,
): TreeNodeWithChildren {
  return {
    id,
    parentId,
    message: { role: "user", content: [{ type: "text", text: `msg-${id}` }] } as any,
    createdAt: Date.now(),
    children,
    ...(activeChildId ? { activeChildId } : {}),
  };
}

/**
 * Build a simple linear chain: A → B → C → D
 */
function linearChain(): Map<string, TreeNodeWithChildren> {
  const map = new Map<string, TreeNodeWithChildren>();
  map.set("A", makeNode("A", null, ["B"]));
  map.set("B", makeNode("B", "A", ["C"]));
  map.set("C", makeNode("C", "B", ["D"]));
  map.set("D", makeNode("D", "C"));
  return map;
}

/**
 * Build a branching tree:
 *
 *       A
 *      / \
 *     B   E
 *    / \
 *   C   D
 */
function branchingTree(): Map<string, TreeNodeWithChildren> {
  const map = new Map<string, TreeNodeWithChildren>();
  map.set("A", makeNode("A", null, ["B", "E"]));
  map.set("B", makeNode("B", "A", ["C", "D"]));
  map.set("C", makeNode("C", "B"));
  map.set("D", makeNode("D", "B"));
  map.set("E", makeNode("E", "A"));
  return map;
}

// ---------------------------------------------------------------------------
// computeActivePath
// ---------------------------------------------------------------------------

describe("computeActivePath", () => {
  test("follows linear chain to the leaf", () => {
    const path = computeActivePath(linearChain(), "A");
    expect(path).toEqual(["A", "B", "C", "D"]);
  });

  test("follows activeChildId when set", () => {
    const tree = branchingTree();
    tree.get("A")!.activeChildId = "E";
    const path = computeActivePath(tree, "A");
    expect(path).toEqual(["A", "E"]);
  });

  test("falls back to last child when no activeChildId", () => {
    const tree = branchingTree();
    // No activeChildId on A → picks last child "E"
    const path = computeActivePath(tree, "A");
    expect(path).toEqual(["A", "E"]);
  });

  test("follows activeChildId then falls back to last child deeper", () => {
    const tree = branchingTree();
    tree.get("A")!.activeChildId = "B";
    // B has no activeChildId → picks last child "D"
    const path = computeActivePath(tree, "A");
    expect(path).toEqual(["A", "B", "D"]);
  });

  test("single node tree", () => {
    const map = new Map<string, TreeNodeWithChildren>();
    map.set("X", makeNode("X", null));
    expect(computeActivePath(map, "X")).toEqual(["X"]);
  });

  test("returns empty on unknown rootNodeId", () => {
    const path = computeActivePath(linearChain(), "UNKNOWN");
    expect(path).toEqual([]);
  });

  test("skips invalid activeChildId that is not in the map", () => {
    const tree = linearChain();
    tree.get("A")!.activeChildId = "GONE";
    // "GONE" not in map → falls back to last child "B"
    const path = computeActivePath(tree, "A");
    expect(path).toEqual(["A", "B", "C", "D"]);
  });
});

// ---------------------------------------------------------------------------
// flattenPathToMessages
// ---------------------------------------------------------------------------

describe("flattenPathToMessages", () => {
  test("returns messages in path order", () => {
    const tree = linearChain();
    const messages = flattenPathToMessages(tree, ["A", "B", "C"]);
    expect(messages).toHaveLength(3);
    expect((messages[0] as any).content[0].text).toBe("msg-A");
    expect((messages[2] as any).content[0].text).toBe("msg-C");
  });

  test("returns empty for empty path", () => {
    expect(flattenPathToMessages(linearChain(), [])).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// pathToNode
// ---------------------------------------------------------------------------

describe("pathToNode", () => {
  test("traces from root to leaf", () => {
    const tree = linearChain();
    expect(pathToNode(tree, "D")).toEqual(["A", "B", "C", "D"]);
  });

  test("traces from root to middle node", () => {
    const tree = linearChain();
    expect(pathToNode(tree, "B")).toEqual(["A", "B"]);
  });

  test("root node returns single-element path", () => {
    const tree = linearChain();
    expect(pathToNode(tree, "A")).toEqual(["A"]);
  });

  test("works in branching tree", () => {
    const tree = branchingTree();
    expect(pathToNode(tree, "D")).toEqual(["A", "B", "D"]);
    expect(pathToNode(tree, "E")).toEqual(["A", "E"]);
  });

  test("unknown node returns single-element path", () => {
    expect(pathToNode(linearChain(), "UNKNOWN")).toEqual(["UNKNOWN"]);
  });
});

// ---------------------------------------------------------------------------
// switchBranch
// ---------------------------------------------------------------------------

describe("switchBranch", () => {
  test("switches parent activeChildId upward to root", () => {
    const tree = branchingTree();
    // Switch to C (child of B, which is child of A)
    tree.get("A")!.activeChildId = "E"; // currently pointing to E
    tree.get("B")!.activeChildId = "D"; // currently pointing to D

    const result = switchBranch(tree, "C");

    // A should now point to B, B should now point to C
    expect(tree.get("A")!.activeChildId).toBe("B");
    expect(tree.get("B")!.activeChildId).toBe("C");
    expect(result.updatedNodes).toHaveLength(2);
    expect(result.newLeafId).toBe("C");
  });

  test("returns empty updatedNodes when already on active path", () => {
    const tree = branchingTree();
    tree.get("A")!.activeChildId = "B";
    tree.get("B")!.activeChildId = "D";

    const result = switchBranch(tree, "D");
    expect(result.updatedNodes).toHaveLength(0);
    expect(result.newLeafId).toBe("D");
  });

  test("switching to a non-leaf walks down to find actual leaf", () => {
    const tree = branchingTree();
    tree.get("A")!.activeChildId = "E";

    const result = switchBranch(tree, "B");
    expect(tree.get("A")!.activeChildId).toBe("B");
    // B has children [C, D], no activeChildId → picks last child "D"
    expect(result.newLeafId).toBe("D");
  });

  test("switching to root works", () => {
    const map = new Map<string, TreeNodeWithChildren>();
    map.set("A", makeNode("A", null, ["B"]));
    map.set("B", makeNode("B", "A"));

    const result = switchBranch(map, "A");
    expect(result.newLeafId).toBe("B");
    // No parent to update
    expect(result.updatedNodes).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// generateTitle
// ---------------------------------------------------------------------------

describe("generateTitle", () => {
  test("returns short text as-is", () => {
    expect(generateTitle("hello world")).toBe("hello world");
  });

  test("truncates at 50 chars with ellipsis", () => {
    const long = "a".repeat(60);
    const title = generateTitle(long);
    expect(title.length).toBe(53); // 50 + "..."
    expect(title.endsWith("...")).toBe(true);
  });

  test("exactly 50 chars is not truncated", () => {
    const exact = "b".repeat(50);
    expect(generateTitle(exact)).toBe(exact);
  });

  test("replaces newlines with spaces", () => {
    expect(generateTitle("line1\nline2\nline3")).toBe("line1 line2 line3");
  });

  test("trims whitespace", () => {
    expect(generateTitle("  hello  ")).toBe("hello");
  });

  test("empty string returns empty", () => {
    expect(generateTitle("")).toBe("");
  });
});
