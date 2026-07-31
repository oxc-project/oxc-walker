import type {
  ArrowFunctionExpression,
  BindingPattern,
  BindingRestElement,
  CatchClause,
  FormalParameterRest,
  Function,
  IdentifierReference,
  ImportDeclaration,
  ImportDeclarationSpecifier,
  JSXIdentifier,
  Node,
  ParamPattern,
  TSParameterProperty,
  VariableDeclaration,
} from "@oxc-project/types";
import type { Identifier } from "./walk";
import { walk } from "./walk";

export interface ScopeTrackerProtected {
  processNodeEnter: (node: Node) => void;
  processNodeLeave: (node: Node) => void;
}

/**
 * The node types handled by {@link ScopeTracker.processNodeEnter}.
 * Must list every `case` of its switch statement; a missing entry silently disables
 * scope tracking for that node type (see the drift test in `test/scope-tracker.test.ts`).
 */
const SCOPE_ENTER_TYPES = new Set<Node["type"]>([
  "Program",
  "BlockStatement",
  "StaticBlock",
  "TSModuleBlock",
  "FunctionDeclaration",
  "FunctionExpression",
  "ArrowFunctionExpression",
  "VariableDeclaration",
  "ClassDeclaration",
  "ClassExpression",
  "ImportDeclaration",
  "TSEnumDeclaration",
  "TSModuleDeclaration",
  "TSImportEqualsDeclaration",
  "TSDeclareFunction",
  "TSInterfaceDeclaration",
  "TSTypeAliasDeclaration",
  "TSTypeParameter",
  "TSMappedType",
  "TSEnumBody",
  "CatchClause",
  "ForStatement",
  "ForOfStatement",
  "ForInStatement",
]);

/**
 * Tracks variable scopes and identifier declarations within a JavaScript AST.
 *
 * Maintains a stack of scopes, each represented as a map from identifier names to their declaration nodes,
 * enabling efficient lookup of the declaration.
 *
 * The ScopeTracker is designed to integrate with the `walk` function,
 * it automatically manages scope creation and identifier tracking,
 * so only query and inspection methods are exposed for external use.
 *
 * ### Scope tracking
 * A new scope is created when entering blocks, function parameters, loop variables, etc.
 * Note that this representation may split a single JavaScript lexical scope into multiple internal scopes,
 * meaning it doesn't mirror JavaScript’s scoping 1:1.
 *
 * Scopes are represented using a string-based index like `"0-1-2"`, which tracks depth and ancestry.
 *
 * #### Root scope
 * The root scope is represented by an empty string `""`.
 *
 * #### Scope key format
 * Scope keys are hierarchical strings that uniquely identify each scope and its position in the tree.
 * They are constructed using a depth-based indexing scheme, where:
 *
 * - the root scope is represented by an empty string `""`.
 * - the first child scope is `"0"`.
 * - a parallel sibling of `"0"` becomes `"1"`, `"2"`, etc.
 * - a nested scope under `"0"` is `"0-0"`, then its sibling is `"0-1"`, and so on.
 *
 * Each segment in the key corresponds to the zero-based index of the scope at that depth level in
 * the order of AST traversal.
 *
 * ### Additional features
 * - supports freezing the tracker to allow for second passes through the AST without modifying the scope data
 * (useful for doing a pre-pass to collect all identifiers before walking).
 *
 * @example
 * ```ts
 * const scopeTracker = new ScopeTracker()
 * walk(code, {
 *   scopeTracker,
 *   enter(node) {
 *     // ...
 *   },
 * })
 * ```
 *
 * @see parseAndWalk
 * @see walk
 */
