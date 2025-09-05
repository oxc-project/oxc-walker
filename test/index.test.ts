import type { Node } from 'oxc-parser'
import { describe, expect, it } from 'vitest'
import { parseAndWalk, walk } from '../src'

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
    const nodes: Node[] = []
    parseAndWalk('console.log("hello world")', 'test.js', function (node) {
      if (node.type !== 'Program') {
        this.skip()
        return
      }
      nodes.push(node)
    })
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
        walkedNodes.push(`enter:${node.type}`)
        if (node.type === 'CallExpression') {
          this.skip()
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
    parseAndWalk('console.log("hello world")', 'test.js', {
      enter(node) {
        if (node.type === 'Literal') {
          walkedNodes.push(`enter:${node.type}:${node.value}`)
          this.remove()
          return
        }
        walkedNodes.push(`enter:${node.type}`)
      },
      leave(node) {
        if (node.type === 'Literal') {
          walkedNodes.push(`leave:${node.type}:${node.value}`)
          return
        }
        walkedNodes.push(`leave:${node.type}`)
      },
    })

    expect(walkedNodes).toMatchInlineSnapshot(`
      [
        "enter:Program",
        "enter:ExpressionStatement",
        "enter:CallExpression",
        "enter:MemberExpression",
        "enter:Identifier",
        "leave:Identifier",
        "enter:Identifier",
        "leave:Identifier",
        "leave:MemberExpression",
        "enter:Literal:hello world",
        "leave:Literal:hello world",
        "leave:CallExpression",
        "leave:ExpressionStatement",
        "leave:Program",
      ]
    `)
  })

  it('supports replacing nodes', () => {
    const walkedNodes: string[] = []
    parseAndWalk('console.log("hello world")', 'test.js', {
      enter(node) {
        if (node.type === 'Literal') {
          walkedNodes.push(`enter:${node.type}:${node.value}`)
          this.replace({
            ...node,
            value: 'replaced',
          })
          return
        }
        walkedNodes.push(`enter:${node.type}`)
      },
      leave(node) {
        if (node.type === 'Literal') {
          walkedNodes.push(`leave:${node.type}:${node.value}`)
          return
        }
        walkedNodes.push(`leave:${node.type}`)
      },
    })

    expect(walkedNodes).toMatchInlineSnapshot(`
      [
        "enter:Program",
        "enter:ExpressionStatement",
        "enter:CallExpression",
        "enter:MemberExpression",
        "enter:Identifier",
        "leave:Identifier",
        "enter:Identifier",
        "leave:Identifier",
        "leave:MemberExpression",
        "enter:Literal:hello world",
        "leave:Literal:hello world",
        "leave:CallExpression",
        "leave:ExpressionStatement",
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
        if (node.type === 'Literal') {
          walkedNodes.push(`${node.type}:${node.value}`)
          return
        }
        walkedNodes.push(node.type)
      },
    })

    expect(walkedNodes).toMatchInlineSnapshot(`
      [
        "Program",
        "ExpressionStatement",
        "CallExpression",
        "MemberExpression",
        "Identifier",
        "Identifier",
        "Literal:final",
      ]
    `)
  })
})
