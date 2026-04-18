import { describe, test, expect } from "bun:test";
import {
  parseSessionFile,
  buildTreeMap,
  deriveSession,
  serializeSession,
} from "../../src/session/format.js";
import type { TreeNode } from "../../src/types.js";

// --- Helpers ---

function makeTreeNode(
  id: string,
  parentId: string | null,
  role: "user" | "assistant" = "user",
  text = `msg-${id}`,
  overrides: Partial<TreeNode> = {},
): TreeNode {
  return {
    id,
    parentId,
    message: role === "assistant"
      ? { role: "assistant", content: [{ type: "text", text }], provider: "google", model: "gemini-test" } as any
      : { role: "user", content: [{ type: "text", text }] } as any,
    createdAt: 1000 + parseInt(id.replace(/\D/g, "") || "0") * 100,
    ...overrides,
  };
}

const HEADER_LINE = JSON.stringify({
  _header: true,
  createdAt: 1000,
  provider: "google",
  model: "gemini-test",
});

function buildJSONL(...lines: string[]): string {
  return lines.join("\n") + "\n";
}

// ---------------------------------------------------------------------------
// parseSessionFile
// ---------------------------------------------------------------------------

describe("parseSessionFile", () => {
  test("parses header + nodes", () => {
    const node1 = makeTreeNode("n1", null);
    const node2 = makeTreeNode("n2", "n1");
    const content = buildJSONL(HEADER_LINE, JSON.stringify(node1), JSON.stringify(node2));

    const result = parseSessionFile(content);

    expect(result.header).not.toBeNull();
    expect(result.header!._header).toBe(true);
    expect(result.header!.provider).toBe("google");
    expect(result.headerLine).toBe(HEADER_LINE);
    expect(result.nodes).toHaveLength(2);
    expect(result.nodes[0].id).toBe("n1");
    expect(result.nodes[1].id).toBe("n2");
  });

  test("parses nodes without header", () => {
    const node = makeTreeNode("n1", null);
    const content = buildJSONL(JSON.stringify(node));

    const result = parseSessionFile(content);

    expect(result.header).toBeNull();
    expect(result.headerLine).toBeNull();
    expect(result.nodes).toHaveLength(1);
  });

  test("handles empty content", () => {
    const result = parseSessionFile("");
    expect(result.header).toBeNull();
    expect(result.nodes).toEqual([]);
  });

  test("handles whitespace-only content", () => {
    const result = parseSessionFile("  \n  \n  ");
    expect(result.header).toBeNull();
    expect(result.nodes).toEqual([]);
  });

  test("applies branch markers to node activeChildId", () => {
    const node1 = makeTreeNode("n1", null);
    const node2 = makeTreeNode("n2", "n1");
    const node3 = makeTreeNode("n3", "n1");
    const marker = JSON.stringify({ _marker: "branch", nodeId: "n1", activeChildId: "n2" });
    const content = buildJSONL(
      HEADER_LINE,
      JSON.stringify(node1),
      JSON.stringify(node2),
      JSON.stringify(node3),
      marker,
    );

    const result = parseSessionFile(content);

    expect(result.nodes).toHaveLength(3);
    const n1 = result.nodes.find((n) => n.id === "n1")!;
    expect(n1.activeChildId).toBe("n2");
  });

  test("last branch marker wins for same nodeId", () => {
    const node1 = makeTreeNode("n1", null);
    const node2 = makeTreeNode("n2", "n1");
    const node3 = makeTreeNode("n3", "n1");
    const marker1 = JSON.stringify({ _marker: "branch", nodeId: "n1", activeChildId: "n2" });
    const marker2 = JSON.stringify({ _marker: "branch", nodeId: "n1", activeChildId: "n3" });
    const content = buildJSONL(
      HEADER_LINE,
      JSON.stringify(node1),
      JSON.stringify(node2),
      JSON.stringify(node3),
      marker1,
      marker2,
    );

    const result = parseSessionFile(content);
    const n1 = result.nodes.find((n) => n.id === "n1")!;
    expect(n1.activeChildId).toBe("n3");
  });

  test("branch marker referencing unknown nodeId is silently ignored", () => {
    const node1 = makeTreeNode("n1", null);
    const marker = JSON.stringify({ _marker: "branch", nodeId: "UNKNOWN", activeChildId: "n1" });
    const content = buildJSONL(HEADER_LINE, JSON.stringify(node1), marker);

    const result = parseSessionFile(content);
    expect(result.nodes).toHaveLength(1);
    expect(result.nodes[0].activeChildId).toBeUndefined();
  });

  test("header with compactedFrom and mode", () => {
    const header = JSON.stringify({
      _header: true,
      createdAt: 1000,
      provider: "google",
      model: "gemini-test",
      compactedFrom: "old-session",
      mode: "meta",
    });
    const content = buildJSONL(header);
    const result = parseSessionFile(content);

    expect(result.header!.compactedFrom).toBe("old-session");
    expect(result.header!.mode).toBe("meta");
  });
});

