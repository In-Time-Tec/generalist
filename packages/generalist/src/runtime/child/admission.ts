import { Context, Effect, Schema } from "effect"
import { ActionableTaggedError, errorHint } from "../../core/error-hint.js"
import { ToolContext } from "../../core/tools/tool-context.js"
import { make as makeAddress } from "../address.js"
import { childSessionId } from "./session.js"
import { make as makeMessage } from "../messaging/message.js"
import { normalizePrompt } from "../memory/prompt.js"
import type {
  ChildSelectionMissing,
  IdempotencyConflict,
  RunIdConflict,
  RunNotFound,
  RunTerminal,
  RuntimeUnavailable,
} from "../errors.js"
import type { RunOutcome, RunStatus } from "../run.js"
import type { Service as RunStoreService } from "../run/store.js"
import type { ChildReadiness } from "./readiness.js"

/**
 * A Run addressed a child it does not own.
 *
 * Parentage is read from the durable child record, so knowing a child Run id grants nothing to a
 * Run that did not admit it.
 */
export class ChildParentageInvalid extends ActionableTaggedError<ChildParentageInvalid>()(
  "generalist/runtime/ChildParentageInvalid",
  {
    parentRunId: Schema.String,
    childRunId: Schema.String,
    hint: errorHint("Address only children owned by the current parent run."),
  },
) {}

/** Parameters for one non-blocking child admission. */
export const AdmitParameters = Schema.Struct({
  selection: Schema.String.check(Schema.isNonEmpty(), Schema.isMaxLength(128)),
  prompt: Schema.String.check(Schema.isNonEmpty()),
  /** Host-supplied admission identity. Two admissions under one key name one child. */
  key: Schema.String.check(Schema.isNonEmpty(), Schema.isMaxLength(128)),
})
export type AdmitParameters = typeof AdmitParameters.Type

/**
 * Stable receipt returned at admission, never an outcome.
 *
 * Admission answers "which durable child owns this work", not "what did it produce". A caller that
 * wants the answer joins explicitly, so a crash between admission and join never loses the child.
 */
export const AdmitReceipt = Schema.Struct({
  childRunId: Schema.String,
  key: Schema.String,
  duplicate: Schema.Boolean,
})
export type AdmitReceipt = typeof AdmitReceipt.Type

/** One direct child as the parent may observe it. */
export interface ChildInspection {
  readonly childRunId: string
  readonly status: RunStatus
  readonly readiness: ChildReadiness
  readonly invocationId?: string
  readonly origin?: ChildOrigin
  readonly outcome?: RunOutcome
}

/**
 * Non-blocking direct-child operations scoped to one parent Run.
 *
 * Every operation takes the parent Run id the host derived from the ambient `ToolContext`. Model
 * code never supplies parentage, so a child cannot be adopted, inspected, or cancelled by a Run
 * that does not own it.
 */
export type AdmitChildError =
  | import("../errors.js").ChildDepthExceeded
  | import("../errors.js").ChildLimitExceeded
  | ChildSelectionMissing
  | IdempotencyConflict
  | RunIdConflict
  | RunNotFound
  | RunTerminal
  | RuntimeUnavailable
  | import("../../core/durable/run-budget.js").Exhausted
export type ChildLookupError = ChildParentageInvalid | RunNotFound | RuntimeUnavailable

export interface Service {
  readonly admit: (input: {
    readonly parentRunId: string
    readonly toolCallId: string
    readonly selection: string
    readonly prompt: string
    readonly key: string
    readonly origin?: ChildOrigin
  }) => Effect.Effect<AdmitReceipt, AdmitChildError>
  readonly listDirect: (parentRunId: string) => Effect.Effect<ReadonlyArray<ChildInspection>, ChildLookupError>
  readonly inspect: (input: {
    readonly parentRunId: string
    readonly childRunId: string
  }) => Effect.Effect<ChildInspection, ChildLookupError>
  /**
   * Read a child's current state. This does NOT block until the child is terminal: an admission
   * handle never carries an answer, so a caller that must wait polls this or follows Run events.
   */
  readonly join: (input: {
    readonly parentRunId: string
    readonly childRunId: string
  }) => Effect.Effect<ChildInspection, ChildLookupError>
  readonly cancel: (input: {
    readonly parentRunId: string
    readonly childRunId: string
    readonly reason?: string
  }) => Effect.Effect<void, ChildLookupError>
}

