import type { Node as ESTreeNode, Program as ESTreeProgram } from 'estree'
import type { SyncHandler } from 'estree-walker'

import type { ArrayPattern, AssignmentPattern, AssignmentTargetMaybeDefault, AssignmentTargetRest, BindingIdentifier, BindingPattern, CatchClause, ClassBody, ClassElement, Declaration, ExportSpecifier, Expression, IdentifierName, IdentifierReference, ImportDefaultSpecifier, ImportNamespaceSpecifier, ImportSpecifier, LabelIdentifier, MagicString, MethodDefinition, ModuleDeclaration, ObjectPattern, ObjectProperty, ParamPattern, ParseResult, Pattern, PrivateIdentifier, Program, PropertyDefinition, SpreadElement, Statement, Super, SwitchCase, TemplateElement, TSIndexSignatureName, VariableDeclarator, WithClause } from 'oxc-parser'

import { walk as _walk } from 'estree-walker'
import { anyOf, createRegExp, exactly } from 'magic-regexp/further-magic'
import { parseSync } from 'oxc-parser'
import { ScopeTracker } from './scope-tracker'

export type Identifier = IdentifierName | IdentifierReference | BindingIdentifier | LabelIdentifier | TSIndexSignatureName

/** estree also has AssignmentProperty, Identifier and Literal as possible node types */
export type Node = AssignmentTargetMaybeDefault | AssignmentTargetRest | Declaration | VariableDeclarator | Expression | Identifier | ClassBody | ClassElement | CatchClause | WithClause | MethodDefinition | ModuleDeclaration | ImportSpecifier | ImportDefaultSpecifier | ImportNamespaceSpecifier | ExportSpecifier | Pattern | PrivateIdentifier | Program | SpreadElement | Statement | Super | SwitchCase | TemplateElement | ObjectProperty | PropertyDefinition | BindingPattern | ParamPattern | ObjectPattern | ArrayPattern | AssignmentPattern

interface WalkerCallbackContext<TInput extends Program | Node | ParseResult, TOptions extends Partial<_WalkOptions<TInput>>> {
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
  /**
   * The MagicString instance that is being used to modify the code.
   */
  magicString: TInput extends ParseResult ? MagicString : TOptions['magicString'] extends MagicString ? MagicString : undefined
}

type WalkerCallback<TInput extends Program | Node | ParseResult, TOptions extends Partial<_WalkOptions<TInput>>> = (this: ThisParameterType<SyncHandler>, node: Node, parent: Node | null, ctx: WalkerCallbackContext<TInput, TOptions>) => void

interface WalkScopeTrackingOptions {
  /**
   * Whether to do a pre-pass to collect all identifiers in advance.
   * @default false
   */
  collect?: boolean
}

interface _WalkOptions<TInput extends Program | Node | ParseResult> {
  /**
   * The oxc MagicString instance to be used to modify the code.
   *
   * When the input is a `ParseResult`, the MagicString from the result is used.
   */
  magicString: TInput extends ParseResult ? never : MagicString | undefined
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
  scope: ScopeTracker | true | WalkScopeTrackingOptions
}

type WalkOptions<TInput extends Program | Node | ParseResult, TOptions extends Partial<_WalkOptions<TInput>>> = {
  /**
   * The function to be called when entering a node.
   */
  enter: WalkerCallback<TInput, TOptions>
  /**
   * The function to be called when leaving a node.
   */
  leave: WalkerCallback<TInput, TOptions>
} & TOptions

/**
 * Walk the AST with the given options.
 * @param input The AST to walk.
 * @param options The options to be used when walking the AST. Here you can specify the callbacks for entering and leaving nodes, as well as other options.
 */
export function walk<T extends Program | Node | ParseResult, TOptions extends _WalkOptions<T>>(input: T, options: Partial<WalkOptions<T, TOptions>>) {
  const [ast, magicString] = 'magicString' in input ? [input.program, input.magicString] : [input, options.magicString]

  const scopeTrackingOptions: WalkScopeTrackingOptions = options.scope instanceof ScopeTracker || typeof options.scope !== 'object' ? {} : options.scope
  const scopeTracker = options.scope instanceof ScopeTracker
    ? options.scope
    : options.scope !== undefined
      ? new ScopeTracker({
        keepExitedScopes: scopeTrackingOptions.collect,
      })
      : null

  if (scopeTrackingOptions.collect && scopeTracker) {
    _walk(ast as unknown as ESTreeProgram | ESTreeNode, {
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

  return {
    ast: _walk(
      ast as unknown as ESTreeProgram | ESTreeNode,
      {
        enter(node, parent, key, index) {
          if (!scopeTrackingOptions.collect) {
            // @ts-expect-error - accessing a protected property; estree also has AssignmentProperty type, which is not in Node
            scopeTracker?.processNodeEnter(node)
          }
          options.enter?.call(this, node as Node, parent as Node | null, { key, index, ast, magicString } as WalkerCallbackContext<T, TOptions>)
        },
        leave(node, parent, key, index) {
          if (!scopeTrackingOptions.collect) {
            // @ts-expect-error - accessing a protected property; estree also has AssignmentProperty type, which is not in Node
            scopeTracker?.processNodeLeave(node)
          }
          options.leave?.call(this, node as Node, parent as Node | null, { key, index, ast, magicString } as WalkerCallbackContext<T, TOptions>)
        },
      },
    ) as Program | Node | null,
    scopeTracker: scopeTracker as TOptions['scope'] extends undefined ? null : ScopeTracker,
  }
}

const LANG_RE = createRegExp(exactly('jsx').or('tsx').or('js').or('ts').groupedAs('lang').after(exactly('.').and(anyOf('c', 'm').optionally())))

/**
 * Parse the code and walk the AST with the given callback, which is called when entering a node.
 * @param code The string with the code to parse and walk. This can be javascript, typescript, jsx or tsx.
 * @param sourceFilename The filename of the source code. This is used to determine the language of the code.
 * @param callback The callback to be called when entering a node.
 */
export function parseAndWalk<TOptions extends Partial<_WalkOptions<ParseResult>>>(code: string, sourceFilename: string, callback: WalkerCallback<ParseResult, TOptions>): ParseResult
/**
 * Parse the code and walk the AST with the given callback(s).
 * @param code The string with the code to parse and walk. This can be javascript, typescript, jsx or tsx.
 * @param sourceFilename The filename of the source code. This is used to determine the language of the code.
 * @param options The options to be used when walking the AST. Here you can specify the callbacks for entering and leaving nodes, as well as other options.
 */
export function parseAndWalk<TOptions extends Partial<_WalkOptions<ParseResult>>>(code: string, sourceFilename: string, options: Partial<WalkOptions<ParseResult, TOptions>>): ParseResult
export function parseAndWalk<TOptions extends Partial<_WalkOptions<ParseResult>>>(code: string, sourceFilename: string, arg3: Partial<WalkOptions<ParseResult, TOptions>> | WalkerCallback<ParseResult, TOptions>) {
  const lang = sourceFilename?.match(LANG_RE)?.groups?.lang
  const result = parseSync(sourceFilename, code, { sourceType: 'module', lang })
  walk(result, (typeof arg3 === 'function' ? { enter: arg3 } : arg3) as any) // TODO: use a more specific type cast
  return result
}
