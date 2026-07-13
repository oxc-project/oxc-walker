import type {
  BindingIdentifier,
  IdentifierName,
  IdentifierReference,
  LabelIdentifier,
  Node,
  Program,
  TSIndexSignatureName,
} from "@oxc-project/types";
import type { ParseResult, ParserOptions } from "oxc-parser";
import type { WalkerEnter } from "./walker/base";
import type { WalkOptions } from "./walker/sync";
import { createRequire } from "node:module";
import { anyOf, createRegExp, exactly } from "magic-regexp/further-magic";
import { WalkerSync } from "./walker/sync";

type ParseSync = (
  filename: string,
  sourceText: string,
  options?: ParserOptions | null,
) => ParseResult;

let cachedParseSync: ParseSync | undefined;

function resolveParseSync(): ParseSync {
  if (cachedParseSync) return cachedParseSync;
  const require = createRequire(import.meta.url);
  const candidates = ["oxc-parser", "rolldown/utils"] as const;
  for (const id of candidates) {
    try {
      const mod = require(id) as { parseSync?: ParseSync };
      if (typeof mod.parseSync === "function") {
        cachedParseSync = mod.parseSync;
        return cachedParseSync;
      }
    } catch {}
  }
  throw new Error(
    "oxc-walker: could not resolve a `parseSync` implementation. Install `oxc-parser` or `rolldown` (and use `rolldown/utils`), or pass a `parseSync` function via the `parseAndWalk` options.",
  );
}

export type Identifier =
  | IdentifierName
  | IdentifierReference
  | BindingIdentifier
  | LabelIdentifier
  | TSIndexSignatureName;

/**
 * Walk the AST with the given options.
 * @param input The AST to walk.
 * @param options The options to be used when walking the AST. Here you can specify the callbacks for entering and leaving nodes, as well as other options.
 */
export function walk(input: Program | Node, options: Partial<WalkOptions>) {
  return new WalkerSync(
    {
      enter: options.enter,
      leave: options.leave,
    },
    {
      scopeTracker: options.scopeTracker,
    },
  ).traverse(input);
}

interface ParseAndWalkOptions extends WalkOptions {
  /**
   * The options for `oxc-parser` to use when parsing the code.
   */
  parseOptions: ParserOptions;
  /**
   * The `parseSync` implementation to use. Defaults to `parseSync` from `oxc-parser`,
   * falling back to `rolldown/utils` if `oxc-parser` is not installed.
   *
   * Provide this explicitly to avoid the runtime lookup or to use a different
   * compatible parser (e.g. `import { parseSync } from "rolldown/utils"`).
   */
  parseSync: ParseSync;
}

const LANG_RE = createRegExp(
  exactly("jsx")
    .or("tsx")
    .or("js")
    .or("ts")
    .groupedAs("lang")
    .after(exactly(".").and(anyOf("c", "m").optionally()))
    .at.lineEnd(),
);

/**
 * Parse the code and walk the AST with the given callback, which is called when entering a node.
 * @param code The string with the code to parse and walk. This can be JavaScript, TypeScript, jsx, or tsx.
 * @param sourceFilename The filename of the source code. This is used to determine the language of the code, unless
 * it is specified in the parse options.
 * @param callback The callback to be called when entering a node.
 */
export function parseAndWalk(
  code: string,
  sourceFilename: string,
  callback: WalkerEnter,
): ParseResult;
/**
 * Parse the code and walk the AST with the given callback(s).
 * @param code The string with the code to parse and walk. This can be JavaScript, TypeScript, jsx, or tsx.
 * @param sourceFilename The filename of the source code. This is used to determine the language of the code, unless
 * it is specified in the parse options.
 * @param options The options to be used when walking the AST. Here you can specify the callbacks for entering and leaving nodes, as well as other options.
 */
export function parseAndWalk(
  code: string,
  sourceFilename: string,
  options: Partial<ParseAndWalkOptions>,
): ParseResult;
export function parseAndWalk(
  code: string,
  sourceFilename: string,
  arg3: Partial<ParseAndWalkOptions> | WalkerEnter,
) {
  const lang = sourceFilename?.match(LANG_RE)?.groups?.lang as ParserOptions["lang"];
  const {
    parseOptions: _parseOptions = {},
    parseSync: _parseSync,
    ...options
  } = typeof arg3 === "function" ? { enter: arg3 } : arg3;
  const parseOptions: ParserOptions = {
    sourceType: "module",
    lang,
    ..._parseOptions,
  };
  const parse = _parseSync ?? resolveParseSync();
  const ast = parse(sourceFilename, code, parseOptions);
  walk(ast.program, options);
  return ast;
}