/**
 * Where one admitted child came from, carried on the admission itself.
 *
 * A cell admits many children in one tool call, so the tool call alone does not say which cell
 * statement produced which child, nor in what order. Origin names the operation that ran the code
 * and the host-assigned ordinal within it, so a presentation layer can group children under their
 * originating cell in source order. It is derived from the ambient `ToolContext` and the host's own
 * counter, never from model-authored text.
 */
export interface ChildOrigin {
  readonly operationKey: string
  readonly ordinal: number
}

/**
 * The invocation identity one admission key names beneath its parent.
 *
 * Origin travels inside the invocation id because `invocationId` is the one admission field that
 * Generalist already carries into `ChildLinked` and every canonical child-tree event. Encoding it here
 * means correlation survives replay, restart, and reload with no event-schema change and no
 * reconstruction from cell source.
 */
export const invocationIdFor = (input: {
  readonly toolCallId: string
  readonly key: string
  readonly origin?: ChildOrigin
}): string =>
  input.origin === undefined
    ? `child-admit:${encodeURIComponent(input.toolCallId)}:${encodeURIComponent(input.key)}`
    : `child-admit:${encodeURIComponent(input.toolCallId)}:${encodeURIComponent(input.origin.operationKey)}#${
        input.origin.ordinal
      }:${encodeURIComponent(input.key)}`

/** The complete admission identity one invocation id carries. */
export interface ChildAdmissionIdentity {
  readonly toolCallId: string
  readonly key: string
  readonly origin?: ChildOrigin
}

/** Read the admission identity an invocation id encodes, if it is one. */
export const admissionOf = (invocationId: string): ChildAdmissionIdentity | undefined => {
  const parts = invocationId.split(":")
  if (parts[0] !== "child-admit") return undefined
  if (parts.length === 3) {
    return { toolCallId: decodeURIComponent(parts[1]!), key: decodeURIComponent(parts[2]!) }
  }
  if (parts.length !== 4) return undefined
  const marker = parts[2]!
  const separator = marker.lastIndexOf("#")
  if (separator <= 0) return undefined
  const ordinal = Number(marker.slice(separator + 1))
  if (!Number.isSafeInteger(ordinal) || ordinal < 0) return undefined
  return {
    toolCallId: decodeURIComponent(parts[1]!),
    key: decodeURIComponent(parts[3]!),
    origin: { operationKey: decodeURIComponent(marker.slice(0, separator)), ordinal },
  }
}

/** Read the origin an invocation id carries, if it carries one. */
export const originOf = (invocationId: string): ChildOrigin | undefined => admissionOf(invocationId)?.origin

/**
 * Build non-blocking child admission over one RunStore.
 *
 * This is additive: blocking `invoke` and the child-group operations keep their existing semantics.
 * A host that wants an immediate handle uses `admit`; a host that wants the loop to wait uses the
 * blocking route exactly as before.
 */
