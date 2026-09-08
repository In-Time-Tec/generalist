import { expect, it } from "@effect/vitest"
import { Context, Effect, Option, Schema } from "effect"
import { Tool } from "effect/unstable/ai"
import { makeCapability } from "../../../src/core/durable/pin.js"
import { make as makeToolManifest } from "../../../src/core/durable/manifest/tool-manifest.js"
import { make as makeExecutable } from "../../../src/runtime/executable/manifest.js"
import { make as makeRegistry, resolve as resolveRegistered } from "../../../src/runtime/executable/registered-agent.js"
import { makeStatic } from "../../../src/runtime/executable/resolver.js"
import { codec, type RegisteredTool } from "../../../src/runtime/executable/registered-tool.js"
import { requiredPins } from "../../../src/runtime/executable/registration.js"

const tool = Tool.make("checks", {})
const pinned = makeToolManifest({
  name: tool.name,
  tool: makeCapability("checks"),
  input: makeCapability("input"),
  output: makeCapability("output"),
  failure: makeCapability("failure"),
  replay: "never",
})
const executable = makeExecutable({ root: pinned.pin, entries: [{ _tag: "Tool", ...pinned }] })
const registration = (): RegisteredTool => ({
  source: tool,
  context: Context.makeUnsafe<unknown>(new Map()),
  registrations: [...requiredPins(executable)].map((pin) => ({ pin, codec, version: "1", payload: {} })),
  resolution: {
    _tag: "Tool",
    pinned,
    tool,
    input: Schema.Unknown,
    output: Schema.Unknown,
    failure: Schema.Unknown,
    executor: { execute: () => Effect.die("resolution must not execute the Tool") },
    authorizer: () => ({ authorize: () => Effect.succeed({ _tag: "Execute" }) }),
    attestation: executable,
  },
})

it.effect("preserves the first Tool resources when the same source is registered again", () =>
  Effect.gen(function* () {
    const registry = makeRegistry()
    const first = registration()
    const replacement = registration()
    expect(replacement.resolution.executor).not.toBe(first.resolution.executor)
    yield* registry.registerTool(first)
    yield* registry.registerTool(replacement)
    expect(Option.getOrThrow(yield* registry.getTool(tool))).toBe(first)
    expect(Option.getOrThrow(yield* registry.resolveTool(pinned.pin))).toBe(first)
  }),
)

it.effect("rejects a different Tool source with the same pin without replacing its resources", () =>
  Effect.gen(function* () {
    const registry = makeRegistry()
    const first = registration()
    yield* registry.registerTool(first)
    const error = yield* registry.registerTool({ ...registration(), source: Tool.make("checks", {}) }).pipe(Effect.flip)
    expect(error._tag).toBe("generalist/runtime/ExecutableRegistrationInvalid")
    expect(Option.getOrThrow(yield* registry.resolveTool(pinned.pin))).toBe(first)
  }),
)

it.effect("resolves a retained host Tool through the exact static resolver after a fresh registry", () =>
  Effect.gen(function* () {
    const first = registration()
    const fallback = yield* makeStatic([{ ...first.resolution, executable }])
    const input = { runId: "retained-tool", ...executable, registrations: first.registrations }
    const resolved = yield* resolveRegistered(makeRegistry(), fallback, input).pipe(Effect.scoped)
    expect(resolved._tag).toBe("Tool")
    expect(resolved.attestation).toEqual(executable)
    if (resolved._tag === "Tool") expect(resolved.executor).toBe(first.resolution.executor)
    const invalid = yield* resolveRegistered(makeRegistry(), fallback, {
      ...input,
      registrations: first.registrations.map((entry) => ({ ...entry, version: "2" })),
    }).pipe(Effect.flip, Effect.scoped)
    expect(invalid._tag).toBe("generalist/runtime/ExecutableRegistrationInvalid")
  }),
)