export class ScopeTracker {
  protected scopeIndexStack: number[] = [];
  /**
   * The scope keys of the ancestors of the current scope, one entry per active scope.
   * `pushScope` pushes the current `scopeIndexKey` before deriving the new one,
   * and `popScope` restores it from here, so the stack always mirrors the path
   * from the root scope down to the parent of the current scope.
   */
  protected scopeKeyStack: string[] = [];
  /**
   * The nodes that created the currently active scopes, one entry per scope.
   * A node that creates multiple scopes (e.g. `FunctionExpression`) appears once per scope.
   * This lets `processNodeLeave` detect scope ends with a pointer comparison
   * instead of checking the node type.
   */
  protected scopeOwnerStack: Node[] = [];
  protected scopeIndexKey = "";
  protected scopes: Map<string, Map<string, ScopeTrackerNode>> = new Map();
  protected typeScopes: Map<string, Map<string, ScopeTrackerNode>> = new Map();

  protected options: Partial<ScopeTrackerOptions>;
  protected isFrozen = false;

  constructor(options: ScopeTrackerOptions = {}) {
    this.options = options;
  }

  protected pushScope(owner: Node) {
    const depthIndex = this.scopeIndexStack[this.scopeIndexStack.length - 1];
    this.scopeKeyStack.push(this.scopeIndexKey);
    this.scopeOwnerStack.push(owner);
    this.scopeIndexStack.push(0);
    if (depthIndex !== undefined) {
      this.scopeIndexKey = this.scopeIndexKey
        ? `${this.scopeIndexKey}-${depthIndex}`
        : `${depthIndex}`;
    }
  }

  protected popScope() {
    this.scopeOwnerStack.pop();
    this.scopeIndexStack.pop();
    if (this.scopeIndexStack[this.scopeIndexStack.length - 1] !== undefined) {
      this.scopeIndexStack[this.scopeIndexStack.length - 1]!++;
    }

    if (!this.options.preserveExitedScopes) {
      this.scopes.delete(this.scopeIndexKey);
      this.typeScopes.delete(this.scopeIndexKey);
    }

    this.scopeIndexKey = this.scopeKeyStack.pop() ?? "";
  }

  protected declareInNamespace(
    scopes: Map<string, Map<string, ScopeTrackerNode>>,
    name: string,
    data: ScopeTrackerNode,
  ) {
    let scope = scopes.get(this.scopeIndexKey);
    if (!scope) {
      scope = new Map();
      scopes.set(this.scopeIndexKey, scope);
    }
    scope.set(name, data);
  }

  protected declareIdentifier(
    name: string,
    data: ScopeTrackerNode,
    namespaces: { value?: boolean; type?: boolean } = { value: true },
  ) {
    if (this.isFrozen) {
      return;
    }

    if (namespaces.value) {
      this.declareInNamespace(this.scopes, name, data);
    }
    if (namespaces.type) {
      this.declareInNamespace(this.typeScopes, name, data);
    }
  }

  protected declareFunctionParameter(param: ParamPattern, fn: Function | ArrowFunctionExpression) {
    if (this.isFrozen) {
      return;
    }

    const identifiers = getPatternIdentifiers(param);
    for (const identifier of identifiers) {
      this.declareIdentifier(
        identifier.name,
        new ScopeTrackerFunctionParam(identifier, this.scopeIndexKey, fn),
      );
    }
  }

  protected declarePattern(
    pattern: BindingPattern,
    parent: VariableDeclaration | ArrowFunctionExpression | CatchClause | Function,
  ) {
    if (this.isFrozen) {
      return;
    }

    const identifiers = getPatternIdentifiers(pattern);
    for (const identifier of identifiers) {
      this.declareIdentifier(
        identifier.name,
        parent.type === "VariableDeclaration"
          ? new ScopeTrackerVariable(identifier, this.scopeIndexKey, parent)
          : parent.type === "CatchClause"
            ? new ScopeTrackerCatchParam(identifier, this.scopeIndexKey, parent)
            : new ScopeTrackerFunctionParam(identifier, this.scopeIndexKey, parent),
      );
    }
  }

