import type {
  BindingIdentifier,
  IdentifierName,
  IdentifierReference,
  LabelIdentifier,
  Node,
  ParseResult,
  ParserOptions,
  Program,
  TSIndexSignatureName,
} from "oxc-parser";
import type { WalkerEnter } from "./walker/base";
import type { WalkOptions } from "./walker/sync";
import { anyOf, createRegExp, exactly } from "magic-regexp/further-magic";
import { parseSync } from "oxc-parser";
import { WalkerSync } from "./walker/sync";

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
  const { parseOptions: _parseOptions = {}, ...options } =
    typeof arg3 === "function" ? { enter: arg3 } : arg3;
  const parseOptions: ParserOptions = {
    sourceType: "module",
    lang,
    ..._parseOptions,
  };
  const ast = parseSync(sourceFilename, code, parseOptions);
  walk(ast.program, options);
  return ast;
}
