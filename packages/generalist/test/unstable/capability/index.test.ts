/* oxlint-disable effecttsgo/strict-effect-provide -- Each test is a test-host Layer composition root. */
import { expect, it } from "@effect/vitest"
import { Cause, Effect, Exit, Layer, pipe, Schema, Stream } from "effect"
import { TestClock } from "effect/testing"
import { LanguageModel, Prompt, Response, Tool, Toolkit } from "effect/unstable/ai"
import { Agent, Approvals, DurableDriver, ExecutableManifest, Hooks, Permissions } from "../../../src/index.js"
import { LoopDriverState } from "../../../src/core/durable/loop-driver-state.js"
import type { DriverCheckpoint } from "../../../src/core/durable/driver/contract.js"
import { applyInheritance, inheritance } from "../../../src/core/agent/lifecycle/fan-out.js"
import {
  AttenuationWidened,
  Denied,
  Invalid,
  Scope,
  attenuate,
  check,
  grant,
  requireUntainted,
  revoke,
  type Handle,
} from "../../../src/unstable/capability/index.js"

const usage = Response.Usage.make({
  inputTokens: { total: 1, uncached: 1, cacheRead: undefined, cacheWrite: undefined },
  outputTokens: { total: 1, text: 1, reasoning: undefined },
})
const finish = (reason: Response.FinishReason) => Response.makePart("finish", { reason, usage, response: undefined })
const toolCall = (id: string, name: string, params: Readonly<Record<string, Schema.Json>>) =>
  Stream.make(Response.makePart("tool-call", { id, name, params, providerExecuted: false }), finish("tool-calls"))
const textResponse = (text: string) =>
  Stream.make(Response.makePart("text-delta", { id: "capability-answer", delta: text }), finish("stop"))
const modelLayer = (streamText: Parameters<typeof LanguageModel.make>[0]["streamText"]) =>
  Layer.effect(
    LanguageModel.LanguageModel,
    LanguageModel.make({
      generateText: () => Effect.succeed([{ type: "text" as const, text: "unused" }]),
      streamText,
    }),
  )
const authorization = Layer.mergeAll(Permissions.layerAllowAll, Approvals.layerAutoApprove)
const fileScope = { paths: ["src/**"], ops: ["read", "write"] }
const fileTool = Tool.make("capability_file", {
  parameters: Schema.Struct({ path: Schema.String, op: Schema.String }),
  success: Schema.String,
})

it.effect("rejects widening, transitively revokes descendants, and enforces TestClock expiry", () =>
  Effect.gen(function* () {
    const root = yield* grant(fileTool, { scope: fileScope, expires: "1 hour" })
    const readAuth = attenuate(root, { paths: ["src/auth/**"], ops: ["read"] })
    const leaf = attenuate(readAuth, { paths: ["src/auth/session.ts"], ops: ["read"] })

    expect(() => attenuate(readAuth, { paths: ["src/**"], ops: ["read", "write"] })).toThrow(AttenuationWidened)
    expect(() => attenuate(root, { paths: ["other/**"], ops: ["read"] })).toThrow(AttenuationWidened)
    yield* check(leaf, { path: "src/auth/session.ts", op: "read" })
    yield* revoke(root)
    expect(yield* Effect.flip(check(leaf, { path: "src/auth/session.ts", op: "read" }))).toMatchObject({
      _tag: "generalist/capability/Denied",
      reason: "revoked",
    })

    const expiring = yield* grant(fileTool, { scope: fileScope, expires: "30 minutes" })
    yield* check(expiring, { path: "src/index.ts", op: "write" })
    yield* TestClock.adjust("30 minutes")
    expect(yield* Effect.flip(check(expiring, { path: "src/index.ts", op: "write" }))).toMatchObject({
      _tag: "generalist/capability/Denied",
      reason: "expired",
    })
  }),
)

