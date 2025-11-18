import type { Node, Program } from "oxc-parser";
import type { ScopeTracker, ScopeTrackerProtected } from "../scope-tracker";

export interface WalkerCallbackContext {
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
  key: string | number | symbol | null | undefined;
  /**
   * The zero-based index of the current node within its parent's children array, if applicable.
   * For instance, when processing a `VariableDeclarator` node,
   * this would be the index of the current `VariableDeclarator` node within the `declarations` array.
   *
   * This is `null` when the node is not part of an array.
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
  index: number | null;
  /**
   * The full Abstract Syntax Tree (AST) that is being walked, starting from the root node.
   */
  ast: Program | Node;
}

interface WalkerThisContextLeave {
  /**
   * Remove the current node from the AST.
   * @remarks
   * - The `ScopeTracker` currently does not support node removal
   * @see ScopeTracker
   */
  remove: () => void;
  /**
   * Replace the current node with another node.
   * After replacement, the walker will continue with the next sibling of the replaced node.
   *
   * In case the current node was removed in the `enter` phase, this will put the new node in
   * the place of the removed node - essentially undoing the removal.
   * @remarks
   * - The `ScopeTracker` currently does not support node replacement
   * @see ScopeTracker
   */
  replace: (node: Node) => void;
}

interface WalkerThisContextEnter extends WalkerThisContextLeave {
  /**
   * Skip traversing the child nodes of the current node.
   */
  skip: () => void;
  /**
   * Remove the current node and all of its children from the AST.
   * @remarks
   * - The `ScopeTracker` currently does not support node removal
   * @see ScopeTracker
   */
  remove: () => void;
  /**
   * Replace the current node with another node.
   * After replacement, the walker will continue to traverse the children of the new node.
   *
   * If you want to replace the current node and skip traversing its children, call `this.skip()` after calling `this.replace(newNode)`.
   * @remarks
   * - The `ScopeTracker` currently does not support node replacement
   * @see this.skip
   * @see ScopeTracker
   */
  replace: (node: Node) => void;
}

type WalkerCallback<T extends WalkerThisContextLeave> = (
  this: T,
  node: Node,
  parent: Node | null,
  ctx: WalkerCallbackContext,
) => void;

export type WalkerEnter = WalkerCallback<WalkerThisContextEnter>;
export type WalkerLeave = WalkerCallback<WalkerThisContextLeave>;

export interface WalkerOptions {
  scopeTracker: ScopeTracker;
}

export class WalkerBase {
  protected scopeTracker: (ScopeTracker & ScopeTrackerProtected) | undefined;
  protected enter: WalkerEnter | undefined;
  protected leave: WalkerLeave | undefined;

  protected contextEnter: WalkerThisContextEnter = {
    skip: () => {
      this._skip = true;
    },
    remove: () => {
      this._remove = true;
    },
    replace: (node: Node) => {
      this._replacement = node;
    },
  };

  protected contextLeave: WalkerThisContextLeave = {
    remove: this.contextEnter.remove,
    replace: this.contextEnter.replace,
  };

  protected _skip = false;
  protected _remove = false;
  protected _replacement: Node | null = null;

  constructor(
    handler: {
      enter?: WalkerEnter;
      leave?: WalkerLeave;
    },
    options?: Partial<WalkerOptions>,
  ) {
    this.enter = handler.enter;
    this.leave = handler.leave;
    this.scopeTracker = options?.scopeTracker as ScopeTracker &
      ScopeTrackerProtected;
  }

  protected replace<T extends Node>(
    parent: T | null,
    key: keyof T | null,
    index: number | null,
    node: Node,
  ) {
    if (!parent || key === null) {
      return;
    }
    if (index !== null) {
      (parent[key] as Array<unknown>)[index] = node;
    } else {
      parent[key] = node as T[keyof T];
    }
  }

  protected insert<T extends Node>(
    parent: T | null,
    key: keyof T | null,
    index: number | null,
    node: Node,
  ) {
    if (!parent || key === null) return;
    if (index !== null) {
      (parent[key] as Array<unknown>).splice(index, 0, node);
    } else {
      parent[key] = node as T[keyof T];
    }
  }

  protected remove<T extends Node>(
    parent: T | null,
    key: keyof T | null,
    index: number | null,
  ) {
    if (!parent || key === null) {
      return;
    }
    if (index !== null) {
      (parent[key] as Array<unknown>).splice(index, 1);
    } else {
      delete parent[key];
    }
  }
}
