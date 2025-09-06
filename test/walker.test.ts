import type { Node } from 'oxc-parser'
import { describe, expect, it } from 'vitest'
import { parseAndWalk, walk } from '../src'

function getNodeString(node: Node) {
  const parts: string[] = [node.type]
  if ('name' in node) {
    parts.push(`${node.name}`)
  }
  if ('value' in node) {
    parts.push(`${node.value}`)
  }
  if ('async' in node) {
    parts.push(`async=${node.async}`)
  }

  return parts.join(':')
}

describe('oxc-walker', () => {
  it('works', () => {
    const nodes: Node[] = []
    parseAndWalk('console.log("hello world")', 'test.js', {
      enter(node) {
        if (node.type !== 'Program') {
          this.skip()
          return
        }
        nodes.push(node)
      },
      leave(node) {
        if (node.type !== 'Program') {
          return
        }
        nodes.push(node)
      },
    })
    const [first, last] = nodes
    expect(first).toStrictEqual(last)
    expect(nodes).toMatchInlineSnapshot(`
      [
        {
          "body": [
            {
              "end": 26,
              "expression": {
                "arguments": [
                  {
                    "end": 25,
                    "raw": ""hello world"",
                    "start": 12,
                    "type": "Literal",
                    "value": "hello world",
                  },
                ],
                "callee": {
                  "computed": false,
                  "end": 11,
                  "object": {
                    "end": 7,
                    "name": "console",
                    "start": 0,
                    "type": "Identifier",
                  },
                  "optional": false,
                  "property": {
                    "end": 11,
                    "name": "log",
                    "start": 8,
                    "type": "Identifier",
                  },
                  "start": 0,
                  "type": "MemberExpression",
                },
                "end": 26,
                "optional": false,
                "start": 0,
                "type": "CallExpression",
              },
              "start": 0,
              "type": "ExpressionStatement",
            },
          ],
          "end": 26,
          "hashbang": null,
          "sourceType": "module",
          "start": 0,
          "type": "Program",
        },
        {
          "body": [
            {
              "end": 26,
              "expression": {
                "arguments": [
                  {
                    "end": 25,
                    "raw": ""hello world"",
                    "start": 12,
                    "type": "Literal",
                    "value": "hello world",
                  },
                ],
                "callee": {
                  "computed": false,
                  "end": 11,
                  "object": {
                    "end": 7,
                    "name": "console",
                    "start": 0,
                    "type": "Identifier",
                  },
                  "optional": false,
                  "property": {
                    "end": 11,
                    "name": "log",
                    "start": 8,
                    "type": "Identifier",
                  },
                  "start": 0,
                  "type": "MemberExpression",
                },
                "end": 26,
                "optional": false,
                "start": 0,
                "type": "CallExpression",
              },
              "start": 0,
              "type": "ExpressionStatement",
            },
          ],
          "end": 26,
          "hashbang": null,
          "sourceType": "module",
          "start": 0,
          "type": "Program",
        },
      ]
    `)
  })

  it('handles simple enter callback', () => {
    const walkedNodes: string[] = []
    parseAndWalk('console.log("hello world")', 'test.js', (node) => {
      walkedNodes.push(getNodeString(node))
    })

    expect(walkedNodes).toMatchInlineSnapshot(`
      [
        "Program",
        "ExpressionStatement",
        "CallExpression",
        "MemberExpression",
        "Identifier:console",
        "Identifier:log",
        "Literal:hello world",
      ]
    `)
  })

  it('walks in the correct order', () => {
    const code = `
    function foo<T>(arg: T, another: number): T {
      const [a, b] = [1, 2]
      console.log(arg, another)
      for (let i = 0; i < 10; i++) {
        console.log(i)
      }
      return arg
    }
    foo<string>('test', 42)
    `
    const walkedNodes: string[] = []
    const { program } = parseAndWalk(code, 'test.ts', {
      enter(node, parent, { key, index }) {
        walkedNodes.push(`enter:${getNodeString(node)}|parent:${parent ? getNodeString(parent) : 'null'}|key:${key as string}|index:${index}`)
      },
      leave(node, parent, { key, index }) {
        walkedNodes.push(`leave:${getNodeString(node)}|parent:${parent ? getNodeString(parent) : 'null'}|key:${key as string}|index:${index}`)
      },
    })

    const reWalkedNodes: string[] = []
    walk(program, {
      enter(node, parent, { key, index }) {
        reWalkedNodes.push(`enter:${getNodeString(node)}|parent:${parent ? getNodeString(parent) : 'null'}|key:${key as string}|index:${index}`)
      },
      leave(node, parent, { key, index }) {
        reWalkedNodes.push(`leave:${getNodeString(node)}|parent:${parent ? getNodeString(parent) : 'null'}|key:${key as string}|index:${index}`)
      },
    })

    expect(walkedNodes).toStrictEqual(reWalkedNodes)
    expect(walkedNodes).toMatchInlineSnapshot(`
      [
        "enter:Program|parent:null|key:null|index:null",
        "enter:FunctionDeclaration:async=false|parent:Program|key:body|index:0",
        "enter:Identifier:foo|parent:FunctionDeclaration:async=false|key:id|index:null",
        "leave:Identifier:foo|parent:FunctionDeclaration:async=false|key:id|index:null",
        "enter:TSTypeParameterDeclaration|parent:FunctionDeclaration:async=false|key:typeParameters|index:null",
        "enter:TSTypeParameter:[object Object]|parent:TSTypeParameterDeclaration|key:params|index:0",
        "enter:Identifier:T|parent:TSTypeParameter:[object Object]|key:name|index:null",
        "leave:Identifier:T|parent:TSTypeParameter:[object Object]|key:name|index:null",
        "leave:TSTypeParameter:[object Object]|parent:TSTypeParameterDeclaration|key:params|index:0",
        "leave:TSTypeParameterDeclaration|parent:FunctionDeclaration:async=false|key:typeParameters|index:null",
        "enter:Identifier:arg|parent:FunctionDeclaration:async=false|key:params|index:0",
        "enter:TSTypeAnnotation|parent:Identifier:arg|key:typeAnnotation|index:null",
        "enter:TSTypeReference|parent:TSTypeAnnotation|key:typeAnnotation|index:null",
        "enter:Identifier:T|parent:TSTypeReference|key:typeName|index:null",
        "leave:Identifier:T|parent:TSTypeReference|key:typeName|index:null",
        "leave:TSTypeReference|parent:TSTypeAnnotation|key:typeAnnotation|index:null",
        "leave:TSTypeAnnotation|parent:Identifier:arg|key:typeAnnotation|index:null",
        "leave:Identifier:arg|parent:FunctionDeclaration:async=false|key:params|index:0",
        "enter:Identifier:another|parent:FunctionDeclaration:async=false|key:params|index:1",
        "enter:TSTypeAnnotation|parent:Identifier:another|key:typeAnnotation|index:null",
        "enter:TSNumberKeyword|parent:TSTypeAnnotation|key:typeAnnotation|index:null",
        "leave:TSNumberKeyword|parent:TSTypeAnnotation|key:typeAnnotation|index:null",
        "leave:TSTypeAnnotation|parent:Identifier:another|key:typeAnnotation|index:null",
        "leave:Identifier:another|parent:FunctionDeclaration:async=false|key:params|index:1",
        "enter:TSTypeAnnotation|parent:FunctionDeclaration:async=false|key:returnType|index:null",
        "enter:TSTypeReference|parent:TSTypeAnnotation|key:typeAnnotation|index:null",
        "enter:Identifier:T|parent:TSTypeReference|key:typeName|index:null",
        "leave:Identifier:T|parent:TSTypeReference|key:typeName|index:null",
        "leave:TSTypeReference|parent:TSTypeAnnotation|key:typeAnnotation|index:null",
        "leave:TSTypeAnnotation|parent:FunctionDeclaration:async=false|key:returnType|index:null",
        "enter:BlockStatement|parent:FunctionDeclaration:async=false|key:body|index:null",
        "enter:VariableDeclaration|parent:BlockStatement|key:body|index:0",
        "enter:VariableDeclarator|parent:VariableDeclaration|key:declarations|index:0",
        "enter:ArrayPattern|parent:VariableDeclarator|key:id|index:null",
        "enter:Identifier:a|parent:ArrayPattern|key:elements|index:0",
        "leave:Identifier:a|parent:ArrayPattern|key:elements|index:0",
        "enter:Identifier:b|parent:ArrayPattern|key:elements|index:1",
        "leave:Identifier:b|parent:ArrayPattern|key:elements|index:1",
        "leave:ArrayPattern|parent:VariableDeclarator|key:id|index:null",
        "enter:ArrayExpression|parent:VariableDeclarator|key:init|index:null",
        "enter:Literal:1|parent:ArrayExpression|key:elements|index:0",
        "leave:Literal:1|parent:ArrayExpression|key:elements|index:0",
        "enter:Literal:2|parent:ArrayExpression|key:elements|index:1",
        "leave:Literal:2|parent:ArrayExpression|key:elements|index:1",
        "leave:ArrayExpression|parent:VariableDeclarator|key:init|index:null",
        "leave:VariableDeclarator|parent:VariableDeclaration|key:declarations|index:0",
        "leave:VariableDeclaration|parent:BlockStatement|key:body|index:0",
        "enter:ExpressionStatement|parent:BlockStatement|key:body|index:1",
        "enter:CallExpression|parent:ExpressionStatement|key:expression|index:null",
        "enter:MemberExpression|parent:CallExpression|key:callee|index:null",
        "enter:Identifier:console|parent:MemberExpression|key:object|index:null",
        "leave:Identifier:console|parent:MemberExpression|key:object|index:null",
        "enter:Identifier:log|parent:MemberExpression|key:property|index:null",
        "leave:Identifier:log|parent:MemberExpression|key:property|index:null",
        "leave:MemberExpression|parent:CallExpression|key:callee|index:null",
        "enter:Identifier:arg|parent:CallExpression|key:arguments|index:0",
        "leave:Identifier:arg|parent:CallExpression|key:arguments|index:0",
        "enter:Identifier:another|parent:CallExpression|key:arguments|index:1",
        "leave:Identifier:another|parent:CallExpression|key:arguments|index:1",
        "leave:CallExpression|parent:ExpressionStatement|key:expression|index:null",
        "leave:ExpressionStatement|parent:BlockStatement|key:body|index:1",
        "enter:ForStatement|parent:BlockStatement|key:body|index:2",
        "enter:VariableDeclaration|parent:ForStatement|key:init|index:null",
        "enter:VariableDeclarator|parent:VariableDeclaration|key:declarations|index:0",
        "enter:Identifier:i|parent:VariableDeclarator|key:id|index:null",
        "leave:Identifier:i|parent:VariableDeclarator|key:id|index:null",
        "enter:Literal:0|parent:VariableDeclarator|key:init|index:null",
        "leave:Literal:0|parent:VariableDeclarator|key:init|index:null",
        "leave:VariableDeclarator|parent:VariableDeclaration|key:declarations|index:0",
        "leave:VariableDeclaration|parent:ForStatement|key:init|index:null",
        "enter:BinaryExpression|parent:ForStatement|key:test|index:null",
        "enter:Identifier:i|parent:BinaryExpression|key:left|index:null",
        "leave:Identifier:i|parent:BinaryExpression|key:left|index:null",
        "enter:Literal:10|parent:BinaryExpression|key:right|index:null",
        "leave:Literal:10|parent:BinaryExpression|key:right|index:null",
        "leave:BinaryExpression|parent:ForStatement|key:test|index:null",
        "enter:UpdateExpression|parent:ForStatement|key:update|index:null",
        "enter:Identifier:i|parent:UpdateExpression|key:argument|index:null",
        "leave:Identifier:i|parent:UpdateExpression|key:argument|index:null",
        "leave:UpdateExpression|parent:ForStatement|key:update|index:null",
        "enter:BlockStatement|parent:ForStatement|key:body|index:null",
        "enter:ExpressionStatement|parent:BlockStatement|key:body|index:0",
        "enter:CallExpression|parent:ExpressionStatement|key:expression|index:null",
        "enter:MemberExpression|parent:CallExpression|key:callee|index:null",
        "enter:Identifier:console|parent:MemberExpression|key:object|index:null",
        "leave:Identifier:console|parent:MemberExpression|key:object|index:null",
        "enter:Identifier:log|parent:MemberExpression|key:property|index:null",
        "leave:Identifier:log|parent:MemberExpression|key:property|index:null",
        "leave:MemberExpression|parent:CallExpression|key:callee|index:null",
        "enter:Identifier:i|parent:CallExpression|key:arguments|index:0",
        "leave:Identifier:i|parent:CallExpression|key:arguments|index:0",
        "leave:CallExpression|parent:ExpressionStatement|key:expression|index:null",
        "leave:ExpressionStatement|parent:BlockStatement|key:body|index:0",
        "leave:BlockStatement|parent:ForStatement|key:body|index:null",
        "leave:ForStatement|parent:BlockStatement|key:body|index:2",
        "enter:ReturnStatement|parent:BlockStatement|key:body|index:3",
        "enter:Identifier:arg|parent:ReturnStatement|key:argument|index:null",
        "leave:Identifier:arg|parent:ReturnStatement|key:argument|index:null",
        "leave:ReturnStatement|parent:BlockStatement|key:body|index:3",
        "leave:BlockStatement|parent:FunctionDeclaration:async=false|key:body|index:null",
        "leave:FunctionDeclaration:async=false|parent:Program|key:body|index:0",
        "enter:ExpressionStatement|parent:Program|key:body|index:1",
        "enter:CallExpression|parent:ExpressionStatement|key:expression|index:null",
        "enter:Identifier:foo|parent:CallExpression|key:callee|index:null",
        "leave:Identifier:foo|parent:CallExpression|key:callee|index:null",
        "enter:TSTypeParameterInstantiation|parent:CallExpression|key:typeArguments|index:null",
        "enter:TSStringKeyword|parent:TSTypeParameterInstantiation|key:params|index:0",
        "leave:TSStringKeyword|parent:TSTypeParameterInstantiation|key:params|index:0",
        "leave:TSTypeParameterInstantiation|parent:CallExpression|key:typeArguments|index:null",
        "enter:Literal:test|parent:CallExpression|key:arguments|index:0",
        "leave:Literal:test|parent:CallExpression|key:arguments|index:0",
        "enter:Literal:42|parent:CallExpression|key:arguments|index:1",
        "leave:Literal:42|parent:CallExpression|key:arguments|index:1",
        "leave:CallExpression|parent:ExpressionStatement|key:expression|index:null",
        "leave:ExpressionStatement|parent:Program|key:body|index:1",
        "leave:Program|parent:null|key:null|index:null",
      ]
    `)
  })

  it('handles language detection', () => {
    const nodes: Node[] = []
    parseAndWalk('const render = () => <div></div>', 'test.jsx', {
      enter(node) {
        if (node.type !== 'Program') {
          this.skip()
          return
        }
        nodes.push(node)
      },
      leave(node) {
        nodes.push(node)
      },
    })
    expect('sourceType' in nodes[0]! ? nodes[0].sourceType : undefined).toMatchInlineSnapshot(`"module"`)
  })

  it('handles language extensions in path', () => {
    let didEncounterTypescript = false
    parseAndWalk('const foo: number = 1', 'directory.js/file.ts', {
      enter(node) {
        if (node.type === 'TSTypeAnnotation') {
          didEncounterTypescript = true
        }
      },
    })
    expect(didEncounterTypescript).toBe(true)
  })

  it('accepts options for parsing', () => {
    let didEncounterTypescript = false
    parseAndWalk('const foo: number = 1', 'test.js', {
      parseOptions: { lang: 'ts' },
      enter(node) {
        if (node.type === 'TSTypeAnnotation') {
          didEncounterTypescript = true
        }
      },
    })
    expect(didEncounterTypescript).toBe(true)
  })

  it('handles `null` literals', () => {
    const ast: Node = {
      type: 'Program',
      hashbang: null,
      start: 0,
      end: 8,
      body: [
        {
          type: 'ExpressionStatement',
          start: 0,
          end: 5,
          expression: {
            type: 'Literal',
            start: 0,
            end: 4,
            value: null,
            raw: 'null',
          },
        },
        {
          type: 'ExpressionStatement',
          start: 6,
          end: 8,
          expression: {
            type: 'Literal',
            start: 6,
            end: 7,
            value: 1,
            raw: '1',
          },
        },
      ],
      sourceType: 'module',
    }

    const walkedNodes: string[] = []

    walk(ast, {
      enter(node) {
        walkedNodes.push(`enter:${getNodeString(node)}`)
      },
      leave(node) {
        walkedNodes.push(`leave:${getNodeString(node)}`)
      },
    })

    expect(walkedNodes).toMatchInlineSnapshot(`
      [
        "enter:Program",
        "enter:ExpressionStatement",
        "enter:Literal:null",
        "leave:Literal:null",
        "leave:ExpressionStatement",
        "enter:ExpressionStatement",
        "enter:Literal:1",
        "leave:Literal:1",
        "leave:ExpressionStatement",
        "leave:Program",
      ]
    `)
  })

  it('allows walk() reentrancy without context corruption', () => {
    const walkedNodes: string[] = []
    const innerWalkedNodes: string[] = []

    parseAndWalk('a + b', 'file.ts', (node) => {
      if (node.type === 'ExpressionStatement') {
        walk(node, {
          enter() {
            innerWalkedNodes.push(getNodeString(node))
            this.skip()
          },
        })
      }

      walkedNodes.push(getNodeString(node))
    })

    expect(walkedNodes).toMatchInlineSnapshot(`
      [
        "Program",
        "ExpressionStatement",
        "BinaryExpression",
        "Identifier:a",
        "Identifier:b",
      ]
    `)

    expect(innerWalkedNodes).toMatchInlineSnapshot(`
      [
        "ExpressionStatement",
      ]
    `)
  })

  it('handles JSXAttribute', () => {
    parseAndWalk(`<input type="text" />`, 'test.jsx', (node) => {
      if (node.type === 'JSXAttribute') {
        expect(node.name.name).toBe('type')
      }
    })
  })

  it('handles JSXText', () => {
    parseAndWalk(`<div>hello world</div>`, 'test.jsx', (node) => {
      if (node.type === 'JSXText') {
        expect(node.value).toBe('hello world')
      }
    })
  })

  it('supports skipping nodes and all their children', () => {
    const walkedNodes: string[] = []
    parseAndWalk('console.log("hello world")', 'test.js', {
      enter(node) {
        walkedNodes.push(`enter:${getNodeString(node)}`)
        if (node.type === 'CallExpression') {
          this.skip()
        }
      },
      leave(node) {
        walkedNodes.push(`leave:${getNodeString(node)}`)
      },
    })

    expect(walkedNodes).toMatchInlineSnapshot(`
      [
        "enter:Program",
        "enter:ExpressionStatement",
        "enter:CallExpression",
        "leave:CallExpression",
        "leave:ExpressionStatement",
        "leave:Program",
      ]
    `)
  })

  it('handles multiple calls of `this.skip`', () => {
    const walkedNodes: string[] = []
    parseAndWalk('console.log("hello world")', 'test.js', {
      enter(node) {
        walkedNodes.push(`enter:${node.type}`)
        if (node.type === 'CallExpression') {
          this.skip()
          this.skip() // multiple calls to skip should be no-op
        }
      },
      leave(node) {
        walkedNodes.push(`leave:${node.type}`)
      },
    })

    expect(walkedNodes).toMatchInlineSnapshot(`
      [
        "enter:Program",
        "enter:ExpressionStatement",
        "enter:CallExpression",
        "leave:CallExpression",
        "leave:ExpressionStatement",
        "leave:Program",
      ]
    `)
  })

  it('supports removing nodes', () => {
    const walkedNodes: string[] = []
    const { program } = parseAndWalk('console.log("hello world")', 'test.js', {
      enter(node) {
        if (node.type === 'Literal') {
          this.remove()
        }
        walkedNodes.push(`enter:${getNodeString(node)}`)
      },
      leave(node) {
        walkedNodes.push(`leave:${getNodeString(node)}`)
      },
    })

    const postRemoveWalkedNodes: string[] = []

    walk(program, {
      enter(node) {
        postRemoveWalkedNodes.push(`enter:${getNodeString(node)}`)
      },
      leave(node) {
        postRemoveWalkedNodes.push(`leave:${getNodeString(node)}`)
      },
    })

    expect(walkedNodes).toMatchInlineSnapshot(`
      [
        "enter:Program",
        "enter:ExpressionStatement",
        "enter:CallExpression",
        "enter:MemberExpression",
        "enter:Identifier:console",
        "leave:Identifier:console",
        "enter:Identifier:log",
        "leave:Identifier:log",
        "leave:MemberExpression",
        "enter:Literal:hello world",
        "leave:Literal:hello world",
        "leave:CallExpression",
        "leave:ExpressionStatement",
        "leave:Program",
      ]
    `)

    expect(postRemoveWalkedNodes).toMatchInlineSnapshot(`
      [
        "enter:Program",
        "enter:ExpressionStatement",
        "enter:CallExpression",
        "enter:MemberExpression",
        "enter:Identifier:console",
        "leave:Identifier:console",
        "enter:Identifier:log",
        "leave:Identifier:log",
        "leave:MemberExpression",
        "leave:CallExpression",
        "leave:ExpressionStatement",
        "leave:Program",
      ]
    `)
  })

  it('removes nodes from arrays and reports indices visited', () => {
    const code = `
    let a, b, c
    `

    const walkedNodes: string[] = []
    const { program } = parseAndWalk(code, 'test.ts', {
      enter(node, _, { index }) {
        if (node.type === 'VariableDeclarator') {
          walkedNodes.push(`enter:${getNodeString(node)}|index:${index}`)
          if (node.id.type === 'Identifier' && ['a', 'b'].includes(node.id.name)) {
            this.remove()
          }
        }
      },
    })

    expect(walkedNodes).toMatchInlineSnapshot(`
      [
        "enter:VariableDeclarator|index:0",
        "enter:VariableDeclarator|index:0",
        "enter:VariableDeclarator|index:0",
      ]
    `)
    expect(program).toMatchInlineSnapshot(`
      {
        "body": [
          {
            "declarations": [
              {
                "definite": false,
                "end": 16,
                "id": {
                  "decorators": [],
                  "end": 16,
                  "name": "c",
                  "optional": false,
                  "start": 15,
                  "type": "Identifier",
                  "typeAnnotation": null,
                },
                "init": null,
                "start": 15,
                "type": "VariableDeclarator",
              },
            ],
            "declare": false,
            "end": 16,
            "kind": "let",
            "start": 5,
            "type": "VariableDeclaration",
          },
        ],
        "end": 21,
        "hashbang": null,
        "sourceType": "module",
        "start": 5,
        "type": "Program",
      }
    `)
  })

  it('supports replacing nodes', () => {
    const walkedNodes: string[] = []
    const { program } = parseAndWalk('console.log("hello world")', 'test.js', {
      enter(node) {
        if (node.type === 'Literal') {
          this.replace({
            ...node,
            value: 'replaced',
          })
        }
        walkedNodes.push(`enter:${getNodeString(node)}`)
      },
      leave(node) {
        walkedNodes.push(`leave:${getNodeString(node)}`)
      },
    })

    const postReplaceWalkedNodes: string[] = []

    walk(program, {
      enter(node) {
        postReplaceWalkedNodes.push(`enter:${getNodeString(node)}`)
      },
      leave(node) {
        postReplaceWalkedNodes.push(`leave:${getNodeString(node)}`)
      },
    })

    expect(walkedNodes).toMatchInlineSnapshot(`
      [
        "enter:Program",
        "enter:ExpressionStatement",
        "enter:CallExpression",
        "enter:MemberExpression",
        "enter:Identifier:console",
        "leave:Identifier:console",
        "enter:Identifier:log",
        "leave:Identifier:log",
        "leave:MemberExpression",
        "enter:Literal:hello world",
        "leave:Literal:hello world",
        "leave:CallExpression",
        "leave:ExpressionStatement",
        "leave:Program",
      ]
    `)

    expect(postReplaceWalkedNodes).toMatchInlineSnapshot(`
      [
        "enter:Program",
        "enter:ExpressionStatement",
        "enter:CallExpression",
        "enter:MemberExpression",
        "enter:Identifier:console",
        "leave:Identifier:console",
        "enter:Identifier:log",
        "leave:Identifier:log",
        "leave:MemberExpression",
        "enter:Literal:replaced",
        "leave:Literal:replaced",
        "leave:CallExpression",
        "leave:ExpressionStatement",
        "leave:Program",
      ]
    `)
  })

  it('replaces a top-level node and returns it', () => {
    const ast: Node = { type: 'Identifier', name: 'answer', start: 0, end: 6 }
    const fortyTwo: Node = { type: 'Literal', value: 42, raw: '42', start: 0, end: 2 }

    const newAst = walk(ast, {
      enter(node) {
        if (node.type === 'Identifier' && node.name === 'answer') {
          this.replace(fortyTwo)
        }
      },
    })

    expect(newAst).toBe(fortyTwo)
  })

  it('walks the children of the newly replaced node', () => {
    const walkedNodes: string[] = []
    parseAndWalk('function (arg1, arg2) {}', 'test.js', {
      enter(node, parent) {
        if (node.type === 'FunctionDeclaration') {
          this.replace({
            type: 'FunctionDeclaration',
            id: null,
            generator: false,
            async: true,
            params: [
              { type: 'Identifier', name: 'rep1', start: 10, end: 14 },
              { type: 'Identifier', name: 'rep2', start: 16, end: 20 },
            ],
            body: { type: 'BlockStatement', body: [], start: 22, end: 24 },
            expression: false,
            start: 0,
            end: 24,
          })
        }
        walkedNodes.push(`enter:${getNodeString(node)}`)

        if (parent && parent.type === 'FunctionDeclaration') {
          // expect that the parent is the replaced node
          expect(parent.async).toBe(true)
        }
      },
      leave(node, parent) {
        walkedNodes.push(`leave:${getNodeString(node)}`)

        if (parent && parent.type === 'FunctionDeclaration') {
          // expect that the parent is the replaced node
          expect(parent.async).toBe(true)
        }
      },
    })

    // ensure that leave is still called with the original old node (async: false)
    expect(walkedNodes).toMatchInlineSnapshot(`
      [
        "enter:Program",
        "enter:FunctionDeclaration:async=false",
        "enter:Identifier:rep1",
        "leave:Identifier:rep1",
        "enter:Identifier:rep2",
        "leave:Identifier:rep2",
        "enter:BlockStatement",
        "leave:BlockStatement",
        "leave:FunctionDeclaration:async=false",
        "leave:Program",
      ]
    `)
  })

  it('uses last result of `this.replace` when replacing nodes multiple times', () => {
    const { program: ast } = parseAndWalk('console.log("hello world")', 'test.js', {
      enter(node) {
        if (node.type === 'Literal') {
          this.replace({
            ...node,
            value: 'first',
          })
          this.replace({
            ...node,
            value: 'second',
          })
          this.replace({
            ...node,
            value: 'final',
          })
        }
      },
    })

    const walkedNodes: string[] = []
    walk(ast, {
      enter(node) {
        walkedNodes.push(getNodeString(node))
      },
    })

    expect(walkedNodes).toMatchInlineSnapshot(`
      [
        "Program",
        "ExpressionStatement",
        "CallExpression",
        "MemberExpression",
        "Identifier:console",
        "Identifier:log",
        "Literal:final",
      ]
    `)
  })
})