// ---------------------------------------------------------------------------
// buildTreeMap
// ---------------------------------------------------------------------------

describe("buildTreeMap", () => {
  test("builds parent-child relationships", () => {
    const nodes: TreeNode[] = [
      makeTreeNode("n1", null),
      makeTreeNode("n2", "n1"),
      makeTreeNode("n3", "n1"),
    ];
    const map = buildTreeMap(nodes);

    expect(map.size).toBe(3);
    expect(map.get("n1")!.children).toEqual(["n2", "n3"]);
    expect(map.get("n2")!.children).toEqual([]);
    expect(map.get("n3")!.children).toEqual([]);
  });

  test("handles single root node", () => {
    const map = buildTreeMap([makeTreeNode("root", null)]);
    expect(map.size).toBe(1);
    expect(map.get("root")!.children).toEqual([]);
  });

  test("handles empty input", () => {
    const map = buildTreeMap([]);
    expect(map.size).toBe(0);
  });

  test("orphan node with missing parent has no children link", () => {
    const nodes: TreeNode[] = [
      makeTreeNode("n1", null),
      makeTreeNode("n2", "MISSING"),
    ];
    const map = buildTreeMap(nodes);
    expect(map.get("n1")!.children).toEqual([]);
    // n2 exists but its parent is not in the map
    expect(map.get("n2")!.parentId).toBe("MISSING");
  });
});

// ---------------------------------------------------------------------------
// deriveSession
// ---------------------------------------------------------------------------

