import eslint from "@eslint/js";
import { defineConfig } from "eslint/config";
import tseslint from "typescript-eslint";
import reactHooks from "eslint-plugin-react-hooks";

export default defineConfig(
  { ignores: ["**/dist/", "**/data/", "example_data/", "research/", ".claude/", ".turbo/"] },

  eslint.configs.recommended,
  tseslint.configs.recommended,
  tseslint.configs.recommendedTypeChecked,

  { languageOptions: { parserOptions: { projectService: true } } },

  {
    rules: {
      // Stylistic — not error prevention
      "@typescript-eslint/no-inferrable-types": "off",
      "@typescript-eslint/no-empty-object-type": "off",
      "@typescript-eslint/consistent-type-imports": "off",
      "@typescript-eslint/no-empty-function": "off",
      "no-empty": "off",
      // Async event handlers in JSX are standard React — skip void-return check for attributes
      "@typescript-eslint/no-misused-promises": ["error", { checksVoidReturn: { attributes: false } }],
      // Type-strictness — not error prevention, noisy at third-party boundaries
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-unsafe-argument": "off",
      "@typescript-eslint/no-unsafe-assignment": "off",
      "@typescript-eslint/no-unsafe-call": "off",
      "@typescript-eslint/no-unsafe-member-access": "off",
      "@typescript-eslint/no-unsafe-return": "off",
      // Allow destructuring to omit properties: { children, ...rest }
      "@typescript-eslint/no-unused-vars": ["error", { ignoreRestSiblings: true }],
    },
  },

  {
    files: ["apps/webui/src/**/*.{ts,tsx}"],
    extends: [reactHooks.configs.flat.recommended],
  },

  { files: ["**/*.{js,mjs,cjs}"], ...tseslint.configs.disableTypeChecked },
);
