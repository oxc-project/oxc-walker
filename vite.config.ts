import { fileURLToPath } from "node:url";
import { defineConfig } from "vite-plus";

export default defineConfig({
  staged: {
    "*": "vp check --fix",
  },
  resolve: {
    alias: {
      "oxc-walker": fileURLToPath(new URL("./src/index.ts", import.meta.url).href),
    },
  },
  test: {
    coverage: {
      include: ["src"],
      reporter: ["text", "json", "html"],
    },
  },
  fmt: {
    ignorePatterns: ["CHANGELOG.md"],
  },
  lint: {
    options: {
      typeAware: true,
      typeCheck: true,
    },
    overrides: [
      {
        files: ["test/walker.test.ts", "test/scope-tracker.test.ts"],
        rules: {
          "@typescript-eslint/no-base-to-string": "off",
          "@typescript-eslint/restrict-template-expressions": "off",
        },
      },
    ],
  },
});
