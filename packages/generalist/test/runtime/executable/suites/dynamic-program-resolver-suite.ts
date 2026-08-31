import { describe, expect, it } from "@effect/vitest"
import { Effect, Exit, Layer, Option, Schema, Scope } from "effect"
import { Prompt } from "effect/unstable/ai"
import {
  Agent,
  AgentManifest,
  ExecutableManifest,
  Pins,
  ProgramHandlers,
  ProgramManifest,
  CodeExecutor,
} from "../../../../src/index.js"
import { Errors, ExecutableRegistration, ExecutableResolver } from "../../../../src/runtime/index.js"
import { closedTestAgent, pinnedTestAgent } from "../../run/identity.js"
import { registrationsFor } from "../../execution/fixtures.js"

const sandboxPin = Pins.makeCapability({ sandbox: "dynamic-v1" })
const inputPin = Pins.makeCapability({ codec: "prompt-v1" })
const outputPin = Pins.makeCapability({ codec: "string-v1" })
const toolPin = Pins.makeCapability({ tool: "echo-v1" })
const stepPin = Pins.makeCapability({ step: "shape-v1" })
const agentInputPin = Pins.makeCapability({ codec: "worker-input-v1" })

const budget: ProgramManifest.ProgramBudget = {
  agentRuns: 1,
  concurrency: 1,
  toolCalls: 1,
  tokens: 10,
  wallClockMillis: 1_000,
  logBytes: 100,
  outputBytes: 1_000,
}

const child = Agent.make({ name: "dynamic-worker" })
const pinnedChild = pinnedTestAgent(child, "dynamic-1")

const programFor = (toolCallId: string): ProgramManifest.PinnedProgram =>
  ProgramManifest.make({
    name: `code_mode:${toolCallId}`,
    source: { language: "javascript", text: `return '${toolCallId}'` },
    sandbox: sandboxPin,
    input: inputPin,
    output: outputPin,
    capabilities: {
      tools: [{ name: "echo", pin: toolPin }],
      steps: [{ name: "shape", pin: stepPin }],
      agents: [{ selection: "worker", agent: pinnedChild.pin, input: agentInputPin }],
    },
    budget,
  })

const executableFor = (toolCallId: string): ExecutableManifest.PinnedExecutable => {
  const program = programFor(toolCallId)
  return ExecutableManifest.make({
    root: program.pin,
    entries: [
      { _tag: "Program", ...program },
      { _tag: "Agent", ...pinnedChild },
    ],
  })
}

const invalid = (message: string) => Errors.ExecutableRegistrationInvalid.make({ message })
const fixturePayload = Schema.Struct({ fixture: Schema.String })

/** The exact registration set an admitted Program Run persists, narrowed per required pin. */
const admittedRegistrations = (
  executable: ExecutableManifest.PinnedExecutable,
  revision = "1",
): ReadonlyArray<ExecutableRegistration.ExecutableRegistration> =>
  registrationsFor(executable, revision).filter((registration) =>
    ExecutableRegistration.requiredPinsForActiveExecutable(executable).has(registration.pin),
  )

