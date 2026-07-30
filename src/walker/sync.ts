import type { Node } from "@oxc-project/types";
import type { ScopeTracker } from "../scope-tracker";
import type { WalkerCallbackContext, WalkerEnter, WalkerLeave, WalkerOptions } from "./base";
import { isNode } from "../utils";
import { WalkerBase } from "./base";

interface _WalkOptions {
  /**
   * The instance of `ScopeTracker` to use for tracking declarations and references.
   * @see ScopeTracker
   * @default undefined
   */
  scopeTracker: ScopeTracker;
}

export interface WalkOptions extends Partial<_WalkOptions> {
  /**
   * The function to be called when entering a node.
   */
  enter: WalkerEnter;
  /**
   * The function to be called when leaving a node.
   */
  leave: WalkerLeave;
}

export class WalkerSync extends WalkerBase {
  constructor(
    handler: {
      enter?: WalkerEnter;
      leave?: WalkerLeave;
    },
    options?: Partial<WalkerOptions>,
  ) {
    super(handler, options);
  }

  traverse(input: Node): Node | null;
  traverse(input: any, key?: keyof Node, index?: number | null, parent?: Node | null): Node | null {
    const ast = input;
    const ctx: WalkerCallbackContext = { key: null, index: index ?? null, ast };

    // perf: store in local variables to prevent repeated property access
    const scopeTracker = this.scopeTracker;
    const enter = this.enter;
    const leave = this.leave;
    const contextEnter = this.contextEnter;
    const contextLeave = this.contextLeave;

    const _walk = (
      input: Node,
      parent: Node | null,
      key: keyof Node | null,
      index: number | null,
      skip: boolean,
    ): Node | null => {
      if (scopeTracker) {
        scopeTracker.processNodeEnter(input);
      }
      let currentNode: Node | null = input;
      let removedInEnter = false;
      let skipChildren = skip;

      if (enter && !skip) {
        const _skip = this._skip;
        const _remove = this._remove;
        const _replacement = this._replacement;

        this._skip = false;
        this._remove = false;
        this._replacement = null;

        ctx.key = key;
        ctx.index = index;
        enter.call(contextEnter, input, parent, ctx);

        if (this._replacement && !this._remove) {
          currentNode = this._replacement;
          this.replace(parent, key, index, this._replacement);
        }

        if (this._remove) {
          removedInEnter = true;
          currentNode = null;
          this.remove(parent, key, index);
        }

        if (this._skip) {
          skipChildren = true;
        }

        this._skip = _skip;
        this._remove = _remove;
        this._replacement = _replacement;
      }

      // walk the child nodes of the current node or the replaced new node
      // (we need to walk everything when scope tracking)
      if ((!skipChildren || scopeTracker) && currentNode) {
        for (const k in currentNode) {
          // perf: every node has these scalar keys, skip them before loading the value
          if (k === "type" || k === "start" || k === "end") {
            continue;
          }
          const node = currentNode[k as keyof typeof currentNode];
          if (!node || typeof node !== "object") {
            continue;
          }

          if (Array.isArray(node)) {
            for (let i = 0; i < node.length; i++) {
              const child = node[i];
              if (isNode(child)) {
                if (_walk(child, currentNode, k as keyof Node, i, skipChildren) === null) {
                  // removed a node, adjust index not to skip next node
                  i--;
                }
              }
            }
            // perf: `node.type` check is the only one which hasn't been checked yet. check only that instead of `isNode`
          } else if (typeof node.type === "string") {
            _walk(node, currentNode, k as keyof Node, null, skipChildren);
          }
        }
      }

      if (scopeTracker) {
        scopeTracker.processNodeLeave(input);
      }

      if (leave && !skip) {
        const _replacement = this._replacement;
        const _remove = this._remove;
        this._replacement = null;
        this._remove = false;

        ctx.key = key;
        ctx.index = index;
        leave.call(contextLeave, input, parent, ctx);

        if (this._replacement && !this._remove) {
          currentNode = this._replacement;
          if (removedInEnter) {
            this.insert(parent, key, index, this._replacement);
          } else {
            this.replace(parent, key, index, this._replacement);
          }
        }

        if (this._remove) {
          currentNode = null;
          this.remove(parent, key, index);
        }

        this._replacement = _replacement;
        this._remove = _remove;
      }

      return currentNode;
    };

    // perf: check the root node before walking
    if (!isNode(input)) {
      return null;
    }
    if (scopeTracker) {
      scopeTracker.onWalkStart(input);
    }

    // perf: without enter/leave handlers no node can be skipped, removed or replaced,
    // so a minimal recursion without the callback bookkeeping is enough
    if (scopeTracker && !enter && !leave) {
      const _walkScopesOnly = (input: Node): void => {
        scopeTracker.processNodeEnter(input);
        for (const k in input) {
          // perf: every node has these scalar keys, skip them before loading the value
          if (k === "type" || k === "start" || k === "end") {
            continue;
          }
          const node = input[k as keyof typeof input] as unknown;
          if (!node || typeof node !== "object") {
            continue;
          }

          if (Array.isArray(node)) {
            for (let i = 0; i < node.length; i++) {
              const child = node[i];
              if (isNode(child)) {
                _walkScopesOnly(child);
              }
            }

            // perf: `node.type` check is the only one which hasn't been checked yet. check only that instead of `isNode`
          } else if (typeof (node as Node).type === "string") {
            _walkScopesOnly(node as Node);
          }
        }
        scopeTracker.processNodeLeave(input);
      };

      _walkScopesOnly(input);
      return input;
    }

    return _walk(input, parent ?? null, key ?? null, index ?? null, false);
  }
}
