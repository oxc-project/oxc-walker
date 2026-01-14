export {
  getUndeclaredIdentifiersInFunction,
  isBindingIdentifier,
  ScopeTrackerFunctionParam,
  ScopeTrackerFunction,
  ScopeTrackerVariable,
  ScopeTrackerIdentifier,
  ScopeTrackerImport,
  ScopeTrackerCatchParam,
  ScopeTracker,
} from "./scope-tracker";
export type { ScopeTrackerOptions, ScopeTrackerNode } from "./scope-tracker";
export type {
  WalkerThisContextEnter,
  WalkerThisContextLeave,
  WalkerCallbackContext,
  WalkerEnter,
  WalkerLeave,
} from "./walker/base";
export type { WalkOptions } from "./walker/sync";
export { parseAndWalk, walk } from "./walk";
export type { Identifier } from "./walk";
