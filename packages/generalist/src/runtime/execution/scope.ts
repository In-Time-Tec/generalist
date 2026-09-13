/* oxlint-disable effecttsgo/any-unknown-in-error-context -- This internal bridge deliberately erases heterogeneous registered Agent and Layer environments, then restores them from exact registration metadata. */
import { Context, Deferred, Effect, Equal, Layer, Option, Predicate, Schema, Scope, Semaphore, Stream } from "effect"
import { Prompt } from "effect/unstable/ai"
import type { Any as AnyAgent, Input, Output } from "../../core/agent/lifecycle/definition.js"
import { encode as encodeAgentInput } from "../../core/agent/lifecycle/input.js"
import { digest } from "../../core/durable/canonical-json.js"
import type { Exhausted as RunBudgetExhausted } from "../../core/durable/run-budget.js"
import type { DurabilityFailure } from "../../durability/errors.js"
import { make as makeAddress } from "../address.js"
import type { ChildParentageInvalid } from "../child/admission.js"
import { childSessionId } from "../child/session.js"
import type { RegisteredAgent, RegisteredAgents } from "../executable/registered-agent.js"
import {
  ChildDepthExceeded,
  ChildLimitExceeded,
  RunNotFound,
  RuntimeUnavailable,
  type PayloadTooLarge,
  type RunTerminal,
} from "../errors.js"
import { make as makeMessage } from "../messaging/message.js"
import { isTerminal, type RunOutcome, type RunStatus } from "../run.js"
import type { ExecutionClaim, ExecutionRecord, Service as RunStoreService } from "../run/store.js"
import type { StaleClaim, StaleSessionClaim } from "../run/ownership-errors.js"
import { normalizePrompt } from "../state/prompt.js"
import type { Service as EngineService } from "../engine.js"
import { Runtime, type Service as RuntimeService } from "../service.js"
import { get as getExternalChildRuntime } from "../child/external/runtime.js"
import { ExternalChildStore, type Service as ExternalChildStoreService } from "../child/external/store.js"
import type { Placement, ScopedAdmissionRequest } from "../child/external/placement.js"

const ExecutionScopeTypeId: unique symbol = Symbol("generalist/runtime/ExecutionScope")
const ChildReceiptTypeId: unique symbol = Symbol("generalist/runtime/ChildReceipt")

/** A requested child execution partition. */
export interface ChildPlacement {
  readonly partition: string
}

/** Nominal receipt for one child admitted by an ExecutionScope. */
export interface ChildReceipt<AgentName extends string, ChildOutput> {
  readonly [ChildReceiptTypeId]: (output: ChildOutput) => ChildOutput
  readonly childRunId: string
  readonly sessionId: string
  readonly agent: AgentName
  readonly placement: { readonly partition: string }
  readonly duplicate: boolean
}

/** Stable application-facing child failure. */
export interface ChildFailure {
  readonly code: string
  readonly message: string
  readonly retryable: boolean
}

/** Terminal child result observed through its issuing ExecutionScope. */
export type ChildOutcome<ChildOutput> =
  | { readonly _tag: "Succeeded"; readonly output: ChildOutput }
  | { readonly _tag: "Failed"; readonly failure: ChildFailure }
  | { readonly _tag: "Cancelled"; readonly reason?: string }

/** One direct child as visible to its parent execution. */
export interface ChildInspection {
  readonly childRunId: string
  readonly sessionId: string
  readonly agent: string
  readonly status: RunStatus
  readonly readiness: "admitted" | "active" | "terminal"
  readonly invocationId: string
  readonly placement: { readonly partition: string }
}

/** A claimed execution attempt no longer owns its Run. */
export class ExecutionScopeRetired extends Schema.TaggedError<ExecutionScopeRetired>()(
  "generalist/runtime/ExecutionScopeRetired",
  { runId: Schema.String, incarnation: Schema.String },
) {}

/** One child command was replayed with different immutable facts. */
export class ChildCommandConflict extends Schema.TaggedError<ChildCommandConflict>()(
  "generalist/runtime/ChildCommandConflict",
  {
    parentRunId: Schema.String,
    commandId: Schema.String,
    existingChildRunId: Schema.String,
  },
) {}

/** The Runtime cannot authorize or reach the requested child placement. */
export class ChildPlacementDenied extends Schema.TaggedError<ChildPlacementDenied>()(
  "generalist/runtime/ChildPlacementDenied",
  { parentRunId: Schema.String, partition: Schema.String },
) {}

/** Typed failures exposed by execution-scoped child operations. */
export type ChildCapabilityFailure =
  | ExecutionScopeRetired
  | ChildCommandConflict
  | ChildPlacementDenied
  | ChildDepthExceeded
  | ChildLimitExceeded
  | RunBudgetExhausted
  | RunNotFound
  | RunTerminal
  | RuntimeUnavailable
  | DurabilityFailure

