import { Effect } from "effect"
import { ToolContext } from "generalist"
import { ChildAdmission } from "generalist/runtime"

type InExecution = ChildAdmission.AgentChildren | ToolContext.ToolContext

/**
 * Admission returns a handle, not an answer. Parentage, tool call, and operation key come from the
 * ambient ToolContext, so a caller names only the work.
 */
export const admitReviewers = (
  keys: ReadonlyArray<string>,
): Effect.Effect<
  ReadonlyArray<ChildAdmission.AdmitReceipt>,
  ChildAdmission.AdmitChildError | ChildAdmission.ChildParentageInvalid,
  InExecution
> =>
  ChildAdmission.AgentChildren.use((children) =>
    Effect.forEach(keys, (key) => children.admit({ selection: "reviewer", prompt: `review ${key}`, key }), {
      concurrency: 1,
    }),
  )

/**
 * `join` reads the child's current state; it does not block until the child is terminal. A caller
 * that must wait polls this or follows Run events.
 */
export const settledChildren: Effect.Effect<
  ReadonlyArray<ChildAdmission.ChildInspection>,
  ChildAdmission.ChildLookupError,
  InExecution
> = ChildAdmission.AgentChildren.use((children) =>
  Effect.map(children.listDirect, (all) =>
    all.filter((child) => child.status === "succeeded" || child.status === "failed"),
  ),
)

/**
 * Origin groups children under the cell that produced them, in source order. It survives replay and
 * restart because it travels inside the invocation id that ChildLinked already carries.
 */
export const byCell = (
  children: ReadonlyArray<ChildAdmission.ChildInspection>,
): ReadonlyMap<string, ReadonlyArray<ChildAdmission.ChildInspection>> => {
  const grouped = new Map<string, Array<ChildAdmission.ChildInspection>>()
  for (const child of children) {
    if (child.origin === undefined) continue
    const bucket = grouped.get(child.origin.operationKey) ?? []
    bucket.push(child)
    grouped.set(child.origin.operationKey, bucket)
  }
  return new Map(
    [...grouped].map(([operationKey, bucket]) => [
      operationKey,
      bucket.toSorted((left, right) => (left.origin?.ordinal ?? 0) - (right.origin?.ordinal ?? 0)),
    ]),
  )
}
