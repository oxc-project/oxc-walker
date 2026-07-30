import { readFileSync } from "node:fs";
import type { Node } from "oxc-parser";
import { assert, describe, expect, it } from "vite-plus/test";
import type { IsReferenceIdentifierOptions, ScopeTrackerQueryOptions } from "../src";
import {
  getUndeclaredIdentifiersInFunction,
  isBindingIdentifier,
  isOnlyBindingIdentifier,
  isReferenceIdentifier,
  parseAndWalk,
  ScopeTracker,
  ScopeTrackerCatchParam,
  ScopeTrackerFunction,
  ScopeTrackerFunctionParam,
  ScopeTrackerIdentifier,
  ScopeTrackerImport,
  ScopeTrackerVariable,
  walk,
} from "../src";

function getNodeString(node: Node) {
  const parts: string[] = [node.type];
  if ("name" in node) {
    parts.push(`${node.name}`);
  }
  if ("value" in node) {
    parts.push(`${node.value}`);
  }
  if ("async" in node) {
    parts.push(`async=${node.async}`);
  }

  return parts.join(":");
}

const filename = "test.ts";

describe("scope tracker", () => {
  it("should throw away exited scopes", () => {
    const code = `
    const a = 1
    {
      const b = 2
    }
    `;

    const scopeTracker = new TestScopeTracker();

    parseAndWalk(code, filename, {
      scopeTracker,
    });

    expect(scopeTracker.getScopes().size).toBe(0);
  });

  it("should keep exited scopes", () => {
    const code = `
    const a = 1
    {
      const b = 2
    }
    `;

    const scopeTracker = new TestScopeTracker({ preserveExitedScopes: true });

    parseAndWalk(code, filename, {
      scopeTracker,
    });

    expect(scopeTracker.getScopes().size).toBe(2);
  });

  it("should create separate scopes when walking a non-Program root", () => {
    let fnDecl: Node | undefined;
    let fnExpr: Node | undefined;
    parseAndWalk(
      `
      function foo(p) { const x = 1 }
      const f = function bar(q) { const y = 1 }
      `,
      filename,
      {
        enter(node) {
          if (node.type === "FunctionDeclaration") {
            fnDecl = node;
          } else if (node.type === "FunctionExpression") {
            fnExpr = node;
          }
        },
      },
    );
    assert(fnDecl && fnExpr);

    // when walking a function directly, its name is declared in the root scope,
    // while the parameters and body get their own child scopes
    const declTracker = new TestScopeTracker({ preserveExitedScopes: true });
    walk(fnDecl, { scopeTracker: declTracker });

    const declScopes = declTracker.getScopes();
    expect([...(declScopes.get("")?.keys() ?? [])]).toEqual(["foo"]);
    expect([...(declScopes.get("0")?.keys() ?? [])]).toEqual(["p"]);
    expect([...(declScopes.get("0-0")?.keys() ?? [])]).toEqual(["x"]);

    // a function expression pushes a scope for its name as well,
    // and nothing is declared in the root scope
    const exprTracker = new TestScopeTracker({ preserveExitedScopes: true });
    walk(fnExpr, { scopeTracker: exprTracker });

    const exprScopes = exprTracker.getScopes();
    expect(exprScopes.get("")).toBeUndefined();
    expect([...(exprScopes.get("0")?.keys() ?? [])]).toEqual(["bar"]);
    expect([...(exprScopes.get("0-0")?.keys() ?? [])]).toEqual(["q"]);
    expect([...(exprScopes.get("0-0-0")?.keys() ?? [])]).toEqual(["y"]);
  });

  it("should generate scope key correctly and not allocate unnecessary scopes", () => {
    const code = `
    // starting in global scope ("")
    const a = 1
    // pushing scope for function parameters ("0")
    // pushing scope for function body ("0-0")
    function foo (param) {
      const b = 2
      // pushing scope for for loop variable declaration ("0-0-0")
      // pushing scope for for loop body ("0-0-0-0")
      for (let i = 0; i < 10; i++) {
        const c = 3

        // pushing scope for block statement ("0-0-0-0-0")
        try {
          const d = 4
        }
        // in for loop body scope ("0-0-0-0")
        // pushing scope for catch clause param ("0-0-0-0-1")
        // pushing scope for block statement ("0-0-0-0-1-0")
        catch (e) {
          const f = 4
        }

        // in for loop body scope ("0-0-0-0")

        const cc = 3
      }

      // in function body scope ("0-0")

      // pushing scope for for of loop variable declaration ("0-0-1")
      // pushing scope for for of loop body ("0-0-1-0")
      for (const i of [1, 2, 3]) {
        const dd = 3
      }

      // in function body scope ("0-0")

      // pushing scope for for in loop variable declaration ("0-0-2")
      // pushing scope for for in loop body ("0-0-2-0")
      for (const i in [1, 2, 3]) {
        const ddd = 3
      }

      // in function body scope ("0-0")

      // pushing scope for while loop body ("0-0-3")
      while (true) {
        const e = 3
      }
    }

    // in global scope ("")

    // pushing scope for function expression name ("1")
    // pushing scope for function parameters ("1-0")
    // pushing scope for function body ("1-0-0")
    const baz = function bar (param) {
      const g = 5

      // pushing scope for block statement ("1-0-0-0")
      if (true) {
        const h = 6
      }
    }

    // in global scope ("")

    // pushing scope for function expression name ("2")
    {
      const i = 7
      // pushing scope for block statement ("2-0")
      {
        const j = 8
      }
    }

    // in global scope ("")

    // pushing scope for arrow function parameters ("3")
    // pushing scope for arrow function body ("3-0")
    const arrow = (param) => {
      const k = 9
    }

    // in global scope ("")

    // pushing scope for class expression name ("4")
    const classExpression = class InternalClassName {
      classAttribute = 10
      // pushing scope for constructor function expression name ("4-0")
      // pushing scope for constructor parameters ("4-0-0")
      // pushing scope for constructor body ("4-0-0-0")
      constructor(constructorParam) {
        const l = 10
      }

      // in class body scope ("4")

      // pushing scope for static block ("4-1")
      static {
        const m = 11
      }
    }

    // in global scope ("")

    class NoScopePushedForThis {
      // pushing scope for constructor function expression name ("5")
      // pushing scope for constructor parameters ("5-0")
      // pushing scope for constructor body ("5-0-0")
      constructor() {
        const n = 12
      }
    }

    `;

    const scopeTracker = new TestScopeTracker({
      preserveExitedScopes: true,
    });

    // is in global scope initially
    expect(scopeTracker.getScopeIndexKey()).toBe("");

    parseAndWalk(code, filename, {
      scopeTracker,
    });

    // is in global scope after parsing
    expect(scopeTracker.getScopeIndexKey()).toBe("");

    // check that the scopes are correct
    const scopes = scopeTracker.getScopes();

    const expectedScopesInOrder = [
      "",
      "0",
      "0-0",
      "0-0-0",
      "0-0-0-0",
      "0-0-0-0-0",
      "0-0-0-0-1",
      "0-0-0-0-1-0",
      "0-0-1",
      "0-0-1-0",
      "0-0-2",
      "0-0-2-0",
      "0-0-3",
      "1",
      "1-0",
      "1-0-0",
      "1-0-0-0",
      "2",
      "2-0",
      "3",
      "3-0",
      "4",
      // '4-0', -> DO NOT UNCOMMENT - class constructor method definition doesn't provide a function expression id (scope doesn't have any identifiers)
      "4-0-0",
      "4-0-0-0",
      "4-1",
      // '5',   -> DO NOT UNCOMMENT - class constructor - same as above
      // '5-0', -> DO NOT UNCOMMENT - class constructor parameters (none in this case, so the scope isn't stored)
      "5-0-0",
    ];

    expect(scopes.size).toBe(expectedScopesInOrder.length);

    const scopeKeys = Array.from(scopes.keys());

    expect(scopeKeys).toEqual(expectedScopesInOrder);
  });

  it("should track variable declarations", () => {
    const code = `
    const a = 1
    let x, y = 2

    {
      let b = 2
    }
    `;

    const scopeTracker = new TestScopeTracker({
      preserveExitedScopes: true,
    });

    parseAndWalk(code, filename, {
      scopeTracker,
    });

    const scopes = scopeTracker.getScopes();

    const globalScope = scopes.get("");
    expect(globalScope?.get("a")?.type).toEqual("Variable");
    expect(globalScope?.get("b")).toBeUndefined();
    expect(globalScope?.get("x")?.type).toEqual("Variable");
    expect(globalScope?.get("y")?.type).toEqual("Variable");

    const blockScope = scopes.get("0");
    expect(blockScope?.get("b")?.type).toEqual("Variable");
    expect(blockScope?.get("a")).toBeUndefined();
    expect(blockScope?.get("x")).toBeUndefined();
    expect(blockScope?.get("y")).toBeUndefined();

    expect(scopeTracker.isDeclaredInScope("a", "")).toBe(true);
    expect(scopeTracker.isDeclaredInScope("a", "0")).toBe(true);
    expect(scopeTracker.isDeclaredInScope("y", "")).toBe(true);
    expect(scopeTracker.isDeclaredInScope("y", "0")).toBe(true);

    expect(scopeTracker.isDeclaredInScope("b", "")).toBe(false);
    expect(scopeTracker.isDeclaredInScope("b", "0")).toBe(true);
  });

  it("should separate variables in different scopes", () => {
    const code = `
    const a = 1

    {
      let a = 2
    }

    function foo (a) {
      // scope "1-0"
      let b = a
    }
    `;

    const scopeTracker = new TestScopeTracker({
      preserveExitedScopes: true,
    });

    parseAndWalk(code, filename, {
      scopeTracker,
    });

    const globalA = scopeTracker.getDeclarationFromScope("a", "");
    expect(globalA?.type).toEqual("Variable");
    expect(globalA?.type === "Variable" && globalA.variableNode.type).toEqual(
      "VariableDeclaration",
    );

    const blockA = scopeTracker.getDeclarationFromScope("a", "0");
    expect(blockA?.type).toEqual("Variable");
    expect(blockA?.type === "Variable" && blockA.variableNode.type).toEqual("VariableDeclaration");

    // check that the two `a` variables are different
    expect(globalA?.type === "Variable" && globalA.variableNode).not.toBe(
      blockA?.type === "Variable" && blockA.variableNode,
    );

    // check that the `a` in the function scope is a function param and not a variable
    const fooA = scopeTracker.getDeclarationFromScope("a", "1-0");
    expect(fooA?.type).toEqual("FunctionParam");
  });

  it("should handle patterns", () => {
    const code = `
    const { a, b: c } = { a: 1, b: 2 }
    const [d, [e]] = [3, [4]]
    const { f: { g } } = { f: { g: 5 } }

    function foo ({ h, i: j } = {}, [k, [l, m], ...rest]) {
    }

    try {} catch ({ message }) {}
    `;

    const scopeTracker = new TestScopeTracker({
      preserveExitedScopes: true,
    });

    parseAndWalk(code, filename, {
      scopeTracker,
    });

    const scopes = scopeTracker.getScopes();
    expect(scopes.size).toBe(3);

    const globalScope = scopes.get("");
    expect(globalScope?.size).toBe(6);

    expect(globalScope?.get("a")?.type).toEqual("Variable");
    expect(globalScope?.get("b")?.type).toBeUndefined();
    expect(globalScope?.get("c")?.type).toEqual("Variable");
    expect(globalScope?.get("d")?.type).toEqual("Variable");
    expect(globalScope?.get("e")?.type).toEqual("Variable");
    expect(globalScope?.get("f")?.type).toBeUndefined();
    expect(globalScope?.get("g")?.type).toEqual("Variable");
    expect(globalScope?.get("foo")?.type).toEqual("Function");

    const fooScope = scopes.get("0");
    expect(fooScope?.size).toBe(6);

    expect(fooScope?.get("h")?.type).toEqual("FunctionParam");
    expect(fooScope?.get("i")?.type).toBeUndefined();
    expect(fooScope?.get("j")?.type).toEqual("FunctionParam");
    expect(fooScope?.get("k")?.type).toEqual("FunctionParam");
    expect(fooScope?.get("l")?.type).toEqual("FunctionParam");
    expect(fooScope?.get("m")?.type).toEqual("FunctionParam");
    expect(fooScope?.get("rest")?.type).toEqual("FunctionParam");

    const catchScope = scopes.get("2");
    expect(catchScope?.size).toBe(1);
    expect(catchScope?.get("message")?.type).toEqual("CatchParam");

    expect(scopeTracker.isDeclaredInScope("a", "")).toBe(true);
    expect(scopeTracker.isDeclaredInScope("b", "")).toBe(false);
    expect(scopeTracker.isDeclaredInScope("c", "")).toBe(true);
    expect(scopeTracker.isDeclaredInScope("d", "")).toBe(true);
    expect(scopeTracker.isDeclaredInScope("e", "")).toBe(true);
    expect(scopeTracker.isDeclaredInScope("f", "")).toBe(false);
    expect(scopeTracker.isDeclaredInScope("g", "")).toBe(true);
    expect(scopeTracker.isDeclaredInScope("h", "0")).toBe(true);
    expect(scopeTracker.isDeclaredInScope("i", "0")).toBe(false);
    expect(scopeTracker.isDeclaredInScope("j", "0")).toBe(true);
    expect(scopeTracker.isDeclaredInScope("k", "0")).toBe(true);
    expect(scopeTracker.isDeclaredInScope("l", "0")).toBe(true);
    expect(scopeTracker.isDeclaredInScope("m", "0")).toBe(true);
    expect(scopeTracker.isDeclaredInScope("rest", "0")).toBe(true);
    expect(scopeTracker.isDeclaredInScope("message", "2")).toBe(true);
  });

  it("should handle loops", () => {
    const code = `
    for (let i = 0, getI = () => i; i < 3; i++) {
      console.log(getI());
    }

    let j = 0;
    for (; j < 3; j++) { }

    const obj = { a: 1, b: 2, c: 3 }
    for (const property in obj) { }

    const arr = ['a', 'b', 'c']
    for (const element of arr) { }
    `;

    const scopeTracker = new TestScopeTracker({
      preserveExitedScopes: true,
    });

    parseAndWalk(code, filename, {
      scopeTracker,
    });

    const scopes = scopeTracker.getScopes();
    expect(scopes.size).toBe(4);

    const globalScope = scopes.get("");
    expect(globalScope?.size).toBe(3);
    expect(globalScope?.get("j")?.type).toEqual("Variable");
    expect(globalScope?.get("obj")?.type).toEqual("Variable");
    expect(globalScope?.get("arr")?.type).toEqual("Variable");

    const forScope1 = scopes.get("0");
    expect(forScope1?.size).toBe(2);
    expect(forScope1?.get("i")?.type).toEqual("Variable");
    expect(forScope1?.get("getI")?.type).toEqual("Variable");

    const forScope2 = scopes.get("1");
    expect(forScope2).toBeUndefined();

    const forScope3 = scopes.get("2");
    expect(forScope3?.size).toBe(1);
    expect(forScope3?.get("property")?.type).toEqual("Variable");

    const forScope4 = scopes.get("3");
    expect(forScope4?.size).toBe(1);
    expect(forScope4?.get("element")?.type).toEqual("Variable");

    expect(scopeTracker.isDeclaredInScope("i", "")).toBe(false);
    expect(scopeTracker.isDeclaredInScope("getI", "")).toBe(false);
    expect(scopeTracker.isDeclaredInScope("i", "0-0")).toBe(true);
    expect(scopeTracker.isDeclaredInScope("getI", "0-0")).toBe(true);
    expect(scopeTracker.isDeclaredInScope("j", "")).toBe(true);
    expect(scopeTracker.isDeclaredInScope("j", "1-0")).toBe(true);
    expect(scopeTracker.isDeclaredInScope("property", "")).toBe(false);
    expect(scopeTracker.isDeclaredInScope("element", "")).toBe(false);
  });

  it("should handle imports", () => {
    const code = `
    import { a, b as c } from 'module-a'
    import d from 'module-b'
    `;

    const scopeTracker = new TestScopeTracker({
      preserveExitedScopes: true,
    });

    parseAndWalk(code, filename, {
      scopeTracker,
    });

    expect(scopeTracker.isDeclaredInScope("a", "")).toBe(true);
    expect(scopeTracker.isDeclaredInScope("b", "")).toBe(false);
    expect(scopeTracker.isDeclaredInScope("c", "")).toBe(true);
    expect(scopeTracker.isDeclaredInScope("d", "")).toBe(true);

    expect(scopeTracker.getScopes().get("")?.size).toBe(3);
  });

  it("should declare type-only imports in the type namespace only", () => {
    const code = `
    import type Foo from 'module-a'
    import type { Bar } from 'module-b'
    import type * as Ns from 'module-c'
    import { type Inline, value } from 'module-d'
    const marker = 1
    `;

    const scopeTracker = new ScopeTracker();
    let checked = false;

    parseAndWalk(code, filename, {
      scopeTracker,
      enter(node) {
        if (node.type === "Identifier" && node.name === "marker") {
          checked = true;
          for (const name of ["Foo", "Bar", "Ns", "Inline"]) {
            expect(scopeTracker.isDeclared(name, { mode: "type" })).toBe(true);
            expect(scopeTracker.isDeclared(name, { mode: "value" })).toBe(false);
          }

          expect(scopeTracker.isDeclared("value", { mode: "value" })).toBe(true);
          expect(scopeTracker.isDeclared("value", { mode: "type" })).toBe(true);
        }
      },
    });

    expect(checked).toBe(true);
  });

  it("should resolve identifiers used as switch case labels", () => {
    const code = `
    import { foo } from './foo'
    const bar = 1
    function baz() {}
    class Qux {}

    switch (input) {
      case foo:
        break
      case bar:
        break
      case baz:
        break
      case Qux:
        break
      case nope:
        break
    }
    `;

    const scopeTracker = new TestScopeTracker({
      preserveExitedScopes: true,
    });

    let processedCases = 0;

    parseAndWalk(code, filename, {
      scopeTracker,
      enter: (node) => {
        if (node.type !== "SwitchCase" || node.test?.type !== "Identifier") {
          return;
        }

        const declaration = scopeTracker.getDeclaration(node.test.name);
        switch (node.test.name) {
          case "foo":
            expect(declaration?.type).toEqual("Import");
            break;
          case "bar":
            expect(declaration?.type).toEqual("Variable");
            break;
          case "baz":
            expect(declaration?.type).toEqual("Function");
            break;
          case "Qux":
            expect(declaration?.type).toEqual("Identifier");
            break;
          case "nope":
            expect(declaration).toBeNull();
            break;
          default:
            assert.fail(`Unexpected switch case label: ${node.test.name}`);
        }

        processedCases++;
      },
    });

    expect(processedCases).toBe(5);
  });

  it("should handle classes", () => {
    const code = `
    // ""

    class Foo {
      someProperty = 1

      // "0" - function expression name
      // "0-0" - constructor parameters
      // "0-0-0" - constructor body
      constructor(param) {
        let a = 1
        this.b = 1
      }

      // "1" - method name
      // "1-0" - method parameters
      // "1-0-0" - method body
      someMethod(param) {
        let c = 1
      }

      // "2" - method name
      // "2-0" - method parameters
      // "2-0-0" - method body
      get d() {
        let e = 1
        return 1
      }
    }
    `;

    const scopeTracker = new TestScopeTracker({
      preserveExitedScopes: true,
    });

    parseAndWalk(code, filename, {
      scopeTracker,
    });

    const scopes = scopeTracker.getScopes();

    // only the scopes containing identifiers are stored
    const expectedScopes = ["", "0-0", "0-0-0", "1-0", "1-0-0", "2-0-0"];

    expect(scopes.size).toBe(expectedScopes.length);

    const scopeKeys = Array.from(scopes.keys());
    expect(scopeKeys).toEqual(expectedScopes);

    expect(scopeTracker.isDeclaredInScope("Foo", "")).toBe(true);

    // properties should be accessible through the class
    expect(scopeTracker.isDeclaredInScope("someProperty", "")).toBe(false);
    expect(scopeTracker.isDeclaredInScope("someProperty", "0")).toBe(false);

    expect(scopeTracker.isDeclaredInScope("a", "0-0-0")).toBe(true);
    expect(scopeTracker.isDeclaredInScope("b", "0-0-0")).toBe(false);

    // method definitions don't have names in function expressions, so it is not stored
    // they should be accessed through the class
    expect(scopeTracker.isDeclaredInScope("someMethod", "1")).toBe(false);
    expect(scopeTracker.isDeclaredInScope("someMethod", "1-0-0")).toBe(false);
    expect(scopeTracker.isDeclaredInScope("someMethod", "")).toBe(false);
    expect(scopeTracker.isDeclaredInScope("c", "1-0-0")).toBe(true);

    expect(scopeTracker.isDeclaredInScope("d", "2")).toBe(false);
    expect(scopeTracker.isDeclaredInScope("d", "2-0-0")).toBe(false);
    expect(scopeTracker.isDeclaredInScope("d", "")).toBe(false);
    expect(scopeTracker.isDeclaredInScope("e", "2-0-0")).toBe(true);
  });

  it("should track type declarations in the type namespace", () => {
    const code = `
    interface Foo {}
    type Alias = 1
    class Klass {}
    const value = 1
    `;

    const scopeTracker = new TestScopeTracker({
      preserveExitedScopes: true,
    });

    parseAndWalk(code, filename, {
      scopeTracker,
    });

    expect(scopeTracker.isDeclaredInScope("Foo", "")).toBe(false);
    expect(scopeTracker.isDeclaredInScope("Foo", "", { mode: "type" })).toBe(true);

    expect(scopeTracker.isDeclaredInScope("Alias", "")).toBe(false);
    expect(scopeTracker.isDeclaredInScope("Alias", "", { mode: "type" })).toBe(true);

    expect(scopeTracker.isDeclaredInScope("Klass", "")).toBe(true);
    expect(scopeTracker.isDeclaredInScope("Klass", "", { mode: "type" })).toBe(true);

    expect(scopeTracker.isDeclaredInScope("value", "")).toBe(true);
    expect(scopeTracker.isDeclaredInScope("value", "", { mode: "type" })).toBe(false);
    expect(scopeTracker.isDeclaredInScope("value", "", { mode: "all" })).toBe(true);
  });

  it("should freeze scopes", () => {
    let code = `
    const a = 1
    {
      const b = 2
    }
    `;

    const scopeTracker = new TestScopeTracker({
      preserveExitedScopes: true,
    });

    parseAndWalk(code, filename, {
      scopeTracker,
    });

    expect(scopeTracker.getScopes().size).toBe(2);

    code =
      `${code}\n` +
      `
      {
        const c = 3
      }
    `;

    parseAndWalk(code, filename, {
      scopeTracker,
    });

    expect(scopeTracker.getScopes().size).toBe(3);

    scopeTracker.freeze();

    code =
      `${code}\n` +
      `
      {
        const d = 4
      }
    `;

    parseAndWalk(code, filename, {
      scopeTracker,
    });

    expect(scopeTracker.getScopes().size).toBe(3);

    expect(scopeTracker.isDeclaredInScope("a", "")).toBe(true);
    expect(scopeTracker.isDeclaredInScope("b", "0")).toBe(true);
    expect(scopeTracker.isDeclaredInScope("c", "1")).toBe(true);
    expect(scopeTracker.isDeclaredInScope("d", "2")).toBe(false);
  });

  it("should work with skipping", () => {
    const code = `
    import { onMounted } from '#imports'

    onMounted(() => console.log('treeshake this'))

    function foo() {
      onMounted()

      function onMounted() {
        console.log('do not treeshake this')
      }
    }
    `;

    const scopeTracker = new TestScopeTracker({
      preserveExitedScopes: true,
    });

    const { program } = parseAndWalk(code, filename, { scopeTracker });

    scopeTracker.freeze();

    const walkedNodes: string[] = [];

    walk(program, {
      scopeTracker,
      enter(node) {
        if (
          node.type === "CallExpression" &&
          node.callee.type === "Identifier" &&
          node.callee.name === "onMounted"
        ) {
          this.skip();
          const declaration = scopeTracker.getDeclaration(node.callee.name);
          walkedNodes.push(`${node.callee.name} -> ${declaration?.type || "not found"}`);
          return;
        }

        walkedNodes.push(`enter:${getNodeString(node)}`);
      },
      leave(node) {
        walkedNodes.push(`leave:${getNodeString(node)}`);
      },
    });

    expect(walkedNodes).toMatchInlineSnapshot(`
      [
        "enter:Program",
        "enter:ImportDeclaration",
        "enter:ImportSpecifier",
        "enter:Identifier:onMounted",
        "leave:Identifier:onMounted",
        "enter:Identifier:onMounted",
        "leave:Identifier:onMounted",
        "leave:ImportSpecifier",
        "enter:Literal:#imports",
        "leave:Literal:#imports",
        "leave:ImportDeclaration",
        "enter:ExpressionStatement",
        "onMounted -> Import",
        "leave:CallExpression",
        "leave:ExpressionStatement",
        "enter:FunctionDeclaration:async=false",
        "enter:Identifier:foo",
        "leave:Identifier:foo",
        "enter:BlockStatement",
        "enter:ExpressionStatement",
        "onMounted -> Function",
        "leave:CallExpression",
        "leave:ExpressionStatement",
        "enter:FunctionDeclaration:async=false",
        "enter:Identifier:onMounted",
        "leave:Identifier:onMounted",
        "enter:BlockStatement",
        "enter:ExpressionStatement",
        "enter:CallExpression",
        "enter:MemberExpression",
        "enter:Identifier:console",
        "leave:Identifier:console",
        "enter:Identifier:log",
        "leave:Identifier:log",
        "leave:MemberExpression",
        "enter:Literal:do not treeshake this",
        "leave:Literal:do not treeshake this",
        "leave:CallExpression",
        "leave:ExpressionStatement",
        "leave:BlockStatement",
        "leave:FunctionDeclaration:async=false",
        "leave:BlockStatement",
        "leave:FunctionDeclaration:async=false",
        "leave:Program",
      ]
    `);
  });

  it("should report the current scope and its relation to parent scopes", () => {
    const code = `
    const a = 1
    function foo() {
      const b = 2
    }
    `;

    const scopeTracker = new TestScopeTracker();
    const observed: Array<[string, boolean, boolean]> = [];

    parseAndWalk(code, filename, {
      scopeTracker,
      enter(node) {
        if (node.type === "VariableDeclaration") {
          observed.push([
            scopeTracker.getCurrentScope(),
            scopeTracker.isCurrentScopeUnder("0"),
            scopeTracker.isCurrentScopeUnder("0-0"),
          ]);
        }
      },
    });

    expect(observed).toEqual([
      ["", false, false],
      ["0-0", true, false],
    ]);
  });

  it("should not treat sibling scopes with a shared digit prefix as nested", () => {
    // 11 sibling blocks produce the scope keys '0' through '10'
    // scope '10' shares the string prefix '1' with scope '1' but is its sibling, not its child
    const blocks = Array.from({ length: 10 }, (_, i) => `{ const x${i} = ${i} }`).join("\n");
    const code = `
    ${blocks}
    {
      const x10 = 10
      {
        const y = 11
      }
    }
    `;

    const scopeTracker = new ScopeTracker();
    let checked = false;

    parseAndWalk(code, filename, {
      scopeTracker,
      enter(node) {
        if (node.type === "Identifier" && node.name === "y") {
          checked = true;
          expect(scopeTracker.getCurrentScope()).toBe("10-0");
          expect(scopeTracker.isCurrentScopeUnder("")).toBe(true);
          expect(scopeTracker.isCurrentScopeUnder("10")).toBe(true);
          expect(scopeTracker.isCurrentScopeUnder("1")).toBe(false);

          const declaration = scopeTracker.getDeclaration("x10");
          assert(declaration);
          expect(declaration.isUnderScope("")).toBe(true);
          expect(declaration.isUnderScope("1")).toBe(false);
        }
      },
    });

    expect(checked).toBe(true);
  });

  it("should provide the position of the whole relevant node for declarations", () => {
    const code = `import { imp } from 'mod'
const a = 1
function foo(param) {}
try {} catch (err) {}
class Klass {}
`;

    const scopeTracker = new TestScopeTracker({ preserveExitedScopes: true });

    parseAndWalk(code, filename, { scopeTracker });

    const imp = scopeTracker.getDeclarationFromScope("imp", "");
    assert(imp instanceof ScopeTrackerImport);
    expect(imp.start).toBe(0);
    expect(imp.end).toBe(code.indexOf("'mod'") + "'mod'".length);

    const a = scopeTracker.getDeclarationFromScope("a", "");
    assert(a instanceof ScopeTrackerVariable);
    expect(a.start).toBe(code.indexOf("const a"));
    expect(a.end).toBe(code.indexOf("const a") + "const a = 1".length);

    const foo = scopeTracker.getDeclarationFromScope("foo", "");
    assert(foo instanceof ScopeTrackerFunction);
    expect(foo.start).toBe(code.indexOf("function foo"));
    expect(foo.end).toBe(code.indexOf("function foo") + "function foo(param) {}".length);

    const param = scopeTracker.getDeclarationFromScope("param", "0");
    assert(param instanceof ScopeTrackerFunctionParam);
    expect(param.start).toBe(foo.start);
    expect(param.end).toBe(foo.end);

    const err = scopeTracker.getDeclarationFromScope("err", "2");
    assert(err instanceof ScopeTrackerCatchParam);
    expect(err.start).toBe(code.indexOf("catch"));
    expect(err.end).toBe(code.indexOf("catch") + "catch (err) {}".length);

    const klass = scopeTracker.getDeclarationFromScope("Klass", "");
    assert(klass instanceof ScopeTrackerIdentifier);
    expect(klass.start).toBe(code.indexOf("Klass"));
    expect(klass.end).toBe(code.indexOf("Klass") + "Klass".length);
  });

  it("should track declarations introduced by replacement nodes", () => {
    const { program } = parseAndWalk("let replaced = 1", filename, {});
    const replacement = program.body[0];
    assert(replacement);

    const code = `
    let original = 1
    original
    `;

    const scopeTracker = new ScopeTracker();
    let referenceCount = 0;

    parseAndWalk(code, filename, {
      scopeTracker,
      enter(node) {
        if (node.type === "VariableDeclaration") {
          this.replace(replacement);
        }
        if (node.type === "Identifier" && node.name === "original") {
          referenceCount++;
          expect(scopeTracker.isDeclared("replaced")).toBe(true);
        }
      },
    });

    // the walker walks the replacement's children instead of the original declaration,
    // so the only `original` identifier left is the standalone reference
    expect(referenceCount).toBe(1);
  });
});

