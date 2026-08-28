import { classify as ContextOverflow_classify } from "../result/context-overflow.js"
export const ContextOverflow = {
  classify: ContextOverflow_classify,
} satisfies typeof import("../result/context-overflow.js")
export namespace ContextOverflow {
  export type classify = typeof import("../result/context-overflow.js").classify
}
