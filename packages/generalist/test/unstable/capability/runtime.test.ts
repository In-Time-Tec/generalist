import { expect, it } from "@effect/vitest"
import { Effect, Layer, Schema, Stream } from "effect"
import { LanguageModel, Response, Tool, Toolkit } from "effect/unstable/ai"
import { Agent, AgentTool, Approvals, Permissions } from "../../../src/index.js"
import { Descriptor } from "../../../src/core/capability/state.js"
import { LoopDriverState } from "../../../src/core/durable/loop-driver-state.js"
import { ExecutableResolver, RunExecutor, RunStore, Runtime } from "../../../src/runtime/index.js"
import { Denied, attenuate, grant } from "../../../src/unstable/capability/index.js"
import { provideScoped } from "../../runtime/execution/scoped-provide.js"

const usage = Response.Usage.make({
  inputTokens: { total: 1, uncached: 1, cacheRead: undefined, cacheWrite: undefined },
  outputTokens: { total: 1, text: 1, reasoning: undefined },
})
const finish = (reason: Response.FinishReason) => Response.makePart("finish", { reason, usage, response: undefined })
const call = (id: string, name: string, params: Readonly<Record<string, Schema.Json>>) =>
  Stream.make(Response.makePart("tool-call", { id, name, params, providerExecuted: false }), finish("tool-calls"))
const text = (value: string) =>
  Stream.make(Response.makePart("text-delta", { id: "capability-runtime", delta: value }), finish("stop"))
const ModelToolNames = Schema.Array(Schema.Struct({ name: Schema.String }))
const toolNames = (request: Parameters<Parameters<typeof LanguageModel.make>[0]["streamText"]>[0]) =>
  Schema.decodeSync(ModelToolNames)(request.tools).map((tool) => tool.name)

