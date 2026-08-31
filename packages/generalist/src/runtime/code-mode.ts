import { Effect, Function, Layer, Option, Schema } from "effect"
import { Tool } from "effect/unstable/ai"
import { type Agent, type ClosedServices, withTools } from "../core/agent/service.js"
import type { ProgramAuthority } from "../core/durable/manifest/agent-manifest.js"
import {
  type ExecutableEntry,
  type ExecutableManifest,
  type ProfileBinding,
  make as makeExecutableManifest,
} from "../core/durable/manifest/executable-manifest.js"
import { digest } from "../core/durable/pin.js"
import { type ProgramBudget, make as makeProgramManifest } from "../core/durable/manifest/program-manifest.js"
import type { AgentSuspended } from "../core/agent/event.js"
import type { ToolContext } from "../core/tools/tool-context.js"
import {
  type CancellationRequest,
  FrameworkFailure,
  type Outcome,
  type Request,
  type Service as ToolExecutorService,
  ToolExecutor,
  executeToolkit,
} from "../core/tools/tool-executor.js"
import type {
  AdmitProgramChildInput,
  ExecutionClaim,
  ExecutionRecord,
  Service as RunStoreService,
} from "./run/store.js"
import type { ExecutionCheckpoint } from "./execution/state.js"
import type { ExecutionContinuation } from "./run/steering.js"
import type { RunWait } from "./run/wait.js"
import { make as makeAddress } from "./address.js"
import { make as makeMessage } from "./messaging/message.js"
import { narrow as narrowRegistrations } from "./executable/registration.js"
import { normalizePrompt } from "./memory/prompt.js"
import { supportsCancellation } from "../core/tools/tool-executor-cancellation.js"

const SelectionId = Schema.String.check(Schema.isNonEmpty(), Schema.isMaxLength(128))
const SelectionIds = Schema.Array(SelectionId).pipe(Schema.check(Schema.isMaxLength(64)))
const BudgetDimensions = [
  "agentRuns",
  "concurrency",
  "toolCalls",
  "tokens",
  "wallClockMillis",
  "logBytes",
  "outputBytes",
] as const
const AuthorityDimension = Schema.Literals(["sourceBytes", "tools", "agents", "steps", ...BudgetDimensions])

/** @experimental Exact selection IDs advertised to the model for one ProgramAuthority. */
export interface AuthorityCatalog {
  readonly tools: ReadonlyArray<string>
  readonly agents: ReadonlyArray<string>
  readonly steps: ReadonlyArray<string>
}

/** @experimental Construct the exact canonical selection catalog for one ProgramAuthority. */
export const makeCatalog = (authority: ProgramAuthority): AuthorityCatalog => ({
  tools: authority.tools.map(({ name }) => name),
  agents: authority.agents.map(({ selection }) => selection),
  steps: authority.steps.map(({ name }) => name),
})

const boundedInt = (minimum: number, maximum: number) =>
  Schema.Int.check(Schema.isGreaterThanOrEqualTo(minimum), Schema.isLessThanOrEqualTo(maximum))

/** @experimental Exact model-authored Program request admitted only through an authorized Agent Run. */
export interface Parameters {
  readonly source: string
  readonly input: string
  readonly tools: ReadonlyArray<string>
  readonly agents: ReadonlyArray<string>
  readonly steps: ReadonlyArray<string>
  readonly budget: ProgramBudget
}

/**
 * An empty catalog admits no selection at all. `Schema.Literals([])` would model that as `never`, which serializes to
 * the untyped JSON Schema `items: { not: {} }` that providers reject, so express the same contract as a typed array
 * that is bounded to zero elements.
 */
const selectionArray = (catalog: ReadonlyArray<string>): Schema.Codec<ReadonlyArray<string>> =>
  catalog.length === 0
    ? Schema.Array(SelectionId).pipe(Schema.check(Schema.isMaxLength(0)))
    : Schema.Array(Schema.Literals(catalog)).pipe(Schema.check(Schema.isMaxLength(64)))

/** @experimental Construct the model-visible request schema for one exact ProgramAuthority. */
export const makeParameters = (authority: ProgramAuthority) => {
  const catalog = makeCatalog(authority)
  return Schema.Struct({
    source: Schema.String.pipe(Schema.check(Schema.isMaxLength(authority.maxSourceBytes))),
    input: Schema.String,
    tools: selectionArray(catalog.tools),
    agents: selectionArray(catalog.agents),
    steps: selectionArray(catalog.steps),
    budget: Schema.Struct({
      agentRuns: boundedInt(0, authority.budget.agentRuns),
      concurrency: boundedInt(1, authority.budget.concurrency),
      toolCalls: boundedInt(0, authority.budget.toolCalls),
      tokens: boundedInt(0, authority.budget.tokens),
      wallClockMillis: boundedInt(0, authority.budget.wallClockMillis),
      logBytes: boundedInt(0, authority.budget.logBytes),
      outputBytes: boundedInt(0, authority.budget.outputBytes),
    }),
  })
}

