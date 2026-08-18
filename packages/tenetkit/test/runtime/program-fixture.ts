import { Effect, Layer, Schema, Stream } from "effect"
import { LanguageModel, Prompt, Response } from "effect/unstable/ai"
import {
  Agent,
  AgentProgram,
  ExecutableManifest,
  Pins,
  ProgramBindings,
  ProgramCapabilities,
  SandboxExecutor,
} from "tenetkit"
import { Address, ExecutionHost, ExecutableResolver, Runtime, RunStore } from "../../src/runtime/index.js"
import { pinnedTestAgent } from "./identity.js"

export const program: ReturnType<typeof AgentProgram.make> = AgentProgram.make({
  name: "durable-program",
  source: "return await tool.call('echo')",
  sandbox: Pins.makeCapability({ sandbox: "test-v1" }),
  input: Prompt.Prompt,
  inputPin: Pins.makeCapability({ codec: "prompt-v1" }),
  output: Schema.String,
  outputPin: Pins.makeCapability({ codec: "string-v1" }),
  tools: [{ name: "echo", pin: Pins.makeCapability({ tool: "echo-v1" }) }],
  agents: [],
  steps: [],
  budget: {
    agentRuns: 0,
    concurrency: 1,
    toolCalls: 2,
    tokens: 0,
    wallClockMillis: 60_000,
    logBytes: 1_000,
    outputBytes: 1_000,
  },
})

export const programExecutable: ExecutableManifest.PinnedExecutable = ExecutableManifest.make({
  root: program.pinned.pin,
  entries: [{ _tag: "Program", ...program.pinned }],
})
export const programAddress = Address.make("program:durable")

export const programFixture = (): {
  readonly resolver: ExecutableResolver.Interface
  readonly sandbox: SandboxExecutor.Interface
  readonly bindings: ProgramBindings.Bindings
  readonly counts: () => { readonly toolCalls: number; readonly logs: number }
} => {
  let toolCalls = 0
  let logs = 0
  const bindings = ProgramBindings.make({
    tools: [
      ProgramBindings.tool({
        name: "echo",
        pin: program.pinned.manifest.capabilities.tools[0]!.pin,
        input: Schema.String,
        output: Schema.String,
        replay: "non-idempotent",
        authorize: () => Effect.succeed(true),
        execute: (value) => Effect.sync(() => `${value}:${++toolCalls}`),
      }),
    ],
    steps: [],
    agents: [],
  })
  const sandbox = SandboxExecutor.makeTest(
    () =>
      Effect.gen(function* () {
        const host = yield* ProgramCapabilities.ProgramCapabilities
        const first = yield* host.callTool({ operation: "echo", tool: "echo", input: "value" })
        const replayed = yield* host.callTool({ operation: "echo", tool: "echo", input: "value" })
        yield* host.log({ operation: "summary", level: "info", message: "finished" })
        yield* Effect.sync(() => void ++logs)
        return `${first}|${replayed}`
      }),
    { ...SandboxExecutor.testIdentity, fixture: "program" },
  )
  const resolver = ExecutableResolver.makeStatic([
    { _tag: "Program", executable: programExecutable, program, sandbox, bindings },
  ])
  return { resolver, sandbox, bindings, counts: () => ({ toolCalls, logs }) }
}

export const approvalProgramFixture = (): {
  readonly resolver: ExecutableResolver.Interface
  readonly counts: () => { readonly authorizations: number; readonly executions: number; readonly sandboxes: number }
} => {
  let authorizations = 0
  let executions = 0
  let sandboxes = 0
  const bindings = ProgramBindings.make({
    tools: [
      ProgramBindings.tool({
        name: "echo",
        pin: program.pinned.manifest.capabilities.tools[0]!.pin,
        input: Schema.String,
        output: Schema.String,
        replay: "non-idempotent",
        authorize: ({ operation }) =>
          Effect.sync(() => void ++authorizations).pipe(
            Effect.andThen(
              ProgramCapabilities.ProgramSuspended.make({
                operation,
                reason: "approval",
                token: `approval:${operation}`,
              }),
            ),
          ),
        execute: (value) => Effect.sync(() => `${value}:${++executions}`),
      }),
    ],
    steps: [],
    agents: [],
  })
  const sandbox = SandboxExecutor.makeTest(
    () =>
      Effect.sync(() => void ++sandboxes).pipe(
        Effect.andThen(
          Effect.flatMap(ProgramCapabilities.ProgramCapabilities, (host) =>
            host.callTool({ operation: "echo", tool: "echo", input: "approved" }),
          ),
        ),
      ),
    { ...SandboxExecutor.testIdentity, fixture: "approval-program" },
  )
  return {
    resolver: ExecutableResolver.makeStatic([
      { _tag: "Program", executable: programExecutable, program, sandbox, bindings },
    ]),
    counts: () => ({ authorizations, executions, sandboxes }),
  }
}