describe("parsing", () => {
  it("should correctly get identifiers not declared in a function", () => {
    const functionParams = `(param, { param1, temp: param2 } = {}, [param3, [param4]], ...rest)`;
    const functionBody = `{
      const c = 1, d = 2
      console.log(undeclaredIdentifier1, foo)
      const obj = {
        key1: param,
        key2: undeclaredIdentifier1,
        undeclaredIdentifier2: undeclaredIdentifier2,
        undeclaredIdentifier3,
        undeclaredIdentifier4,
      }
      nonExistentFunction()

      console.log(a, b, c, d, param, param1, param2, param3, param4, param['test']['key'], rest)
      console.log(param3[0].access['someKey'], obj, obj.key1, obj.key2, obj.undeclaredIdentifier2, obj.undeclaredIdentifier3)

      try {} catch (error) { console.log(error) }

      class Foo { constructor() { console.log(Foo) } }
      const cls = class Bar { constructor() { console.log(Bar, cls) } }
      const cls2 = class Baz {
        someProperty = someValue
        someMethod() { }
      }
      console.log(Baz)

      function f() {
        console.log(hoisted, nonHoisted)
      }
      let hoisted = 1
      f()
    }`;

    const code = `
    import { a } from 'module-a'
    const b = 1

    // "0"
    function foo ${functionParams} ${functionBody}

    // "1"
    const f = ${functionParams} => ${functionBody}

    // "2-0"
    const bar = function ${functionParams} ${functionBody}

    // "3-0"
    const baz = function foo ${functionParams} ${functionBody}

    // "4"
    function emptyParams() {
      console.log(param)
    }
    `;

    const scopeTracker = new TestScopeTracker({
      preserveExitedScopes: true,
    });

    let processedFunctions = 0;

    parseAndWalk(code, filename, {
      scopeTracker,
      enter: (node) => {
        const currentScope = scopeTracker.getScopeIndexKey();
        if (
          (node.type !== "FunctionDeclaration" &&
            node.type !== "FunctionExpression" &&
            node.type !== "ArrowFunctionExpression") ||
          !["0", "1", "2-0", "3-0", "4"].includes(currentScope)
        ) {
          return;
        }

        const undeclaredIdentifiers = getUndeclaredIdentifiersInFunction(node);
        expect(undeclaredIdentifiers).toEqual(
          currentScope === "4"
            ? ["console", "param"]
            : [
                "console",
                "undeclaredIdentifier1",
                ...(node.type === "ArrowFunctionExpression" ||
                (node.type === "FunctionExpression" && !node.id)
                  ? ["foo"]
                  : []),
                "undeclaredIdentifier2",
                "undeclaredIdentifier3",
                "undeclaredIdentifier4",
                "nonExistentFunction",
                "a", // import is outside the scope of the function
                "b", // variable is outside the scope of the function
                "someValue",
                "Baz",
                "nonHoisted",
              ],
        );

        processedFunctions++;
      },
    });

    expect(processedFunctions).toBe(5);
  });

  it("should correctly compare identifiers defined in different scopes", () => {
    const code = `
      // ""
      const a = 1

      // ""
      const func = () => {
        // "0-0"
        const b = 2

        // "0-0"
        function foo() {
          // "0-0-0-0"
          const c = 3
        }
      }

      // ""
      const func2 = () => {
        // "1-0"
        const d = 2

        // "1-0"
        function bar() {
          // "1-0-0-0"
          const e = 3
        }
      }

      // ""
      const f = 4
    `;

    const scopeTracker = new TestScopeTracker({
      preserveExitedScopes: true,
    });

    parseAndWalk(code, filename, {
      scopeTracker,
    });

    const a = scopeTracker.getDeclarationFromScope("a", "");
    const func = scopeTracker.getDeclarationFromScope("func", "");
    const foo = scopeTracker.getDeclarationFromScope("foo", "0-0");
    const b = scopeTracker.getDeclarationFromScope("b", "0-0");
    const c = scopeTracker.getDeclarationFromScope("c", "0-0-0-0");
    const func2 = scopeTracker.getDeclarationFromScope("func2", "");
    const bar = scopeTracker.getDeclarationFromScope("bar", "1-0");
    const d = scopeTracker.getDeclarationFromScope("d", "1-0");
    const e = scopeTracker.getDeclarationFromScope("e", "1-0-0-0");
    const f = scopeTracker.getDeclarationFromScope("f", "");

    assert(
      a && func && foo && b && c && func2 && bar && d && e && f,
      "All declarations should be found",
    );

    // identifiers in the same scope should be equal
    expect(f.isUnderScope(a.scope)).toBe(false);
    expect(func.isUnderScope(a.scope)).toBe(false);
    expect(d.isUnderScope(bar.scope)).toBe(false);

    // identifiers in deeper scopes should be under the scope of the parent scope
    expect(b.isUnderScope(a.scope)).toBe(true);
    expect(b.isUnderScope(func.scope)).toBe(true);
    expect(c.isUnderScope(a.scope)).toBe(true);
    expect(c.isUnderScope(b.scope)).toBe(true);
    expect(d.isUnderScope(a.scope)).toBe(true);
    expect(d.isUnderScope(func2.scope)).toBe(true);
    expect(e.isUnderScope(a.scope)).toBe(true);
    expect(e.isUnderScope(d.scope)).toBe(true);

    // identifiers in parent scope should not be under the scope of the children
    expect(a.isUnderScope(b.scope)).toBe(false);
    expect(a.isUnderScope(c.scope)).toBe(false);
    expect(a.isUnderScope(d.scope)).toBe(false);
    expect(a.isUnderScope(e.scope)).toBe(false);
    expect(b.isUnderScope(c.scope)).toBe(false);

    // identifiers in parallel scopes should not influence each other
    expect(d.isUnderScope(b.scope)).toBe(false);
    expect(e.isUnderScope(b.scope)).toBe(false);
    expect(b.isUnderScope(d.scope)).toBe(false);
    expect(c.isUnderScope(e.scope)).toBe(false);
  });

  it("should treat identifiers in switch case tests as references", () => {
    const code = `
    function handle(input) {
      const foo = 1

      switch (input) {
        case foo:
          return 1
        case bar:
          return 2
        default:
          return 0
      }
    }
    `;

    let processedFunctions = 0;

    parseAndWalk(code, filename, {
      enter: (node) => {
        if (node.type !== "FunctionDeclaration") {
          return;
        }

        // `input` and `foo` are declared within the function,
        // while `bar` is a reference to an identifier outside of it
        expect(getUndeclaredIdentifiersInFunction(node)).toEqual(["bar"]);

        processedFunctions++;
      },
    });

    expect(processedFunctions).toBe(1);
  });
});

