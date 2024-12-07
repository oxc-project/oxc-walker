import type { Node } from '../src'
import { describe, expect, it } from 'vitest'
import { parseAndWalk } from '../src'

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
              "end": 7,
              "expression": {
                "end": 7,
                "object": {
                  "end": 4,
                  "name": "test",
                  "start": 0,
                  "type": "Identifier",
                },
                "optional": false,
                "property": {
                  "end": 7,
                  "name": "js",
                  "start": 5,
                  "type": "Identifier",
                },
                "start": 0,
                "type": "StaticMemberExpression",
              },
              "start": 0,
              "type": "ExpressionStatement",
            },
          ],
          "directives": [],
          "end": 7,
          "hashbang": null,
          "sourceType": {
            "language": "javascript",
            "moduleKind": "module",
            "variant": "standard",
          },
          "start": 0,
          "type": "Program",
        },
        {
          "body": [
            {
              "end": 7,
              "expression": {
                "end": 7,
                "object": {
                  "end": 4,
                  "name": "test",
                  "start": 0,
                  "type": "Identifier",
                },
                "optional": false,
                "property": {
                  "end": 7,
                  "name": "js",
                  "start": 5,
                  "type": "Identifier",
                },
                "start": 0,
                "type": "StaticMemberExpression",
              },
              "start": 0,
              "type": "ExpressionStatement",
            },
          ],
          "directives": [],
          "end": 7,
          "hashbang": null,
          "sourceType": {
            "language": "javascript",
            "moduleKind": "module",
            "variant": "standard",
          },
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
              "end": 7,
              "expression": {
                "end": 7,
                "object": {
                  "end": 4,
                  "name": "test",
                  "start": 0,
                  "type": "Identifier",
                },
                "optional": false,
                "property": {
                  "end": 7,
                  "name": "js",
                  "start": 5,
                  "type": "Identifier",
                },
                "start": 0,
                "type": "StaticMemberExpression",
              },
              "start": 0,
              "type": "ExpressionStatement",
            },
          ],
          "directives": [],
          "end": 7,
          "hashbang": null,
          "sourceType": {
            "language": "javascript",
            "moduleKind": "module",
            "variant": "standard",
          },
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
    expect('sourceType' in nodes[0]! ? nodes[0].sourceType : undefined).toMatchInlineSnapshot(`
      {
        "language": "javascript",
        "moduleKind": "module",
        "variant": "jsx",
      }
    `)
  })
})