/** @experimental */
export class ProgramAuthorityMissing extends Schema.TaggedError<ProgramAuthorityMissing>()(
  "generalist/runtime/ProgramAuthorityMissing",
  { runId: Schema.String },
) {}

/** @experimental */
export class ProgramAuthorityExceeded extends Schema.TaggedError<ProgramAuthorityExceeded>()(
  "generalist/runtime/ProgramAuthorityExceeded",
  {
    dimension: AuthorityDimension,
    requestedId: Schema.optionalKey(SelectionId),
    allowedIds: SelectionIds,
    message: Schema.String.check(Schema.isMaxLength(512)),
  },
) {}

/** @experimental */
export class ProgramAdmissionFailed extends Schema.TaggedError<ProgramAdmissionFailed>()(
  "generalist/runtime/ProgramAdmissionFailed",
  { message: Schema.String },
) {}

const makeDeclaration = (parameters: ReturnType<typeof makeParameters>) =>
  Tool.make("code_mode", {
    description: "Run exact JavaScript in the host sandbox using a narrowed set of approved capabilities and budgets.",
    parameters,
    success: Schema.Unknown,
    failure: Schema.Union([ProgramAuthorityMissing, ProgramAuthorityExceeded, ProgramAdmissionFailed]),
  })

/** @experimental Construct the Runtime-owned Effect AI tool for one exact ProgramAuthority. */
export const makeTool = (authority: ProgramAuthority) => makeDeclaration(makeParameters(authority))

const selected = <A>(
  requested: ReadonlyArray<string>,
  allowed: ReadonlyArray<A>,
  nameOf: (value: A) => string,
  dimension: "tools" | "agents" | "steps",
): Effect.Effect<ReadonlyArray<A>, ProgramAuthorityExceeded> =>
  Effect.gen(function* () {
    const allowedIds = allowed.map(nameOf)
    const seen = new Set<string>()
    for (const requestedId of requested) {
      if (seen.has(requestedId)) {
        return yield* ProgramAuthorityExceeded.make({
          dimension,
          requestedId,
          allowedIds,
          message: `${dimension} selection must be unique`,
        })
      }
      seen.add(requestedId)
    }
    const byName = new Map(allowed.map((value) => [nameOf(value), value] as const))
    const values: Array<A> = []
    for (const requestedId of requested) {
      const value = byName.get(requestedId)
      if (value === undefined) {
        return yield* ProgramAuthorityExceeded.make({
          dimension,
          requestedId,
          allowedIds,
          message: `${requestedId} is not authorized`,
        })
      }
      values.push(value)
    }
    return values
  })

const narrowBudget = (
  requested: ProgramBudget,
  maximum: ProgramBudget,
): Effect.Effect<void, ProgramAuthorityExceeded> =>
  Effect.gen(function* () {
    for (const key of BudgetDimensions) {
      if (requested[key] > maximum[key]) {
        return yield* ProgramAuthorityExceeded.make({
          dimension: key,
          allowedIds: [],
          message: `${requested[key]} exceeds ${maximum[key]}`,
        })
      }
    }
  })

interface ExecutableClosure {
  readonly entries: ReadonlyArray<Extract<ExecutableEntry, { readonly _tag: "Agent" }>>
  readonly profiles: ReadonlyArray<ProfileBinding>
}

const closureFor = (manifest: ExecutableManifest, roots: ReadonlyArray<string>): ExecutableClosure => {
  const byPin = new Map<string, ExecutableEntry>(manifest.entries.map((entry) => [entry.pin, entry] as const))
  const bySelection = new Map(manifest.profiles.map((profile) => [profile.selection, profile] as const))
  const entries = new Map<string, Extract<ExecutableEntry, { readonly _tag: "Agent" }>>()
  const profiles = new Map<string, ProfileBinding>()
  const visit = (pin: string): void => {
    if (entries.has(pin)) return
    const entry = byPin.get(pin)
    if (entry?._tag !== "Agent") throw new TypeError(`Program Agent is not in the parent executable: ${pin}`)
    entries.set(pin, entry)
    for (const child of entry.manifest.children) {
      const profile = bySelection.get(child.selection)
      if (profile === undefined)
        throw new TypeError(`Program Agent child profile is not in the parent executable: ${child.selection}`)
      profiles.set(profile.selection, profile)
      visit(profile.agent)
    }
    for (const child of entry.manifest.programAuthority?.agents ?? []) visit(child.agent)
  }
  for (const root of roots) visit(root)
  return {
    entries: [...entries.values()],
    profiles: [...profiles.values()],
  }
}

