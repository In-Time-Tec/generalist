import { describe, expect, it } from "@effect/vitest"
import { Effect, Schema } from "effect"
import { Tool } from "effect/unstable/ai"
import { makeCapability } from "../../../../src/core/durable/pin.js"
import { ToolManifest } from "../../../../src/index.js"
import {
  decode as decodeExecutable,
  encode as encodeExecutable,
  make as makeExecutable,
} from "../../../../src/core/durable/manifest/executable-manifest.js"
import {
  requiredPins,
  requiredPinsForActiveExecutable,
  validate as validateRegistrations,
} from "../../../../src/runtime/executable/registration.js"
import { type StaticToolExecutable, makeDynamic, makeStatic } from "../../../../src/runtime/executable/resolver.js"

const manifest = {
  name: "checks",
  tool: makeCapability({ tool: "checks" }),
  input: makeCapability({ codec: "input" }),
  output: makeCapability({ codec: "output" }),
  failure: makeCapability({ codec: "failure" }),
  replay: "never" as const,
  policy: makeCapability({ policy: "checks" }),
}

const fixture = () => {
  const pinned = ToolManifest.make(manifest)
  const executable = makeExecutable({ root: pinned.pin, entries: [{ _tag: "Tool", ...pinned }] })
  return { pinned, executable }
}

describe("Tool executable manifests", () => {
  it.effect("round trips a Tool closure and retains its required capability registrations", () =>
    Effect.gen(function* () {
      const { executable } = fixture()
      const encoded = yield* encodeExecutable(executable, {})
      expect(yield* decodeExecutable(encoded)).toEqual(executable)
      const expected = new Set([manifest.tool, manifest.input, manifest.output, manifest.failure, manifest.policy])
      expect(requiredPins(executable)).toEqual(expected)
      expect(requiredPinsForActiveExecutable(executable)).toEqual(expected)
      const missing = yield* validateRegistrations(executable, []).pipe(Effect.flip)
      expect(missing._tag).toBe("generalist/runtime/ExecutableRegistrationMissing")
    }),
  )

  it("pins all boundary and replay identities and rejects changed manifests", () => {
    const { pinned, executable } = fixture()
    for (const changed of [
      { ...manifest, replay: "provider-idempotent" as const },
      { ...manifest, failure: makeCapability({ codec: "changed" }) },
      { ...manifest, policy: makeCapability({ policy: "changed" }) },
    ]) {
      expect(ToolManifest.make(changed).pin).not.toBe(pinned.pin)
      expect(() =>
        makeExecutable({
          root: pinned.pin,
          entries: [{ _tag: "Tool", pin: pinned.pin, manifest: ToolManifest.make(changed).manifest }],
        }),
      ).toThrow(/digest mismatch/)
    }
    expect(() =>
      Schema.decodeUnknownSync(ToolManifest.ToolManifest)({ ...manifest, version: "1", replay: "idempotent" }),
    ).toThrow()
    expect(executable.manifest.entries[0]?._tag).toBe("Tool")
  })

  it.effect("resolves the same static Tool from a fresh resolver and rejects a mismatched live name", () =>
    Effect.gen(function* () {
      const { pinned, executable } = fixture()
      const registration: StaticToolExecutable = {
        _tag: "Tool",
        pinned,
        executable,
        tool: Tool.make("checks", { parameters: Schema.Struct({}), success: Schema.Unknown }),
        input: Schema.Unknown,
        output: Schema.Unknown,
        failure: Schema.Unknown,
        executor: { execute: () => Effect.die("not invoked during resolution") },
        authorizer: () => ({ authorize: () => Effect.succeed({ _tag: "Execute" }) }),
      }
      for (let host = 0; host < 2; host++) {
        const resolver = yield* makeStatic([registration])
        const resolved = yield* resolver
          .resolve({ runId: "tool-run", ...executable, registrations: [] })
          .pipe(Effect.scoped)
        expect(resolved._tag).toBe("Tool")
        if (resolved._tag !== "Tool") return
        expect(resolved.pinned).toEqual(pinned)
        expect(resolved.executor).toBe(registration.executor)
        expect(resolved.attestation).toEqual(executable)
      }
      const error = yield* makeStatic([{ ...registration, tool: Tool.make("other", {}) }]).pipe(Effect.flip)
      expect(error.message).toMatch(/does not match/)
    }),
  )

  it.effect("reconstructs Tool resources only after validating persisted registrations", () =>
    Effect.gen(function* () {
      const { pinned, executable } = fixture()
      const registrations = [...requiredPins(executable)].map((pin) => ({
        pin,
        codec: "tool-test",
        version: "1",
        payload: { revision: "1" },
      }))
      let reconstructed = 0
      const unused = () => Effect.die("Program reconstruction must not handle a Tool")
      const resolver = yield* makeDynamic({
        agents: [],
        program: { executor: unused, codec: unused, tool: unused, step: unused, agent: unused },
        tool: (request) => {
          reconstructed++
          expect(request.pinned).toEqual(pinned)
          expect(request.registrations).toHaveLength(5)
          return Effect.succeed({
            tool: Tool.make("checks", {}),
            input: Schema.Unknown,
            output: Schema.Unknown,
            failure: Schema.Unknown,
            executor: { execute: unused },
            authorizer: () => ({ authorize: () => Effect.succeed({ _tag: "Execute" as const }) }),
          })
        },
      })
      const missing = yield* resolver
        .resolve({ runId: "tool-run", ...executable, registrations: [] })
        .pipe(Effect.flip, Effect.scoped)
      expect(missing._tag).toBe("generalist/runtime/ExecutableRegistrationMissing")
      expect(reconstructed).toBe(0)
      const resolved = yield* resolver.resolve({ runId: "tool-run", ...executable, registrations }).pipe(Effect.scoped)
      expect(resolved._tag).toBe("Tool")
      expect(reconstructed).toBe(1)
    }),
  )
})