  protected processNodeEnter: ScopeTrackerProtected["processNodeEnter"] = (node) => {
    // perf: fast path for the nodes, which do not affect scopes (avoiding unnecessary comparisons)
    if (!SCOPE_ENTER_TYPES.has(node.type)) {
      return;
    }
    switch (node.type) {
      case "Program":
      case "BlockStatement":
      case "StaticBlock":
      case "TSModuleBlock":
        this.pushScope(node);
        break;

      case "FunctionDeclaration":
        // declare function name for named functions, skip for `export default`
        if (node.id?.name) {
          this.declareIdentifier(node.id.name, new ScopeTrackerFunction(node, this.scopeIndexKey));
        }
        this.pushScope(node);
        for (const param of node.params) {
          this.declareFunctionParameter(param, node);
        }
        break;

      case "FunctionExpression":
        // make the name of the function available only within the function
        // e.g. const foo = function bar() {  // bar is only available within the function body
        this.pushScope(node);
        // can be undefined, for example, in class method definitions
        if (node.id?.name) {
          this.declareIdentifier(node.id.name, new ScopeTrackerFunction(node, this.scopeIndexKey));
        }

        this.pushScope(node);
        for (const param of node.params) {
          this.declareFunctionParameter(param, node);
        }
        break;
      case "ArrowFunctionExpression":
        this.pushScope(node);
        for (const param of node.params) {
          this.declareFunctionParameter(param, node);
        }
        break;

      case "VariableDeclaration":
        for (const decl of node.declarations) {
          this.declarePattern(decl.id, node);
        }
        break;

      case "ClassDeclaration":
        // declare class name for named classes, skip for `export default`
        // classes are referencable both as values and as types
        if (node.id?.name) {
          this.declareIdentifier(
            node.id.name,
            new ScopeTrackerIdentifier(node.id, this.scopeIndexKey),
            { value: true, type: true },
          );
        }
        // a scope is pushed for generic classes so that their type parameters do not leak out
        if (node.typeParameters) {
          this.pushScope(node);
        }
        break;

      case "ClassExpression":
        // make the name of the class available only within the class
        // e.g. const MyClass = class InternalClassName { // InternalClassName is only available within the class body
        this.pushScope(node);
        if (node.id?.name) {
          this.declareIdentifier(
            node.id.name,
            new ScopeTrackerIdentifier(node.id, this.scopeIndexKey),
            { value: true, type: true },
          );
        }
        break;

      case "ImportDeclaration":
        // imports are referencable both as values and as types
        for (const specifier of node.specifiers) {
          this.declareIdentifier(
            specifier.local.name,
            new ScopeTrackerImport(specifier, this.scopeIndexKey, node),
            { value: true, type: true },
          );
        }
        break;

      case "TSEnumDeclaration":
      case "TSModuleDeclaration":
      case "TSImportEqualsDeclaration":
        // enums, namespaces and `import =` are referencable both as values and as types (except `declare global`, which does not create a binding)
        if (node.type === "TSModuleDeclaration" && node.kind === "global") {
          break;
        }
        if (node.id?.type === "Identifier" && node.id.name) {
          this.declareIdentifier(
            node.id.name,
            new ScopeTrackerIdentifier(node.id, this.scopeIndexKey),
            { value: true, type: true },
          );
        }
        break;

      case "TSDeclareFunction":
        // `declare function` and function overload signatures declare a value binding;
        // a scope is pushed so that their type parameters do not leak out
        if (node.id?.name) {
          this.declareIdentifier(
            node.id.name,
            new ScopeTrackerIdentifier(node.id, this.scopeIndexKey),
          );
        }
        this.pushScope(node);
        break;

      case "TSInterfaceDeclaration":
      case "TSTypeAliasDeclaration":
        // interfaces and type aliases declare a binding in the type namespace only;
        // a scope is pushed so that their type parameters do not leak out
        if (node.id?.name) {
          this.declareIdentifier(
            node.id.name,
            new ScopeTrackerIdentifier(node.id, this.scopeIndexKey),
            { type: true },
          );
        }
        this.pushScope(node);
        break;

      case "TSTypeParameter":
        // generic type parameters (`function f<T>()`)
        if (node.name?.name) {
          this.declareIdentifier(
            node.name.name,
            new ScopeTrackerIdentifier(node.name, this.scopeIndexKey),
            { type: true },
          );
        }
        break;

      case "TSMappedType":
        // the key of a mapped type declares a type parameter scoped to the mapped type
        // (`{ [K in keyof T]: K }`)
        this.pushScope(node);
        this.declareIdentifier(
          node.key.name,
          new ScopeTrackerIdentifier(node.key, this.scopeIndexKey),
          { type: true },
        );
        break;

      case "TSEnumBody":
        // enum members are referencable by name within the enum body
        this.pushScope(node);
        for (const member of node.members) {
          if (member.id.type === "Identifier") {
            this.declareIdentifier(
              member.id.name,
              new ScopeTrackerIdentifier(member.id, this.scopeIndexKey),
            );
          }
        }
        break;

      case "CatchClause":
        this.pushScope(node);
        if (node.param) {
          this.declarePattern(node.param, node);
        }
        break;

      case "ForStatement":
      case "ForOfStatement":
      case "ForInStatement":
        // make the variables defined in for loops available only within the loop
        // e.g. for (let i = 0; i < 10; i++) { // i is only available within the loop block scope
        this.pushScope(node);

        if (node.type === "ForStatement" && node.init?.type === "VariableDeclaration") {
          for (const decl of node.init.declarations) {
            this.declarePattern(decl.id, node.init);
          }
        } else if (
          (node.type === "ForOfStatement" || node.type === "ForInStatement") &&
          node.left.type === "VariableDeclaration"
        ) {
          for (const decl of node.left.declarations) {
            this.declarePattern(decl.id, node.left);
          }
        }
        break;
    }
  };