/** Child operations issued only for one live execution attempt. */
export interface ChildCapabilities<Agents extends Readonly<Record<string, AnyAgent>>> {
  readonly start: <Name extends Extract<keyof Agents, string>>(input: {
    readonly agent: Name
    readonly input: Input<Agents[Name]>
    readonly commandId: string
    readonly placement?: ChildPlacement
    readonly label?: string
  }) => Effect.Effect<ChildReceipt<Name, Output<Agents[Name]>>, ChildCapabilityFailure>
  readonly list: Effect.Effect<ReadonlyArray<ChildInspection>, ChildCapabilityFailure>
  readonly inspect: (childRunId: string) => Effect.Effect<ChildInspection, ChildCapabilityFailure>
  readonly await: <Name extends string, ChildOutput>(
    child: ChildReceipt<Name, ChildOutput>,
  ) => Effect.Effect<ChildOutcome<ChildOutput>, ChildCapabilityFailure>
  readonly cancel: <Name extends string, ChildOutput>(
    child: ChildReceipt<Name, ChildOutput>,
    input: { readonly commandId: string; readonly reason?: string },
  ) => Effect.Effect<void, ChildCapabilityFailure>
}

/** Opaque authority for child work beneath one live execution attempt. */
export interface ExecutionScope<Agents extends Readonly<Record<string, AnyAgent>>> {
  readonly [ExecutionScopeTypeId]: typeof ExecutionScopeTypeId
  readonly runId: string
  readonly sessionId: string
  readonly children: ChildCapabilities<Agents>
}

/** Infallible per-execution service declaration. */
export type ExecutionServicesFactory<Agents extends Readonly<Record<string, AnyAgent>>, Services, Requirements> = (
  scope: ExecutionScope<Agents>,
) => Layer.Layer<Services, never, Requirements>

/** @internal Erased factory retained beside one exact registered revision. */
export type ErasedExecutionServicesFactory = ExecutionServicesFactory<
  Readonly<Record<string, AnyAgent>>,
  unknown,
  unknown
>

interface RuntimeIdentityCell {
  current: RuntimeService | undefined
  readonly readiness: Deferred.Deferred<RuntimeService>
}

type RuntimeIdentityOwner = RuntimeService | EngineService

const runtimeIdentity = new WeakMap<RuntimeIdentityOwner, RuntimeIdentityCell>()

const identityCell = (runtime: RuntimeIdentityOwner): RuntimeIdentityCell => {
  const existing = runtimeIdentity.get(runtime)
  if (existing !== undefined) return existing
  const created = { current: undefined, readiness: Deferred.makeUnsafe<RuntimeService>() }
  runtimeIdentity.set(runtime, created)
  return created
}

/** @internal Preserve the late-bound Runtime identity when a facade copies a service. */
export const copyRuntimeBinding = <Target extends RuntimeIdentityOwner>(input: {
  readonly source: RuntimeIdentityOwner
  readonly target: Target
}): Target => {
  const cell = identityCell(input.source)
  runtimeIdentity.set(input.target, cell)
  return input.target
}

/** @internal Publish one Runtime identity only after its activation is ready. */
export const markRuntimeReady = (runtime: RuntimeService): Effect.Effect<void> =>
  Effect.suspend(() => {
    const cell = identityCell(runtime)
    cell.current = runtime
    return Deferred.succeed(cell.readiness, runtime).pipe(Effect.asVoid)
  })

const readyRuntime = (runtime: EngineService | undefined): Effect.Effect<RuntimeService, RuntimeUnavailable> =>
  Effect.suspend(() => {
    if (runtime === undefined) {
      return RuntimeUnavailable.make({ message: "Execution services require the ready Runtime identity" })
    }
    const cell = runtimeIdentity.get(runtime)
    if (cell === undefined) {
      return RuntimeUnavailable.make({ message: "Execution services require a Runtime readiness binding" })
    }
    return cell.current === undefined ? Deferred.await(cell.readiness) : Effect.succeed(cell.current)
  })

/** @internal Exact registered environment used to acquire one attempt's services. */
export interface RegisteredExecutionBinding {
  readonly agents: RegisteredAgents
  readonly registration: RegisteredAgent
  readonly base: Context.Context<unknown>
  readonly executionServices?: ErasedExecutionServicesFactory
  readonly partition: string
}

interface ReceiptMetadata {
  readonly owner: object
  readonly runtime: RuntimeService
  readonly registration: RegisteredAgent
  readonly childRunId: string
  readonly external?: {
    readonly partition: string
    readonly placementId: string
  }
}

const receipts = new WeakMap<object, ReceiptMetadata>()
const receiptVariance = <A>(output: A): A => output

