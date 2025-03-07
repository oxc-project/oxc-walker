# oxc-walker

[![npm version][npm-version-src]][npm-version-href]
[![npm downloads][npm-downloads-src]][npm-downloads-href]
[![Github Actions][github-actions-src]][github-actions-href]
[![Codecov][codecov-src]][codecov-href]

> A wrapper around `estree-walker` that accepts an `oxc` AST and alternatively uses `oxc-parser` to parse code

## Usage

Install package:

```sh
# npm
npm install oxc-walker

# pnpm
pnpm install oxc-walker
```

```js
import { parseAndWalk, walk } from 'oxc-walker'

parseAndWalk(code, filename, (node) => {
  // node is typed correctly
})
```

## 💻 Development

- Clone this repository
- Enable [Corepack](https://github.com/nodejs/corepack) using `corepack enable`
- Install dependencies using `pnpm install`
- Run interactive tests using `pnpm dev`

## License

Made with ❤️

Published under [MIT License](./LICENCE).

<!-- Badges -->

[npm-version-src]: https://img.shields.io/npm/v/oxc-walker?style=flat-square
[npm-version-href]: https://npmjs.com/package/oxc-walker
[npm-downloads-src]: https://img.shields.io/npm/dm/oxc-walker?style=flat-square
[npm-downloads-href]: https://npm.chart.dev/oxc-walker
[github-actions-src]: https://img.shields.io/github/actions/workflow/status/danielroe/oxc-walker/ci.yml?branch=main&style=flat-square
[github-actions-href]: https://github.com/danielroe/oxc-walker/actions?query=workflow%3Aci
[codecov-src]: https://img.shields.io/codecov/c/gh/danielroe/oxc-walker/main?style=flat-square
[codecov-href]: https://codecov.io/gh/danielroe/oxc-walker
