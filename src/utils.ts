import type { Node } from "@oxc-project/types";

export function isNode(v: unknown): v is Node {
  return v !== null && typeof v === "object" && typeof (v as any).type === "string";
}