it.effect("accepts only live framework-issued handles", () =>
  Effect.gen(function* () {
    expect(Schema.is(Scope)({})).toBe(false)
    expect(yield* Effect.flip(grant(fileTool, { scope: {}, expires: "1 hour" }))).toMatchObject({
      _tag: "generalist/capability/Invalid",
      reason: "scope",
    })
    const handle = yield* grant(fileTool, { scope: fileScope, expires: "1 hour" })
    const forged: Handle<typeof fileTool> = { ...handle }
    expect(yield* Effect.flip(check(forged, { path: "src/index.ts", op: "read" }))).toMatchObject({
      _tag: "generalist/capability/Invalid",
      reason: "handle",
    })
    expect(Schema.is(Invalid)(yield* Effect.flip(check(forged, { path: "src/index.ts", op: "read" })))).toBe(true)
    expect(Reflect.set(handle.scope.paths!, 0, "**")).toBe(false)
    expect(handle.scope.paths).toEqual(["src/**"])

    const sameName = Tool.make("capability_file", {
      parameters: Schema.Struct({ path: Schema.String, op: Schema.String }),
      success: Schema.String,
    })
    const otherAgent = Agent.make({ name: "same-name-tool", toolkit: Toolkit.make(sameName) })
    expect(
      yield* Effect.flip(applyInheritance(otherAgent, otherAgent, inheritance({ tools: [handle] }))),
    ).toMatchObject({ _tag: "generalist/core/ChildExceedsParent", field: "tools" })
  }),
)

it.effect("denies a child's widened operation before hooks and permissions while leaving the parent unrestricted", () =>
  Effect.gen(function* () {
    const root = yield* grant(fileTool, { scope: fileScope, expires: "1 hour" })
    const readOnly = attenuate(root, { paths: ["src/auth/**"], ops: ["read"] })
    const toolkit = Toolkit.make(fileTool)
    const child = Agent.make({ name: "capability-child", toolkit })
    let childHandlerCalls = 0
    let childHookCalls = 0
    let childModelCalls = 0
    let denialPrompt = ""
    const checkpoints: Array<DriverCheckpoint> = []
    const handlers = toolkit.toLayer({
      capability_file: () =>
        Effect.sync(() => {
          childHandlerCalls += 1
          return "unexpected child write"
        }),
    })
    const childModel = modelLayer((request) => {
      childModelCalls += 1
      if (childModelCalls === 1) {
        return toolCall("child-write", fileTool.name, { path: "src/auth/token.ts", op: "write" })
      }
      denialPrompt = JSON.stringify(request.prompt.content)
      return textResponse("child observed denial")
    })
    const hooks = Hooks.layer([
      Hooks.onToolCall(() =>
        Effect.sync(() => {
          childHookCalls += 1
          return Hooks.Continue()
        }),
      ),
    ])
    const journal = Layer.succeed(DurableDriver.DriverJournal, {
      onScheduled: () => Effect.void,
      onCompleted: (_operation, _outcome, checkpoint) =>
        Effect.sync(() => {
          checkpoints.push(checkpoint)
        }),
      onCheckpoint: (checkpoint) =>
        Effect.sync(() => {
          checkpoints.push(checkpoint)
        }),
    })

    const exits = yield* Agent.fanOut(
      [Agent.child(child, "attempt a write", { inherit: { tools: [readOnly] } })] as const,
      { concurrency: 1, onFailure: "collect" },
    ).pipe(Effect.provide(Layer.mergeAll(childModel, authorization, handlers, hooks, journal)))

    const childFailure = Exit.isFailure(exits[0]) ? Cause.squash(exits[0].cause) : undefined
    expect(childFailure).toBeUndefined()
    expect(childHandlerCalls).toBe(0)
    expect(childHookCalls).toBe(0)
    expect(denialPrompt).toContain("generalist/capability/Denied")
    expect(denialPrompt).toContain("invalid-scope")
    const states = checkpoints.map((checkpoint) => Schema.decodeUnknownSync(LoopDriverState)(checkpoint.state))
    const events = states.flatMap((state) => state.capabilities?.events ?? [])
    expect(events).toContainEqual(expect.objectContaining({ _tag: "Grant", id: root.id }))
    expect(events).toContainEqual(expect.objectContaining({ _tag: "Attenuation", id: readOnly.id, parentId: root.id }))
    expect(events).toContainEqual(
      expect.objectContaining({
        _tag: "Use",
        toolCallId: "child-write",
        decision: "deny",
        reason: "invalid-scope",
      }),
    )
    const denial = states
      .flatMap((state) => state.toolBatch?.calls ?? [])
      .find((entry) => entry.call.id === "child-write" && entry.state._tag === "Completed")
    expect(denial?.state).toMatchObject({
      _tag: "Completed",
      result: { isFailure: true, result: { _tag: "generalist/capability/Denied" } },
    })

    let parentHandlerCalls = 0
    let parentModelCalls = 0
    const parentHandlers = toolkit.toLayer({
      capability_file: ({ path, op }) =>
        Effect.sync(() => {
          parentHandlerCalls += 1
          return `${op}:${path}`
        }),
    })
    const parentModel = modelLayer(() => {
      parentModelCalls += 1
      return parentModelCalls === 1
        ? toolCall("parent-write", fileTool.name, { path: "src/auth/token.ts", op: "write" })
        : textResponse("parent write completed")
    })
    const parent = Agent.make({ name: "capability-parent", toolkit })
    expect(
      yield* Agent.run(parent, "write as the parent").pipe(
        Effect.provide(Layer.mergeAll(parentModel, authorization, parentHandlers)),
      ),
    ).toBe("parent write completed")
    expect(parentHandlerCalls).toBe(1)
  }),
)

