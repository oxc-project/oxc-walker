import type { Node as ESTreeNode, Program as ESTreeProgram } from 'estree'
import type { SyncHandler } from 'estree-walker'

import type { ArrayPattern, AssignmentPattern, AssignmentTargetMaybeDefault, AssignmentTargetRest, BindingIdentifier, BindingPattern, CatchClause, ClassBody, ClassElement, Declaration, ExportSpecifier, Expression, IdentifierName, IdentifierReference, ImportDefaultSpecifier, ImportNamespaceSpecifier, ImportSpecifier, JSXAttributeItem, JSXChild, LabelIdentifier, MethodDefinition, ModuleDeclaration, ObjectPattern, ObjectProperty, ParamPattern, ParseResult, PrivateIdentifier, Program, PropertyDefinition, SpreadElement, Statement, Super, SwitchCase, TemplateElement, TSIndexSignatureName, VariableDeclarator } from 'oxc-parser'

import { walk as _walk } from 'estree-walker'
import { anyOf, createRegExp, exactly } from 'magic-regexp/further-magic'
import { parseSync } from 'oxc-parser'
import { ScopeTracker } from './scope-tracker'

export { ScopeTracker } from './scope-tracker'

export type Identifier = IdentifierName | IdentifierReference | BindingIdentifier | LabelIdentifier | TSIndexSignatureName

/** estree also has AssignmentProperty, Identifier, and Literal as possible node types */
export type Node = AssignmentTargetMaybeDefault | AssignmentTargetRest | Declaration | VariableDeclarator | Expression | Identifier | ClassBody | ClassElement | CatchClause | MethodDefinition | ModuleDeclaration | ImportSpecifier | ImportDefaultSpecifier | ImportNamespaceSpecifier | ExportSpecifier | PrivateIdentifier | Program | SpreadElement | Statement | Super | SwitchCase | TemplateElement | ObjectProperty | PropertyDefinition | BindingPattern | ParamPattern | ObjectPattern | ArrayPattern | AssignmentPattern | JSXAttributeItem | JSXChild

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

interface WalkScopeTrackingOptions {
  /**
   * Whether to do a pre-pass to collect all identifiers in advance.
   * @default false
   */
  collect?: boolean
}

interface _WalkOptions {
  /**
   * Options for managing scope tracking. By default, no scope tracking is performed.
   *
   * You can either provide a scope tracker class to use, set this option to `true`, or
   * provide an object with options to enable scope tracking.
   *
   * When set to `true`, no identifier collection will be done beforehand. This means that
   * hoisted identifiers will not be handled properly.
   * @default undefined
   */
  scope: ScopeTracker | true | WalkScopeTrackingOptions // TODO: do we want to allow creating a new ScopeTracker instance in walk for convenience?
}

interface WalkOptions extends Partial<_WalkOptions> {
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
export function walk(input: Program | Node, options: Partial<WalkOptions>) {
  const scopeTrackingOptions: WalkScopeTrackingOptions = options.scope instanceof ScopeTracker || typeof options.scope !== 'object' ? {} : options.scope
  const scopeTracker = options.scope instanceof ScopeTracker
    ? options.scope
    : options.scope !== undefined
      ? new ScopeTracker({
        preserveExitedScopes: scopeTrackingOptions.collect,
      })
      : null

  if (scopeTrackingOptions.collect && scopeTracker) {
    _walk(input as unknown as ESTreeProgram | ESTreeNode, {
      enter(node) {
        // @ts-expect-error - accessing a protected property
        scopeTracker.processNodeEnter(node)
      },
      leave(node) {
        // @ts-expect-error - accessing a protected property
        scopeTracker.processNodeLeave(node)
      },
    })

    scopeTracker.freeze()
  }

  // TODO: discuss whether to return an object for future extensibility, or just the AST
  return {
    ast: _walk(
      input as unknown as ESTreeProgram | ESTreeNode,
      {
        enter(node, parent, key, index) {
          if (!scopeTrackingOptions.collect) {
            // @ts-expect-error - accessing a protected property; estree also has AssignmentProperty type, which is not in Node
            scopeTracker?.processNodeEnter(node)
          }
          options.enter?.call(this, node as Node, parent as Node | null, { key, index, ast: input } as WalkerCallbackContext)
        },
        leave(node, parent, key, index) {
          if (!scopeTrackingOptions.collect) {
            // @ts-expect-error - accessing a protected property; estree also has AssignmentProperty type, which is not in Node
            scopeTracker?.processNodeLeave(node)
          }
          options.leave?.call(this, node as Node, parent as Node | null, { key, index, ast: input } as WalkerCallbackContext)
        },
      },
    ) as Program | Node | null,
    // scopeTracker: scopeTracker as TOptions['scope'] extends undefined ? null : ScopeTracker,
  }
}

const LANG_RE = createRegExp(exactly('jsx').or('tsx').or('js').or('ts').groupedAs('lang').after(exactly('.').and(anyOf('c', 'm').optionally())))

/**
 * Parse the code and walk the AST with the given callback, which is called when entering a node.
 * @param code The string with the code to parse and walk. This can be JavaScript, TypeScript, jsx, or tsx.
 * @param sourceFilename The filename of the source code. This is used to determine the language of the code.
 * @param callback The callback to be called when entering a node.
 */
export function parseAndWalk(code: string, sourceFilename: string, callback: WalkerCallback): ParseResult
/**
 * Parse the code and walk the AST with the given callback(s).
 * @param code The string with the code to parse and walk. This can be JavaScript, TypeScript, jsx, or tsx.
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
