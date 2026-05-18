const CLIENT_MARKERS = ["apps/webui/src/client/", "src/client/"];

const FUTURE_SLICE_LAYERS = new Map([
  ["shell", "slice"],
  ["library", "slice"],
  ["project", "slice"],
  ["session", "slice"],
  ["project-editor", "slice"],
  ["renderer-host", "slice"],
  ["provider", "slice"],
  ["theme", "slice"],
  ["onboarding", "slice"],
  ["update", "slice"],
  ["app-settings", "slice"],
  ["design-system", "design-system"],
  ["platform", "platform"],
]);

const FUTURE_SLICE_DAG = new Map([
  ["shell", ["project", "library", "project-editor", "provider", "onboarding", "theme", "update", "app-settings"]],
  ["project", ["session", "library", "project-editor"]],
  ["project-editor", ["session"]],
  ["renderer-host", ["session"]],
  ["onboarding", ["provider", "library"]],
  ["app-settings", ["provider", "theme", "update", "onboarding"]],
  ["session", ["provider"]],
]);

const BASELINE_VIOLATIONS = new Set([
  "deep-import|features/project/useProject|session/data/index|@/client/session/data/index.js",
  "deep-import|pages/ProjectPage|session/ui/index|@/client/session/ui/index.js",
  "entity-cross-import|entities/renderer/useRendererOutput|entities/project/index|@/client/entities/project/index.js",
  "entity-cross-import|entities/renderer/useRendererOutput|entities/view/index|@/client/entities/view/index.js",
]);

