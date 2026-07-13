import type { Node } from "@oxc-project/types";

export function isNode(v: unknown): v is Node {
  return (
    v !== null &&
    typeof v === "object" &&
    (v as any).type != null &&
    typeof (v as any).type === "string"
  );
}