describe("reference identifiers", () => {
  function getUnmatchedIdentifiers(
    code: string,
    sourceFilename = filename,
    options?: IsReferenceIdentifierOptions,
  ): string[] {
    const scopeTracker = new ScopeTracker({ preserveExitedScopes: true });

    // first pass to collect all declarations and hoist them
    parseAndWalk(code, sourceFilename, { scopeTracker });
    scopeTracker.freeze();

    const modes =
      options?.mode === "all"
        ? (["value", "type"] as const)
        : ([options?.mode ?? "value"] as const);

    const unmatched = new Set<string>();
    parseAndWalk(code, sourceFilename, {
      scopeTracker,
      enter(node, parent) {
        // re-export specifiers refer to the other module's exports
        if (node.type === "ExportNamedDeclaration" && node.source) {
          this.skip();
          return;
        }

        if (node.type !== "Identifier" && node.type !== "JSXIdentifier") {
          return;
        }

        for (const mode of modes) {
          if (
            isReferenceIdentifier(node, parent, { mode }) &&
            !scopeTracker.isDeclared(node.name, { mode })
          ) {
            unmatched.add(node.name);
          }
        }
      },
    });

    return [...unmatched].sort();
  }

  it("should detect references in statements", () => {
    const code = `
    switch (input) {
      case ref1:
        break
    }

    function fn1() {
      return ref2
    }
    function fn2() {
      throw ref3
    }
    function fn3(p1 = ref4) {
      return p1
    }

    for (const i of ref5) {}
    for (const i in ref6) {}

    export default ref7

    const [d1 = ref8] = []
    const { d2 = ref9 } = {}
    `;

    expect(getUnmatchedIdentifiers(code)).toEqual([
      "input",
      "ref1",
      "ref2",
      "ref3",
      "ref4",
      "ref5",
      "ref6",
      "ref7",
      "ref8",
      "ref9",
    ]);
  });

  it("should not report identifiers declared via patterns and params", () => {
    const code = `
    const [a1 = 1] = []
    const { a2 = 1, ...a3 } = {}
    try {} catch (e1) { e1() }
    function fn1({ p1 }, [p2], p3 = 1, ...p4) {
      p1(); p2(); p3(); p4()
    }
    const fn2 = ({ p5 }) => p5()
    a1(); a2(); a3()
    `;

    expect(getUnmatchedIdentifiers(code)).toEqual([]);
  });

  it("should not leak params and catch bindings to the enclosing scope", () => {
    const code = `
    const fn1 = ({ p1 }) => p1()
    function fn2(p2) { p2() }
    try {} catch ({ e1 }) { e1() }
    p1(); p2(); e1()
    `;

    expect(getUnmatchedIdentifiers(code)).toEqual(["e1", "p1", "p2"]);
  });

  it("should scope declarations in switch cases to the switch body", () => {
    const code = `
    const input = 1
    switch (input) {
      case 1:
        let leaked = 1
        break
      default:
        leaked = 2
    }
    const after = leaked
    `;

    expect(getUnmatchedIdentifiers(code)).toEqual(["leaked"]);
  });

  it("should resolve references to imports", () => {
    const code = `
    import { Bar } from 'foobar'
    function foo(mode) {
      switch (mode) {
        case Foo:
          return Bar
      }
    }
    `;

    expect(getUnmatchedIdentifiers(code)).toEqual(["Foo"]);
  });

  it("should detect references in computed member expressions", () => {
    const code = `
    obj[ref1]
    `;

    expect(getUnmatchedIdentifiers(code)).toEqual(["obj", "ref1"]);
  });

  it("should detect references in computed keys", () => {
    const code = `
    const obj = { [ref1]: 1 }
    class C1 {
      [ref2] = ref3;
      [ref4]() {}
    }
    `;

    expect(getUnmatchedIdentifiers(code)).toEqual(["ref1", "ref2", "ref3", "ref4"]);
  });

  it("should not report re-export specifiers as references", () => {
    const code = `
    export { ref1 } from './one'
    export { ref2 as ref3 } from './two'
    export * as ref4 from './three'
    `;

    expect(getUnmatchedIdentifiers(code)).toEqual([]);
  });

  it("should detect renamed imports", () => {
    const code = `
    import { a as b } from 'x'
    b()
    `;

    expect(getUnmatchedIdentifiers(code)).toEqual([]);
  });

  it("should not report statement labels as references", () => {
    const code = `
    outer: for (const i of list) {
      if (i) break outer
      continue outer
    }
    `;

    expect(getUnmatchedIdentifiers(code)).toEqual(["list"]);
  });

  it("should not report type-only identifiers as references", () => {
    const code = `
    const x: SomeType = load<OtherType>()
    interface Foo { bar: Baz }
    `;

    expect(getUnmatchedIdentifiers(code)).toEqual(["load"]);
  });

  it("should detect references in expression positions", () => {
    const code = `
    const obj = { foo }
    class A extends Base {}
    typeof ref1
    const sum = ref2 + ref3
    const pick = cond ? ref4 : ref5
    const arr = [...ref6]
    const fn = async () => await ref7
    const tpl = tag\`\${ref8}\`
    const inst = new Ctor()
    `;

    expect(getUnmatchedIdentifiers(code)).toEqual([
      "Base",
      "Ctor",
      "cond",
      "foo",
      "ref1",
      "ref2",
      "ref3",
      "ref4",
      "ref5",
      "ref6",
      "ref7",
      "ref8",
      "tag",
    ]);
  });

  it("should detect references in assignment targets", () => {
    const code = `
    ref1 = 1
    ref2++
    ;({ a: ref3 } = obj)
    ;[ref4] = arr
    `;

    expect(getUnmatchedIdentifiers(code)).toEqual(["arr", "obj", "ref1", "ref2", "ref3", "ref4"]);
  });

  it("should not report non-computed keys and members as references", () => {
    const code = `
    obj.prop
    const x = { key: 1 }
    class C {
      method() {}
      get accessor() { return 1 }
    }
    `;

    expect(getUnmatchedIdentifiers(code)).toEqual(["obj"]);
  });

  it("should report export specifiers without a source as references", () => {
    const code = `
    const foo = 1
    export { foo, bar }
    `;

    expect(getUnmatchedIdentifiers(code)).toEqual(["bar"]);
  });

  it("should detect references in computed pattern keys", () => {
    const code = `
    const { [key]: value } = obj
    `;

    expect(getUnmatchedIdentifiers(code)).toEqual(["key", "obj"]);
  });

  it("should resolve references to hoisted declarations", () => {
    const code = `
    foo()
    bar
    function foo() {}
    var bar = 1
    `;

    expect(getUnmatchedIdentifiers(code)).toEqual([]);
  });

  it("should detect references in JSX", () => {
    const code = `
    const el = <Foo prop={bar}>{baz}</Foo>
    `;

    expect(getUnmatchedIdentifiers(code, "test.tsx")).toEqual(["Foo", "bar", "baz"]);
  });

  it("should not report meta properties as references", () => {
    const code = `
    const url = import.meta.url
    function f() { return new.target }
    `;

    expect(getUnmatchedIdentifiers(code)).toEqual([]);
  });

  it("should not report import attribute keys as references", () => {
    const code = `
    import data from './data.json' with { type: 'json' }
    data
    `;

    expect(getUnmatchedIdentifiers(code)).toEqual([]);
  });

  it("should declare enums and not report their members as references", () => {
    const code = `
    enum E { A, B }
    const x = E.A
    `;

    expect(getUnmatchedIdentifiers(code)).toEqual([]);
  });

  it("should declare namespaces and not report their names as references", () => {
    const code = `
    namespace NS { export const a = 1 }
    NS.a
    `;

    expect(getUnmatchedIdentifiers(code)).toEqual([]);
  });

  it("should not report index signature parameters as references", () => {
    const code = `
    interface I { [key: string]: number }
    `;

    expect(getUnmatchedIdentifiers(code)).toEqual([]);
  });

  it("should declare function overloads and declare functions", () => {
    const code = `
    declare function foo(a: number): void
    function bar(b: string): void
    function bar(b) { return b }
    foo(bar)
    `;

    expect(getUnmatchedIdentifiers(code)).toEqual([]);
  });

  it("should declare constructor parameter properties", () => {
    const code = `
    class C {
      constructor(private x: number, public y: string) {
        x; y
      }
    }
    `;

    expect(getUnmatchedIdentifiers(code)).toEqual([]);
  });

  it("should not report type-only heritage clauses as references", () => {
    const code = `
    class A implements I {}
    interface B extends C {}
    `;

    expect(getUnmatchedIdentifiers(code)).toEqual([]);
  });

  it("should not report accessor property keys as references", () => {
    const code = `
    class C {
      accessor foo = bar;
      accessor [baz] = 1;
    }
    `;

    expect(getUnmatchedIdentifiers(code)).toEqual(["bar", "baz"]);
  });

  it("should not report function type parameter names as references", () => {
    const code = `
    type Fn = (param1: string, param2?: number) => void
    interface I {
      (param3: string): void
      new (param4: string): unknown
      method(param5: string): void
    }
    const ctor: new (param6: string) => unknown = class {}
    `;

    expect(getUnmatchedIdentifiers(code)).toEqual([]);
  });

  it("should not report abstract class members as references", () => {
    const code = `
    abstract class C1 {
      abstract prop: string
      abstract method(param1: string): void
      abstract get getter(): number
      abstract accessor accessor1: number
      abstract [ref1]: string
    }
    declare class C2 {
      method(param2: string): void
    }
    class C3 {
      overloaded(param3: string): void
      overloaded(param3) { return param3 }
    }
    `;

    expect(getUnmatchedIdentifiers(code)).toEqual(["ref1"]);
  });

  it("should declare import equals bindings", () => {
    const code = `
    import A = require('mod')
    A
    `;

    expect(getUnmatchedIdentifiers(code)).toEqual([]);
  });

  it("should resolve enum member references in initializers", () => {
    expect(getUnmatchedIdentifiers(`enum E { A, B = A }`)).toEqual([]);
    expect(getUnmatchedIdentifiers(`enum E { A }\nA`)).toEqual(["A"]);
  });

  it("should not declare the global identifier from declare global", () => {
    const code = `
    declare global { interface Window {} }
    global
    `;

    expect(getUnmatchedIdentifiers(code)).toEqual(["global"]);
  });

  it("should report type-only references depending on the mode", () => {
    const code = `
    const x: SomeType = load<OtherType>()
    class A implements I {}
    interface B extends C {}
    type T = NS.Inner
    type Q = typeof runtimeValue
    `;

    expect(getUnmatchedIdentifiers(code)).toEqual(["load", "runtimeValue"]);
    expect(getUnmatchedIdentifiers(code, filename, { mode: "type" })).toEqual([
      "C",
      "I",
      "NS",
      "OtherType",
      "SomeType",
    ]);
    expect(getUnmatchedIdentifiers(code, filename, { mode: "all" })).toEqual([
      "C",
      "I",
      "NS",
      "OtherType",
      "SomeType",
      "load",
      "runtimeValue",
    ]);
  });

  it("should resolve type references to local type declarations", () => {
    const code = `
    interface Foo {}
    type Bar<T> = T | Foo
    class Klass {}
    const x: Foo = new Klass()
    const y: Unknown = 1
    console.log(Foo)
    `;

    expect(getUnmatchedIdentifiers(code)).toEqual(["Foo", "console"]);
    expect(getUnmatchedIdentifiers(code, filename, { mode: "type" })).toEqual(["Unknown"]);
    expect(getUnmatchedIdentifiers(code, filename, { mode: "all" })).toEqual([
      "Foo",
      "Unknown",
      "console",
    ]);
  });

  it("should handle unnamed declarations and non-identifier module names", () => {
    expect(getUnmatchedIdentifiers(`export default function () { ref1 }`)).toEqual(["ref1"]);
    expect(getUnmatchedIdentifiers(`export default class {}`)).toEqual([]);
    expect(
      getUnmatchedIdentifiers(`const A = class {}\nconst B = class Named { m() { Named } }`),
    ).toEqual([]);
    expect(getUnmatchedIdentifiers(`declare module "mod" {}`)).toEqual([]);
    expect(getUnmatchedIdentifiers(`try {} catch { ref2 }`)).toEqual(["ref2"]);
    expect(getUnmatchedIdentifiers(`const [, ...rest] = arr`)).toEqual(["arr"]);
    expect(getUnmatchedIdentifiers(`enum E { "str" = 1 }`)).toEqual([]);
    expect(
      getUnmatchedIdentifiers(`export default function (): void;\nexport default function () {}`),
    ).toEqual([]);
  });

  it("should declare mapped type keys and not report them as references", () => {
    const code = `
    type X = { [K in keyof Y]: K }
    `;

    expect(getUnmatchedIdentifiers(code)).toEqual([]);
    expect(getUnmatchedIdentifiers(code, filename, { mode: "type" })).toEqual(["Y"]);
  });

  it("should not leak type parameters out of their declarations", () => {
    const code = `
    class Foo<T> {
      method(value: T): T { return value }
    }
    declare function df<U>(x: U): U
    interface Bar<V> { prop: V }
    const marker = 1
    `;

    expect(getUnmatchedIdentifiers(code, filename, { mode: "all" })).toEqual([]);

    const scopeTracker = new ScopeTracker();
    parseAndWalk(code, filename, {
      scopeTracker,
      enter(node) {
        if (node.type === "VariableDeclaration") {
          for (const name of ["T", "U", "V"]) {
            expect(scopeTracker.isDeclared(name, { mode: "all" })).toBe(false);
          }
        }
      },
    });
  });

  it("should not leak type parameters of signatures to sibling members", () => {
    const code = `
    interface Props {
      transform<U>(value: U): U
      fallback: U
    }
    type Obj = {
      method<M>(value: M): M
      prop: M
    }
    type FnPair = [<F>(value: F) => F, F]
    type CtorPair = [new <C>(value: C) => C, C]
    interface WithCall {
      <S>(value: S): S
      also: S
    }
    `;

    expect(getUnmatchedIdentifiers(code, filename, { mode: "type" })).toEqual([
      "C",
      "F",
      "M",
      "S",
      "U",
    ]);
  });

  it("should detect references in JSX member expressions", () => {
    expect(getUnmatchedIdentifiers(`const el = <Foo.Bar.baz />`, "test.tsx")).toEqual(["Foo"]);
    expect(getUnmatchedIdentifiers(`const el = <foo.bar />`, "test.tsx")).toEqual(["foo"]);
  });

  it("should not report JSX identifiers as type references", () => {
    const code = `const el = <Foo prop={bar}>{baz}</Foo>`;

    expect(getUnmatchedIdentifiers(code, "test.tsx", { mode: "type" })).toEqual([]);
  });

  function collectNodes(code: string, sourceFilename = filename): Node[] {
    const nodes: Node[] = [];
    parseAndWalk(code, sourceFilename, {
      enter(node) {
        nodes.push(node);
      },
    });
    return nodes;
  }

  it("should not consider detached nodes to be bindings or references", () => {
    const identifier = collectNodes("foo").find((n) => n.type === "Identifier");
    assert(identifier);

    expect(isOnlyBindingIdentifier(identifier, null)).toBe(false);
    expect(isBindingIdentifier(identifier, null)).toBe(false);
    expect(isReferenceIdentifier(identifier, null)).toBe(false);
  });

  it("should match identifiers nested in function parameter patterns", () => {
    const nodes = collectNodes(
      `function fn([a = 1, , ...rest], { b: renamed, ...others }, ...variadic) { fn() }`,
    );
    const fn = nodes.find((n) => n.type === "FunctionDeclaration");
    assert(fn);
    const identifier = (name: string) => {
      const node = nodes.find((n) => n.type === "Identifier" && n.name === name);
      assert(node);
      return node;
    };

    expect(isOnlyBindingIdentifier(identifier("a"), fn)).toBe(true);
    expect(isOnlyBindingIdentifier(identifier("rest"), fn)).toBe(true);
    expect(isOnlyBindingIdentifier(identifier("renamed"), fn)).toBe(true);
    expect(isOnlyBindingIdentifier(identifier("others"), fn)).toBe(true);
    expect(isOnlyBindingIdentifier(identifier("variadic"), fn)).toBe(true);
    // property keys are not bindings of the function
    expect(isOnlyBindingIdentifier(identifier("b"), fn)).toBe(false);
  });

  it("should treat constructor parameter properties as bindings of the constructor", () => {
    const nodes = collectNodes(`class A { constructor(private p = 1) {} }`);
    const constructorFn = nodes.find((n) => n.type === "FunctionExpression");
    const parameter = nodes.find((n) => n.type === "Identifier" && n.name === "p");
    assert(constructorFn && parameter);

    expect(isOnlyBindingIdentifier(parameter, constructorFn)).toBe(true);
  });

  // @todo: remove in v2
  it("should preserve the legacy behavior of the deprecated isBindingIdentifier", () => {
    const identifiers = new Map<string, { node: Node; parent: Node | null }>();
    parseAndWalk(
      `
      import def, { imp as alias } from 'x'
      import * as ns from 'y'
      enum E {}
      namespace N {}
      function fn(a) { obj.prop; ({ key: 1, short }); class C { method() {} field = 2 } }
      `,
      filename,
      {
        enter(node, parent) {
          if (node.type === "Identifier") {
            identifiers.set(node.name, { node, parent });
          }
        },
      },
    );
    const byName = (name: string) => {
      const entry = identifiers.get(name);
      assert(entry);
      return entry;
    };

    // binding positions behave the same in both implementations,
    // including the ones added after the deprecation (imports, enums, namespaces, ...)
    for (const name of ["fn", "a", "C", "def", "alias", "ns", "E", "N"]) {
      const { node, parent } = byName(name);
      expect(isBindingIdentifier(node, parent)).toBe(true);
      expect(isOnlyBindingIdentifier(node, parent)).toBe(true);
    }

    // the imported name of `import { imp as alias }` is not a binding
    const imported = byName("imp");
    expect(isBindingIdentifier(imported.node, imported.parent)).toBe(false);
    expect(isOnlyBindingIdentifier(imported.node, imported.parent)).toBe(false);

    // non-reference positions the legacy implementation also reports as bindings
    for (const name of ["prop", "key", "method", "field"]) {
      const { node, parent } = byName(name);
      expect(isBindingIdentifier(node, parent)).toBe(true);
      expect(isOnlyBindingIdentifier(node, parent)).toBe(false);
    }

    // shorthand property values are references in both
    const short = byName("short");
    expect(isBindingIdentifier(short.node, short.parent)).toBe(false);
    expect(isOnlyBindingIdentifier(short.node, short.parent)).toBe(false);
  });

  it("should not report JSX identifiers in non-JSX positions", () => {
    const nodes = collectNodes(`const el = <div />`, "test.tsx");
    const jsxIdentifier = nodes.find((n) => n.type === "JSXIdentifier");
    const program = nodes.find((n) => n.type === "Program");
    assert(jsxIdentifier && program);

    expect(isReferenceIdentifier(jsxIdentifier, program)).toBe(false);
  });
});