  protected processNodeLeave: ScopeTrackerProtected["processNodeLeave"] = (node) => {
    // pop every scope this node created on enter
    // perf: a pointer comparison instead of checking `node.type`
    const owners = this.scopeOwnerStack;
    while (owners.length > 0 && owners[owners.length - 1] === node) {
      this.popScope();
    }
  };

  protected getDeclarationIn(
    scopes: Map<string, Map<string, ScopeTrackerNode>>,
    name: string,
  ): ScopeTrackerNode | null {
    let key = this.scopeIndexKey;
    while (true) {
      const node = scopes.get(key)?.get(name);
      if (node) {
        return node;
      }
      if (!key) {
        return null;
      }
      const separatorIndex = key.lastIndexOf("-");
      key = separatorIndex === -1 ? "" : key.slice(0, separatorIndex);
    }
  }

  /**
   * Check if an identifier is declared in the current scope or any parent scope.
   * @param name the identifier name to check
   * @param options which namespace to check — the value namespace (default), the type namespace, or both
   */
  isDeclared(name: string, options?: ScopeTrackerQueryOptions) {
    return this.getDeclaration(name, options) !== null;
  }

  /**
   * Get the declaration node for a given identifier name.
   * @param name the identifier name to look up
   * @param options which namespace to check — the value namespace (default), the type namespace, or both
   */
  getDeclaration(name: string, options?: ScopeTrackerQueryOptions): ScopeTrackerNode | null {
    const mode = options?.mode ?? "value";
    return (
      (mode !== "type" ? this.getDeclarationIn(this.scopes, name) : null) ??
      (mode !== "value" ? this.getDeclarationIn(this.typeScopes, name) : null)
    );
  }

  /**
   * Get the current scope key.
   */
  getCurrentScope() {
    return this.scopeIndexKey;
  }

  /**
   * Check if the current scope is a child of a specific scope.
   * @example
   * ```ts
   * // current scope is 0-1
   * isCurrentScopeUnder('0') // true
   * isCurrentScopeUnder('0-1') // false
   * ```
   *
   * @param scope the parent scope key to check against
   * @returns `true` if the current scope is a child of the specified scope, `false` otherwise (also when they are the same)
   */
  isCurrentScopeUnder(scope: string) {
    return isChildScope(this.scopeIndexKey, scope);
  }