export const make = (store: RunStoreService): Service => {
  /** Read a child only after proving the caller is its recorded parent. */
  const owned = (input: { readonly parentRunId: string; readonly childRunId: string }) =>
    Effect.gen(function* () {
      const snapshot = yield* store.snapshot(input.childRunId)
      if (snapshot.run.parentRunId !== input.parentRunId) {
        return yield* ChildParentageInvalid.make({
          parentRunId: input.parentRunId,
          childRunId: input.childRunId,
        })
      }
      return snapshot
    })

  const inspection = (snapshot: {
    readonly run: { readonly runId: string; readonly status: RunStatus; readonly childReadiness?: ChildReadiness }
    readonly outcome?: RunOutcome
  }): ChildInspection => {
    const value = {
      childRunId: snapshot.run.runId,
      status: snapshot.run.status,
      readiness: snapshot.run.childReadiness ?? "settled",
    }
    return snapshot.outcome === undefined ? value : { ...value, outcome: snapshot.outcome }
  }

  return {
    admit: (input) =>
      Effect.gen(function* () {
        const invocation = {
          toolCallId: input.toolCallId,
          key: input.key,
        }
        const invocationId = invocationIdFor(
          input.origin === undefined ? invocation : { ...invocation, origin: input.origin },
        )
        const idempotencyKey = `child-admit:${input.parentRunId}:${invocationId}`
        const receipt = yield* store.admitSpawn({
          parentRunId: input.parentRunId,
          invocationId,
          selection: input.selection,
          prompt: input.prompt,
          message: makeMessage({
            id: `spawn:${idempotencyKey}`,
            to: makeAddress(`spawn:${input.parentRunId}`),
            sessionId: childSessionId({ parentRunId: input.parentRunId, invocationId }),
            prompt: normalizePrompt(input.prompt),
            idempotencyKey,
            correlationId: input.parentRunId,
            metadata: {
              runtimeChildAdmission: true,
              parentRunId: input.parentRunId,
              parentToolCallId: input.toolCallId,
              childAdmissionKey: input.key,
              ...Object.assign(
                {},
                input.origin === undefined
                  ? undefined
                  : { originOperationKey: input.origin.operationKey, originOrdinal: input.origin.ordinal },
              ),
            },
          }),
        })
        return { childRunId: receipt.runId, key: input.key, duplicate: receipt.duplicate }
      }),
    listDirect: (parentRunId) =>
      Effect.gen(function* () {
        const execution = yield* store.loadExecution(parentRunId)
        const checkpoint = yield* store.treeCheckpoint(execution.rootRunId)
        return checkpoint.inspection.runs
          .filter((entry) => entry.parentRunId === parentRunId)
          .map((entry) => {
            const value: ChildInspection = {
              childRunId: entry.run.runId,
              status: entry.run.status,
              readiness: entry.run.childReadiness ?? "settled",
            }
            if (entry.invocationId === undefined)
              return entry.outcome === undefined ? value : { ...value, outcome: entry.outcome }
            const foundOrigin = originOf(entry.invocationId)
            const identified =
              foundOrigin === undefined
                ? { ...value, invocationId: entry.invocationId }
                : { ...value, invocationId: entry.invocationId, origin: foundOrigin }
            return entry.outcome === undefined ? identified : { ...identified, outcome: entry.outcome }
          })
      }),
    inspect: (input) => Effect.map(owned(input), inspection),
    join: (input) => Effect.map(owned(input), inspection),
    cancel: (input) =>
      Effect.flatMap(owned(input), () =>
        store.cancel(
          input.reason === undefined ? { runId: input.childRunId } : { runId: input.childRunId, reason: input.reason },
        ),
      ),
  }
}

/**
 * Parent Run identity the host derived, never text the model supplied.
 *
 * A route reads parentage here rather than from tool parameters, which is what makes admission,
 * inspection, and cancellation unforgeable from model code.
 */
export const parentRunId: Effect.Effect<string, ChildParentageInvalid, ToolContext> = Effect.flatMap(
  ToolContext,
  (context) =>
    context.runId === undefined
      ? ChildParentageInvalid.make({ parentRunId: "", childRunId: "" })
      : Effect.succeed(context.runId),
)

const origin: Effect.Effect<
  { readonly parentRunId: string; readonly toolCallId: string; readonly operationKey?: string },
  ChildParentageInvalid,
  ToolContext
