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

export default {
  meta: {
    name: "agentchan",
  },
  rules: {
    "no-direct-local-storage": noDirectLocalStorage,
  },
};