export interface Service {
  readonly parameters: ReturnType<typeof makeParameters>
  readonly tool: ReturnType<typeof makeTool>
  readonly invoke: (request: Parameters & { readonly toolCallId: string }) => Effect.Effect<Outcome>
  readonly admitSuspension: (input: {
    readonly suspension: AgentSuspended
    readonly openedAt: string
    readonly waits: ReadonlyArray<RunWait>
    readonly checkpoint?: ExecutionCheckpoint
    readonly continuation?: ExecutionContinuation | null
  }) => Effect.Effect<void, ProgramAdmissionFailed>
}

/** @experimental Construct the Run-attempt scoped implementation; applications still own sandbox and handlers resolution. */
export const make = (input: {
  readonly claim: ExecutionClaim
  readonly claimed: ExecutionRecord
  readonly authority: ProgramAuthority
  readonly store: RunStoreService
}): Service => {
  const parameters = makeParameters(input.authority)
  const declaration = makeDeclaration(parameters)
  const prepare = (request: Parameters & { readonly toolCallId: string }) =>
    Effect.gen(function* () {
      const sourceBytes = new TextEncoder().encode(request.source).byteLength
      if (sourceBytes > input.authority.maxSourceBytes) {
        return yield* ProgramAuthorityExceeded.make({
          dimension: "sourceBytes",
          allowedIds: [],
          message: `${sourceBytes} exceeds ${input.authority.maxSourceBytes}`,
        })
      }
      yield* narrowBudget(request.budget, input.authority.budget)
      const tools = yield* selected(request.tools, input.authority.tools, (value) => value.name, "tools")
      const agents = yield* selected(request.agents, input.authority.agents, (value) => value.selection, "agents")
      const steps = yield* selected(request.steps, input.authority.steps, (value) => value.name, "steps")
      const program = makeProgramManifest({
        name: `code_mode:${request.toolCallId}`,
        source: { language: "javascript", text: request.source },
        sandbox: input.authority.sandbox,
        input: input.authority.input,
        output: input.authority.output,
        capabilities: { tools, agents, steps },
        budget: request.budget,
      })
      const closure = closureFor(
        input.claimed.executableManifest,
        agents.map((agent) => agent.agent),
      )
      const executable = makeExecutableManifest({
        root: program.pin,
        profiles: closure.profiles,
        entries: [
          { _tag: "Program", ...program },
          ...closure.entries.map((entry) => ({
            _tag: "Agent" as const,
            pin: entry.pin,
            manifest: entry.manifest,
          })),
        ],
      })
      const registrations = yield* narrowRegistrations(executable, input.claimed.registrations)
      const childRunId = `run_code_${digest({ parentRunId: input.claim.runId, toolCallId: request.toolCallId }).slice(0, 32)}`
      const idempotencyKey = `code-mode:${input.claim.runId}:${request.toolCallId}`
      const message = makeMessage({
        id: `code-mode:${request.toolCallId}`,
        to: makeAddress(`code-mode:${input.claim.runId}`),
        sessionId: `code-mode:${input.claim.runId}`,
        idempotencyKey,
        correlationId: input.claimed.rootRunId,
        prompt: normalizePrompt(request.input),
        metadata: {
          runtimeChildTool: true,
          codeMode: true,
          parentRunId: input.claim.runId,
          parentToolCallId: request.toolCallId,
        },
      })
      return {
        childRunId,
        invocationId: request.toolCallId,
        message,
        executableRef: executable.ref,
        executableManifest: executable.manifest,
        registrations,
      } satisfies Omit<AdmitProgramChildInput, keyof ExecutionClaim>
    })
  const admissionFailure = (failure: { readonly message?: string }) =>
    ProgramAdmissionFailed.make({
      message: failure.message ?? "program admission failed",
    })
  return {
    parameters,
    tool: declaration,
    invoke: (request) =>
      prepare(request).pipe(
        Effect.map((prepared) => ({ _tag: "Suspend" as const, token: prepared.childRunId })),
        Effect.catch((failure) => {
          const typed =
            Schema.is(ProgramAuthorityExceeded)(failure) || Schema.is(ProgramAuthorityMissing)(failure)
              ? failure
              : ProgramAdmissionFailed.make({
                  message: "message" in failure ? failure.message : String(failure),
                })
          return Effect.succeed({ _tag: "DomainFailure" as const, failure: typed, encodedFailure: typed })
        }),
      ),
    admitSuspension: ({ suspension, openedAt: _openedAt, waits, ...state }) =>
      Effect.gen(function* () {
        const codeWaits = suspension.waits.filter((candidate) => candidate.call.name === "code_mode")
        const children = yield* Effect.forEach(codeWaits, (wait) =>
          Effect.gen(function* () {
            const decoded = yield* Schema.decodeUnknownEffect(parameters, { onExcessProperty: "error" })(
              wait.call.params,
            )
            const prepared = yield* prepare({ ...decoded, toolCallId: wait.call.id })
            if (prepared.childRunId !== wait.token) {
              return yield* ProgramAdmissionFailed.make({
                message: "code_mode suspension token does not match its child Run",
              })
            }
            return prepared
          }),
        )
        const [first, ...rest] = children
        if (first === undefined) return yield* ProgramAdmissionFailed.make({ message: "code_mode wait is missing" })
        return yield* input.store.admitProgramChildAndSuspend({
          ...input.claim,
          ...state,
          children: [first, ...rest],
          suspension,
          waits,
        })
      }).pipe(Effect.asVoid, Effect.mapError(admissionFailure)),
  }
}