const noDirectLocalStorage = {
  meta: {
    type: "problem",
    docs: {
      description: "disallow direct localStorage access outside shared storage",
    },
    messages: {
      directLocalStorage:
        "Do not use `localStorage` directly. Import `localStore` from `@/client/platform/index.js` and register the key there.",
    },
    schema: [],
  },
  create(context) {
    const sourcePath = getClientRelativePath(context.filename ?? context.getFilename?.() ?? "");

    if (sourcePath === null) {
      return {};
    }

    if (sourcePath === "platform/storage") {
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

const sliceBoundaryBaseline = createSliceBoundaryRule({
  description: "report existing slice boundary violations as warnings",
  include: shouldReportSliceBoundaryBaseline,
});

const sliceBoundaryNew = createSliceBoundaryRule({
  description: "disallow new slice boundary violations",
  include: shouldReportSliceBoundaryNew,
});

export function shouldReportSliceBoundaryBaseline(violation) {
  return violation.level !== "error" && BASELINE_VIOLATIONS.has(violation.key);
}

export function shouldReportSliceBoundaryNew(violation) {
  if (violation.level === "error") {
    return true;
  }
  return !BASELINE_VIOLATIONS.has(violation.key);
}

function createSliceBoundaryRule({ description, include }) {
  return {
    meta: {
      type: "problem",
      docs: { description },
      messages: {
        sliceBoundary: "{{ message }}",
      },
      schema: [],
    },
    create(context) {
      const sourcePath = getClientRelativePath(context.filename ?? context.getFilename?.() ?? "");

      if (sourcePath === null) {
        return {};
      }

      function checkImport(node, rawSpecifier) {
        if (typeof rawSpecifier !== "string") {
          return;
        }

        const violation = classifyClientImport(sourcePath, rawSpecifier);
        if (violation === null || !include(violation)) {
          return;
        }

        context.report({
          node,
          messageId: "sliceBoundary",
          data: { message: violation.message },
        });
      }

      return {
        ExportAllDeclaration(node) {
          checkImport(node.source, node.source?.value);
        },
        ExportNamedDeclaration(node) {
          checkImport(node.source, node.source?.value);
        },
        ImportDeclaration(node) {
          checkImport(node.source, node.source?.value);
        },
        ImportExpression(node) {
          checkImport(node.source, node.source?.value);
        },
      };
    },
  };
}

export function classifyClientImport(sourcePath, specifier) {
  const normalizedSource = normalizeClientPath(sourcePath);
  const targetPath = resolveClientImport(normalizedSource, specifier);

  if (targetPath === null) {
    return null;
  }

  const sourceSlice = getSlice(normalizedSource);
  const targetSlice = getSlice(targetPath);

  if (targetSlice === null || sourceSlice?.id === targetSlice.id) {
    return null;
  }

  const deepImportViolation = checkDeepImport({
    sourcePath: normalizedSource,
    targetPath,
    targetSlice,
    specifier,
  });

  if (deepImportViolation !== null) {
    return deepImportViolation;
  }

  if (sourceSlice === null) {
    return null;
  }

  if (sourceSlice.layer === "entity" && targetSlice.layer === "feature") {
    return buildViolation({
      code: "entity-to-feature",
      level: "error",
      sourcePath: normalizedSource,
      targetPath,
      specifier,
      message: `Entity slice cannot import feature slice '${targetSlice.name}'. Move the dependency behind a lower-level interface or invert the dependency.`,
    });
  }

  if (
    (sourceSlice.layer === "design-system" || sourceSlice.layer === "platform") &&
    isDomainSlice(targetSlice)
  ) {
    return buildViolation({
      code: `${sourceSlice.layer}-to-slice`,
      level: "baseline",
      sourcePath: normalizedSource,
      targetPath,
      specifier,
      message: `${sourceSlice.name} must stay domain-independent and cannot import slice '${targetSlice.name}'.`,
    });
  }

  const dagViolation = checkFutureSliceDag({
    sourceSlice,
    targetSlice,
    sourcePath: normalizedSource,
    targetPath,
    specifier,
  });

  if (dagViolation !== null) {
    return dagViolation;
  }

  if (
    (sourceSlice.layer === "entity" && targetSlice.layer === "entity") ||
    (sourceSlice.layer === "feature" && targetSlice.layer === "feature")
  ) {
    return buildViolation({
      code: `${sourceSlice.layer}-cross-import`,
      level: "warn",
      sourcePath: normalizedSource,
      targetPath,
      specifier,
      message: `Transitional ${sourceSlice.layer} cross-import from '${sourceSlice.name}' to '${targetSlice.name}'. Keep it temporary and migrate through the PRD #192 slice surface.`,
    });
  }

  return null;
}

export function getClientRelativePath(filename) {
  const normalized = normalizeSlashes(filename);

  for (const marker of CLIENT_MARKERS) {
    const index = normalized.indexOf(marker);
    if (index !== -1) {
      return stripExtension(normalized.slice(index + marker.length));
    }
  }

  return null;
}

function checkDeepImport({ sourcePath, targetPath, targetSlice, specifier }) {
  if (!targetSlice.requiresIndexImport || targetPath === `${targetSlice.root}/index`) {
    return null;
  }

  return buildViolation({
    code: "deep-import",
    level: "baseline",
    sourcePath,
    targetPath,
    specifier,
    message: `Import slice '${targetSlice.name}' through '${targetSlice.root}/index.js' instead of deep path '${targetPath}.js'.`,
  });
}

function checkFutureSliceDag({ sourceSlice, targetSlice, sourcePath, targetPath, specifier }) {
  if (!sourceSlice.future || !targetSlice.future || targetSlice.layer === "design-system" || targetSlice.layer === "platform") {
    return null;
  }

  const allowedTargets = FUTURE_SLICE_DAG.get(sourceSlice.id) ?? [];
  if (allowedTargets.includes(targetSlice.id)) {
    return null;
  }

  return buildViolation({
    code: "disallowed-slice-dependency",
    level: "baseline",
    sourcePath,
    targetPath,
    specifier,
    message: `Slice '${sourceSlice.name}' cannot import slice '${targetSlice.name}' according to the PRD #192 slice DAG.`,
  });
}

function buildViolation({ code, level, sourcePath, targetPath, specifier, message }) {
  return {
    code,
    key: `${code}|${sourcePath}|${targetPath}|${specifier}`,
    level,
    message,
    sourcePath,
    specifier,
    targetPath,
  };
}

function isDomainSlice(slice) {
  return slice.layer === "slice" || slice.layer === "feature" || slice.layer === "entity" || slice.layer === "app";
}

function getSlice(path) {
  const parts = path.split("/");
  const [root, name] = parts;

  if (FUTURE_SLICE_LAYERS.has(root)) {
    return {
      future: true,
      id: root,
      layer: FUTURE_SLICE_LAYERS.get(root),
      name: root,
      requiresIndexImport: true,
      root,
    };
  }

  if (root === "features" && name) {
    return {
      future: false,
      id: `feature:${name}`,
      layer: "feature",
      name,
      requiresIndexImport: true,
      root: `features/${name}`,
    };
  }

  if (root === "entities" && name) {
    return {
      future: false,
      id: `entity:${name}`,
      layer: "entity",
      name,
      requiresIndexImport: true,
      root: `entities/${name}`,
    };
  }

  if (root === "app") {
    return {
      future: false,
      id: "app",
      layer: "app",
      name: "app",
      requiresIndexImport: true,
      root: "app",
    };
  }

  if (root === "shared") {
    return {
      future: false,
      id: "platform",
      layer: "platform",
      name: "platform",
      requiresIndexImport: false,
      root: "shared",
    };
  }

  if (root === "i18n") {
    return {
      future: false,
      id: "platform",
      layer: "platform",
      name: "platform",
      requiresIndexImport: true,
      root: "i18n",
    };
  }

  return null;
}

function resolveClientImport(sourcePath, specifier) {
  const cleanSpecifier = specifier.split("?")[0].split("#")[0];

  if (cleanSpecifier.startsWith("@/client/")) {
    return normalizeClientPath(cleanSpecifier.slice("@/client/".length));
  }

  if (cleanSpecifier.startsWith("./") || cleanSpecifier.startsWith("../")) {
    return normalizeClientPath(`${dirname(sourcePath)}/${cleanSpecifier}`);
  }

  return null;
}

function normalizeClientPath(path) {
  return stripExtension(normalizeSegments(normalizeSlashes(path)));
}

function normalizeSlashes(path) {
  return path.replaceAll("\\", "/");
}

function normalizeSegments(path) {
  const output = [];

  for (const segment of path.split("/")) {
    if (segment === "" || segment === ".") {
      continue;
    }
    if (segment === "..") {
      output.pop();
      continue;
    }
    output.push(segment);
  }

  return output.join("/");
}

function stripExtension(path) {
  return path.replace(/\.(?:c|m)?(?:tsx?|jsx?)$/, "");
}

function dirname(path) {
  const index = path.lastIndexOf("/");
  return index === -1 ? "" : path.slice(0, index);
}

export default {
  meta: {
    name: "agentchan",
  },
  rules: {
    "no-direct-local-storage": noDirectLocalStorage,
    "slice-boundary-baseline": sliceBoundaryBaseline,
    "slice-boundary-new": sliceBoundaryNew,
  },
};
