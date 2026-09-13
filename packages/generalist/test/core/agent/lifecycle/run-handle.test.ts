/* oxlint-disable effecttsgo/strict-effect-provide -- this test provides its deterministic services at the process boundary. */
import { expect, it } from "@effect/vitest"
import { Effect, Layer, Schema, Scope, Stream } from "effect"
import { LanguageModel } from "effect/unstable/ai"
import { expectTypeOf } from "vitest"
import { Agent, AgentEvent, Approvals, Permissions, Steering, ToolContext } from "../../../../src/index.js"
import { TestModel } from "../../../../src/testing/index.js"

const output = Schema.Struct({ summary: Schema.String })
const agent = Agent.make({ name: "run-handle-contract", output })
const options = { prompt: "summarize" } as const
const allocation = Agent.allocateRun(agent, options)

type ExpectedAllocation = Effect.Effect<
  Agent.RunHandle<
    AgentEvent.Event<typeof output.Type>,
    Agent.RunError,
    Agent.RunRequirements<
      Record<never, never>,
      LanguageModel.LanguageModel,
      typeof options,
      typeof Schema.String,
      typeof output
    >
  >,
  Steering.PolicyInvalid,
  Scope.Scope
>

expectTypeOf(allocation).toEqualTypeOf<ExpectedAllocation>()

const inspectionSnapshot: Agent.InspectionSnapshot = {
  runId: "run-contract",
  turn: 0,
  usage: { inputTokens: 0, outputTokens: 0 },
  activeTools: [],
  elapsed: 0,
}
const inspector: Agent.InspectorService = { snapshot: () => Effect.succeed(inspectionSnapshot) }
const inspectorMemoryLayer: Layer.Layer<Agent.Inspector> = Agent.Inspector.layerMemory
const inspectorTestLayer: Layer.Layer<Agent.Inspector> = Agent.Inspector.layerTest(inspector)
const publicToolContext: ToolContext.Service = {
  signal: new AbortController().signal,
  emit: () => Effect.succeed(true),
  sessionId: "session-contract",
  runId: "run-contract",
  agentName: "run-handle-contract",
  turn: 0,
  rootRunId: "run-contract",
  toolCallId: "call-contract",
  operationKey: "run-contract:tool:0",
  idempotencyKey: "run-contract:tool:0",
  attempt: 1,
  admittedAt: "2026-09-12T00:00:00.000Z",
  deadline: "2026-09-12T01:00:00.000Z",
}
const defaultToolContextLayer: Layer.Layer<ToolContext.ToolContext> = ToolContext.layerDefault
const testToolContextLayer: Layer.Layer<ToolContext.ToolContext> = ToolContext.layerTest(publicToolContext)

const withInjectedHostedState = <O extends object>(input: O): O => {
  Reflect.set(input, "initialSteering", { queue: "steering", count: 1, turn: 0 })
  Reflect.set(input, "driverCheckpoint", {})
  Reflect.set(input, "executableRef", {})
  Reflect.set(input, "executableManifest", {})
  return input
}

void inspectorMemoryLayer
void inspectorTestLayer
void defaultToolContextLayer
void testToolContextLayer