it.effect("journals a transitive revocation when a descendant is next used", () =>
  Effect.gen(function* () {
    const root = yield* grant(fileTool, { scope: fileScope, expires: "1 hour" })
    const readOnly = attenuate(root, { paths: ["src/auth/**"], ops: ["read"] })
    yield* revoke(root)
    const toolkit = Toolkit.make(fileTool)
    const base = Agent.make({ name: "capability-revoked-child", toolkit })
    const constrained = yield* applyInheritance(base, base, inheritance({ tools: [readOnly] }))
    let handlerCalls = 0
    const checkpoints: Array<DriverCheckpoint> = []
    const handlers = toolkit.toLayer({
      capability_file: () =>
        Effect.sync(() => {
          handlerCalls += 1
          return "unexpected read"
        }),
    })
    const journal = Layer.succeed(DurableDriver.DriverJournal, {
      onScheduled: () => Effect.void,
      onCompleted: () => Effect.void,
      onCheckpoint: (checkpoint) =>
        Effect.sync(() => {
          checkpoints.push(checkpoint)
        }),
    })

    const events = yield* Agent.streamToolCalls(constrained, {
      _tag: "Start",
      calls: [
        {
          id: "revoked-read",
          name: fileTool.name,
          params: { path: "src/auth/token.ts", op: "read" },
          type: "tool-call",
        },
      ],
      activeTools: [fileTool.name],
      messages: Prompt.make("read once").content,
      sessionId: "capability-revoked",
      logicalOperationId: "capability-revoked",
      turn: 0,
    }).pipe(Stream.runCollect, Effect.provide(Layer.mergeAll(authorization, handlers, journal)))

    expect(Array.from(events)).toMatchObject([
      {
        _tag: "ToolExecutionCompleted",
        result: { isFailure: true, result: { _tag: "generalist/capability/Denied", reason: "revoked" } },
      },
    ])
    expect(handlerCalls).toBe(0)
    const capabilityEvents = checkpoints
      .map((checkpoint) => Schema.decodeUnknownSync(LoopDriverState)(checkpoint.state))
      .flatMap((state) => state.capabilities?.events ?? [])
    expect(capabilityEvents).toContainEqual(expect.objectContaining({ _tag: "Revocation", id: root.id }))
    expect(capabilityEvents).toContainEqual(
      expect.objectContaining({ _tag: "Use", id: readOnly.id, decision: "deny", reason: "revoked" }),
    )
  }),
)