const fixture = (options: { readonly revision?: string; readonly toolName?: string } = {}) => {
  const revision = options.revision ?? "1"
  const released: Array<string> = []
  const seenAgents: Array<AgentManifest.AgentManifest> = []
  const check = (
    request: ExecutableResolver.CapabilityRequest,
  ): Effect.Effect<void, ExecutableResolver.ReconstructionError> => {
    if (request.registration.codec !== "test" || request.registration.version !== "1") {
      return Effect.fail(
        invalid(`unsupported registration codec ${request.registration.codec}@${request.registration.version}`),
      )
    }
    const payload = Schema.decodeUnknownOption(fixturePayload)(request.registration.payload).pipe(Option.getOrUndefined)
    return payload?.fixture !== revision
      ? Effect.fail(invalid(`registration payload changed: ${request.pin}`))
      : Effect.void
  }
  const reconstruction: ExecutableResolver.ProgramReconstruction = {
    executor: (request) =>
      check(request).pipe(
        Effect.andThen(
          Effect.acquireRelease(
            Effect.succeed(CodeExecutor.makeTest(() => Effect.succeed(request.program.manifest.name))),
            () => Effect.sync(() => void released.push("sandbox")),
          ),
        ),
      ),
    codec: (request) => check(request).pipe(Effect.as(request.boundary === "input" ? Prompt.Prompt : Schema.String)),
    tool: (request) =>
      check(request).pipe(
        Effect.as(
          ProgramHandlers.tool({
            name: options.toolName ?? request.name,
            pin: request.pin,
            input: Schema.String,
            output: Schema.String,
            replay: "recorded",
            authorize: () => Effect.succeed(true),
            execute: (value: string) => Effect.succeed(value),
          }),
        ),
      ),
    step: (request) =>
      check(request).pipe(
        Effect.as(
          ProgramHandlers.step({
            name: request.name,
            pin: request.pin,
            input: Schema.String,
            output: Schema.String,
            replay: "recorded",
            authorize: () => Effect.succeed(true),
            execute: (value: string) => Effect.succeed(value),
          }),
        ),
      ),
    agent: (request) =>
      check(request).pipe(
        Effect.tap(() => Effect.sync(() => void seenAgents.push(request.agentManifest))),
        Effect.as(
          ProgramHandlers.agent({
            selection: request.selection,
            agent: request.agent,
            inputPin: request.pin,
            input: Schema.String,
            replay: "recorded",
            authorize: () => Effect.succeed(true),
            execute: () => Effect.succeed({ text: "worker", turns: 1, tokenUsage: { input: 0, output: 0 } }),
          }),
        ),
      ),
    services: (request) =>
      Effect.acquireRelease(Effect.succeed(Layer.empty), () =>
        Effect.sync(() => void released.push(`services:${request.registrations.length}`)),
      ),
  }
  return { reconstruction, released, seenAgents }
}

const resolverFor = (
  reconstruction: ExecutableResolver.ProgramReconstruction,
  executable: ExecutableManifest.PinnedExecutable,
): ReturnType<typeof ExecutableResolver.makeDynamic> =>
  ExecutableResolver.makeDynamic({
    agents: [
      {
        executable: {
          ref: { executable: executable.ref.executable, active: pinnedChild.pin },
          manifest: executable.manifest,
        },
        agent: closedTestAgent(child),
      },
    ],
    program: reconstruction,
  })