  /**
   * Freezes the ScopeTracker, preventing further modifications to its state.
   * It also resets the scope index stack to its initial state so that the tracker can be reused.
   *
   * This is useful for second passes through the AST.
   */
  freeze() {
    this.isFrozen = true;
    this.scopeIndexStack = [];
    this.scopeKeyStack = [];
    this.scopeOwnerStack = [];
    this.scopeIndexKey = "";
  }
}

type Pattern = BindingPattern | BindingRestElement | FormalParameterRest | TSParameterProperty;

function getPatternIdentifiers(pattern: Pattern) {
  const identifiers: Identifier[] = [];

  function collectIdentifiers(pattern: Pattern) {
    switch (pattern.type) {
      case "Identifier":
        identifiers.push(pattern);
        break;
      case "AssignmentPattern":
        collectIdentifiers(pattern.left);
        break;
      case "RestElement":
        collectIdentifiers(pattern.argument);
        break;
      case "TSParameterProperty":
        collectIdentifiers(pattern.parameter);
        break;
      case "ArrayPattern":
        for (const element of pattern.elements) {
          if (element) {
            collectIdentifiers(element.type === "RestElement" ? element.argument : element);
          }
        }
        break;
      case "ObjectPattern":
        for (const property of pattern.properties) {
          collectIdentifiers(property.type === "RestElement" ? property.argument : property.value);
        }
        break;
    }
  }

  collectIdentifiers(pattern);

  return identifiers;
}

/**
 * An allocation-free alternative to `getPatternIdentifiers(pattern).includes(node)`
 */
function isIdentifierInPattern(pattern: Pattern, node: Node): boolean {
  switch (pattern.type) {
    case "Identifier":
      return pattern === node;
    case "AssignmentPattern":
      return isIdentifierInPattern(pattern.left, node);
    case "RestElement":
      return isIdentifierInPattern(pattern.argument, node);
    case "TSParameterProperty":
      return isIdentifierInPattern(pattern.parameter, node);
    case "ArrayPattern":
      for (const element of pattern.elements) {
        if (
          element &&
          isIdentifierInPattern(element.type === "RestElement" ? element.argument : element, node)
        ) {
          return true;
        }
      }
      return false;
    case "ObjectPattern":
      for (const property of pattern.properties) {
        if (
          isIdentifierInPattern(
            property.type === "RestElement" ? property.argument : property.value,
            node,
          )
        ) {
          return true;
        }
      }
      return false;
  }

  return false;
}

/**
 * Check if an identifier is in a binding position, where it declares a new variable.
 *
 * Note that identifiers nested in destructuring patterns (`const { a, b = c } = obj`)
 * cannot be resolved from the direct parent alone; this function returns `false` for them
 * and {@link isReferenceIdentifier} reports them as references.
 * Pair these functions with a {@link ScopeTracker} to resolve such identifiers correctly.
 */
export function isOnlyBindingIdentifier(node: Node, parent: Node | null) {
  if (!parent || node.type !== "Identifier") {
    return false;
  }

  switch (parent.type) {
    case "FunctionDeclaration":
    case "FunctionExpression":
    case "ArrowFunctionExpression":
    case "TSDeclareFunction":
    case "TSEmptyBodyFunctionExpression":
      // function name or parameters
      // (`TSEmptyBodyFunctionExpression` covers abstract methods, `declare class` methods and overload signatures)
      if (parent.type !== "ArrowFunctionExpression" && parent.id === node) {
        return true;
      }
      for (const param of parent.params) {
        if (isIdentifierInPattern(param, node)) {
          return true;
        }
      }
      return false;

    case "ClassDeclaration":
    case "ClassExpression":
      // class name
      return parent.id === node;

    case "VariableDeclarator":
      // variable name
      return isIdentifierInPattern(parent.id, node);

    case "CatchClause":
      // catch clause param
      if (!parent.param) {
        return false;
      }
      return isIdentifierInPattern(parent.param, node);

    case "ImportSpecifier":
      // the local name of an import
      return parent.local === node;

    case "ImportDefaultSpecifier":
    case "ImportNamespaceSpecifier":
      return true;

    case "TSEnumDeclaration":
    case "TSModuleDeclaration":
      // enum and namespace names
      return parent.id === node;

    case "TSImportEqualsDeclaration":
      // import alias name (`import A = require('...')`)
      return parent.id === node;

    case "TSParameterProperty":
      // constructor parameter properties (`constructor(private foo) {}`)
      return isIdentifierInPattern(parent.parameter, node);
  }

  return false;
}