it.effect("propagates a protected result's taint and rejects a declared untainted sink", () =>
  Effect.gen(function* () {
    const untrusted = Tool.make("capability_untrusted", {
      parameters: Schema.Struct({ url: Schema.String }),
      success: Schema.String,
    })
    const deploy = pipe(
      Tool.make("capability_deploy", {
        parameters: Schema.Struct({ target: Schema.String }),
        success: Schema.String,
      }),
      requireUntainted(["target"]),
    )
    const readHandle = yield* grant(untrusted, { scope: { urls: ["https://example.com/**"] }, expires: "1 hour" })
    const deployHandle = yield* grant(deploy, { scope: { targets: ["production"] }, expires: "1 hour" })
    const toolkit = Toolkit.make(untrusted, deploy)
    const child = Agent.make({ name: "taint-child", toolkit })
    let modelCalls = 0
    let readCalls = 0
    let deployCalls = 0
    let deniedPrompt = ""
    const checkpoints: Array<DriverCheckpoint> = []
    const model = modelLayer((request) => {
      modelCalls += 1
      if (modelCalls === 1) {
        return toolCall("untrusted-read", untrusted.name, { url: "https://example.com/target" })
      }
      if (modelCalls === 2) return toolCall("tainted-deploy", deploy.name, { target: "production" })
      deniedPrompt = JSON.stringify(request.prompt.content)
      return textResponse("taint denied")
    })
    const handlers = toolkit.toLayer({
      capability_untrusted: () =>
        Effect.sync(() => {
          readCalls += 1
          return "production"
        }),
      capability_deploy: () =>
        Effect.sync(() => {
          deployCalls += 1
          return "deployed"
        }),
    })
    const journal = Layer.succeed(DurableDriver.DriverJournal, {
      onScheduled: () => Effect.void,
      onCompleted: (_operation, _outcome, checkpoint) =>
        Effect.sync(() => {
          checkpoints.push(checkpoint)
        }),
      onCheckpoint: (checkpoint) =>
        Effect.sync(() => {
          checkpoints.push(checkpoint)
        }),
    })

    const exits = yield* Agent.fanOut(
      [Agent.child(child, "read then deploy", { inherit: { tools: [readHandle, deployHandle] } })] as const,
      { concurrency: 1, onFailure: "collect" },
    ).pipe(Effect.provide(Layer.mergeAll(model, authorization, handlers, journal)))

    const childFailure = Exit.isFailure(exits[0]) ? Cause.squash(exits[0].cause) : undefined
    expect(childFailure).toBeUndefined()
    expect(readCalls).toBe(1)
    expect(deployCalls).toBe(0)
    expect(deniedPrompt).toContain("generalist/capability/Denied")
    expect(deniedPrompt).toContain("tainted")
    const states = checkpoints.map((checkpoint) => Schema.decodeUnknownSync(LoopDriverState)(checkpoint.state))
    const readResult = states
      .flatMap((state) => state.toolBatch?.calls ?? [])
      .find((entry) => entry.call.id === "untrusted-read" && entry.state._tag === "Completed")
    expect(readResult?.state).toMatchObject({
      _tag: "Completed",
      result: {
        taint: [{ tool: untrusted.name, toolCallId: "untrusted-read" }],
      },
    })
    const taintUse = states
      .flatMap((state) => state.capabilities?.events ?? [])
      .find((event) => event._tag === "Use" && event.toolCallId === "tainted-deploy")
    expect(taintUse).toMatchObject({
      _tag: "Use",
      decision: "deny",
      reason: "tainted",
      argumentTaint: [{ tool: untrusted.name, toolCallId: "untrusted-read" }],
    })
  }),
)

