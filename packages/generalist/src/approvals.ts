import { Effect, Layer, Schema } from "effect"
import { dual } from "effect/Function"
import { ActionableTaggedError, errorHint } from "./core/error-hint.js"
import { Approvals, type Approved, type Denied } from "./core/policy/approvals.js"
import { RuleStore, type Level, type RuleStoreError } from "./core/policy/permissions.js"
import { Runtime, type RespondApprovalError } from "./runtime/service.js"

export {
  Approvals,
  Approved,
  Denied,
  layerAutoApprove,
  layerConsole,
  layerDenyAll,
  layerTest,
  layerTiered,
  type Pending,
  type Resolution,
  type Service,
  type TieredOptions,
} from "./core/policy/approvals.js"

/** One durable approval notification. */
export interface DurableRequest {
  readonly runId: string
  readonly tool: string
  readonly args: unknown
  readonly level: Level
  readonly reason: string
  readonly token: string
}

export interface DurableOptions<R> {
  readonly notify: (request: DurableRequest) => Effect.Effect<void, never, R>
}

/** A Runtime approval token was malformed or did not carry a Run identity. */
export class ApprovalTokenInvalid extends ActionableTaggedError<ApprovalTokenInvalid>()(
  "generalist/approvals/ApprovalTokenInvalid",
  {
    token: Schema.String,
    message: Schema.String,
    hint: errorHint("Resolve the exact token emitted by Approvals.layerDurable."),
  },
) {}

const invalidToken = (token: string): ApprovalTokenInvalid =>
  ApprovalTokenInvalid.make({
    token,
    message: "Approval token does not contain a durable Runtime Run identity",
  })

const runIdFromToken = (token: string): Effect.Effect<string, ApprovalTokenInvalid> => {
  const prefix = "runtime-approval:"
  if (!token.startsWith(prefix)) return Effect.fail(invalidToken(token))
  const separator = token.indexOf(":", prefix.length)
  if (separator === -1) return Effect.fail(invalidToken(token))
  return Effect.try({
    try: () => decodeURIComponent(token.slice(prefix.length, separator)),
    catch: () => invalidToken(token),
  }).pipe(
    Effect.filterOrFail(
      (runId) => runId.length > 0,
      () => invalidToken(token),
    ),
  )
}

/** Park approval requests in the Runtime and notify one external operator boundary. */
export const layerDurable = <R>(options: DurableOptions<R>): Layer.Layer<Approvals, never, Runtime | R> =>
  Layer.effect(
    Approvals,
    Effect.gen(function* () {
      yield* Runtime
      const context = yield* Effect.context<Runtime | R>()
      return Approvals.of({
        resolve: (pending) => {
          if (pending.runId === undefined) {
            return Effect.succeed({
              _tag: "Denied",
              reason: "Durable approvals require a hosted Runtime Run",
            })
          }
          return options
            .notify({
              runId: pending.runId,
              tool: pending.call.name,
              args: pending.call.params,
              level: pending.level,
              reason: pending.reason,
              token: pending.token,
            })
            .pipe(Effect.provide(context), Effect.as(pending))
        },
      })
    }),
  )

export type ResolveError = ApprovalTokenInvalid | RespondApprovalError | RuleStoreError

/** Resolve one exact durable approval through the active Runtime. */
type ResolveEffect = Effect.Effect<void, ResolveError, Runtime | RuleStore>

const resolveImpl = (token: string, decision: Approved | Denied): ResolveEffect =>
  Effect.gen(function* () {
    const runId = yield* runIdFromToken(token)
    if (decision._tag === "Approved" && decision.remember !== undefined) {
      const rules = yield* RuleStore
      yield* rules.remember(decision.remember)
    }
    const runtime = yield* Runtime
    if (decision._tag === "Approved") {
      return yield* runtime.respondApproval({
        runId,
        approvalId: token,
        decision: { _tag: "Approved" },
      })
    }
    return yield* runtime.respondApproval({
      runId,
      approvalId: token,
      decision: decision.reason === undefined ? { _tag: "Denied" } : { _tag: "Denied", reason: decision.reason },
    })
  })

export const resolve: {
  (decision: Approved | Denied): (token: string) => ResolveEffect
  (token: string, decision: Approved | Denied): ResolveEffect
} = dual(2, resolveImpl)