describe("ExecutableResolver.makeDynamic", () => {
  it.effect("reconstructs a unique Program executable admitted for each code_mode tool call", () =>
    Effect.gen(function* () {
      const first = executableFor("code-1")
      const second = executableFor("code-2")
      expect(first.ref.executable).not.toBe(second.ref.executable)
      expect(first.ref.active).not.toBe(second.ref.active)
      const { reconstruction } = fixture()
      const resolver = yield* resolverFor(reconstruction, first)

      for (const executable of [first, second]) {
        const resolution = yield* resolver
          .resolve({ runId: "run:dynamic", ...executable, registrations: admittedRegistrations(executable) })
          .pipe(Effect.scoped)
        expect(resolution._tag).toBe("Program")
        if (resolution._tag !== "Program") return
        expect(resolution.attestation).toEqual({ ref: executable.ref, manifest: executable.manifest })
        expect(resolution.program.pinned.pin).toBe(executable.ref.active)
        expect(resolution.handlers.tools.map((binding) => binding.name)).toEqual(["echo"])
        expect(resolution.handlers.steps.map((binding) => binding.name)).toEqual(["shape"])
        expect(resolution.handlers.agents.map((binding) => binding.selection)).toEqual(["worker"])
      }
    }),
  )

  it.effect("fails typed when a required registration pin is missing", () =>
    Effect.gen(function* () {
      const executable = executableFor("code-missing")
      const { reconstruction } = fixture()
      const resolver = yield* resolverFor(reconstruction, executable)
      const failure = yield* Effect.flip(
        resolver
          .resolve({
            runId: "run:missing",
            ...executable,
            registrations: admittedRegistrations(executable).filter((registration) => registration.pin !== sandboxPin),
          })
          .pipe(Effect.scoped),
      )
      expect(failure).toMatchObject({ _tag: "generalist/runtime/ExecutableRegistrationMissing", pin: sandboxPin })
    }),
  )

  it.effect("fails typed when the persisted set carries a registration the executable does not require", () =>
    Effect.gen(function* () {
      const executable = executableFor("code-extra")
      const { reconstruction } = fixture()
      const resolver = yield* resolverFor(reconstruction, executable)
      const failure = yield* Effect.flip(
        resolver
          .resolve({
            runId: "run:extra",
            ...executable,
            registrations: [
              ...admittedRegistrations(executable),
              { pin: Pins.makeCapability({ tool: "unauthorized" }), codec: "test", version: "1", payload: {} },
            ],
          })
          .pipe(Effect.scoped),
      )
      expect(failure).toMatchObject({ _tag: "generalist/runtime/ExecutableRegistrationInvalid" })
      expect(failure.message).toMatch(/not required by executable/)
    }),
  )

  it.effect("fails typed on an unsupported registration codec version", () =>
    Effect.gen(function* () {
      const executable = executableFor("code-codec")
      const { reconstruction } = fixture()
      const resolver = yield* resolverFor(reconstruction, executable)
      const failure = yield* Effect.flip(
        resolver
          .resolve({
            runId: "run:codec",
            ...executable,
            registrations: [
              { pin: sandboxPin, codec: "test", version: "9", payload: { fixture: "1" } },
              ...admittedRegistrations(executable).filter((registration) => registration.pin !== sandboxPin),
            ],
          })
          .pipe(Effect.scoped),
      )
      expect(failure).toMatchObject({ _tag: "generalist/runtime/ExecutableRegistrationInvalid" })
      expect(failure.message).toMatch(/unsupported registration codec/)
    }),
  )

  it.effect("fails typed when a persisted registration payload changed", () =>
    Effect.gen(function* () {
      const executable = executableFor("code-changed")
      const { reconstruction } = fixture()
      const resolver = yield* resolverFor(reconstruction, executable)
      const failure = yield* Effect.flip(
        resolver
          .resolve({ runId: "run:changed", ...executable, registrations: admittedRegistrations(executable, "2") })
          .pipe(Effect.scoped),
      )
      expect(failure).toMatchObject({ _tag: "generalist/runtime/ExecutableRegistrationInvalid" })
      expect(failure.message).toMatch(/registration payload changed/)
    }),
  )

  it.effect("fails typed when a reconstructed handler leaves the admitted manifest closure", () =>
    Effect.gen(function* () {
      const executable = executableFor("code-handler")
      const { reconstruction } = fixture({ toolName: "shell" })
      const resolver = yield* resolverFor(reconstruction, executable)
      const failure = yield* Effect.flip(
        resolver
          .resolve({ runId: "run:handler", ...executable, registrations: admittedRegistrations(executable) })
          .pipe(Effect.scoped),
      )
      expect(failure).toMatchObject({ _tag: "generalist/runtime/ExecutableRegistrationInvalid" })
      expect(failure.message).toMatch(/handler/)
    }),
  )

  it.effect(
    "reconstructs each Program Agent capability from the admitted closure and keeps static Agent resolution",
    () =>
      Effect.gen(function* () {
        const admitted = executableFor("code-agents")
        const registered = executableFor("code-registered")
        const { reconstruction, seenAgents } = fixture()
        const resolver = yield* resolverFor(reconstruction, registered)

        const program = yield* resolver
          .resolve({ runId: "run:agents", ...admitted, registrations: admittedRegistrations(admitted) })
          .pipe(Effect.scoped)
        expect(program._tag).toBe("Program")
        expect(seenAgents).toEqual([pinnedChild.manifest])

        const childRef = { executable: admitted.ref.executable, active: pinnedChild.pin }
        const agent = yield* resolver
          .resolve({
            runId: "run:agents:child",
            ref: childRef,
            manifest: admitted.manifest,
            registrations: admittedRegistrations({ ref: childRef, manifest: admitted.manifest }),
          })
          .pipe(Effect.scoped)
        expect(agent._tag).toBe("Agent")
        if (agent._tag !== "Agent") return
        expect(agent.agent.open((live) => Object.is(live, child))).toBe(true)
        expect(agent.attestation).toEqual({ ref: childRef, manifest: admitted.manifest })
      }),
  )

  it.effect("finalizes every reconstructed resource when the resolver scope closes", () =>
    Effect.gen(function* () {
      const executable = executableFor("code-scope")
      const { reconstruction, released } = fixture()
      const scope = yield* Scope.make()
      const resolver = yield* resolverFor(reconstruction, executable)
      yield* resolver
        .resolve({ runId: "run:scope", ...executable, registrations: admittedRegistrations(executable) })
        .pipe(Scope.provide(scope))
      expect(released).toEqual([])
      yield* Scope.close(scope, Exit.void)
      expect(released).toHaveLength(2)
      expect(released).toContain("sandbox")
    }),
  )

  it.effect("resolves the exact registrations code_mode narrows from the authorizing parent Run", () =>
    Effect.gen(function* () {
      const program = programFor("code-narrowed")
      const root = Agent.make({ name: "dynamic-root" })
      const authority = AgentManifest.fromLiveAgent(root, {
        model: Pins.makeModel({ model: "dynamic-root-v1" }),
        tools: [],
        skills: [],
        services: [],
        policy: { _tag: "Portable", policy: root.policy.snapshot! },
        budget: {},
        children: [],
        programAuthority: {
          sandbox: sandboxPin,
          input: inputPin,
          output: outputPin,
          maxSourceBytes: 1_000,
          tools: [{ name: "echo", pin: toolPin }],
          steps: [{ name: "shape", pin: stepPin }],
          agents: [{ selection: "worker", agent: pinnedChild.pin, input: agentInputPin }],
          budget,
        },
      })
      const parent = ExecutableManifest.make({
        root: authority.pin,
        entries: [
          { _tag: "Agent", ...authority },
          { _tag: "Agent", ...pinnedChild },
        ],
      })
      const admitted = ExecutableManifest.make({
        root: program.pin,
        entries: [
          { _tag: "Program", ...program },
          { _tag: "Agent", ...pinnedChild },
        ],
      })
      const narrowed = yield* ExecutableRegistration.narrow(admitted, registrationsFor(parent))
      const { reconstruction } = fixture()
      const resolver = yield* resolverFor(reconstruction, admitted)

      const resolution = yield* resolver
        .resolve({ runId: "run:narrowed", ...admitted, registrations: narrowed })
        .pipe(Effect.scoped)
      expect(resolution._tag).toBe("Program")
      if (resolution._tag !== "Program") return
      expect(resolution.attestation).toEqual({ ref: admitted.ref, manifest: admitted.manifest })
      expect(narrowed.length).toBeLessThan(registrationsFor(parent).length)
    }),
  )

  it.effect("fails typed instead of throwing when the reference is not owned by the manifest", () =>
    Effect.gen(function* () {
      const executable = executableFor("code-ref")
      const { reconstruction } = fixture()
      const ref = { executable: executable.ref.executable, active: Pins.makeProgram({ unknown: true }) }
      const resolver = yield* resolverFor(reconstruction, executable)
      const failure = yield* Effect.flip(
        resolver
          .resolve({
            runId: "run:ref",
            ref,
            manifest: executable.manifest,
            registrations: admittedRegistrations(executable),
          })
          .pipe(Effect.scoped),
      )
      expect(failure).toMatchObject({ _tag: "generalist/runtime/ExecutablePinMissing", ref })
    }),
  )
})
