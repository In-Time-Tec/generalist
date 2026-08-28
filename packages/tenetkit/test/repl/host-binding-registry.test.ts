import "./suites/host-binding-context-suite.js"
import "./suites/bun-host-binding-no-argument-suite.js"
import "./suites/bun-host-binding-identity-suite.js"
import "./suites/bun-host-binding-failure-detail-suite.js"
import { describe, expect, it, layer } from "@effect/vitest"
import { Effect, Schema } from "effect"
import { HostBindingRegistry } from "../../src/repl/index"

const ReadInput = Schema.Struct({ path: Schema.String })
const ReadOutput = Schema.Struct({ text: Schema.String })
const ReadFailure = Schema.TaggedStruct("NotFound", { reason: Schema.String })

const read: HostBindingRegistry.AnyOperation = {
  name: "read",
  input: ReadInput,
  output: ReadOutput,
  failure: ReadFailure,
  handle: (input) =>
    Schema.decodeUnknownEffect(ReadInput)(input).pipe(
      Effect.orDie,
      Effect.flatMap((decoded) =>
        decoded.path === "/missing"
          ? Effect.fail({ _tag: "NotFound" as const, reason: "missing" })
          : Effect.succeed({ text: `contents of ${decoded.path}` }),
      ),
    ),
}

const broken: HostBindingRegistry.AnyOperation = {
  name: "broken",
  input: ReadInput,
  output: ReadOutput,
  failure: ReadFailure,
  handle: () => Effect.succeed({ text: 42 }),
}

const workspace: HostBindingRegistry.Module = {
  name: "workspace",
  operations: [read, broken],
}

describe("HostBindingRegistry", () => {
  it.effect("describes the mounted surface without exposing handlers", () =>
    Effect.gen(function* () {
      const registry = yield* HostBindingRegistry.make([workspace])
      expect(registry.descriptors).toEqual([{ module: "workspace", operations: ["read", "broken"] }])
    }),
  )

  it.effect("resolves a mounted operation", () =>
    Effect.gen(function* () {
      const registry = yield* HostBindingRegistry.make([workspace])
      const operation = yield* registry.resolve({ module: "workspace", operation: "read", input: {} })
      expect(operation.name).toBe("read")
    }),
  )

  it.effect("invokes a mounted operation and encodes its output", () =>
    Effect.gen(function* () {
      const registry = yield* HostBindingRegistry.make([workspace])
      const response = yield* registry.invoke({
        module: "workspace",
        operation: "read",
        input: { path: "/a" },
      })
      expect(response).toEqual({ _tag: "Success", output: { text: "contents of /a" } })
    }),
  )

  it.effect("encodes a declared domain failure instead of failing the boundary", () =>
    Effect.gen(function* () {
      const registry = yield* HostBindingRegistry.make([workspace])
      const response = yield* registry.invoke({
        module: "workspace",
        operation: "read",
        input: { path: "/missing" },
      })
      expect(response).toEqual({ _tag: "Failure", failure: { _tag: "NotFound", reason: "missing" } })
    }),
  )

  it.effect("rejects an unmounted module", () =>
    Effect.gen(function* () {
      const registry = yield* HostBindingRegistry.make([workspace])
      const failure = yield* Effect.flip(registry.invoke({ module: "web", operation: "search", input: {} }))
      expect(Schema.is(HostBindingRegistry.HostBindingNotFound)(failure)).toBe(true)
      if (Schema.is(HostBindingRegistry.HostBindingNotFound)(failure)) {
        expect(failure.module).toBe("web")
        expect(failure.operation).toBeUndefined()
      }
    }),
  )

  it.effect("rejects an unmounted operation and names it", () =>
    Effect.gen(function* () {
      const registry = yield* HostBindingRegistry.make([workspace])
      const failure = yield* Effect.flip(registry.invoke({ module: "workspace", operation: "delete", input: {} }))
      expect(Schema.is(HostBindingRegistry.HostBindingNotFound)(failure)).toBe(true)
      if (Schema.is(HostBindingRegistry.HostBindingNotFound)(failure)) expect(failure.operation).toBe("delete")
    }),
  )

  it.effect("rejects a request that does not match the declared input schema", () =>
    Effect.gen(function* () {
      const registry = yield* HostBindingRegistry.make([workspace])
      const failure = yield* Effect.flip(
        registry.invoke({ module: "workspace", operation: "read", input: { path: 7 } }),
      )
      expect(Schema.is(HostBindingRegistry.HostBindingSchemaFailure)(failure)).toBe(true)
      if (Schema.is(HostBindingRegistry.HostBindingSchemaFailure)(failure)) expect(failure.stage).toBe("decode-input")
    }),
  )

  it.effect("rejects a handler reply that does not match the declared output schema", () =>
    Effect.gen(function* () {
      const registry = yield* HostBindingRegistry.make([workspace])
      const failure = yield* Effect.flip(
        registry.invoke({ module: "workspace", operation: "broken", input: { path: "/a" } }),
      )
      expect(Schema.is(HostBindingRegistry.HostBindingSchemaFailure)(failure)).toBe(true)
      if (Schema.is(HostBindingRegistry.HostBindingSchemaFailure)(failure)) expect(failure.stage).toBe("encode-output")
    }),
  )

  it.effect("rejects two modules claiming the same name", () =>
    Effect.gen(function* () {
      const failure = yield* Effect.flip(HostBindingRegistry.make([workspace, workspace]))
      expect(Schema.is(HostBindingRegistry.HostBindingConflict)(failure)).toBe(true)
      if (Schema.is(HostBindingRegistry.HostBindingConflict)(failure)) expect(failure.module).toBe("workspace")
    }),
  )

  it.effect("rejects two operations claiming the same name", () =>
    Effect.gen(function* () {
      const duplicate: HostBindingRegistry.Module<never> = {
        name: "workspace",
        operations: [read, read],
      }
      const failure = yield* Effect.flip(HostBindingRegistry.make([duplicate]))
      expect(Schema.is(HostBindingRegistry.HostBindingConflict)(failure)).toBe(true)
      if (Schema.is(HostBindingRegistry.HostBindingConflict)(failure)) expect(failure.operation).toBe("read")
    }),
  )

  it.effect("mounts several modules side by side", () =>
    Effect.gen(function* () {
      const registry = yield* HostBindingRegistry.make([
        workspace,
        { name: "web", operations: [{ ...read, name: "search" }] },
      ])
      expect(registry.descriptors.map((descriptor) => descriptor.module)).toEqual(["workspace", "web"])
      const response = yield* registry.invoke({ module: "web", operation: "search", input: { path: "/b" } })
      expect(response._tag).toBe("Success")
    }),
  )
})

layer(HostBindingRegistry.layer([workspace]))("mounted HostBindingRegistry", (mounted) => {
  mounted.effect("provides the registry through its layer", () =>
    Effect.gen(function* () {
      const registry = yield* HostBindingRegistry.HostBindingRegistry
      const response = yield* registry.invoke({ module: "workspace", operation: "read", input: { path: "/a" } })
      expect(response._tag).toBe("Success")
    }),
  )
})
