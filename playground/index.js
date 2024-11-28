import assert from 'node:assert'
import * as pkg from 'oxc-walker'

// eslint-disable-next-line no-console
console.log(pkg.parseAndWalk())

assert.strictEqual(pkg.parseAndWalk(), 'hello world')
