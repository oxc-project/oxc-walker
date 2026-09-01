# Changelog

## [1.1.2](https://github.com/oxc-project/oxc-walker/compare/v1.1.1...v1.1.2) (2026-09-01)


### Bug Fixes

* surface load errors when resolving `parseSync` ([#363](https://github.com/oxc-project/oxc-walker/issues/363)) ([a1514a7](https://github.com/oxc-project/oxc-walker/commit/a1514a7aa25504dc7630a7669ea8bf151f970626))

## [1.1.1](https://github.com/oxc-project/oxc-walker/compare/v1.1.0...v1.1.1) (2026-07-31)


### Bug Fixes

* fix build script ([#350](https://github.com/oxc-project/oxc-walker/issues/350)) ([2438ec5](https://github.com/oxc-project/oxc-walker/commit/2438ec5443f9250362c0af7236d78f5f42175632))

## [1.1.0](https://github.com/oxc-project/oxc-walker/compare/v1.0.0...v1.1.0) (2026-07-31)


### Features

* add `isReferenceIdentifier` and `isOnlyBindingIdentifier` ([#344](https://github.com/oxc-project/oxc-walker/issues/344)) ([ee083fa](https://github.com/oxc-project/oxc-walker/commit/ee083fa214507099f6ef5803a779b74d3edc33a0))


### Bug Fixes

* improve scope tracking accuracy ([#347](https://github.com/oxc-project/oxc-walker/issues/347)) ([014fa17](https://github.com/oxc-project/oxc-walker/commit/014fa17aab41e4a0431494e515042e1f489d1caa))
* use `@oxc-project/types` for ast types ([#332](https://github.com/oxc-project/oxc-walker/issues/332)) ([4ef7ab0](https://github.com/oxc-project/oxc-walker/commit/4ef7ab081eefcbe14961766b1dd0f7a3196671d1))


### Performance Improvements

* optimize walker & scope tracker ([#345](https://github.com/oxc-project/oxc-walker/issues/345)) ([b564d8f](https://github.com/oxc-project/oxc-walker/commit/b564d8f38ebe1c49e519791663b810f51eb739d9))
* remove magic-regexp dependency ([#341](https://github.com/oxc-project/oxc-walker/issues/341)) ([fcedf6f](https://github.com/oxc-project/oxc-walker/commit/fcedf6f1c0371aa2e2e7187903f28c229d5c5323))

## [1.0.0](https://github.com/oxc-project/oxc-walker/compare/v0.7.0...v1.0.0) (2026-05-08)


### ⚠ BREAKING CHANGES

* support rolldown or custom `parseSync` ([#288](https://github.com/oxc-project/oxc-walker/issues/288))

### Features

* support rolldown or custom `parseSync` ([#288](https://github.com/oxc-project/oxc-walker/issues/288)) ([8d6d4cc](https://github.com/oxc-project/oxc-walker/commit/8d6d4cc1bd3689ad534e7cf599e956a2e557fae9))

## [0.7.0](https://github.com/oxc-project/oxc-walker/compare/v0.6.0...v0.7.0) (2026-01-15)


### Features

* export classes & types for external usage ([#199](https://github.com/oxc-project/oxc-walker/issues/199)) ([fe938a2](https://github.com/oxc-project/oxc-walker/commit/fe938a23b8443f0dd112af780e6acd82d7e42c20))

## [0.6.0](https://github.com/oxc-project/oxc-walker/compare/v0.5.2...v0.6.0) (2025-11-18)


### Features

* peer oxc-parser to v0.98.0 ([#166](https://github.com/oxc-project/oxc-walker/issues/166)) ([a535f9f](https://github.com/oxc-project/oxc-walker/commit/a535f9f1d0da9235aaa9f243d91cf715241814ca))


### Bug Fixes

* release-please ([bf7002d](https://github.com/oxc-project/oxc-walker/commit/bf7002dadbad537d851719d944cafd3eee011882))
