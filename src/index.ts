import type { Node as ESTreeNode, Program as ESTreeProgram } from 'estree'
import type { SyncHandler } from 'estree-walker'

import type { CatchClause, ClassBody, Declaration, ExportSpecifier, Expression, ImportDefaultSpecifier, ImportNamespaceSpecifier, ImportSpecifier, MagicString, MethodDefinition, ModuleDeclaration, ObjectProperty, ParseResult, Pattern, PrivateIdentifier, Program, PropertyDefinition, SpreadElement, Statement, Super, SwitchCase, TemplateElement } from 'oxc-parser'

import { walk as _walk } from 'estree-walker'
import { anyOf, createRegExp, exactly } from 'magic-regexp/further-magic'
import { parseSync } from 'oxc-parser'

/** estree also has AssignmentProperty, Identifier and Literal as possible node types */
export type Node = Declaration | Expression | ClassBody | CatchClause | MethodDefinition | ModuleDeclaration | ImportSpecifier | ImportDefaultSpecifier | ImportNamespaceSpecifier | ExportSpecifier | Pattern | PrivateIdentifier | Program | SpreadElement | Statement | Super | SwitchCase | TemplateElement | ObjectProperty | PropertyDefinition

type WalkerCallback = (this: ThisParameterType<SyncHandler>, node: Node, parent: Node | null, ctx: { key: string | number | symbol | null | undefined, index: number | null | undefined, ast: Program | Node, magicString?: MagicString | undefined }) => void

export function walk(input: Program | Node | ParseResult, callback: { enter?: WalkerCallback, leave?: WalkerCallback }) {
  const [ast, magicString] = 'magicString' in input ? [input.program, input.magicString] : [input]
  return _walk(ast as unknown as ESTreeProgram | ESTreeNode, {
    enter(node, parent, key, index) {
      callback.enter?.call(this, node as Node, parent as Node | null, { key, index, ast, magicString })
    },
    leave(node, parent, key, index) {
      callback.leave?.call(this, node as Node, parent as Node | null, { key, index, ast, magicString })
    },
  }) as Program | Node | null
}

const LANG_RE = createRegExp(exactly('jsx').or('tsx').or('js').or('ts').groupedAs('lang').after(exactly('.').and(anyOf('c', 'm').optionally())))

export function parseAndWalk(code: string, sourceFilename: string, callback: WalkerCallback): ParseResult
export function parseAndWalk(code: string, sourceFilename: string, object: { enter?: WalkerCallback, leave?: WalkerCallback }): ParseResult
export function parseAndWalk(code: string, sourceFilename: string, callback: { enter?: WalkerCallback, leave?: WalkerCallback } | WalkerCallback) {
  const lang = sourceFilename?.match(LANG_RE)?.groups?.lang
  const result = parseSync(sourceFilename, code, { sourceType: 'module', lang })
  walk(result, typeof callback === 'function' ? { enter: callback } : callback)
  return result
}
