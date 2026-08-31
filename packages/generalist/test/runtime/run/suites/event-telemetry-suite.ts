import { expect, it } from "@effect/vitest"
import { ModelTelemetry } from "../../../../src/index.js"
import { Effect, Schema } from "effect"
import { RunEvent } from "../../../../src/runtime/index.js"

const specVersion: (typeof RunEvent.RunEvent.Encoded)["specVersion"] = "1"

const base = {
  specVersion,
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

const fallbackScheduled: typeof RunEvent.RunEvent.Encoded = {
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
    const telemetry = yield* Schema.decodeEffect(ModelTelemetry.Event)(fallbackScheduled)
    expect(telemetry._tag).toBe("ModelFallbackScheduled")
    const decoded = yield* Schema.decodeEffect(RunEvent.RunEvent)(fallbackScheduled)
    expect(decoded._tag).toBe("ModelFallbackScheduled")
  }),
)