it.effect("serializes capability lineage and recovers a hosted child denial without redispatch", () =>
  Effect.gen(function* () {
    const file = Tool.make("runtime_capability_file", {
      parameters: Schema.Struct({ path: Schema.String, op: Schema.String }),
      success: Schema.String,
      needsApproval: true,
    })
    const root = yield* grant(file, {
      scope: { paths: ["src/**"], ops: ["read", "write"] },
      expires: "1 hour",
    })
    const readOnly = attenuate(root, { paths: ["src/auth/**"], ops: ["read"] })
    const child = Agent.make({ name: "runtime-capability-child", toolkit: Toolkit.make(file) })
    const reviewer = Agent.child(child, "attempt a write, then read", { inherit: { tools: [readOnly] } })
    const delegate = AgentTool.fanOut({
      name: "delegate_runtime_capability",
      description: "Run one capability-constrained durable child",
      agents: { reviewer: { agent: reviewer.agent, inherit: { tools: [readOnly] } } },
      maxChildren: 1,
    })
    const parent = Agent.make({ name: "runtime-capability-parent", toolkit: Toolkit.make(file, delegate) })

    let parentModelCalls = 0
    let childModelCalls = 0
    let recoveredPrompt = ""
    const model = Layer.effect(
      LanguageModel.LanguageModel,
      LanguageModel.make({
        generateText: () => Effect.succeed([{ type: "text", text: "unused" }]),
        streamText: (request) => {
          if (toolNames(request).includes(delegate.name)) {
            parentModelCalls += 1
            return parentModelCalls === 1
              ? call("delegate-child", delegate.name, {
                  children: [{ agent: "reviewer", input: "attempt a write, then read" }],
                })
              : text("parent complete")
          }
          childModelCalls += 1
          if (childModelCalls === 1) {
            return call("hosted-write", file.name, { path: "src/admin/config.ts", op: "write" })
          }
          if (childModelCalls === 2) {
            return call("hosted-read", file.name, { path: "src/auth/session.ts", op: "read" })
          }
          recoveredPrompt = JSON.stringify(request.prompt.content)
          return text("child complete")
        },
      }),
    )
    const dispatched: Array<{ readonly path: string; readonly op: string }> = []
    const handlers = Toolkit.make(file).toLayer({
      runtime_capability_file: (input) =>
        Effect.sync(() => {
          dispatched.push(input)
          return `${input.op}:${input.path}`
        }),
    })
    const authorization = Layer.merge(
      Permissions.layerAllowAll,
      Approvals.layerTest({ resolve: (pending) => Effect.succeed(pending) }),
    )
    const runtime = Runtime.layerMemory({ addresses: [], scheduler: { pollInterval: "1 hour" } }).pipe(
      Layer.provide(ExecutableResolver.layerStatic([]).pipe(Layer.orDie)),
    )

    yield* provideScoped(
      Layer.merge(runtime, Layer.mergeAll(model, authorization, handlers)),
      Effect.gen(function* () {
        const service = yield* Runtime.Runtime
        const executor = yield* RunExecutor.RunExecutor
        const store = yield* RunStore.RunStore
        yield* service.register(parent)
        const parentRun = yield* service.start(parent, "delegate to the reviewer")
        yield* executor.execute(yield* store.claimExecution({ runId: parentRun.runId, ownerId: "capability-parent" }))

        const parentHistory = yield* service.history({ runId: parentRun.runId, limit: 100 })
        const linked = parentHistory.find((event) => event._tag === "ChildLinked")
        if (linked?._tag !== "ChildLinked") {
          return yield* Effect.die("capability child was not durably linked")
        }
        const descriptors = yield* Schema.decodeUnknownEffect(Schema.Array(Descriptor))(linked.inherit.tools).pipe(
          Effect.orDie,
        )
        const requestedDescriptors = yield* Schema.decodeUnknownEffect(Schema.Array(Descriptor))(
          reviewer.inherit.tools,
        ).pipe(Effect.orDie)
        expect(descriptors).toEqual(requestedDescriptors)
        expect(descriptors).toHaveLength(1)
        const descriptor = descriptors[0]!
        expect(descriptor).not.toBe(readOnly)
        expect("_tag" in descriptor).toBe(false)
        expect(descriptor).toMatchObject({
          id: readOnly.id,
          tool: file.name,
          scope: { paths: ["src/auth/**"], ops: ["read"] },
        })
        expect(descriptor.lineage).toMatchObject([
          { _tag: "Grant", id: root.id, tool: file.name },
          { _tag: "Attenuation", id: readOnly.id, parentId: root.id, tool: file.name },
        ])

        const childRunId = linked.childRunId
        const admitted = yield* store.loadExecution(childRunId)
        const policy = yield* Schema.decodeUnknownEffect(Agent.Inheritance)(
          admitted.message.metadata.childInheritancePolicy,
        )
        expect(policy.tools).toEqual(descriptors)

        yield* executor.execute(
          yield* store.claimExecution({ runId: childRunId, ownerId: "capability-child-before-recovery" }),
        )
        expect(dispatched).toEqual([])
        expect(childModelCalls).toBe(2)
        const suspended = yield* service.inspect(childRunId)
        const approval = suspended.waits.find((wait) => wait.reason._tag === "Approval")
        if (approval === undefined) return yield* Effect.die("capability child did not suspend for approval")
        expect(suspended.status).toBe("waiting")

        const checkpoint = (yield* store.loadExecution(childRunId)).checkpoint
        if (checkpoint === undefined || !("driverVersion" in checkpoint)) {
          return yield* Effect.die("capability child checkpoint was not persisted")
        }
        const state = yield* Schema.decodeUnknownEffect(LoopDriverState)(checkpoint.state).pipe(Effect.orDie)
        expect(state.capabilities?.events).toContainEqual(
          expect.objectContaining({
            _tag: "Use",
            toolCallId: "hosted-write",
            decision: "deny",
            reason: "invalid-scope",
          }),
        )
        expect(state.capabilities?.events).toContainEqual(
          expect.objectContaining({ _tag: "Use", toolCallId: "hosted-read", decision: "allow" }),
        )
        const beforeRecovery = yield* service.history({ runId: childRunId, limit: 100 })
        expect(
          beforeRecovery.filter(
            (event) =>
              event._tag === "ToolExecutionCompleted" &&
              event.call.id === "hosted-write" &&
              event.result.isFailure &&
              Schema.is(Denied)(event.result.result),
          ),
        ).toHaveLength(1)

        yield* service.respond({
          runId: childRunId,
          waitId: approval.waitId,
          resolution: { _tag: "Approved" },
        })
        yield* executor.execute(
          yield* store.claimExecution({ runId: childRunId, ownerId: "capability-child-after-recovery" }),
        )

        expect((yield* service.inspect(childRunId)).status).toBe("succeeded")
        expect(dispatched).toEqual([{ path: "src/auth/session.ts", op: "read" }])
        expect(childModelCalls).toBe(3)
        expect(recoveredPrompt).toContain("generalist/capability/Denied")
        expect(recoveredPrompt).toContain("invalid-scope")
        const recoveredHistory = yield* service.history({ runId: childRunId, limit: 100 })
        expect(
          recoveredHistory.filter(
            (event) => event._tag === "ToolExecutionCompleted" && event.call.id === "hosted-write",
          ),
        ).toHaveLength(1)
        expect(
          recoveredHistory.filter((event) => event._tag === "ToolExecutionStarted" && event.call.id === "hosted-write"),
        ).toHaveLength(0)

        yield* executor.execute(
          yield* store.claimExecution({ runId: parentRun.runId, ownerId: "capability-parent-resume" }),
        )
        expect(yield* parentRun.await).toBe("parent complete")
      }),
    )
  }),
)
