import { Effect, Function, Layer, Option, Schema } from "effect"
import { Tool } from "effect/unstable/ai"
import { Agent, AgentEvent, ExecutableManifest, Pins, ProgramManifest, ToolContext, ToolExecutor } from "tenetkit"
import type { AgentManifest } from "tenetkit"
import type {
  AdmitProgramChildInput,
  ExecutionClaim,
  ExecutionRecord,
  Interface as RunStoreInterface,
} from "./run-store.js"
import type { ExecutionCheckpoint } from "./execution-state.js"
import type { ExecutionContinuation } from "./steering.js"
import { make as makeAddress } from "./address.js"
import { make as makeMessage } from "./message.js"
import { narrow as narrowRegistrations } from "./executable-registration.js"
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
export const makeCatalog = (authority: AgentManifest.ProgramAuthority): AuthorityCatalog => ({
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
  readonly budget: ProgramManifest.ProgramBudget
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
export const makeParameters = (authority: AgentManifest.ProgramAuthority) => {
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
  "tenetkit/runtime/ProgramAuthorityMissing",
  { runId: Schema.String },
) {}

/** @experimental */
export class ProgramAuthorityExceeded extends Schema.TaggedError<ProgramAuthorityExceeded>()(
  "tenetkit/runtime/ProgramAuthorityExceeded",
  {
    dimension: AuthorityDimension,
    requestedId: Schema.optionalKey(SelectionId),
    allowedIds: SelectionIds,
    message: Schema.String.check(Schema.isMaxLength(512)),
  },
) {}

/** @experimental */
export class ProgramAdmissionFailed extends Schema.TaggedError<ProgramAdmissionFailed>()(
  "tenetkit/runtime/ProgramAdmissionFailed",
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
export const makeTool = (authority: AgentManifest.ProgramAuthority) => makeDeclaration(makeParameters(authority))

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
  requested: ProgramManifest.ProgramBudget,
  maximum: ProgramManifest.ProgramBudget,
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

const closureFor = (
  manifest: ExecutableManifest.ExecutableManifest,
  roots: ReadonlyArray<string>,
): {
  readonly entries: ReadonlyArray<Extract<ExecutableManifest.ExecutableEntry, { readonly _tag: "Agent" }>>
  readonly profiles: ReadonlyArray<ExecutableManifest.ProfileBinding>
} => {
  const byPin = new Map<string, ExecutableManifest.ExecutableEntry>(
    manifest.entries.map((entry) => [entry.pin, entry] as const),
  )
  const bySelection = new Map(manifest.profiles.map((profile) => [profile.selection, profile] as const))
  const entries = new Map<string, Extract<ExecutableManifest.ExecutableEntry, { readonly _tag: "Agent" }>>()
  const profiles = new Map<string, ExecutableManifest.ProfileBinding>()
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

export interface Interface {
  readonly parameters: ReturnType<typeof makeParameters>
  readonly tool: ReturnType<typeof makeTool>
  readonly invoke: (request: Parameters & { readonly toolCallId: string }) => Effect.Effect<ToolExecutor.Outcome>
  readonly admitSuspension: (input: {
    readonly suspension: AgentEvent.AgentSuspended
    readonly openedAt: string
    readonly checkpoint?: ExecutionCheckpoint
    readonly continuation?: ExecutionContinuation | null
  }) => Effect.Effect<void, ProgramAdmissionFailed>
}

/** @experimental Construct the Run-attempt scoped implementation; applications still own sandbox and bindings resolution. */
export const make = (input: {
  readonly claim: ExecutionClaim
  readonly claimed: ExecutionRecord
  readonly authority: AgentManifest.ProgramAuthority
  readonly store: RunStoreInterface
}): Interface => {
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
      const program = ProgramManifest.make({
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
      const executable = ExecutableManifest.make({
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
      const childRunId = `run_code_${Pins.digest({ parentRunId: input.claim.runId, toolCallId: request.toolCallId }).slice(0, 32)}`
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
        ...input.claim,
        childRunId,
        invocationId: request.toolCallId,
        message,
        executableRef: executable.ref,
        executableManifest: executable.manifest,
        registrations,
      } satisfies AdmitProgramChildInput
    })
  const admissionFailure = (failure: unknown) =>
    ProgramAdmissionFailed.make({
      message:
        typeof failure === "object" && failure !== null && "message" in failure
          ? String(failure.message)
          : String(failure),
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
                  message: "message" in failure ? String(failure.message) : String(failure),
                })
          return Effect.succeed({ _tag: "DomainFailure" as const, failure: typed, encodedFailure: typed })
        }),
      ),
    admitSuspension: ({ suspension, openedAt, ...state }) =>
      Schema.decodeUnknownEffect(parameters, { onExcessProperty: "error" })(suspension.tool_params).pipe(
        Effect.flatMap((decoded) => prepare({ ...decoded, toolCallId: suspension.tool_call_id })),
        Effect.filterOrFail(
          (prepared) => prepared.childRunId === suspension.token,
          () => ProgramAdmissionFailed.make({ message: "code_mode suspension token does not match its child Run" }),
        ),
        Effect.flatMap((prepared) =>
          input.store.admitProgramChildAndSuspend({
            ...prepared,
            ...state,
            suspension,
            wait: {
              waitId: suspension.tool_call_id,
              reason: { _tag: "ToolWait" },
              status: "open",
              openedAt,
            },
          }),
        ),
        Effect.asVoid,
        Effect.mapError(admissionFailure),
      ),
  }
}

/** @experimental Add the Runtime-owned declaration without changing the resolved Agent identity. */
export const withTool: {
  (
    implementation: Interface,
  ): <Tools extends Record<string, Tool.Any>, R>(agent: Agent.Agent<Tools, R>) => Agent.Agent<Tools, R>
  <Tools extends Record<string, Tool.Any>, R>(
    agent: Agent.Agent<Tools, R>,
    implementation: Interface,
  ): Agent.Agent<Tools, R>
} = Function.dual(
  2,
  <Tools extends Record<string, Tool.Any>, R>(
    agent: Agent.Agent<Tools, R>,
    implementation: Interface,
  ): Agent.Agent<Tools, R> => Agent.withTools(agent, [implementation.tool]),
)

/** @experimental Route only code_mode to Runtime and preserve the resolved Agent's existing executor behavior. */
export const makeExecutor = <Tools extends Record<string, Tool.Any>, R>(options: {
  readonly agent: Agent.Agent<Tools, R>
  readonly environment: Layer.Layer<Agent.ClosedServices<Tools, R>>
  readonly implementation: Interface
  readonly upstream: Option.Option<ToolExecutor.Interface>
}): ToolExecutor.Interface => {
  const upstream = Option.getOrUndefined(options.upstream)
  const upstreamCancellation =
    upstream?.cancel !== undefined
      ? {
          cancellable: (request: ToolExecutor.Request) =>
            request.call.name !== options.implementation.tool.name && supportsCancellation(upstream, request),
          cancel: (request: ToolExecutor.CancellationRequest) => upstream.cancel!(request),
        }
      : {}
  return ToolExecutor.ToolExecutor.of({
    replayPolicy: (request) =>
      request.call.name === options.implementation.tool.name
        ? "never"
        : Option.isSome(options.upstream)
          ? (options.upstream.value.replayPolicy?.(request) ?? "never")
          : "never",
    execute: (request) =>
      request.call.name === options.implementation.tool.name
        ? Schema.decodeUnknownEffect(options.implementation.parameters, { onExcessProperty: "error" })(
            request.call.params,
          ).pipe(
            Effect.flatMap((parameters) =>
              options.implementation.invoke({ ...parameters, toolCallId: request.call.id }),
            ),
            Effect.mapError(() =>
              ToolExecutor.FrameworkFailure.make({
                stage: "decode-input",
                tool: options.implementation.tool.name,
                message: "code_mode input does not match its schema",
              }),
            ),
          )
        : Option.isSome(options.upstream)
          ? options.upstream.value.execute(request)
          : Effect.flatMap(Effect.context<ToolContext.ToolContext>(), (context) =>
              Effect.scoped(
                Effect.flatMap(Layer.build(options.environment), (environment) =>
                  ToolExecutor.executeToolkit(options.agent.toolkit, request).pipe(
                    Effect.provideContext(context),
                    Effect.provideContext(environment),
                  ),
                ),
              ),
            ),
    ...upstreamCancellation,
  })
}
