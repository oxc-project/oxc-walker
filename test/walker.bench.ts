import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { bench, describe } from "vite-plus/test";
import { isReferenceIdentifier, parseAndWalk, ScopeTracker, walk } from "../src";

const rootDir = fileURLToPath(new URL("..", import.meta.url));

const code = readFileSync(
  join(rootDir, "node_modules/@vue/compiler-sfc/dist/compiler-sfc.esm-browser.js"),
  "utf8",
);

const { program } = parseAndWalk(code, "compiler-sfc.js", {});

let sink = 0;

describe("walker on @vue/compiler-sfc", () => {
  bench("walk", () => {
    walk(program, {
      enter(node) {
        if (node.type === "Identifier") {
          sink++;
        }
      },
    });
  });

  bench("walk with scope tracking", () => {
    walk(program, { scopeTracker: new ScopeTracker() });
    sink++;
  });

  bench("detect unmatched identifiers", () => {
    const scopeTracker = new ScopeTracker({ preserveExitedScopes: true });

    // first pass to collect all declarations and hoist them
    walk(program, { scopeTracker });
    scopeTracker.freeze();

    const unmatched = new Set<string>();
    walk(program, {
      scopeTracker,
      enter(node, parent) {
        // re-export specifiers refer to the other module's exports
        if (node.type === "ExportNamedDeclaration" && node.source) {
          this.skip();
          return;
        }
        if (node.type !== "Identifier" && node.type !== "JSXIdentifier") {
          return;
        }
        if (isReferenceIdentifier(node, parent) && !scopeTracker.isDeclared(node.name)) {
          unmatched.add(node.name);
        }
      },
    });
    sink += unmatched.size;
  });
});