describe("optimized scope tracking without callbacks", () => {
  it("should produce identical scope data to a walk with a no-op callback", () => {
    const code = `
    import { imported } from "module"
    const topLevel = 1
    const [, holey = imported, ...restOfIt] = [, 2]
    function outer(param, { destructured, nested: [inArray] }) {
      const inner = param + topLevel
      try {
        inner.toString()
      }
      catch (err) {
        err.toString()
      }
      for (const item of []) {
        item.toString()
      }
      return function named() { return inner }
    }
    const arrow = (withDefault = 1) => withDefault
    class Klass {
      method(methodParam) { return methodParam }
    }
    const expr = class NamedExpr {}
    interface Iface { prop: string }
    type Alias<T> = T[]
    enum Enum { A, B }
    // non-node object and primitive values: \`regex\` of a regexp literal and
    // \`value\` of template quasis are plain objects without a \`type\`,
    // a bigint value is a non-object primitive
    const re = /ab+c/gi
    const tpl = \`x\${re.source}y\`
    const big = 10n
    `;

    const snapshot = (tracker: TestScopeTracker) =>
      [...tracker.getScopes().entries()].map(([scope, declarations]) => [
        scope,
        [...declarations.entries()].map(([name, node]) => `${name}:${node.type}`),
      ]);

    const fastTracker = new TestScopeTracker({ preserveExitedScopes: true });
    const { program } = parseAndWalk(code, filename, { scopeTracker: fastTracker });

    const enterTracker = new TestScopeTracker({ preserveExitedScopes: true });
    walk(program, { scopeTracker: enterTracker, enter() {} });

    const leaveTracker = new TestScopeTracker({ preserveExitedScopes: true });
    walk(program, { scopeTracker: leaveTracker, leave() {} });

    const expected = snapshot(enterTracker);
    expect(expected.flatMap(([, declarations]) => declarations).length).toBeGreaterThan(10);
    expect(snapshot(fastTracker)).toStrictEqual(expected);
    expect(snapshot(leaveTracker)).toStrictEqual(expected);
  });

  it("should return the root node", () => {
    const { program } = parseAndWalk("const a = 1", filename, {});
    expect(walk(program, { scopeTracker: new ScopeTracker() })).toBe(program);
  });

  it("should track declarations from array patterns with holes", () => {
    const code = `const [, second, ...rest] = [, 1, 2, 3]`;

    const scopeTracker = new TestScopeTracker({ preserveExitedScopes: true });
    parseAndWalk(code, filename, { scopeTracker });

    expect(scopeTracker.isDeclaredInScope("second", "")).toBe(true);
    expect(scopeTracker.isDeclaredInScope("rest", "")).toBe(true);
  });

  it("should track scopes when walking a non-Program subtree", () => {
    const code = `
    function fn(param) {
      const local = param
      return local
    }
    `;

    let fn: Node | undefined;
    parseAndWalk(code, filename, {
      enter(node) {
        if (node.type === "FunctionDeclaration") {
          fn = node;
        }
      },
    });
    assert(fn);

    const scopeTracker = new TestScopeTracker({ preserveExitedScopes: true });
    walk(fn, { scopeTracker });

    const declaredNames = [...scopeTracker.getScopes().values()].flatMap((declarations) => [
      ...declarations.keys(),
    ]);
    expect(declaredNames).toContain("param");
    expect(declaredNames).toContain("local");
  });

  it("should keep the scope enter fast path in sync with the node types it guards", () => {
    const source = readFileSync(new URL("../src/scope-tracker.ts", import.meta.url), "utf8");
    const { program } = parseAndWalk(source, "scope-tracker.ts", {});

    const guardedTypes = new Set<string>();
    const handledTypes = new Set<string>();

    walk(program, {
      enter(node) {
        if (
          node.type === "VariableDeclarator" &&
          node.id.type === "Identifier" &&
          node.id.name === "SCOPE_ENTER_TYPES"
        ) {
          assert(node.init?.type === "NewExpression");
          const [elements] = node.init.arguments;
          assert(elements?.type === "ArrayExpression");
          for (const element of elements.elements) {
            assert(element?.type === "Literal" && typeof element.value === "string");
            guardedTypes.add(element.value);
          }
        }

        if (
          node.type === "PropertyDefinition" &&
          node.key.type === "Identifier" &&
          node.key.name === "processNodeEnter"
        ) {
          walk(node, {
            enter(inner) {
              if (inner.type === "SwitchCase" && inner.test?.type === "Literal") {
                assert(typeof inner.test.value === "string");
                handledTypes.add(inner.test.value);
              }
            },
          });
        }
      },
    });

    expect(handledTypes.size).toBeGreaterThan(20);
    expect([...guardedTypes].sort()).toEqual([...handledTypes].sort());
  });
});

export class TestScopeTracker extends ScopeTracker {
  getScopes() {
    return this.scopes;
  }

  getScopeIndexKey() {
    return this.scopeIndexKey;
  }

  getScopeIndexStack() {
    return this.scopeIndexStack;
  }

  isDeclaredInScope(identifier: string, scope: string, options?: ScopeTrackerQueryOptions) {
    const oldKey = this.scopeIndexKey;
    this.scopeIndexKey = scope;
    const result = this.isDeclared(identifier, options);
    this.scopeIndexKey = oldKey;
    return result;
  }

  getDeclarationFromScope(identifier: string, scope: string, options?: ScopeTrackerQueryOptions) {
    const oldKey = this.scopeIndexKey;
    this.scopeIndexKey = scope;
    const result = this.getDeclaration(identifier, options);
    this.scopeIndexKey = oldKey;
    return result;
  }
}
