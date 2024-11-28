import type { Node } from '../src'
import { describe, expect, it } from 'vitest'
import { parseAndWalk } from '../src'

describe('oxc-walker', () => {
  it('works', () => {
    const nodes: Node[] = []
    parseAndWalk('console.log("hello world")', 'test.js', {
      enter(node) {
        nodes.push(node)
      },
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
                    "raw": null,
                    "start": 12,
                    "type": "Literal",
                    "value": "hello world",
                  },
                ],
                "callee": {
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
                  "type": "StaticMemberExpression",
                },
                "end": 26,
                "optional": false,
                "start": 0,
                "type": "CallExpression",
                "typeParameters": null,
              },
              "start": 0,
              "type": "ExpressionStatement",
            },
          ],
          "directives": [],
          "end": 26,
          "hashbang": null,
          "sourceType": {
            "language": "javascript",
            "moduleKind": "module",
            "variant": "jsx",
          },
          "start": 0,
          "type": "Program",
        },
        {
          "end": 26,
          "expression": {
            "arguments": [
              {
                "end": 25,
                "raw": null,
                "start": 12,
                "type": "Literal",
                "value": "hello world",
              },
            ],
            "callee": {
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
              "type": "StaticMemberExpression",
            },
            "end": 26,
            "optional": false,
            "start": 0,
            "type": "CallExpression",
            "typeParameters": null,
          },
          "start": 0,
          "type": "ExpressionStatement",
        },
        {
          "arguments": [
            {
              "end": 25,
              "raw": null,
              "start": 12,
              "type": "Literal",
              "value": "hello world",
            },
          ],
          "callee": {
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
            "type": "StaticMemberExpression",
          },
          "end": 26,
          "optional": false,
          "start": 0,
          "type": "CallExpression",
          "typeParameters": null,
        },
        {
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
          "type": "StaticMemberExpression",
        },
        {
          "end": 7,
          "name": "console",
          "start": 0,
          "type": "Identifier",
        },
        {
          "end": 11,
          "name": "log",
          "start": 8,
          "type": "Identifier",
        },
        {
          "end": 25,
          "raw": null,
          "start": 12,
          "type": "Literal",
          "value": "hello world",
        },
      ]
    `)
  })
})
