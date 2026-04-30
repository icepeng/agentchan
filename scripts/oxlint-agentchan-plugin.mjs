const noDirectLocalStorage = {
  meta: {
    type: "problem",
    docs: {
      description: "disallow direct localStorage access outside shared storage",
    },
    messages: {
      directLocalStorage:
        "Do not use `localStorage` directly. Import `localStore` from `@/client/shared/storage.js` and register the key there.",
    },
    schema: [],
  },
  create(context) {
    const filename = context.filename ?? context.getFilename?.() ?? "";
    const normalized = filename.replaceAll("\\", "/");

    if (
      !normalized.includes("apps/webui/src/client/") &&
      !normalized.startsWith("src/client/")
    ) {
      return {};
    }

    if (normalized.endsWith("apps/webui/src/client/shared/storage.ts") || normalized.endsWith("src/client/shared/storage.ts")) {
      return {};
    }

    return {
      MemberExpression(node) {
        if (node.object?.type !== "Identifier" || node.object.name !== "localStorage") {
          return;
        }

        context.report({ node, messageId: "directLocalStorage" });
      },
    };
  },
};

const noRendererBuildImport = {
  meta: {
    type: "problem",
    docs: {
      description: "disallow client imports from @agentchan/renderer-build",
    },
    messages: {
      rendererBuildImport:
        "Client code must not import from `@agentchan/renderer-build` (server-only build tool). Renderer wire format types live in `@agentchan/renderer/core`.",
    },
    schema: [],
  },
  create(context) {
    const filename = context.filename ?? context.getFilename?.() ?? "";
    const normalized = filename.replaceAll("\\", "/");

    if (
      !normalized.includes("apps/webui/src/client/") &&
      !normalized.startsWith("src/client/")
    ) {
      return {};
    }

    function check(node, source) {
      if (typeof source !== "string") return;
      if (source === "@agentchan/renderer-build" || source.startsWith("@agentchan/renderer-build/")) {
        context.report({ node, messageId: "rendererBuildImport" });
      }
    }

    return {
      ImportDeclaration(node) {
        check(node, node.source?.value);
      },
      ExportAllDeclaration(node) {
        check(node, node.source?.value);
      },
      ExportNamedDeclaration(node) {
        if (node.source) check(node, node.source.value);
      },
    };
  },
};

export default {
  meta: {
    name: "agentchan",
  },
  rules: {
    "no-direct-local-storage": noDirectLocalStorage,
    "no-renderer-build-import": noRendererBuildImport,
  },
};
