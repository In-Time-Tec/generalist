import { Effect, Schema, type Types } from "effect"
import type { RuntimeState } from "../../projection.js"
import { defaultTreePolicy, narrow } from "../../../tree/policy.js"
import { capGrant, narrowGrant, profileBudget, requireAvailable } from "../../../budget/state.js"
import { spendForEvents } from "../../../execution/inspection.js"
import type { SessionSelection } from "../../../session/queue.js"
import { RuntimeUnavailable } from "../../../errors.js"
import type { BudgetLimits } from "../../../../core/durable/run-budget.js"
import type { Message } from "../../../messaging/message.js"
import { Input as ToolInput } from "../../../hosting/tool-start.js"

interface Input {
  readonly state: RuntimeState
  readonly sessionId: string
  readonly selection: SessionSelection
  readonly message?: Message
  readonly bypassRetained?: boolean
}

export const retainedBudget = (input: Pick<Input, "state" | "sessionId">) =>
  Effect.gen(function* () {
    const family = input.state.sessions.get(input.sessionId)?.family
    const remaining: Types.Mutable<BudgetLimits> = { ...family?.budget }
    for (const runId of family?.runIds ?? []) {
      const run = input.state.runs.get(runId)
      if (run === undefined)
        return yield* RuntimeUnavailable.make({ message: `Session allocation Run ${runId} is missing` })
      const spend = yield* spendForEvents({ events: run.events })
      for (const dimension of ["tokens", "usd", "duration", "toolCalls", "children"] as const) {
        const limit = remaining[dimension]
        if (limit !== undefined)
          remaining[dimension] = spend[dimension] === "unknown" ? 0 : Math.max(0, limit - spend[dimension])
      }
    }
    return remaining
  })

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

const toolGrant = (input: Input) =>
  Effect.gen(function* () {
    const admission = yield* Schema.decodeUnknownEffect(ToolInput)(input.message?.metadata.tool).pipe(
      Effect.mapError((error) => RuntimeUnavailable.make({ message: error.message })),
    )
    if (input.state.hostSessions.has(input.sessionId))
      return yield* RuntimeUnavailable.make({ message: "Tool Runs require an independent routing identity" })
    const sponsor = admission.parentRunId === undefined ? undefined : input.state.runs.get(admission.parentRunId)
    if (admission.parentRunId !== undefined && sponsor === undefined)
      return yield* RuntimeUnavailable.make({ message: "Tool sponsor does not exist" })
    const treePolicy = yield* narrow({
      policy: input.selection.treePolicy ?? sponsor?.treePolicy ?? input.state.delegationPolicy ?? defaultTreePolicy,
      ceiling: sponsor?.treePolicy ?? input.state.delegationPolicy,
    })
    yield* narrow({ policy: treePolicy, ceiling: input.state.delegationPolicy })
    return { treePolicy, budget: {}, depth: sponsor?.depth ?? 0, sponsor }
  })

export const rootGrant = (input: Input) =>
  Effect.gen(function* () {
    const active = input.selection.executableManifest.entries.find(
      (entry) => entry.pin === input.selection.executableRef.active,
    )
    if (active?._tag === "Tool") return yield* toolGrant(input)
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
    const remaining = input.bypassRetained === true ? profile : yield* retainedBudget(input)
    const budget = capGrant(capGrant(input.grant, profile), remaining)
    yield* requireAvailable(budget)
    return budget
  })