/** @experimental Add the Runtime-owned parallel-safe declaration without changing the resolved Agent identity. */
export const withTool: {
  (implementation: Service): <Tools extends Record<string, Tool.Any>, R>(agent: Agent<Tools, R>) => Agent<Tools, R>
  <Tools extends Record<string, Tool.Any>, R>(agent: Agent<Tools, R>, implementation: Service): Agent<Tools, R>
} = Function.dual(
  2,
  <Tools extends Record<string, Tool.Any>, R>(agent: Agent<Tools, R>, implementation: Service): Agent<Tools, R> => {
    const extended = withTools(agent, [implementation.tool])
    return {
      ...extended,
      toolScheduling: {
        ...extended.toolScheduling,
        parallelSafe: [...extended.toolScheduling.parallelSafe, "code_mode"],
      },
    }
  },
)

/** @experimental Route only code_mode to Runtime and preserve the resolved Agent's existing executor behavior. */
const makeExecutor = <Tools extends Record<string, Tool.Any>, R>(options: {
  readonly agent: Agent<Tools, R>
  readonly environment: Layer.Layer<ClosedServices<Tools, R>>
  readonly implementation: Service
  readonly upstream: Option.Option<ToolExecutorService>
}): ToolExecutorService => {
  const upstream = Option.getOrUndefined(options.upstream)
  const upstreamCancellation =
    upstream?.cancel !== undefined
      ? {
          cancellable: (request: Request) =>
            request.call.name !== options.implementation.tool.name && supportsCancellation(upstream, request),
          cancel: (request: CancellationRequest) => upstream.cancel!(request),
        }
      : {}
  const replayPolicy: ToolExecutorService["replayPolicy"] = (request) => {
    if (request.call.name === options.implementation.tool.name) return "never"
    return Option.isSome(options.upstream) ? (options.upstream.value.replayPolicy?.(request) ?? "never") : "never"
  }
  const execute: ToolExecutorService["execute"] = (request) => {
    if (request.call.name === options.implementation.tool.name) {
      return Schema.decodeUnknownEffect(options.implementation.parameters, { onExcessProperty: "error" })(
        request.call.params,
      ).pipe(
        Effect.flatMap((parameters) => options.implementation.invoke({ ...parameters, toolCallId: request.call.id })),
        Effect.mapError(() =>
          FrameworkFailure.make({
            stage: "decode-input",
            tool: options.implementation.tool.name,
            message: "code_mode input does not match its schema",
          }),
        ),
      )
    }
    if (Option.isSome(options.upstream)) return options.upstream.value.execute(request)
    return Effect.flatMap(Effect.context<ToolContext>(), (context) =>
      Effect.scoped(
        Effect.flatMap(Layer.build(options.environment), (environment) =>
          executeToolkit(options.agent.toolkit, request).pipe(
            Effect.provideContext(context),
            Effect.provideContext(environment),
          ),
        ),
      ),
    )
  }
  return ToolExecutor.of({
    replayPolicy,
    execute,
    ...upstreamCancellation,
  })
}

/** @experimental Tool executor that owns the code_mode route. */
export const Executor = { make: makeExecutor }
