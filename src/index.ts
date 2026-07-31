export {
  getUndeclaredIdentifiersInFunction,
  isBindingIdentifier,
  isOnlyBindingIdentifier,
  isReferenceIdentifier,
  ScopeTrackerFunctionParam,
  ScopeTrackerFunction,
  ScopeTrackerFunctionArguments,
  ScopeTrackerVariable,
  ScopeTrackerIdentifier,
  ScopeTrackerImport,
  ScopeTrackerCatchParam,
  ScopeTracker,
} from "./scope-tracker";
export type {
  ScopeTrackerOptions,
  ScopeTrackerQueryOptions,
  ScopeTrackerNode,
  IsReferenceIdentifierOptions,
} from "./scope-tracker";
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
