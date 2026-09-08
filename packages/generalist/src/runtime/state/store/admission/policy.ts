import { Effect } from "effect"
import type { RuntimeState } from "../../projection.js"
import { defaultTreePolicy, narrow } from "../../../tree/policy.js"
import { capGrant, narrowGrant, profileBudget } from "../../../budget/state.js"
import type { SessionSelection } from "../../../session/queue.js"
import { RuntimeUnavailable } from "../../../errors.js"
import type { BudgetLimits } from "../../../../core/durable/run-budget.js"

interface Input {
  readonly state: RuntimeState
  readonly sessionId: string
  readonly selection: SessionSelection
}

const selectedPolicy = ({ state, sessionId, selection: requested }: Input) =>
  Effect.gen(function* () {
    const family = state.sessions.get(sessionId)?.family
    const selection = state.hostSessions.get(sessionId)?.session.selection
    let policy =
      requested.treePolicy ?? family?.treePolicy ?? selection?.treePolicy ?? state.delegationPolicy ?? defaultTreePolicy
    for (const ceiling of [state.delegationPolicy, family?.treePolicy ?? null, selection?.treePolicy ?? null]) {
      policy = yield* narrow({ policy, ceiling })
    }
    return policy
  })

const validateTools = ({ state, sessionId, selection }: Input) =>
  Effect.gen(function* () {
    const family = state.sessions.get(sessionId)?.family
    const original = family?.runIds[0] === undefined ? undefined : state.runs.get(family.runIds[0])
    const originalSelection = state.hostSessions.get(sessionId)?.session.selection
    const granted = original === undefined ? originalSelection : original
    if (granted === undefined) return
    const source = granted.executableManifest.entries.find((entry) => entry.pin === granted.executableRef.active)
    const target = selection.executableManifest.entries.find((entry) => entry.pin === selection.executableRef.active)
    if (
      source?._tag === "Agent" &&
      target?._tag === "Agent" &&
      !target.manifest.tools.every((tool) =>
        source.manifest.tools.some((grantedTool) => grantedTool.name === tool.name),
      )
    ) {
      return yield* RuntimeUnavailable.make({ message: "Session selection widens its admitted tool grant" })
    }
  })

export const rootGrant = (input: Input) =>
  Effect.gen(function* () {
    const treePolicy = yield* selectedPolicy(input)
    yield* validateTools(input)
    const family = input.state.sessions.get(input.sessionId)?.family
    if (family !== undefined && family.parentRunId !== null)
      return yield* RuntimeUnavailable.make({
        message: "Child Session continuations require a fresh parent-owned child admission",
      })
    const selection = input.state.hostSessions.get(input.sessionId)?.session.selection
    const profile = profileBudget({ ref: input.selection.executableRef, manifest: input.selection.executableManifest })
    const budget = narrowGrant(
      capGrant(family?.budget ?? selection?.budget ?? profile, profile),
      input.selection.budget,
    )
    if (budget === undefined)
      return yield* RuntimeUnavailable.make({
        message: "Admission budget exceeds the admitted Session or profile grant",
      })
    return { treePolicy, budget, depth: family?.depth ?? 0 }
  })

export const sessionChildGrant = (input: Input & { readonly grant: BudgetLimits }) =>
  Effect.gen(function* () {
    yield* validateTools(input)
    const profile = profileBudget({ ref: input.selection.executableRef, manifest: input.selection.executableManifest })
    const family = input.state.sessions.get(input.sessionId)?.family
    return capGrant(capGrant(input.grant, profile), family?.budget ?? {})
  })
