import { expect, it } from "@effect/vitest"
import { Cause, Deferred, Effect, Exit, Layer, Schema, Stream } from "effect"
import { LanguageModel, Response, Toolkit } from "effect/unstable/ai"
import { Agent, AgentTool, Approvals, Hooks, Permissions } from "../../../../src/index.js"
import { withProviderFinish, withProviderFinishContent } from "../../provider-finish.js"
import { provideScoped } from "../../../runtime/execution/scoped-provide.js"

type Equal<Left, Right> =
  (<Value>() => Value extends Left ? 1 : 2) extends <Value>() => Value extends Right ? 1 : 2 ? true : false
type Assert<Value extends true> = Value
type EffectSuccess<Value> = Value extends Effect.Effect<infer Success, unknown, unknown> ? Success : never

const stringOutput = Schema.Struct({ value: Schema.String })
const numberOutput = Schema.Struct({ value: Schema.Finite })
const stringAgent = Agent.make({ name: "fan-out-string", output: stringOutput })
const numberAgent = Agent.make({ name: "fan-out-number", output: numberOutput })
const typedFanOut = Agent.fanOut([Agent.child(stringAgent, "string"), Agent.child(numberAgent, "number")] as const, {
  concurrency: 2,
  onFailure: "collect",
})
const typedFanOutProof: Assert<
  Equal<
    EffectSuccess<typeof typedFanOut>,
    readonly [
      Exit.Exit<{ readonly value: string }, Agent.RunError>,
      Exit.Exit<{ readonly value: number }, Agent.RunError>,
    ]
  >
> = true

it("normalizes every child inheritance field and its safe defaults", () => {
  expect(Agent.child(stringAgent, "default").inherit).toEqual({
    history: "none",
    tools: "attenuate",
    permissions: "inherit",
    sandbox: "fork",
    instructions: "inherit",
    memory: "inherit",
    tasks: "none",
  })
  expect(
    Agent.child(stringAgent, "explicit", {
      inherit: {
        history: "full",
        tools: "same",
        permissions: "fresh",
        budget: { usd: 1 },
        sandbox: "share",
        instructions: "own",
        memory: "fresh",
        tasks: "read",
      },
    }).inherit,
  ).toEqual({
    history: "full",
    tools: "same",
    permissions: "fresh",
    budget: { usd: 1 },
    sandbox: "share",
    instructions: "own",
    memory: "fresh",
    tasks: "read",
  })
})

const textDelta = (text: string) => Response.makePart("text-delta", { id: "fan-out", delta: text })
const promptText = (options: Parameters<Parameters<typeof LanguageModel.make>[0]["streamText"]>[0]): string =>
  JSON.stringify(options.prompt.content)

const modelLayer = (
  response: (options: Parameters<Parameters<typeof LanguageModel.make>[0]["generateText"]>[0]) => Effect.Effect<string>,
) =>
  Layer.effect(
    LanguageModel.LanguageModel,
    LanguageModel.make({
      generateText: (options) =>
        withProviderFinishContent(response(options).pipe(Effect.map((text) => [{ type: "text" as const, text }]))),
      streamText: (options) =>
        Stream.unwrap(response(options).pipe(Effect.map((text) => Stream.make(textDelta(text))))).pipe(
          withProviderFinish,
        ),
    }),
  )

it.effect("returns typed Exits in child order and collects one failure", () => {
  expect(typedFanOutProof).toBe(true)
  const model = modelLayer((options) => {
    const prompt = promptText(options)
    if (prompt.includes("number")) return Effect.succeed('{"output":{"value":42}}')
    if (prompt.includes("invalid")) return Effect.succeed('{"output":{"value":42}}')
    return Effect.succeed('{"output":{"value":"ok"}}')
  })
  return Effect.gen(function* () {
    const exits = yield* Agent.fanOut(
      [
        Agent.child(stringAgent, "valid"),
        Agent.child(stringAgent, "invalid"),
        Agent.child(numberAgent, "number"),
      ] as const,
      { concurrency: 2, onFailure: "collect" },
    )
    expect([Exit.isSuccess(exits[0]), Exit.isSuccess(exits[1]), Exit.isSuccess(exits[2])]).toEqual([true, false, true])
    expect(Exit.isSuccess(exits[0]) && exits[0].value).toEqual({ value: "ok" })
    const failure = Exit.isFailure(exits[1]) ? Cause.squash(exits[1].cause) : undefined
    expect(Schema.is(Agent.RunError)(failure) ? failure._tag : undefined).toBe("generalist/core/InvalidOutput")
    expect(Exit.isSuccess(exits[2]) && exits[2].value).toEqual({ value: 42 })
  }).pipe((effect) => provideScoped(model, effect))
})

