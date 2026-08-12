import { expect, it } from "@effect/vitest"
import { ModelTelemetry } from "@batonfx/core"
import { Effect, Schema } from "effect"
import { RunEvent } from "../src/index.js"

const telemetryTags = (
  ModelTelemetry.Event.ast as unknown as {
    readonly types: ReadonlyArray<{
      readonly propertySignatures: ReadonlyArray<{
        readonly name: string
        readonly type: { readonly literal?: string }
      }>
    }>
  }
).types.flatMap((member) => member.propertySignatures.find(({ name }) => name === "_tag")?.type.literal ?? [])

const base = {
  specVersion: "1",
  eventId: "run:1",
  runId: "run",
  sequence: 1,
  executableRef: {
    executable: `executable-pin:v1:sha256:${"a".repeat(64)}`,
    active: `agent-pin:v1:sha256:${"b".repeat(64)}`,
  },
  rootRunId: "run",
  depth: 0,
  occurredAt: "2026-01-01T00:00:00.000Z",
}

const fallbackScheduled = {
  ...base,
  _tag: "ModelFallbackScheduled",
  deliveryId: "delivery",
  turn: 0,
  modelCallId: "call",
  attempt: 0,
  fromCandidate: 0,
  fromProvider: "anthropic",
  fromModel: "primary",
  fromRegistrationKey: "primary-key",
  toCandidate: 1,
  toProvider: "anthropic",
  toModel: "fallback",
  toRegistrationKey: "fallback-key",
  category: "rate-limit",
  at: 1,
}

it.effect("persists the model fallback the agent loop emits when a candidate is exhausted", () =>
  Effect.gen(function* () {
    expect(telemetryTags).toContain("ModelFallbackScheduled")
    const decoded = yield* Schema.decodeUnknownEffect(RunEvent.RunEvent)(fallbackScheduled)
    expect(decoded._tag).toBe("ModelFallbackScheduled")
  }),
)
