import { expect, it } from "@effect/vitest"
import { Effect, Layer, Schema } from "effect"
import { Tool, Toolkit } from "effect/unstable/ai"
import { layerAllowAll } from "../../../src/core/policy/permissions.js"
import { layerAutoApprove } from "../../../src/core/policy/approvals.js"
import { capture } from "../../../src/runtime/executable/registered-tool.js"
import { ToolIdentity } from "../../../src/runtime/executable/tool-identity.js"
import { make as makeRegistry, resolve as resolveRegistered } from "../../../src/runtime/executable/registered-agent.js"
import { makeStatic } from "../../../src/runtime/executable/resolver.js"
import { provideScoped } from "../execution/scoped-provide.js"

const definition = (needsApproval: boolean) =>
  Tool.make("checks", {
    parameters: Schema.Struct({}),
    success: Schema.String,
    needsApproval,
  })
const identity = { implementation: "checks-v1", policy: "checks-policy-v1" }
const register = (tool: ReturnType<typeof definition>) =>
  provideScoped(
    Layer.mergeAll(
      Toolkit.make(tool).toLayer({ checks: () => Effect.succeed("checked") }),
      layerAllowAll,
      layerAutoApprove,
    ),
    capture(tool),
  )

it.effect("rejects a host Tool without an explicit implementation and policy identity", () =>
  Effect.gen(function* () {
    const error = yield* register(definition(false)).pipe(Effect.flip)
    expect(error._tag).toBe("generalist/runtime/ExecutableRegistrationInvalid")
    expect(error.message).toMatch(/ToolIdentity/)
  }),
)

it.effect("pins Boolean approval behavior and explicit implementation and policy revisions", () =>
  Effect.gen(function* () {
    const original = yield* register(definition(false).annotate(ToolIdentity, identity))
    const approval = yield* register(definition(true).annotate(ToolIdentity, identity))
    const implementation = yield* register(
      definition(false).annotate(ToolIdentity, { ...identity, implementation: "checks-v2" }),
    )
    const policy = yield* register(
      definition(false).annotate(ToolIdentity, { ...identity, policy: "checks-policy-v2" }),
    )
    expect(
      original.registrations.every((registration) =>
        Schema.is(Schema.Struct({ pin: Schema.String, revision: Schema.Literal("1") }))(registration.payload),
      ),
    ).toBe(true)
    expect(approval.resolution.pinned.pin).not.toBe(original.resolution.pinned.pin)
    expect(approval.resolution.pinned.manifest.policy).not.toBe(original.resolution.pinned.manifest.policy)
    expect(implementation.resolution.pinned.pin).not.toBe(original.resolution.pinned.pin)
    expect(implementation.resolution.pinned.manifest.tool).not.toBe(original.resolution.pinned.manifest.tool)
    expect(policy.resolution.pinned.pin).not.toBe(original.resolution.pinned.pin)
    expect(policy.resolution.pinned.manifest.policy).not.toBe(original.resolution.pinned.manifest.policy)
  }),
)

it.effect("reconstructs the exact identity on a fresh host through static fallback", () =>
  Effect.gen(function* () {
    const original = yield* register(definition(true).annotate(ToolIdentity, identity))
    const reconstructed = yield* register(definition(true).annotate(ToolIdentity, identity))
    expect(reconstructed.resolution.attestation).toEqual(original.resolution.attestation)
    expect(reconstructed.registrations).toEqual(original.registrations)
    const fallback = yield* makeStatic([
      { ...reconstructed.resolution, executable: reconstructed.resolution.attestation },
    ])
    const resolved = yield* resolveRegistered(makeRegistry(), fallback, {
      runId: "retained-tool",
      ...original.resolution.attestation,
      registrations: original.registrations,
    }).pipe(Effect.scoped)
    expect(resolved._tag).toBe("Tool")
    expect(resolved.attestation).toEqual(original.resolution.attestation)
    if (resolved._tag === "Tool") expect(resolved.executor).toBe(reconstructed.resolution.executor)
  }),
)