> = Effect.gen(function* () {
  const derived = yield* parentRunId
  const context = yield* ToolContext
  return context.toolCallId === undefined
    ? yield* ChildParentageInvalid.make({ parentRunId: derived, childRunId: "" })
    : Object.assign(
        {
          parentRunId: derived,
          toolCallId: context.toolCallId,
        },
        context.operationKey === undefined ? undefined : { operationKey: context.operationKey },
      )
})

/**
 *
 * @effect-expect-leaking ToolContext
 * ToolContext is the per-call ambient identity of the running execution. Binding one Run into the
 * service at Layer creation would let a caller admit and cancel children under another Run, which is
 * exactly the forgery this contract exists to prevent.
 */
export class AgentChildren extends Context.Service<
  AgentChildren,
  {
    readonly admit: (
      input: AdmitParameters,
    ) => Effect.Effect<AdmitReceipt, AdmitChildError | ChildParentageInvalid, ToolContext>
    readonly listDirect: Effect.Effect<ReadonlyArray<ChildInspection>, ChildLookupError, ToolContext>
    readonly inspect: (input: {
      readonly childRunId: string
    }) => Effect.Effect<ChildInspection, ChildLookupError, ToolContext>
    readonly join: (input: {
      readonly childRunId: string
    }) => Effect.Effect<ChildInspection, ChildLookupError, ToolContext>
    readonly cancel: (input: {
      readonly childRunId: string
      readonly reason?: string
    }) => Effect.Effect<void, ChildLookupError, ToolContext>
  }
>()("generalist/runtime/child/admission/AgentChildren") {}

/**
 * Build in-execution direct-child operations over one RunStore.
 *
 * The ordinal is derived from the parent's own durable children, never from an in-process counter
 * and never from the caller's payload. Two properties depend on that choice. It is unforgeable,
 * because cell code cannot influence what the Run store already recorded. And it is stable across
 * replay: the ordinal is encoded into the invocation id, which derives the idempotency key, so a
 * counter that restarted at zero after a restart would mint a second invocation id for the same
 * logical spawn and silently duplicate a child Run. A key already admitted under this operation
 * keeps the exact ordinal it was first given; only a genuinely new key extends the sequence.
 *
 * This costs one direct-child read per admission. That cost is deliberate: caching the sequence in
 * process would reintroduce exactly the duplicate-child failure above, so restart safety is chosen
 * over speed here and the read must not be optimised away.
 */
export const makeAgentChildren = (store: RunStoreService): AgentChildren["Service"] => {
  const operations = make(store)
  const admitted = (runId: string, operationKey: string) =>
    Effect.map(operations.listDirect(runId), (children) => {
      const origins = children.flatMap((child) => {
        const admission = child.invocationId === undefined ? undefined : admissionOf(child.invocationId)
        return admission?.origin?.operationKey === operationKey ? [{ key: admission.key, ...admission.origin }] : []
      })
      return {
        assigned: new Map(origins.map((entry) => [entry.key, entry.ordinal] as const)),
        next: origins.reduce((highest, entry) => Math.max(highest, entry.ordinal + 1), 0),
      }
    })
  return {
    admit: (input) =>
      Effect.flatMap(origin, (derived) => {
        const operationKey = derived.operationKey
        if (operationKey === undefined) return operations.admit({ ...input, ...derived })
        return Effect.flatMap(admitted(derived.parentRunId, operationKey), (ordinals) =>
          operations.admit({
            ...input,
            ...derived,
            origin: { operationKey, ordinal: ordinals.assigned.get(input.key) ?? ordinals.next },
          }),
        )
      }),
    listDirect: Effect.flatMap(parentRunId, operations.listDirect),
    inspect: (input) =>
      Effect.flatMap(parentRunId, (derived) => operations.inspect({ ...input, parentRunId: derived })),
    join: (input) => Effect.flatMap(parentRunId, (derived) => operations.join({ ...input, parentRunId: derived })),
    cancel: (input) => Effect.flatMap(parentRunId, (derived) => operations.cancel({ ...input, parentRunId: derived })),
  }
}
