import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, describe, expect, it } from "vite-plus/test";
import { _loadParseSync } from "../src/walk";

const realOxcParser = fileURLToPath(new URL("../node_modules/oxc-parser", import.meta.url));
const reexportRealParser = `module.exports = require(${JSON.stringify(realOxcParser)});`;

const fixtures: string[] = [];

/**
 * Create a directory containing real CommonJS packages, and return a `require` resolving
 * against it. Nothing here is mocked: resolution failures come from Node itself.
 * @param packages Map of package name to the body of its entry point.
 */
async function createRequireFor(packages: Record<string, string>) {
  const dir = await mkdtemp(join(tmpdir(), "oxc-walker-"));
  fixtures.push(dir);

  for (const [name, body] of Object.entries(packages)) {
    const pkgDir = join(dir, "node_modules", name);
    await mkdir(pkgDir, { recursive: true });
    await writeFile(
      join(pkgDir, "package.json"),
      JSON.stringify({ name, version: "0.0.0", main: "index.cjs" }),
    );
    await writeFile(join(pkgDir, "index.cjs"), body);
  }

  return createRequire(join(dir, "index.js"));
}

function parse(parseSync: ReturnType<typeof _loadParseSync>) {
  return parseSync("test.js", "const a = 1").program.body[0]?.type;
}

afterAll(async () => {
  await Promise.all(fixtures.map((dir) => rm(dir, { recursive: true, force: true })));
});

describe("_loadParseSync", () => {
  it("should use `oxc-parser` when it is installed", async () => {
    const require = await createRequireFor({ "oxc-parser": reexportRealParser });
    expect(parse(_loadParseSync(require))).toBe("VariableDeclaration");
  });

  it("should fall back to `rolldown/utils` when `oxc-parser` is not installed", async () => {
    const require = await createRequireFor({ "rolldown/utils": reexportRealParser });
    expect(parse(_loadParseSync(require))).toBe("VariableDeclaration");
  });

  it("should fall back when a candidate resolves without a `parseSync` export", async () => {
    const require = await createRequireFor({
      "oxc-parser": "module.exports = {};",
      "rolldown/utils": reexportRealParser,
    });
    expect(parse(_loadParseSync(require))).toBe("VariableDeclaration");
  });

  it("should surface the original error when an installed candidate fails to load", async () => {
    const require = await createRequireFor({
      "oxc-parser": "throw new Error('missing native binding');",
    });
    expect(() => _loadParseSync(require)).toThrow(/found `oxc-parser` but failed to load it/);
    expect(() => _loadParseSync(require)).toThrow(
      expect.objectContaining({
        cause: expect.objectContaining({ message: "missing native binding" }),
      }),
    );
  });

  it("should surface a non-error thrown while loading a candidate", async () => {
    const require = await createRequireFor({ "oxc-parser": "throw 'boom';" });
    expect(() => _loadParseSync(require)).toThrow(/found `oxc-parser` but failed to load it/);
  });

  it("should surface a nested missing module rather than treating it as uninstalled", async () => {
    const require = await createRequireFor({
      "oxc-parser": "require('some-missing-transitive-dependency');",
    });
    expect(() => _loadParseSync(require)).toThrow(/found `oxc-parser` but failed to load it/);
  });

  it("should throw when no candidate is installed", async () => {
    const require = await createRequireFor({});
    expect(() => _loadParseSync(require)).toThrow(/could not resolve a `parseSync` implementation/);
  });
});