// @todo: remove in v2
/**
 * @deprecated
 * Despite its name, this function does not check for binding positions only.
 * It will adopt the strict binding-position behavior of {@link isOnlyBindingIdentifier}
 * in the next major version. Migrate based on what you need:
 * - `!isReferenceIdentifier(node, parent)` if you were filtering out variable references
 *   (the common case)
 * - `isOnlyBindingIdentifier(node, parent)` if you need actual binding positions
 */
export function isBindingIdentifier(node: Node, parent: Node | null) {
  if (!parent || node.type !== "Identifier") {
    return false;
  }

  if (isOnlyBindingIdentifier(node, parent)) {
    return true;
  }

  // non-binding, non-reference positions this function historically reported as bindings
  switch (parent.type) {
    case "MethodDefinition":
    case "PropertyDefinition":
      // class member names
      return parent.key === node;

    case "Property":
      // property key if not used as a shorthand
      return parent.key === node && parent.value !== node;

    case "MemberExpression":
      // member expression properties
      return parent.property === node;
  }

  return false;
}

/**
 * Check if an identifier is a reference.
 *
 * Note that this function returns `true` for the local name of a plain export
 * (`export { foo }`), where it is a genuine reference to a local variable,
 * but also for the local name of a re-export (`export { foo } from '...'`),
 * where it refers to the other module's exports instead.
 *
 * The two are indistinguishable from the specifier alone, as the `source` lives
 * on the parent `ExportNamedDeclaration`.
 * Skip re-export declarations during the walk to avoid the false positives.
 *
 * Identifiers nested in destructuring patterns (`const { a, b = c } = obj`) are also
 * indistinguishable from references based on the direct parent alone and are reported
 * as references. Pair this function with a {@link ScopeTracker} to resolve them correctly.
 */