export const agentMapProgramFixture = (): {
  readonly address: Address.Address
  readonly executable: ExecutableManifest.PinnedExecutable
  readonly resolver: ExecutableResolver.Interface
  readonly counts: () => { readonly bindingDispatches: number; readonly childFinalizers: number }
} => {
  const child = Agent.make({ name: "program-child" })
  const pinnedChild = pinnedTestAgent(child, "program-child-v1")
  const mapProgram = AgentProgram.make({
    name: "durable-agent-map",
    source: "return await agent.map('workers')",
    sandbox: Pins.makeCapability({ sandbox: "test-v1" }),
    input: Prompt.Prompt,
    inputPin: Pins.makeCapability({ codec: "prompt-v1" }),
    output: Schema.Array(Schema.String),
    outputPin: Pins.makeCapability({ codec: "strings-v1" }),
    tools: [],
    agents: [{ selection: "worker", agent: pinnedChild.pin, input: Pins.makeCapability({ codec: "string-v1" }) }],
    steps: [],
    budget: {
      agentRuns: 3,
      concurrency: 2,
      toolCalls: 0,
      tokens: 100,
      wallClockMillis: 10_000,
      logBytes: 100,
      outputBytes: 1_000,
    },
  })
  const executable = ExecutableManifest.make({
    root: mapProgram.pinned.pin,
    entries: [
      { _tag: "Program", ...mapProgram.pinned },
      { _tag: "Agent", ...pinnedChild },
    ],
  })
  let bindingDispatches = 0
  const bindings = ProgramBindings.make({
    tools: [],
    steps: [],
    agents: [
      ProgramBindings.agent({
        selection: "worker",
        agent: pinnedChild.pin,
        inputPin: mapProgram.pinned.manifest.capabilities.agents[0]!.input,
        input: Schema.String,
        replay: "non-idempotent",
        authorize: () => Effect.succeed(true),
        execute: () =>
          Effect.sync(() => {
            bindingDispatches++
            return { text: "wrong", turns: 0, tokenUsage: { input: 0, output: 0 } }
          }),
      }),
    ],
  })
  const sandbox = SandboxExecutor.makeTest(
    () =>
      Effect.gen(function* () {
        const host = yield* ProgramCapabilities.ProgramCapabilities
        const results = yield* host.mapAgents({
          operation: "workers",
          selection: "worker",
          members: [
            { member: "third", input: "three" },
            { member: "first", input: "one" },
            { member: "second", input: "two" },
          ],
        })
        return results.map((member) => `${member.member}:${member.result.text}`)
      }),
    { ...SandboxExecutor.testIdentity, fixture: "agent-map-program" },
  )
  const finish = Response.makePart("finish", {
    reason: "stop",
    usage: Response.Usage.make({
      inputTokens: { total: 1, uncached: 1, cacheRead: undefined, cacheWrite: undefined },
      outputTokens: { total: 1, text: 1, reasoning: undefined },
    }),
    response: undefined,
  })
  let childFinalizers = 0
  const modelService = LanguageModel.make({
    generateText: () => Effect.succeed([{ type: "text", text: "child" }]),
    streamText: () =>
      Stream.fromIterable<Response.StreamPartEncoded>([
        { type: "text-start", id: "text" },
        { type: "text-delta", id: "text", delta: "child" },
        { type: "text-end", id: "text" },
        finish,
      ]),
  })
  const model = Layer.effect(
    LanguageModel.LanguageModel,
    Effect.acquireRelease(modelService, () => Effect.sync(() => void ++childFinalizers)),
  )
  const childExecutable = {
    ref: { executable: executable.ref.executable, active: pinnedChild.pin },
    manifest: executable.manifest,
  }
  return {
    address: Address.make("program:agent-map"),
    executable,
    resolver: ExecutableResolver.makeStatic([
      { _tag: "Program", executable, program: mapProgram, sandbox, bindings },
      { _tag: "Agent", executable: childExecutable, agent: Agent.close(child, model) },
    ]),
    counts: () => ({ bindingDispatches, childFinalizers }),
  }
}

export const executeProgramFixture = Effect.gen(function* () {
  const runtime = yield* Runtime.Runtime
  const store = yield* RunStore.RunStore
  const host = yield* ExecutionHost.ExecutionHost
  const receipt = yield* runtime.send({
    to: programAddress,
    sessionId: "program-session",
    idempotencyKey: "program-run",
    prompt: "run",
  })
  yield* host.execute(yield* store.claimExecution({ runId: receipt.runId, ownerId: "program-worker" }))
  return receipt.runId
})