describe("deriveSession", () => {
  test("derives metadata from header and nodes", () => {
    const nodes: TreeNode[] = [
      makeTreeNode("n1", null, "user", "Hello there!"),
      makeTreeNode("n2", "n1", "assistant", "Hi!"),
    ];
    const tree = buildTreeMap(nodes);
    const session = deriveSession("sess-1", {
      _header: true,
      createdAt: 1000,
      provider: "google",
      model: "gemini-test",
    }, nodes, tree);

    expect(session.id).toBe("sess-1");
    expect(session.title).toBe("Hello there!");
    expect(session.createdAt).toBe(1000);
    expect(session.rootNodeId).toBe("n1");
    expect(session.activeLeafId).toBe("n2");
  });

  test("title truncated at 50 chars", () => {
    const longText = "x".repeat(60);
    const nodes: TreeNode[] = [makeTreeNode("n1", null, "user", longText)];
    const tree = buildTreeMap(nodes);
    const session = deriveSession("s", null, nodes, tree);

    expect(session.title.length).toBe(53);
    expect(session.title.endsWith("...")).toBe(true);
  });

  test("falls back to 'New session' when no user messages", () => {
    const nodes: TreeNode[] = [makeTreeNode("n1", null, "assistant", "Hi!")];
    const tree = buildTreeMap(nodes);
    const session = deriveSession("s", null, nodes, tree);
    expect(session.title).toBe("New session");
  });

  test("uses last assistant provider/model over header", () => {
    const nodes: TreeNode[] = [
      makeTreeNode("n1", null, "user", "hello"),
      makeTreeNode("n2", "n1", "assistant", "hi"),
    ];
    const tree = buildTreeMap(nodes);
    const session = deriveSession("s", {
      _header: true, createdAt: 1000, provider: "old-provider", model: "old-model",
    }, nodes, tree);

    expect(session.provider).toBe("google");
    expect(session.model).toBe("gemini-test");
  });

  test("uses header provider/model when no assistant messages", () => {
    const nodes: TreeNode[] = [makeTreeNode("n1", null, "user", "hello")];
    const tree = buildTreeMap(nodes);
    const session = deriveSession("s", {
      _header: true, createdAt: 1000, provider: "google", model: "gemini-test",
    }, nodes, tree);

    expect(session.provider).toBe("google");
    expect(session.model).toBe("gemini-test");
  });

  test("empty nodes with no header", () => {
    const session = deriveSession("s", null, []);
    expect(session.title).toBe("New session");
    expect(session.rootNodeId).toBe("");
    expect(session.activeLeafId).toBe("");
    expect(session.provider).toBe("");
    expect(session.model).toBe("");
  });

  test("compactedFrom and mode propagated from header", () => {
    const session = deriveSession("s", {
      _header: true, createdAt: 1000, provider: "g", model: "m",
      compactedFrom: "old-id", mode: "meta",
    }, []);
    expect(session.compactedFrom).toBe("old-id");
    expect(session.mode).toBe("meta");
  });

  test("updatedAt uses last node's createdAt", () => {
    const nodes: TreeNode[] = [
      { ...makeTreeNode("n1", null), createdAt: 1000 },
      { ...makeTreeNode("n2", "n1"), createdAt: 2000 },
      { ...makeTreeNode("n3", "n2"), createdAt: 3000 },
    ];
    const tree = buildTreeMap(nodes);
    const session = deriveSession("s", null, nodes, tree);
    expect(session.updatedAt).toBe(3000);
  });
});

// ---------------------------------------------------------------------------
// serializeSession
// ---------------------------------------------------------------------------

describe("serializeSession", () => {
  test("round-trips through parse → build → serialize → parse", () => {
    const node1 = makeTreeNode("n1", null);
    const node2 = makeTreeNode("n2", "n1");
    const original = buildJSONL(HEADER_LINE, JSON.stringify(node1), JSON.stringify(node2));

    const parsed = parseSessionFile(original);
    const tree = buildTreeMap(parsed.nodes);
    const serialized = serializeSession(parsed.headerLine, tree);
    const reparsed = parseSessionFile(serialized);

    expect(reparsed.header).not.toBeNull();
    expect(reparsed.header!.provider).toBe("google");
    expect(reparsed.nodes).toHaveLength(2);
    expect(reparsed.nodes[0].id).toBe("n1");
    expect(reparsed.nodes[1].id).toBe("n2");
  });

  test("serializes without header", () => {
    const nodes: TreeNode[] = [makeTreeNode("n1", null)];
    const tree = buildTreeMap(nodes);
    const serialized = serializeSession(null, tree);

    expect(serialized).not.toContain("_header");
    const reparsed = parseSessionFile(serialized);
    expect(reparsed.header).toBeNull();
    expect(reparsed.nodes).toHaveLength(1);
  });

  test("strips children field from output", () => {
    const nodes: TreeNode[] = [
      makeTreeNode("n1", null),
      makeTreeNode("n2", "n1"),
    ];
    const tree = buildTreeMap(nodes);
    const serialized = serializeSession(null, tree);

    // The serialized JSON should not contain the "children" key
    expect(serialized).not.toContain('"children"');
  });

  test("empty tree serializes to header + empty node content", () => {
    const tree = buildTreeMap([]);
    const serialized = serializeSession(HEADER_LINE, tree);
    // allNodes is [], join produces "", + "\n" = "\n"
    // so result is HEADER_LINE + "\n" + "\n"
    expect(serialized).toBe(HEADER_LINE + "\n\n");
  });
});