export function isReferenceIdentifier(
  node: Node,
  parent: Node | null,
  options?: IsReferenceIdentifierOptions,
) {
  if (!parent) {
    return false;
  }

  const mode = options?.mode ?? "value";

  if (node.type === "JSXIdentifier") {
    if (mode === "type") {
      return false;
    }
    switch (parent.type) {
      case "JSXOpeningElement":
      case "JSXClosingElement":
        // lowercase element names refer to intrinsic elements, not variables
        return parent.name === node && !/^[a-z]/.test(node.name);
      case "JSXMemberExpression":
        return parent.object === node;
      case "JSXAttribute":
      case "JSXNamespacedName":
        return false;
    }
    return false;
  }

  if (node.type !== "Identifier" || isOnlyBindingIdentifier(node, parent)) {
    return false;
  }

  switch (parent.type) {
    case "MemberExpression":
      // the object and computed properties (`foo[bar]`), but not `foo.bar`
      return mode !== "type" && (parent.object === node || parent.computed);

    case "Property":
      // property values, shorthands and computed keys, but not `{ foo: 1 }`
      return mode !== "type" && (parent.value === node || parent.computed);

    case "MethodDefinition":
    case "PropertyDefinition":
    case "AccessorProperty":
    case "TSAbstractMethodDefinition":
    case "TSAbstractPropertyDefinition":
    case "TSAbstractAccessorProperty":
      // computed class member keys, but not `class { foo() {} }`
      return mode !== "type" && (parent.value === node || parent.computed);

    case "ExportSpecifier":
      // the local name of an export, but not the exported name of `export { foo as bar }`
      return mode !== "type" && parent.local === node;

    case "ExportAllDeclaration":
      // the exported name of `export * as foo from '...'`
      return false;

    case "ImportSpecifier":
      // the imported name of `import { foo as bar }`
      return false;

    case "LabeledStatement":
    case "BreakStatement":
    case "ContinueStatement":
      // statement labels
      return false;

    case "MetaProperty":
      // `import.meta` and `new.target`
      return false;

    case "ImportAttribute":
      // attribute keys (`with { type: 'json' }`)
      return false;

    case "TSEnumMember":
      // enum member names, but not their initializers (`enum E { A = B }`)
      return mode !== "type" && parent.id !== node;

    case "TSMappedType":
      // the key of a mapped type declares a type parameter (`{ [K in keyof T]: K }`)
      return false;

    // references in TypeScript's type namespace
    case "TSTypeReference":
      // type annotations (`const x: Foo`)
      return mode !== "value";

    case "TSQualifiedName":
      // the root of a qualified type name (`NS.Inner`)
      return mode !== "value" && parent.left === node;

    case "TSClassImplements":
    case "TSInterfaceHeritage":
      // heritage clauses (`implements Foo`, `extends Bar`)
      return mode !== "value" && parent.expression === node;

    // type-only positions that are never references
    case "TSTypeParameter":
    case "TSInterfaceDeclaration":
    case "TSTypeAliasDeclaration":
    case "TSPropertySignature":
    case "TSMethodSignature":
    case "TSIndexSignature":
      return false;

    // parameter names of function types and signatures (`type F = (foo: string) => void`)
    case "TSFunctionType":
    case "TSConstructorType":
    case "TSCallSignatureDeclaration":
    case "TSConstructSignatureDeclaration":
      return false;
  }

  return mode !== "type";
}

export interface IsReferenceIdentifierOptions {
  /**
   * Which references to report:
   * - `'value'`: references to runtime values, e.g. `foo()` or `typeof foo` in a type annotation
   * - `'type'`: references in type-only positions, e.g. `const x: Foo` or `implements Foo`,
   * which reference bindings in TypeScript's type namespace rather than runtime values
   * - `'all'`: both
   * @default 'value'
   */
  mode?: "value" | "type" | "all";
}

export function getUndeclaredIdentifiersInFunction(node: Function | ArrowFunctionExpression) {
  const scopeTracker = new ScopeTracker({
    preserveExitedScopes: true,
  });
  const undeclaredIdentifiers = new Set<string>();

  function isIdentifierUndeclared(
    node: Omit<IdentifierReference, "typeAnnotation"> | JSXIdentifier,
    parent: Node | null,
  ) {
    return isReferenceIdentifier(node, parent) && !scopeTracker.isDeclared(node.name);
  }

  // first pass to collect all declarations and hoist them
  walk(node, {
    scopeTracker,
  });

  scopeTracker.freeze();

  walk(node, {
    scopeTracker,
    enter(node, parent) {
      if (
        (node.type === "Identifier" || node.type === "JSXIdentifier") &&
        isIdentifierUndeclared(node, parent)
      ) {
        undeclaredIdentifiers.add(node.name);
      }
    },
  });

  return Array.from(undeclaredIdentifiers);
}

/**
 * A function to check whether scope A is a child of scope B.
 * @example
 * ```ts
 * isChildScope('0-1-2', '0-1') // true
 * isChildScope('0-1', '0-1') // false
 * ```
 *
 * @param a the child scope
 * @param b the parent scope
 * @returns true if scope A is a child of scope B, false otherwise (also when they are the same)
 */
function isChildScope(a: string, b: string) {
  return a.startsWith(b) && a.length > b.length;
}

abstract class BaseNode<T extends Node = Node> {
  abstract type: string;
  readonly scope: string;
  node: T;