it.effect("interrupts running siblings after the first failFast failure", () =>
  Effect.gen(function* () {
    const hangingStarted = yield* Deferred.make<void>()
    const hangingInterrupted = yield* Deferred.make<void>()
    const model = modelLayer((options) => {
      const prompt = promptText(options)
      if (prompt.includes("hang")) {
        return Deferred.succeed(hangingStarted, undefined).pipe(
          Effect.andThen(Effect.never),
          Effect.onInterrupt(() => Deferred.succeed(hangingInterrupted, undefined)),
        )
      }
      return Deferred.await(hangingStarted).pipe(Effect.as('{"output":{"value":42}}'))
    })
    const failure = yield* provideScoped(
      model,
      Agent.fanOut([Agent.child(stringAgent, "hang"), Agent.child(stringAgent, "fail")] as const, {
        concurrency: 2,
        onFailure: "failFast",
      }).pipe(Effect.flip),
    )
    expect(failure._tag).toBe("generalist/core/InvalidOutput")
    yield* Deferred.await(hangingInterrupted)
  }),
)

it.effect("executes AgentTool.fanOut without a caller-supplied handler", () => {
  const child = Agent.make({ name: "delegated-child" })
  const delegate = AgentTool.fanOut({
    name: "delegate",
    description: "Delegate independent tasks",
    agents: { researcher: { agent: child } },
    maxChildren: 2,
  })
  const toolkit = Toolkit.make(delegate)
  const parent = Agent.make({ name: "fan-out-parent", toolkit })
  const parentRequirementsProof: Assert<Equal<Agent.Requirements<typeof parent>, LanguageModel.LanguageModel>> = true
  let parentCalls = 0
  const lifecycle = new Array<string>()
  const hooks = Hooks.layer([
    Hooks.onChildStart(({ child: started }) =>
      Effect.sync(() => {
        lifecycle.push(`start:${started.operation}:${started.selection}`)
        return Hooks.Continue()
      }),
    ),
    Hooks.onChildEnd(({ child: ended, result }) =>
      Effect.sync(() => {
        lifecycle.push(`end:${ended.operation}:${String(result)}`)
        return Hooks.Continue()
      }),
    ),
  ])
  const layer = Layer.effect(
    LanguageModel.LanguageModel,
    LanguageModel.make({
      generateText: () => withProviderFinishContent(Effect.succeed([{ type: "text" as const, text: "unused" }])),
      streamText: (options) => {
        const activeTools = Schema.decodeSync(Schema.Array(Schema.Struct({ name: Schema.String })))(options.tools).map(
          (tool) => tool.name,
        )
        if (activeTools.includes("delegate")) {
          parentCalls += 1
          return withProviderFinish(
            parentCalls === 1
              ? Stream.make(
                  Response.toolCallPart({
                    id: "delegate-call",
                    name: "delegate",
                    params: {
                      children: [
                        { agent: "researcher", input: "first" },
                        { agent: "researcher", input: "second" },
                      ],
                      concurrency: 2,
                      onFailure: "collect",
                    },
                    providerExecuted: false,
                  }),
                )
              : Stream.make(textDelta("parent complete")),
          )
        }
        const prompt = JSON.stringify(options.prompt.content)
        return withProviderFinish(Stream.make(textDelta(prompt.includes("first") ? "first result" : "second result")))
      },
    }),
  )
  return Effect.gen(function* () {
    expect(parentRequirementsProof).toBe(true)
    expect(Object.keys(toolkit.tools)).toEqual(["delegate"])
    expect(() =>
      Schema.decodeSync(delegate.parametersSchema)({
        children: [
          { agent: "researcher", input: "one" },
          { agent: "researcher", input: "two" },
        ],
      }),
    ).not.toThrow()
    expect(() =>
      Schema.decodeSync(delegate.parametersSchema)({
        children: [
          { agent: "researcher", input: "one" },
          { agent: "researcher", input: "two" },
          { agent: "researcher", input: "three" },
        ],
      }),
    ).toThrow()

    const events = yield* Stream.runCollect(Agent.stream(parent, "delegate both tasks"))
    const completed = events.find((event) => event._tag === "ToolExecutionCompleted")
    const result: unknown = completed?._tag === "ToolExecutionCompleted" ? completed.result.result : undefined
    const results = yield* Schema.decodeUnknownEffect(
      Schema.Array(Schema.Exit(Schema.String, Agent.RunError, Schema.Defect())),
    )(result)
    expect(results.map((exit) => exit._tag)).toEqual(["Success", "Success"])
    expect(results.map((exit) => (Exit.isSuccess(exit) ? exit.value : undefined))).toEqual([
      "first result",
      "second result",
    ])
    expect(lifecycle.toSorted()).toEqual([
      "end:delegate-call:0:first result",
      "end:delegate-call:1:second result",
      "start:delegate-call:0:researcher",
      "start:delegate-call:1:researcher",
    ])
    expect(events.at(-1)).toMatchObject({ _tag: "Completed", output: "parent complete" })
  }).pipe((effect) =>
    provideScoped(Layer.mergeAll(layer, hooks, Permissions.layerAllowAll, Approvals.layerAutoApprove), effect),
  )
})