const retired = (runId: string, incarnation: string) => ExecutionScopeRetired.make({ runId, incarnation })

const agentName = (record: ExecutionRecord): string => {
  const active = record.executableManifest.entries.find((entry) => entry.pin === record.executableRef.active)
  return active?._tag === "Agent" ? active.manifest.name : (active?._tag ?? "unknown")
}

const readiness = (status: RunStatus): ChildInspection["readiness"] => {
  if (isTerminal(status)) return "terminal"
  return status === "queued" ? "admitted" : "active"
}

const failure = (outcome: Extract<RunOutcome, { readonly _tag: "Failed" }>): ChildFailure => ({
  code: outcome.error._tag,
  message: outcome.error.message,
  retryable: false,
})

type FencedChildCancellation = (input: {
  readonly claim: ExecutionClaim
  readonly childRunId: string
  readonly commandId: string
  readonly reason?: string
}) => Effect.Effect<
  void,
  ChildCapabilityFailure | ChildParentageInvalid | PayloadTooLarge | StaleClaim | StaleSessionClaim
>

/** @internal One issued scope together with its attempt-owned environment and finalizer. */
export interface IssuedExecutionScope {
  readonly scope: ExecutionScope<Readonly<Record<string, AnyAgent>>>
  readonly environment: Layer.Layer<unknown>
  readonly retire: Effect.Effect<void>
}

