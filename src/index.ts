import type { Node as ESTreeNode, Program as ESTreeProgram } from 'estree'
import type { SyncHandler } from 'estree-walker'

import type { CatchClause, ClassBody, Declaration, ExportSpecifier, Expression, ImportDefaultSpecifier, ImportNamespaceSpecifier, ImportSpecifier, MethodDefinition, ModuleDeclaration, ObjectProperty, Pattern, PrivateIdentifier, Program, PropertyDefinition, SpreadElement, Statement, Super, SwitchCase, TemplateElement } from 'oxc-parser'

import { walk as _walk } from 'estree-walker'
import { createRegExp, exactly } from 'magic-regexp/further-magic'
import { parseSync } from 'oxc-parser'

/** estree also has AssignmentProperty, Identifier and Literal as possible node types */
export type Node = Declaration | Expression | ClassBody | CatchClause | MethodDefinition | ModuleDeclaration | ImportSpecifier | ImportDefaultSpecifier | ImportNamespaceSpecifier | ExportSpecifier | Pattern | PrivateIdentifier | Program | SpreadElement | Statement | Super | SwitchCase | TemplateElement | ObjectProperty | PropertyDefinition

type WalkerCallback = (this: ThisParameterType<SyncHandler>, node: Node, parent: Node | null, ctx: { key: string | number | symbol | null | undefined, index: number | null | undefined, ast: Program | Node }) => void

export function walk(ast: Program | Node, callback: { enter?: WalkerCallback, leave?: WalkerCallback }) {
  return _walk(ast as unknown as ESTreeProgram | ESTreeNode, {
    enter(node, parent, key, index) {
      callback.enter?.call(this, node as Node, parent as Node | null, { key, index, ast })
    },
    leave(node, parent, key, index) {
      callback.leave?.call(this, node as Node, parent as Node | null, { key, index, ast })
    },
  }) as Program | Node | null
}

const LANG_RE = createRegExp(exactly('jsx').or('tsx').or('js').or('ts').groupedAs('lang').after('.'))

export function parseAndWalk(code: string, sourceFilename: string, callback: WalkerCallback): Program
export function parseAndWalk(code: string, sourceFilename: string, object: { enter?: WalkerCallback, leave?: WalkerCallback }): Program
export function parseAndWalk(code: string, sourceFilename: string, callback: { enter?: WalkerCallback, leave?: WalkerCallback } | WalkerCallback) {
  const lang = sourceFilename.match(LANG_RE)?.groups.lang
  const ast = parseSync(code, sourceFilename, { sourceType: 'module', lang }).program
  walk(ast, typeof callback === 'function' ? { enter: callback } : callback)
  return ast
}
