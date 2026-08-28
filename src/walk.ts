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
import { WalkerSync } from "./walker/sync";

type ParseSync = (
  filename: string,
  sourceText: string,
  options?: ParserOptions | null,
) => ParseResult;

let cachedParseSync: ParseSync | undefined;

const MODULE_NOT_FOUND_CODES = new Set(["MODULE_NOT_FOUND", "ERR_MODULE_NOT_FOUND"]);

/**
 * Whether `error` means `id` itself is not installed, rather than `id` failing while loading
 * (for example a package that is installed but is missing its platform-specific native binding).
 */
function isMissingModule(error: unknown, id: string): boolean {
  if (typeof error !== "object" || error === null) return false;
  const { code, message } = error as { code?: unknown; message?: unknown };
  if (typeof code !== "string" || !MODULE_NOT_FOUND_CODES.has(code)) return false;
  return typeof message === "string" && message.includes(`'${id}'`);
}

/** @internal exported for testing */
export function _loadParseSync(require: (id: string) => unknown): ParseSync {
  const candidates = ["oxc-parser", "rolldown/utils"] as const;
  for (const id of candidates) {
    let mod: { parseSync?: ParseSync };
    try {
      mod = require(id) as { parseSync?: ParseSync };
    } catch (error) {
      if (isMissingModule(error, id)) continue;
      throw new Error(
        `oxc-walker: found \`${id}\` but failed to load it. Pass a \`parseSync\` function via the \`parseAndWalk\` options to bypass this lookup.`,
        { cause: error },
      );
    }
    if (typeof mod.parseSync === "function") {
      return mod.parseSync;
    }
  }
  throw new Error(
    "oxc-walker: could not resolve a `parseSync` implementation. Install `oxc-parser` or `rolldown` (and use `rolldown/utils`), or pass a `parseSync` function via the `parseAndWalk` options.",
  );
}

function resolveParseSync(): ParseSync {
  cachedParseSync ||= _loadParseSync(createRequire(import.meta.url));
  return cachedParseSync;
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

const LANG_RE = /\.(?:c|m)?(?<lang>jsx?|tsx?)$/;

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
