import type { Node } from 'oxc-parser'
import type { ScopeTracker } from '../scope-tracker'
import type {
  WalkerCallbackContext,
  WalkerEnter,
  WalkerLeave,
  WalkerOptions,
} from './base'
import { isNode } from '../utils'
import { WalkerBase } from './base'

interface _WalkOptions {
  /**
   * The instance of `ScopeTracker` to use for tracking declarations and references.
   * @see ScopeTracker
   * @default undefined
   */
  scopeTracker: ScopeTracker
}

export interface WalkOptions extends Partial<_WalkOptions> {
  /**
   * The function to be called when entering a node.
   */
  enter: WalkerEnter
  /**
   * The function to be called when leaving a node.
   */
  leave: WalkerLeave
}

export class WalkerSync extends WalkerBase {
  constructor(
    handler: {
      enter?: WalkerEnter
      leave?: WalkerLeave
    },
    options?: Partial<WalkerOptions>,
  ) {
    super(handler, options)
  }

  traverse(input: Node): Node | null
  traverse(input: any, key?: keyof Node, index?: number | null, parent?: Node | null): Node | null {
    const ast = input
    const ctx: WalkerCallbackContext = { key: null, index: index ?? null, ast }

    const _walk = (input: unknown, parent: Node | null, key: keyof Node | null, index: number | null) => {
      if (!isNode(input)) {
        return null
      }

      this.scopeTracker?.processNodeEnter(input)
      let currentNode: Node | null = input
      let removedInEnter = false
      let skipChildren = false

      if (this.enter) {
        const _skip = this._skip
        const _remove = this._remove
        const _replacement = this._replacement

        this._skip = false
        this._remove = false
        this._replacement = null

        ctx.key = key
        ctx.index = index
        this.enter.call(this.contextEnter, input, parent, ctx)

        if (this._replacement && !this._remove) {
          currentNode = this._replacement
          this.replace(parent, key, index, this._replacement)
        }

        if (this._remove) {
          removedInEnter = true
          currentNode = null
          this.remove(parent, key, index)
        }

        if (this._skip) {
          skipChildren = true
        }

        this._skip = _skip
        this._remove = _remove
        this._replacement = _replacement
      }

      // walk the child nodes of the current node or the replaced new node
      if (!skipChildren && currentNode) {
        for (const k in currentNode) {
          const node = currentNode[k as keyof typeof currentNode]
          if (!node || typeof node !== 'object') {
            continue
          }

          if (Array.isArray(node)) {
            for (let i = 0; i < node.length; i++) {
              const child = node[i]
              if (isNode(child)) {
                if (_walk(child, currentNode, k as keyof Node, i) === null) {
                  // removed a node, adjust index not to skip next node
                  i--
                }
              }
            }
          }
          else if (isNode(node)) {
            _walk(node, currentNode, k as keyof Node, null)
          }
        }
      }

      this.scopeTracker?.processNodeLeave(input)

      if (this.leave) {
        const _replacement = this._replacement
        const _remove = this._remove
        this._replacement = null
        this._remove = false

        ctx.key = key
        ctx.index = index
        this.leave.call(this.contextLeave, input, parent, ctx)

        if (this._replacement && !this._remove) {
          currentNode = this._replacement
          if (removedInEnter) {
            this.insert(parent, key, index, this._replacement)
          }
          else {
            this.replace(parent, key, index, this._replacement)
          }
        }

        if (this._remove) {
          currentNode = null
          this.remove(parent, key, index)
        }

        this._replacement = _replacement
        this._remove = _remove
      }

      return currentNode
    }

    return _walk(input, parent ?? null, key ?? null, index ?? null)
  }
}