  constructor(node: T, scope: string) {
    this.node = node;
    this.scope = scope;
  }

  /**
   * The starting position of the entire node relevant for code transformation.
   * For instance, for a reference to a variable (ScopeTrackerVariable -> Identifier), this would refer to the start of the VariableDeclaration.
   */
  abstract get start(): number;

  /**
   * The ending position of the entire node relevant for code transformation.
   * For instance, for a reference to a variable (ScopeTrackerVariable -> Identifier), this would refer to the end of the VariableDeclaration.
   */
  abstract get end(): number;

  /**
   * Check if the node is defined under a specific scope.
   * @param scope
   */
  isUnderScope(scope: string) {
    return isChildScope(this.scope, scope);
  }
}

export class ScopeTrackerIdentifier extends BaseNode<Identifier> {
  override type = "Identifier" as const;

  get start() {
    return this.node.start;
  }

  get end() {
    return this.node.end;
  }
}

export class ScopeTrackerFunctionParam extends BaseNode {
  type = "FunctionParam" as const;
  fnNode: Function | ArrowFunctionExpression;

  constructor(node: Node, scope: string, fnNode: Function | ArrowFunctionExpression) {
    super(node, scope);
    this.fnNode = fnNode;
  }

  /**
   * @deprecated The representation of this position may change in the future. Use `.fnNode.start` instead for now.
   */
  get start() {
    return this.fnNode.start;
  }

  /**
   * @deprecated The representation of this position may change in the future. Use `.fnNode.end` instead for now.
   */
  get end() {
    return this.fnNode.end;
  }
}

export class ScopeTrackerFunction extends BaseNode<Function | ArrowFunctionExpression> {
  type = "Function" as const;

  get start() {
    return this.node.start;
  }

  get end() {
    return this.node.end;
  }
}

export class ScopeTrackerVariable extends BaseNode<Identifier> {
  type = "Variable" as const;
  variableNode: VariableDeclaration;

  constructor(node: Identifier, scope: string, variableNode: VariableDeclaration) {
    super(node, scope);
    this.variableNode = variableNode;
  }

  get start() {
    return this.variableNode.start;
  }

  get end() {
    return this.variableNode.end;
  }
}

export class ScopeTrackerImport extends BaseNode<ImportDeclarationSpecifier> {
  type = "Import" as const;
  importNode: ImportDeclaration;

  constructor(node: ImportDeclarationSpecifier, scope: string, importNode: ImportDeclaration) {
    super(node, scope);
    this.importNode = importNode;
  }

  get start() {
    return this.importNode.start;
  }

  get end() {
    return this.importNode.end;
  }
}

export class ScopeTrackerCatchParam extends BaseNode {
  type = "CatchParam" as const;
  catchNode: CatchClause;

  constructor(node: Node, scope: string, catchNode: CatchClause) {
    super(node, scope);
    this.catchNode = catchNode;
  }

  get start() {
    return this.catchNode.start;
  }

  get end() {
    return this.catchNode.end;
  }
}

export type ScopeTrackerNode =
  | ScopeTrackerFunctionParam
  | ScopeTrackerFunction
  | ScopeTrackerVariable
  | ScopeTrackerIdentifier
  | ScopeTrackerImport
  | ScopeTrackerCatchParam;

export interface ScopeTrackerOptions {
  /**
   * If true, the scope tracker will preserve exited scopes in memory.
   * This is necessary when you want to do a pre-pass to collect all identifiers before walking, for example.
   * @default false
   */
  preserveExitedScopes?: boolean;
}

export interface ScopeTrackerQueryOptions {
  /**
   * Which namespace to check:
   * - `'value'`: bindings of runtime values (default)
   * - `'type'`: bindings in TypeScript's type namespace (interfaces, type aliases, type parameters);
   * declarations available in both namespaces (classes, enums, namespaces, imports) are included in either
   * - `'all'`: both
   * @default 'value'
   */
  mode?: "value" | "type" | "all";
}
