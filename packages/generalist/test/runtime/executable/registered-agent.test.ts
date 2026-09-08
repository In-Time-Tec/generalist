import { describe, expect, it } from "@effect/vitest"
import { Effect, Layer, Schema, Stream } from "effect"
import { LanguageModel, Tool, Toolkit } from "effect/unstable/ai"
import { Agent, AgentTool } from "../../../src/index.js"
import {
  AgentProfiles,
  capture,
  durableIdentity,
  make,
  resolve,
} from "../../../src/runtime/executable/registered-agent.js"
import { make as makeExecutable } from "../../../src/runtime/executable/manifest.js"
import { resolveChild } from "../../../src/runtime/executable/manifest-internal.js"
import { ExecutablePinMissing } from "../../../src/runtime/errors.js"
import { provideScoped } from "../execution/scoped-provide.js"

const model = Layer.effect(
  LanguageModel.LanguageModel,
  LanguageModel.make({
    generateText: () => Effect.die("unused"),
    streamText: () => Stream.die("unused"),
  }),
)

describe("declared child profiles", () => {
  it.effect("keeps embedded fan-out profiles registered alongside named Host profiles", () => {
    const child = Agent.make({ name: "embedded" })
    const tool = AgentTool.fanOut({
      name: "delegate",
      description: "Delegate",
      agents: { embedded: { agent: child } },
      maxChildren: 1,
    })
    const root = Agent.make({ name: "root", toolkit: Toolkit.make(tool) })
    return capture(root).pipe(
      Effect.provideService(AgentProfiles, [root]),
      Effect.map((registrations) =>
        expect(registrations.map((registration) => registration.name)).toEqual(["root", "embedded"]),
      ),
      (effect) => provideScoped(model, effect),
    )
  })

  it("rejects a child profile that widens its parent's pinned tools", () => {
    const tool = Tool.make("write", { parameters: Schema.Struct({}), success: Schema.String })
    const root = Agent.make({ name: "root", children: ["child"] })
    const child = Agent.make({ name: "child", toolkit: Toolkit.make(tool) })
    const { executable } = durableIdentity(root, [root, child])
    expect(resolveChild(executable.ref, executable.manifest, "child")).toBeUndefined()
  })

  it("pins named self-recursion without a tool or an object cycle", () => {
    const children = ["researcher"]
    const agent = Agent.make({ name: "researcher", children })
    children.push("not-declared")
    const { executable } = durableIdentity(agent)
    expect(agent.children).toEqual(["researcher"])
    expect(executable.manifest.profiles).toEqual([{ selection: "researcher", agent: executable.ref.active }])
    expect(resolveChild(executable.ref, executable.manifest, "researcher")).toBeDefined()
    expect(resolveChild(executable.ref, executable.manifest, "not-declared")).toBeUndefined()
  })

  it("validates names and rejects missing or conflicting profiles", () => {
    expect(() => Agent.make({ name: "root", children: [""] })).toThrow("non-empty")
    expect(() => Agent.make({ name: "root", children: ["child", "child"] })).toThrow("unique")
    const root = Agent.make({ name: "root", children: ["child"] })
    expect(() => durableIdentity(root)).toThrow("Unknown child profile")
    const child = Agent.make({ name: "child" })
    expect(() => durableIdentity(root, [root, child, child])).toThrow("Duplicate Agent profile")
  })

  it("pins mutual recursion and denies undeclared selections", () => {
    const root = Agent.make({ name: "root", children: ["child"] })
    const child = Agent.make({ name: "child", children: ["root"] })
    const { executable } = durableIdentity(root, [root, child])
    const selected = resolveChild(executable.ref, executable.manifest, "child")!
    expect(selected).toBeDefined()
    expect(resolveChild(executable.ref, executable.manifest, "root")).toBeUndefined()
    expect(executable.manifest.entries).toHaveLength(2)
  })

  it.effect("returns a typed registration error for unresolved declarations", () =>
    capture(Agent.make({ name: "root", children: ["missing"] })).pipe(
      Effect.flip,
      Effect.map((error) => expect(error._tag).toBe("generalist/runtime/ExecutableRegistrationInvalid")),
      (effect) => provideScoped(model, effect),
    ),
  )

  it.effect("attests the original root closure when resolving a named child", () =>
    Effect.gen(function* () {
      const root = Agent.make({ name: "root", children: ["child"] })
      const child = Agent.make({ name: "child" })
      const registry = make()
      const roots = yield* capture(root)
      const children = yield* capture(child)
      yield* registry.registerAll([...roots, ...children])
      const executable = roots[0]!.executable
      const childPin = executable.manifest.profiles[0]!.agent
      const expected = makeExecutable({ ...executable.manifest, active: childPin })
      const result = yield* resolve(
        registry,
        {
          resolve: (input) => ExecutablePinMissing.make({ runId: input.runId, ref: input.ref }),
        },
        {
          runId: "child-run",
          ref: expected.ref,
          manifest: expected.manifest,
          registrations: roots[0]!.registrations,
        },
      )
      expect(result.attestation).toEqual(expected)
      expect(result._tag).toBe("Agent")
    }).pipe(
      Effect.provideService(AgentProfiles, [
        Agent.make({ name: "root", children: ["child"] }),
        Agent.make({ name: "child" }),
      ]),
      (effect) => provideScoped(model, effect),
    ),
  )
})
