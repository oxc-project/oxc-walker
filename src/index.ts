import type { Node as ESTreeNode, Program as ESTreeProgram } from 'estree'
import type { SyncHandler } from 'estree-walker'

import type { CatchClause, ClassBody, Declaration, ExportSpecifier, Expression, ImportDefaultSpecifier, ImportNamespaceSpecifier, ImportSpecifier, MethodDefinition, ModuleDeclaration, ObjectProperty, ParseResult, Pattern, PrivateIdentifier, Program, PropertyDefinition, SpreadElement, Statement, Super, SwitchCase, TemplateElement } from 'oxc-parser'

import { walk as _walk } from 'estree-walker'
import { anyOf, createRegExp, exactly } from 'magic-regexp/further-magic'
import { parseSync } from 'oxc-parser'

/** estree also has AssignmentProperty, Identifier and Literal as possible node types */
export type Node = Declaration | Expression | ClassBody | CatchClause | MethodDefinition | ModuleDeclaration | ImportSpecifier | ImportDefaultSpecifier | ImportNamespaceSpecifier | ExportSpecifier | Pattern | PrivateIdentifier | Program | SpreadElement | Statement | Super | SwitchCase | TemplateElement | ObjectProperty | PropertyDefinition

interface WalkerCallbackContext {
  /**
   * The key of the current node within its parent node object, if applicable.
   *
   * For instance, when processing a `VariableDeclarator` node, this would be the `declarations` key of the parent `VariableDeclaration` node.
   * @example
   * {
   *   type: 'VariableDeclaration',
   *   declarations: [[Object]],
   *   // ...
   * },
   *   {  // <-- when processing this, the key would be 'declarations'
   *     type: 'VariableDeclarator',
   *     // ...
   *   },
   */
  key: string | number | symbol | null | undefined
  /**
   * The zero-based index of the current node within its parent's children array, if applicable.
   * For instance, when processing a `VariableDeclarator` node,
   * this would be the index of the current `VariableDeclarator` node within the `declarations` array.
   *
   * This is `null` when the node is not part of an array and `undefined` for the root `Program` node.
   *
   * @example
   * {
   *   type: 'VariableDeclaration',
   *   declarations: [[Object]],
   *   // ...
   * },
   *   {  // <-- when processing this, the index would be 0
   *     type: 'VariableDeclarator',
   *     // ...
   *   },
   */
  index: number | null | undefined
  /**
   * The full Abstract Syntax Tree (AST) that is being walked, starting from the root node.
   */
  ast: Program | Node
}

type WalkerCallback = (this: ThisParameterType<SyncHandler>, node: Node, parent: Node | null, ctx: WalkerCallbackContext) => void

interface WalkOptions {
  /**
   * The function to be called when entering a node.
   */
  enter: WalkerCallback
  /**
   * The function to be called when leaving a node.
   */
  leave: WalkerCallback
}

/**
 * Walk the AST with the given options.
 * @param input The AST to walk.
 * @param options The options to be used when walking the AST. Here you can specify the callbacks for entering and leaving nodes, as well as other options.
 */
export function walk(ast: Program | Node, options: Partial<WalkOptions>) {
  return _walk(
    ast as unknown as ESTreeProgram | ESTreeNode,
    {
      enter(node, parent, key, index) {
        options.enter?.call(this, node as Node, parent as Node | null, { key, index, ast })
      },
      leave(node, parent, key, index) {
        options.leave?.call(this, node as Node, parent as Node | null, { key, index, ast })
      },
    },
  ) as Program | Node | null
}

const LANG_RE = createRegExp(exactly('jsx').or('tsx').or('js').or('ts').groupedAs('lang').after(exactly('.').and(anyOf('c', 'm').optionally())))

/**
 * Parse the code and walk the AST with the given callback, which is called when entering a node.
 * @param code The string with the code to parse and walk. This can be javascript, typescript, jsx or tsx.
 * @param sourceFilename The filename of the source code. This is used to determine the language of the code.
 * @param callback The callback to be called when entering a node.
 */
export function parseAndWalk(code: string, sourceFilename: string, callback: WalkerCallback): ParseResult
/**
 * Parse the code and walk the AST with the given callback(s).
 * @param code The string with the code to parse and walk. This can be javascript, typescript, jsx or tsx.
 * @param sourceFilename The filename of the source code. This is used to determine the language of the code.
 * @param options The options to be used when walking the AST. Here you can specify the callbacks for entering and leaving nodes, as well as other options.
 */
export function parseAndWalk(code: string, sourceFilename: string, options: Partial<WalkOptions>): ParseResult
export function parseAndWalk(code: string, sourceFilename: string, arg3: Partial<WalkOptions> | WalkerCallback) {
  const lang = sourceFilename?.match(LANG_RE)?.groups?.lang
  const ast = parseSync(sourceFilename, code, { sourceType: 'module', lang })
  walk(ast.program, typeof arg3 === 'function' ? { enter: arg3 } : arg3)
  return ast
}