const typeFixtures = (
  possiblyHosted:
    | { readonly sessionId: string }
    | { readonly sessionId: string; readonly driverCheckpoint: Record<never, never> },
) => {
  const hiddenInitialSteering: Agent.RunOptions = {
    prompt: "hidden",
    // @ts-expect-error Hosted steering restoration is internal.
    initialSteering: { queue: "steering", count: 1, turn: 0 },
  }
  const hiddenDriverCheckpoint: Agent.RunOptions = {
    prompt: "hidden",
    // @ts-expect-error Hosted checkpoints are internal.
    driverCheckpoint: {},
  }
  const hiddenExecutableRef: Agent.RunOptions = {
    prompt: "hidden",
    // @ts-expect-error Hosted executable identity is internal.
    executableRef: {},
  }
  const hiddenExecutableManifest: Agent.RunOptions = {
    prompt: "hidden",
    // @ts-expect-error Hosted executable closure is internal.
    executableManifest: {},
  }
  // @ts-expect-error Hosted checkpoints must not be accepted by public allocation.
  void Agent.allocateRun(agent, { prompt: "hidden", driverCheckpoint: {} })
  // @ts-expect-error Hosted executable identity must not be accepted by public streaming.
  void Agent.stream(agent, "hidden", { executableRef: {} })
  // @ts-expect-error Hosted steering restoration must not be accepted by public runs.
  void Agent.run(agent, "hidden", { initialSteering: { queue: "steering", count: 1, turn: 0 } })
  // @ts-expect-error Hosted executable closure must not be accepted by curried public runs.
  void Agent.run("hidden", { executableManifest: {} })(agent)
  // @ts-expect-error An option union containing hosted state must not be accepted publicly.
  void Agent.stream(agent, "hidden", possiblyHosted)
  const anyAgent: Agent.Any = agent
  // @ts-expect-error Child capability descriptors are internal.
  void anyAgent.capabilities
  const inspectHandle = (handle: Agent.RunHandle) => {
    // @ts-expect-error Run control is not a public handle member.
    void handle.busy
    // @ts-expect-error Run control is not a public handle member.
    void handle.interruptTools
    // @ts-expect-error Run control is not a public handle member.
    void handle.reject
  }
  void inspectHandle
  // @ts-expect-error Inspectors cannot start runs.
  void inspector.start
  // @ts-expect-error Inspectors cannot publish run events.
  void inspector.publish
  // @ts-expect-error Tool handlers cannot receive a parent transcript.
  void publicToolContext.history
  // @ts-expect-error Tool handlers cannot receive a parent Agent definition.
  void publicToolContext.agent
  // @ts-expect-error Tool handlers cannot receive sandbox restoration state.
  void publicToolContext.inheritedSandboxSnapshot
  void hiddenInitialSteering
  void hiddenDriverCheckpoint
  void hiddenExecutableRef
  void hiddenExecutableManifest
}
void typeFixtures

it.effect("admits exactly one events consumer for a scoped handle", () =>
  Effect.scoped(
    Effect.gen(function* () {
      const localAgent = Agent.make({ name: "run-handle-one-consumer" })
      const handle = yield* Agent.allocateRun(localAgent, { prompt: "complete" })
      const events = yield* Stream.runCollect(handle.events)
      expect(events.at(-1)).toMatchObject({ _tag: "Completed", output: "done" })

      const repeated = yield* Effect.flip(Stream.runDrain(handle.events))
      expect(repeated.message).toContain("already consumed or closed")
    }),
  ).pipe(
    Effect.provide(
      Layer.mergeAll(TestModel.layer([TestModel.text("done")]), Permissions.layerAllowAll, Approvals.layerAutoApprove),
    ),
  ),
)

it.effect("drops host restoration state injected into public run options", () =>
  Effect.scoped(
    Effect.gen(function* () {
      const localAgent = Agent.make({ name: "run-handle-public-options" })
      const handle = yield* Agent.allocateRun(localAgent, withInjectedHostedState({ prompt: "allocated" }))
      const allocated = yield* Stream.runCollect(handle.events)
      expect(allocated.at(-1)).toMatchObject({ _tag: "Completed", output: "allocated" })

      const streamed = yield* Agent.stream(localAgent, "streamed", withInjectedHostedState({})).pipe(Stream.runCollect)
      expect(streamed.at(-1)).toMatchObject({ _tag: "Completed", output: "streamed" })

      expect(yield* Agent.run(localAgent, "ran", withInjectedHostedState({}))).toBe("ran")
    }),
  ).pipe(
    Effect.provide(
      Layer.mergeAll(
        TestModel.layer([TestModel.text("allocated"), TestModel.text("streamed"), TestModel.text("ran")]),
        Permissions.layerAllowAll,
        Approvals.layerAutoApprove,
      ),
    ),
  ),
)
