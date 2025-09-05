import type { Node as ESTreeNode, Program as ESTreeProgram } from 'estree'
import type { SyncHandler } from 'estree-walker'
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
} from 'oxc-parser'
import type { ScopeTracker } from './scope-tracker'
import { walk as _walk } from 'estree-walker'
import { anyOf, createRegExp, exactly } from 'magic-regexp/further-magic'
import { parseSync } from 'oxc-parser'

export {
  getUndeclaredIdentifiersInFunction,
  isBindingIdentifier,
  ScopeTracker,
  type ScopeTrackerNode,
} from './scope-tracker'

export type Identifier = IdentifierName
  | IdentifierReference
  | BindingIdentifier
  | LabelIdentifier
  | TSIndexSignatureName

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

interface WalkerThisContext {
  /**
   * Skip traversing the child nodes of the current node.
   * @remarks
   * - The `leave` callback for the current node will still be called.
   */
  skip: () => void
  /**
   * Remove the current node and all of its children from the AST.
   * @remarks
   * - The `leave` callback for the current node will still be called.
   * - The `ScopeTracker` currently does not support node removal
   * @see ScopeTracker
   */
  remove: () => void
  /**
   * Replace the current node with another node.
   * @remarks
   * - The `leave` callback for the original node will still be called.
   * - The `ScopeTracker` currently does not support node replacement
   * @see ScopeTracker
   */
  replace: (node: Node) => void
}

interface WalkerThisContextLeave extends WalkerThisContext {
  /**
   * Skip traversing the child nodes of the current node.
   */
  skip: () => void
  /**
   * Remove the current node from the AST.
   * @remarks
   * - The `ScopeTracker` currently does not support node removal
   * @see ScopeTracker
   */
  remove: () => void
  /**
   * Replace the current node with another node.
   * @remarks
   * - The `ScopeTracker` currently does not support node replacement
   * @see ScopeTracker
   */
  replace: (node: Node) => void
}

function createWalkerThisContext(estreeWalkerThis: ThisParameterType<SyncHandler>, options?: {
  onSkip?: () => void
  onRemove?: () => void
  onReplace?: (node: Node) => void
}): WalkerThisContext {
  return {
    skip() {
      estreeWalkerThis.skip()
      options?.onSkip?.()
    },
    remove() {
      estreeWalkerThis.remove()
      options?.onRemove?.()
    },
    replace(node: Node) {
      estreeWalkerThis.replace(node as unknown as ESTreeNode)
      options?.onReplace?.(node)
    },
  }
}

type WalkerCallback<T extends WalkerThisContext> = (this: T, node: Node, parent: Node | null, ctx: WalkerCallbackContext) => void

interface _WalkOptions {
  /**
   * The instance of `ScopeTracker` to use for tracking declarations and references.
   * @see ScopeTracker
   * @default undefined
   */
  scopeTracker: ScopeTracker
}

interface WalkOptions extends Partial<_WalkOptions> {
  /**
   * The function to be called when entering a node.
   */
  enter: WalkerCallback<WalkerThisContext>
  /**
   * The function to be called when leaving a node.
   */
  leave: WalkerCallback<WalkerThisContextLeave>
}

/**
 * Walk the AST with the given options.
 * @param input The AST to walk.
 * @param options The options to be used when walking the AST. Here you can specify the callbacks for entering and leaving nodes, as well as other options.
 */
export function walk(input: Program | Node, options: Partial<WalkOptions>) {
  const scopeTracker = options.scopeTracker

  // `estree-walker` calls leave with the replaced node when `this.replace` is used in `enter()`
  // this can cause issues when tracking scope, so this is a workaround to skip the call in that case
  let skipNextEstreeWalkerLeave = false

  const leaveCallback: SyncHandler = function (node, parent, key, index) {
    const ctx = createWalkerThisContext(this)
    // @ts-expect-error - accessing a protected property
    scopeTracker?.processNodeLeave(node)
    options.leave?.call(ctx, node as Node, parent as Node | null, { key, index, ast: input } as WalkerCallbackContext)
  }

  return _walk(
    input as unknown as ESTreeProgram | ESTreeNode,
    {
      enter(node, parent, key, index) {
        // TODO: workaround for https://github.com/Rich-Harris/estree-walker/issues/41
        let callLeave = false
        const ctx = createWalkerThisContext(this, {
          onSkip: () => { callLeave = true },
          onRemove: () => { callLeave = true },
          onReplace: () => {
            callLeave = true
            skipNextEstreeWalkerLeave = true
          },
        })
        // @ts-expect-error - accessing a protected property
        scopeTracker?.processNodeEnter(node)
        options.enter?.call(ctx, node as Node, parent as Node | null, { key, index, ast: input } as WalkerCallbackContext)

        if (callLeave) {
          leaveCallback.call(this, node, parent, key, index)
        }
      },
      leave(node, parent, key, index) {
        if (skipNextEstreeWalkerLeave) {
          skipNextEstreeWalkerLeave = false
          return
        }
        leaveCallback.call(this, node, parent, key, index)
      },
    },
  ) as Program | Node | null
}

interface ParseAndWalkOptions extends WalkOptions {
  /**
   * The options for `oxc-parser` to use when parsing the code.
   */
  parseOptions: ParserOptions
}

const LANG_RE = createRegExp(exactly('jsx').or('tsx').or('js').or('ts').groupedAs('lang').after(exactly('.').and(anyOf('c', 'm').optionally())).at.lineEnd())

/**
 * Parse the code and walk the AST with the given callback, which is called when entering a node.
 * @param code The string with the code to parse and walk. This can be JavaScript, TypeScript, jsx, or tsx.
 * @param sourceFilename The filename of the source code. This is used to determine the language of the code.
 * @param callback The callback to be called when entering a node.
 */
export function parseAndWalk(code: string, sourceFilename: string, callback: WalkerCallback<WalkerThisContext>): ParseResult
/**
 * Parse the code and walk the AST with the given callback(s).
 * @param code The string with the code to parse and walk. This can be JavaScript, TypeScript, jsx, or tsx.
 * @param sourceFilename The filename of the source code. This is used to determine the language of the code.
 * @param options The options to be used when walking the AST. Here you can specify the callbacks for entering and leaving nodes, as well as other options.
 */
export function parseAndWalk(code: string, sourceFilename: string, options: Partial<ParseAndWalkOptions>): ParseResult
export function parseAndWalk(code: string, sourceFilename: string, arg3: Partial<ParseAndWalkOptions> | WalkerCallback<WalkerThisContext>) {
  const lang = sourceFilename?.match(LANG_RE)?.groups?.lang as ParserOptions['lang']
  const {
    parseOptions: _parseOptions = {},
    ...options
  } = typeof arg3 === 'function' ? { enter: arg3 } : arg3
  const parseOptions: ParserOptions = { sourceType: 'module', lang, ..._parseOptions }
  const ast = parseSync(sourceFilename, code, parseOptions)
  walk(ast.program, options)
  return ast
}