/** @internal Acquire the exact revision factory once for one claimed Agent attempt. */
export const issue = (options: {
  readonly binding: RegisteredExecutionBinding
  readonly claim: ExecutionClaim
  readonly claimed: ExecutionRecord
  readonly store: RunStoreService
  readonly runtime: EngineService | undefined
  readonly cancelChild: FencedChildCancellation
}): Effect.Effect<IssuedExecutionScope, RuntimeUnavailable, import("effect").Scope.Scope> =>
  Effect.gen(function* () {
    const boundRuntime = yield* readyRuntime(options.runtime)
    const externalRuntime = getExternalChildRuntime(boundRuntime)
    const incarnation = digest([
      "execution-scope",
      options.claim.runId,
      options.claim.ownerId,
      options.claim.attemptFence,
    ])
    const owner = {}
    let isRetired = false
    const retirement = yield* Deferred.make<void>()
    const admissions = yield* Semaphore.make(1)
    const retiredFailure = retired(options.claim.runId, incarnation)
    const placementDenied = (partition: string) =>
      ChildPlacementDenied.make({ parentRunId: options.claim.runId, partition })
    const routeFor = (partition: string) =>
      Effect.suspend(() => {
        if (
          externalRuntime === undefined ||
          externalRuntime.partition !== options.binding.partition ||
          Option.isNone(externalRuntime.routes)
        ) {
          return Effect.fail(placementDenied(partition))
        }
        return externalRuntime.routes.value.connect(partition).pipe(
          Effect.flatMap(
            Option.match({
              onNone: () => Effect.fail(placementDenied(partition)),
              onSome: Effect.succeed,
            }),
          ),
        )
      })
    const withPeer = <A, E>(
      partition: string,
      use: (peer: ExternalChildStoreService) => Effect.Effect<A, E>,
    ) =>
      Effect.scoped(
        Effect.gen(function* () {
          const peerLayer = yield* routeFor(partition)
          const services = yield* Layer.build(peerLayer)
          const peer = yield* ExternalChildStore.pipe(Effect.provide(services))
          return yield* use(peer)
        }),
      )
    const retire = Effect.suspend(() => {
      if (isRetired) return Effect.void
      isRetired = true
      return Deferred.succeed(retirement, undefined).pipe(Effect.asVoid)
    })
    yield* Effect.addFinalizer(() => retire)
    const assertLive: Effect.Effect<void, ChildCapabilityFailure> = Effect.suspend(() => {
      if (isRetired) return Effect.fail(retiredFailure)
      return options.store.assertExecutionClaim(options.claim).pipe(
        Effect.catchTags({
          "generalist/runtime/StaleClaim": () => Effect.fail(retiredFailure),
          "generalist/runtime/StaleSessionClaim": () => Effect.fail(retiredFailure),
        }),
      )
    })
    const interrupted = Deferred.await(retirement).pipe(Effect.andThen(Effect.fail(retiredFailure)))
    const readWhileLive = <A>(
      operation: Effect.Effect<A, ChildCapabilityFailure>,
    ): Effect.Effect<A, ChildCapabilityFailure> =>
      assertLive.pipe(
        Effect.andThen(Effect.raceFirst(operation, interrupted)),
        Effect.tap(() => assertLive),
      )
    const notAChild = (childRunId: string) => RunNotFound.make({ runId: childRunId })
    const inspectLocalChild = (childRunId: string): Effect.Effect<ChildInspection, ChildCapabilityFailure> =>
      Effect.gen(function* () {
        const directory = yield* options.store.directory(childRunId)
        if (directory.parentRunId !== options.claim.runId) return yield* notAChild(childRunId)
        const record = yield* options.store.loadExecution(childRunId)
        const placed = record.message.metadata.executionScopePartition
        return {
          childRunId,
          sessionId: directory.sessionId,
          agent: agentName(record),
          status: directory.status,
          readiness: readiness(directory.status),
          invocationId: record.invocationId ?? childRunId,
          placement: {
            partition: Predicate.isString(placed) ? placed : options.binding.partition,
          },
        }
      })
    const externalAgentName = (placement: Placement): string => {
      const root = placement.request.root
      const active = root.executableManifest.entries.find((entry) => entry.pin === root.executableRef.active)
      return active?._tag === "Agent" ? active.manifest.name : (active?._tag ?? "unknown")
    }
    const statusForOutcome = (outcome: RunOutcome): RunStatus => {
      switch (outcome._tag) {
        case "Succeeded":
          return "succeeded"
        case "Failed":
          return "failed"
        case "Cancelled":
          return "cancelled"
      }
    }
    const placementsForParent = (): Effect.Effect<ReadonlyArray<Placement>, ChildCapabilityFailure> =>
      Effect.suspend(() => {
        if (externalRuntime === undefined || externalRuntime.partition !== options.binding.partition) {
          return Effect.succeed([])
        }
        return Effect.gen(function* () {
          const placements: Array<Placement> = []
          let afterPlacementId: string | undefined
          do {
            const page = yield* externalRuntime.store.placementsByParent({
              parentRunId: options.claim.runId,
              limit: 1000,
              ...(afterPlacementId === undefined ? undefined : { afterPlacementId }),
            })
            placements.push(...page.items)
            afterPlacementId = page.cursor
          } while (afterPlacementId !== undefined)
          return placements
        })
      })
    const findExternalPlacement = (childRunId: string) =>
      placementsForParent().pipe(
        Effect.flatMap((placements) => {
          const placement = placements.find((candidate) => candidate.request.ref.runId === childRunId)
          return placement === undefined ? Effect.fail(notAChild(childRunId)) : Effect.succeed(placement)
        }),
      )
    const inspectExternalPlacement = (placement: Placement): Effect.Effect<ChildInspection, ChildCapabilityFailure> =>
      Effect.gen(function* () {
        const partition = placement.request.ref.partition
        if (placement.settled && placement.outcome !== undefined) {
          yield* routeFor(partition)
          const status = statusForOutcome(placement.outcome)
          return {
            childRunId: placement.request.ref.runId,
            sessionId: placement.request.root.message.sessionId,
            agent: externalAgentName(placement),
            status,
            readiness: "terminal",
            invocationId: placement.invocationId,
            placement: { partition },
          }
        }
        const inspected = yield* withPeer(partition, (peer) =>
          peer.inspectRootRun(placement.placementId).pipe(
            Effect.map(Option.some),
            Effect.catchTag("generalist/runtime/ExternalRootNotFound", () => Effect.succeed(Option.none())),
          ),
        )
        if (Option.isNone(inspected)) {
          if (placement.acknowledged) {
            return yield* RuntimeUnavailable.make({
              message: `External child ${placement.request.ref.runId} is missing after admission acknowledgement`,
            })
          }
          return {
            childRunId: placement.request.ref.runId,
            sessionId: placement.request.root.message.sessionId,
            agent: externalAgentName(placement),
            status: "queued",
            readiness: "admitted",
            invocationId: placement.invocationId,
            placement: { partition },
          }
        }
        const root = inspected.value.root
        if (
          !Equal.equals(root.parent, placement.request.parent) ||
          !Equal.equals(root.ref, placement.request.ref) ||
          root.requestDigest !== placement.requestDigest ||
          root.executableDigest !== placement.executableDigest
        ) {
          return yield* RuntimeUnavailable.make({
            message: `External child ${placement.request.ref.runId} does not match its placement`,
          })
        }
        return {
          childRunId: placement.request.ref.runId,
          sessionId: root.sessionId,
          agent: externalAgentName(placement),
          status: inspected.value.status,
          readiness: readiness(inspected.value.status),
          invocationId: placement.invocationId,
          placement: { partition },
        }
      })
    const inspectChild = (childRunId: string): Effect.Effect<ChildInspection, ChildCapabilityFailure> =>
      inspectLocalChild(childRunId).pipe(
        Effect.catchTag("generalist/runtime/RunNotFound", () =>
          findExternalPlacement(childRunId).pipe(Effect.flatMap(inspectExternalPlacement)),
        ),
      )
    const metadataFor = <Name extends string, ChildOutput>(
      receipt: ChildReceipt<Name, ChildOutput>,
    ): Effect.Effect<ReceiptMetadata, RunNotFound> =>
      Effect.suspend(() => {
        const metadata = receipts.get(receipt)
        return metadata !== undefined &&
          metadata.owner === owner &&
          metadata.runtime === boundRuntime &&
          metadata.childRunId === receipt.childRunId
          ? Effect.succeed(metadata)
          : Effect.fail(notAChild(receipt.childRunId))
      })
    const terminalSnapshot = (childRunId: string): Effect.Effect<RunOutcome, ChildCapabilityFailure> =>
      Effect.suspend(() =>
        options.store.snapshot(childRunId).pipe(
          Effect.flatMap((snapshot) => {
            if (snapshot.run.parentRunId !== options.claim.runId) return Effect.fail(notAChild(childRunId))
            if (snapshot.outcome !== undefined) return Effect.succeed(snapshot.outcome)
            return options.store.events({ runId: childRunId, cursor: snapshot.cursor }).pipe(
              Stream.runHead,
              Effect.flatMap((event) =>
                Option.isSome(event)
                  ? terminalSnapshot(childRunId)
                  : RuntimeUnavailable.make({ message: `Child ${childRunId} event stream ended before settlement` }),
              ),
              Effect.catchTags({
                "generalist/runtime/CursorExpired": () => terminalSnapshot(childRunId),
                "generalist/runtime/SubscriberLagged": () => terminalSnapshot(childRunId),
              }),
            )
          }),
        ),
      )
    const terminalExternalPlacement = (
      metadata: NonNullable<ReceiptMetadata["external"]>,
      childRunId: string,
    ): Effect.Effect<RunOutcome, ChildCapabilityFailure> =>
      Effect.suspend(() => {
        if (externalRuntime === undefined) return Effect.fail(notAChild(childRunId))
        return externalRuntime.store.inspectPlacement(metadata.placementId).pipe(
          Effect.flatMap((placement) => {
            if (
              placement.parentRunId !== options.claim.runId ||
              placement.request.ref.runId !== childRunId ||
              placement.request.ref.partition !== metadata.partition
            ) {
              return Effect.fail(notAChild(childRunId))
            }
            if (placement.outcome !== undefined) return Effect.succeed(placement.outcome)
            return Effect.sleep("10 millis").pipe(
              Effect.andThen(terminalExternalPlacement(metadata, childRunId)),
            )
          }),
          Effect.catchTag("generalist/runtime/ExternalChildPlacementNotFound", () =>
            Effect.fail(notAChild(childRunId)),
          ),
        )
      })
    const decodeOutcome = <ChildOutput>(
      metadata: ReceiptMetadata,
      outcome: RunOutcome,
    ): Effect.Effect<ChildOutcome<ChildOutput>, ChildCapabilityFailure> => {
      if (outcome._tag === "Failed") return Effect.succeed({ _tag: "Failed", failure: failure(outcome) })
      if (outcome._tag === "Cancelled") {
        return Effect.succeed(
          outcome.reason === undefined
            ? ({ _tag: "Cancelled" as const } satisfies ChildOutcome<never>)
            : ({ _tag: "Cancelled" as const, reason: outcome.reason } satisfies ChildOutcome<never>),
        )
      }
      if (!("output" in outcome.result)) {
        return RuntimeUnavailable.make({ message: `Child ${metadata.childRunId} was not an Agent Run` })
      }
      return Schema.decodeEffect(metadata.registration.source.output)(outcome.result.output).pipe(
        Effect.provideContext(metadata.registration.context),
        // SAFETY: receipt ownership ties this exact registered Agent output schema to ChildOutput.
        // oxlint-disable-next-line typescript/no-unsafe-type-assertion
        Effect.map((output) => ({ _tag: "Succeeded" as const, output: output as ChildOutput })),
        Effect.mapError((error) =>
          RuntimeUnavailable.make({ message: `Child output cannot be decoded: ${String(error)}` }),
        ),
      )
    }
    const start: ChildCapabilities<Readonly<Record<string, AnyAgent>>>["start"] = (input) =>
      admissions.withPermit(
        Effect.gen(function* () {
          yield* assertLive
          const requestedPartition = input.placement?.partition ?? options.binding.partition
          const selected = yield* options.binding.agents.get(input.agent)
          if (Option.isNone(selected)) {
            return yield* RuntimeUnavailable.make({
              message: `Execution revision does not register Agent ${input.agent}`,
            })
          }
          const encoded = yield* encodeAgentInput(selected.value.source.input, input.input).pipe(
            Effect.provideContext(selected.value.context),
            Effect.mapError((error) => RuntimeUnavailable.make({ message: error.message })),
          )
          yield* assertLive
          const commandIdentity = digest(["execution-scope-child", options.claim.runId, input.commandId])
          const childRunId = `run_child_${commandIdentity.slice(0, 32)}`
          const invocationId = `execution-scope:${commandIdentity}`
          const sessionId = childSessionId({ parentRunId: options.claim.runId, invocationId })
          const prompt = normalizePrompt(encoded)
          const encodedPrompt = yield* Schema.encodeEffect(Prompt.Prompt)(prompt).pipe(
            Effect.mapError((error) =>
              RuntimeUnavailable.make({ message: `Child prompt cannot be encoded: ${String(error)}` }),
            ),
          )
          const factsIdentity = digest([
            "execution-scope-child-facts",
            input.agent,
            selected.value.executable.ref.executable,
            selected.value.executable.ref.active,
            requestedPartition,
            input.label ?? null,
            encodedPrompt,
          ])
          const metadata = {
            executionScopeChild: true,
            executionScopeCommand: commandIdentity,
            executionScopeFacts: factsIdentity,
            executionScopePartition: requestedPartition,
            parentRunId: options.claim.runId,
            ...Object.assign({}, input.label === undefined ? undefined : { childLabel: input.label }),
          }
          const message = makeMessage({
            id: `execution-scope:${commandIdentity}`,
            to: makeAddress(`execution-scope:${options.claim.runId}`),
            sessionId,
            idempotencyKey: `execution-scope:${commandIdentity}`,
            correlationId: options.claimed.rootRunId,
            prompt,
            metadata,
          })
          const placementId = `execution-scope:${commandIdentity}`
          const receiptFor = (
            runId: string,
            duplicate: boolean,
            external?: NonNullable<ReceiptMetadata["external"]>,
          ) => {
            const receipt: ChildReceipt<typeof input.agent, unknown> = {
              [ChildReceiptTypeId]: receiptVariance,
              childRunId: runId,
              sessionId,
              agent: input.agent,
              placement: { partition: requestedPartition },
              duplicate,
            }
            Object.defineProperty(receipt, ChildReceiptTypeId, { enumerable: false })
            const receiptMetadata = {
              owner,
              runtime: boundRuntime,
              registration: selected.value,
              childRunId: runId,
            }
            receipts.set(receipt, external === undefined ? receiptMetadata : { ...receiptMetadata, external })
            return Object.freeze(receipt)
          }
          const existing = yield* options.store.loadExecution(childRunId).pipe(
            Effect.map(Option.some),
            Effect.catchTag("generalist/runtime/RunNotFound", () => Effect.succeed(Option.none())),
          )
          if (Option.isSome(existing)) {
            if (
              existing.value.parentRunId !== options.claim.runId ||
              existing.value.invocationId !== invocationId ||
              existing.value.message.metadata.executionScopeCommand !== commandIdentity ||
              existing.value.message.metadata.executionScopeFacts !== factsIdentity
            ) {
              return yield* ChildCommandConflict.make({
                parentRunId: options.claim.runId,
                commandId: input.commandId,
                existingChildRunId: childRunId,
              })
            }
            yield* assertLive
            return receiptFor(childRunId, false)
          }
          const existingPlacement =
            externalRuntime === undefined
              ? Option.none<Placement>()
              : yield* externalRuntime.store.inspectPlacement(placementId).pipe(
                  Effect.map(Option.some),
                  Effect.catchTag("generalist/runtime/ExternalChildPlacementNotFound", () =>
                    Effect.succeed(Option.none<Placement>()),
                  ),
                )
          if (Option.isSome(existingPlacement)) {
            const placement = existingPlacement.value
            if (
              placement.parentRunId !== options.claim.runId ||
              placement.invocationId !== invocationId ||
              placement.request.parent.partition !== options.binding.partition ||
              placement.request.ref.partition !== requestedPartition ||
              placement.request.ref.runId !== childRunId ||
              placement.request.root.message.metadata.executionScopeCommand !== commandIdentity ||
              placement.request.root.message.metadata.executionScopeFacts !== factsIdentity
            ) {
              return yield* ChildCommandConflict.make({
                parentRunId: options.claim.runId,
                commandId: input.commandId,
                existingChildRunId: placement.request.ref.runId,
              })
            }
            yield* routeFor(requestedPartition)
            yield* assertLive
            return receiptFor(childRunId, false, { partition: requestedPartition, placementId })
          }
          if (requestedPartition !== options.binding.partition) {
            yield* routeFor(requestedPartition)
            yield* assertLive
            if (externalRuntime === undefined || options.claim.session === undefined) {
              return yield* RuntimeUnavailable.make({
                message: "External child placement requires a claimed parent Session",
              })
            }
            const request: ScopedAdmissionRequest = {
              parent: { partition: options.binding.partition, runId: options.claim.runId },
              ref: { partition: requestedPartition, runId: childRunId },
              root: {
                message,
                executableRef: selected.value.executable.ref,
                executableManifest: selected.value.executable.manifest,
                registrations: selected.value.registrations,
              },
            }
            const reserved = yield* externalRuntime.store
              .reserveScoped({
                runId: options.claim.runId,
                ownerId: options.claim.ownerId,
                attemptFence: options.claim.attemptFence,
                session: options.claim.session,
                placementId,
                invocationId,
                request,
              })
              .pipe(
                Effect.catchTags({
                  "generalist/runtime/ExternalChildPlacementConflict": () =>
                    ChildCommandConflict.make({
                      parentRunId: options.claim.runId,
                      commandId: input.commandId,
                      existingChildRunId: childRunId,
                    }),
                  "generalist/runtime/StaleClaim": () => Effect.fail(retiredFailure),
                  "generalist/runtime/StaleSessionClaim": () => Effect.fail(retiredFailure),
                  "generalist/runtime/PayloadTooLarge": (error) =>
                    RuntimeUnavailable.make({ message: error.message }),
                  "generalist/durability/DurabilityFailure": (error) =>
                    error.reason === "input-conflict"
                      ? ChildCommandConflict.make({
                          parentRunId: options.claim.runId,
                          commandId: input.commandId,
                          existingChildRunId: childRunId,
                        })
                      : Effect.fail(error),
                  "generalist/core/RunBudgetExhausted": (error) => Effect.fail(error),
                }),
              )
            return receiptFor(reserved.request.ref.runId, false, {
              partition: requestedPartition,
              placementId: reserved.placementId,
            })
          }
          const admitted = yield* options.store
            .admitProgramChild({
              ...options.claim,
              childRunId,
              invocationId,
              executableRef: selected.value.executable.ref,
              executableManifest: selected.value.executable.manifest,
              registrations: selected.value.registrations,
              message,
            })
            .pipe(
              Effect.catchTags({
                "generalist/runtime/IdempotencyConflict": (error) =>
                  ChildCommandConflict.make({
                    parentRunId: options.claim.runId,
                    commandId: input.commandId,
                    existingChildRunId: error.existingRunId,
                  }),
                "generalist/runtime/RunIdConflict": (error) =>
                  ChildCommandConflict.make({
                    parentRunId: options.claim.runId,
                    commandId: input.commandId,
                    existingChildRunId: error.existingRunId,
                  }),
                "generalist/runtime/StaleClaim": () => Effect.fail(retiredFailure),
                "generalist/runtime/StaleSessionClaim": () => Effect.fail(retiredFailure),
                "generalist/runtime/PayloadTooLarge": (error) => RuntimeUnavailable.make({ message: error.message }),
                "generalist/durability/DurabilityFailure": (error) =>
                  error.reason === "input-conflict"
                    ? ChildCommandConflict.make({
                        parentRunId: options.claim.runId,
                        commandId: input.commandId,
                        existingChildRunId: childRunId,
                      })
                    : Effect.fail(error),
                "generalist/core/RunBudgetExhausted": (error) => Effect.fail(error),
              }),
            )
          return receiptFor(admitted.runId, admitted.duplicate)
        }),
      )
    const awaitChild = <Name extends string, ChildOutput>(
      receipt: ChildReceipt<Name, ChildOutput>,
    ): Effect.Effect<ChildOutcome<ChildOutput>, ChildCapabilityFailure> =>
      readWhileLive(
        Effect.gen(function* () {
          const metadata = yield* metadataFor(receipt)
          const outcome =
            metadata.external === undefined
              ? yield* terminalSnapshot(metadata.childRunId)
              : yield* routeFor(metadata.external.partition).pipe(
                  Effect.andThen(terminalExternalPlacement(metadata.external, metadata.childRunId)),
                )
          return yield* decodeOutcome<ChildOutput>(metadata, outcome)
        }),
      )
    const children: ChildCapabilities<Readonly<Record<string, AnyAgent>>> = {
      start,
      list: readWhileLive(
        Effect.gen(function* () {
          const entries = yield* options.store.listRelated(options.claim.runId)
          const local = yield* Effect.forEach(
            entries.filter((entry) => entry.parentRunId === options.claim.runId),
            (entry) => inspectLocalChild(entry.runId),
          )
          const external = yield* placementsForParent().pipe(
            Effect.flatMap((placements) => Effect.forEach(placements, inspectExternalPlacement)),
          )
          return [...local, ...external]
        }),
      ),
      inspect: (childRunId) => readWhileLive(inspectChild(childRunId)),
      await: awaitChild,
      cancel: (receipt, input) =>
        Effect.gen(function* () {
          yield* assertLive
          const metadata = yield* metadataFor(receipt)
          if (metadata.external !== undefined) {
            yield* routeFor(metadata.external.partition)
            if (externalRuntime === undefined || options.claim.session === undefined) {
              return yield* RuntimeUnavailable.make({
                message: "External child cancellation requires a claimed parent Session",
              })
            }
            const placement = yield* externalRuntime.store.inspectPlacement(metadata.external.placementId).pipe(
              Effect.catchTag("generalist/runtime/ExternalChildPlacementNotFound", () =>
                Effect.fail(notAChild(metadata.childRunId)),
              ),
            )
            if (
              placement.parentRunId !== options.claim.runId ||
              placement.request.ref.runId !== metadata.childRunId ||
              placement.request.ref.partition !== metadata.external.partition
            ) {
              return yield* notAChild(metadata.childRunId)
            }
            if (placement.cancelRequested) {
              if (placement.cancelReason !== input.reason) {
                return yield* ChildCommandConflict.make({
                  parentRunId: options.claim.runId,
                  commandId: input.commandId,
                  existingChildRunId: metadata.childRunId,
                })
              }
              yield* assertLive
              return
            }
            yield* assertLive
            yield* externalRuntime.store
              .cancelScoped({
                runId: options.claim.runId,
                ownerId: options.claim.ownerId,
                attemptFence: options.claim.attemptFence,
                session: options.claim.session,
                commandId: input.commandId,
                placementId: metadata.external.placementId,
                ...(input.reason === undefined ? undefined : { reason: input.reason }),
              })
              .pipe(
                Effect.catchTags({
                  "generalist/runtime/ExternalChildPlacementNotFound": () =>
                    Effect.fail(notAChild(metadata.childRunId)),
                  "generalist/runtime/ExternalChildPlacementConflict": () =>
                    ChildCommandConflict.make({
                      parentRunId: options.claim.runId,
                      commandId: input.commandId,
                      existingChildRunId: metadata.childRunId,
                    }),
                  "generalist/runtime/StaleClaim": () => Effect.fail(retiredFailure),
                  "generalist/runtime/StaleSessionClaim": () => Effect.fail(retiredFailure),
                  "generalist/runtime/PayloadTooLarge": (error) =>
                    RuntimeUnavailable.make({ message: error.message }),
                  "generalist/durability/DurabilityFailure": (error) =>
                    error.reason === "input-conflict"
                      ? ChildCommandConflict.make({
                          parentRunId: options.claim.runId,
                          commandId: input.commandId,
                          existingChildRunId: metadata.childRunId,
                        })
                      : Effect.fail(error),
                }),
              )
            return
          }
          const cancellation = {
            claim: options.claim,
            childRunId: metadata.childRunId,
            commandId: input.commandId,
          }
          yield* options
            .cancelChild(input.reason === undefined ? cancellation : { ...cancellation, reason: input.reason })
            .pipe(
              Effect.catchTags({
                "generalist/runtime/ChildParentageInvalid": () => Effect.fail(notAChild(metadata.childRunId)),
                "generalist/runtime/StaleClaim": () => Effect.fail(retiredFailure),
                "generalist/runtime/StaleSessionClaim": () => Effect.fail(retiredFailure),
                "generalist/runtime/PayloadTooLarge": (error) => RuntimeUnavailable.make({ message: error.message }),
                "generalist/durability/DurabilityFailure": (error) =>
                  error.reason === "input-conflict"
                    ? ChildCommandConflict.make({
                        parentRunId: options.claim.runId,
                        commandId: input.commandId,
                        existingChildRunId: metadata.childRunId,
                      })
                    : Effect.fail(error),
              }),
            )
        }),
    }
    const scope: ExecutionScope<Readonly<Record<string, AnyAgent>>> = {
      [ExecutionScopeTypeId]: ExecutionScopeTypeId,
      runId: options.claim.runId,
      sessionId: options.claimed.message.sessionId,
      children: Object.freeze(children),
    }
    Object.defineProperty(scope, ExecutionScopeTypeId, { enumerable: false })
    Object.freeze(scope)
    const factory = options.binding.executionServices
    let environment = Layer.succeedContext(options.binding.base)
    if (factory !== undefined) {
      const executionContext = yield* Effect.try({
        try: () => factory(scope),
        catch: (error) => RuntimeUnavailable.make({ message: `Execution services factory failed: ${String(error)}` }),
      }).pipe(
        Effect.flatMap((executionLayer) => Layer.build(executionLayer)),
        Effect.provideContext(Context.add(Context.omit(Scope.Scope)(options.binding.base), Runtime, boundRuntime)),
        Effect.onError(() => retire),
      )
      environment = Layer.succeedContext(Context.merge(options.binding.base, executionContext))
    }
    return {
      scope,
      environment,
      retire,
    }
  })