it.effect("replays a journaled check after expiry in a fresh interpreter but denies a new call", () =>
  Effect.gen(function* () {
    const handle = yield* grant(fileTool, { scope: fileScope, expires: "1 hour" })
    const toolkit = Toolkit.make(fileTool)
    const base = Agent.make({ name: "capability-check-replay", toolkit })
    const constrained = yield* applyInheritance(base, base, inheritance({ tools: [handle] }))
    const messages = Prompt.make("write once").content
    const executableRef = yield* Schema.decodeEffect(ExecutableManifest.ExecutableRef)({
      executable: `executable-pin:v1:sha256:${"c".repeat(64)}`,
      active: `agent-pin:v1:sha256:${"d".repeat(64)}`,
    })
    let handlerCalls = 0
    let interruptedCheckpoint: DriverCheckpoint | undefined
    const handlers = toolkit.toLayer({
      capability_file: () =>
        Effect.sync(() => {
          handlerCalls += 1
          return "written"
        }),
    })
    const interruptAfterCheck = Layer.succeed(DurableDriver.DriverJournal, {
      onScheduled: () => Effect.void,
      onCompleted: () => Effect.void,
      onCheckpoint: (checkpoint) =>
        Effect.gen(function* () {
          const state = yield* Schema.decodeUnknownEffect(LoopDriverState)(checkpoint.state).pipe(Effect.orDie)
          const checked =
            state.capabilities?.events.some(
              (event) => event._tag === "Use" && event.toolCallId === "replayed-write" && event.decision === "allow",
            ) === true
          if (!checked) return
          interruptedCheckpoint = checkpoint
          return yield* Effect.interrupt
        }),
    })
    const start = Agent.streamToolCalls(constrained, {
      _tag: "Start",
      calls: [
        { id: "replayed-write", name: fileTool.name, params: { path: "src/index.ts", op: "write" }, type: "tool-call" },
      ],
      activeTools: [fileTool.name],
      messages,
      sessionId: "capability-replay",
      logicalOperationId: "capability-replay",
      turn: 0,
      executableRef,
    }).pipe(Stream.runDrain, Effect.provide(Layer.mergeAll(authorization, handlers, interruptAfterCheck)))
    const interrupted = yield* Effect.exit(start)
    expect(Exit.isFailure(interrupted) && Cause.hasInterruptsOnly(interrupted.cause)).toBe(true)
    expect(handlerCalls).toBe(0)
    if (interruptedCheckpoint === undefined) return yield* Effect.die("Capability checkpoint was not captured")

    yield* TestClock.adjust("2 hours")
    const replayed = yield* Agent.streamToolCalls(constrained, {
      _tag: "Resume",
      driverCheckpoint: interruptedCheckpoint,
      executableRef,
      messages,
    }).pipe(Stream.runCollect, Effect.provide(Layer.merge(authorization, handlers)))
    expect(Array.from(replayed).map((event) => event._tag)).toEqual(["ToolExecutionStarted", "ToolExecutionCompleted"])
    expect(handlerCalls).toBe(1)

    const denied = yield* Agent.streamToolCalls(constrained, {
      _tag: "Start",
      calls: [
        { id: "new-write", name: fileTool.name, params: { path: "src/index.ts", op: "write" }, type: "tool-call" },
      ],
      activeTools: [fileTool.name],
      messages,
      sessionId: "capability-new-call",
      logicalOperationId: "capability-new-call",
      turn: 0,
    }).pipe(Stream.runCollect, Effect.provide(Layer.merge(authorization, handlers)))
    expect(Array.from(denied)).toMatchObject([
      {
        _tag: "ToolExecutionCompleted",
        result: { isFailure: true, result: { _tag: "generalist/capability/Denied", reason: "expired" } },
      },
    ])
    const deniedEvent = Array.from(denied)[0]
    expect(deniedEvent?._tag === "ToolExecutionCompleted" && Schema.is(Denied)(deniedEvent.result.result)).toBe(true)
    expect(handlerCalls).toBe(1)
  }),
)
