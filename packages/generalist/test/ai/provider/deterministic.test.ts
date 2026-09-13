import { describe, expect, layer as testLayer } from "@effect/vitest"
import { Effect, Layer, Schema } from "effect"
import { Tool, Toolkit } from "effect/unstable/ai"
import { Agent, Approvals, ModelMiddleware, ModelRegistry, ToolExecutor } from "generalist"
import { layer as deterministicLayer } from "../../../src/ai/provider/deterministic.js"
import { allowAllAuthorization } from "../../authorization.js"

const unexpectedTool = Tool.make("unexpected", { parameters: Schema.Unknown, success: Schema.Unknown })
const unexpectedToolkit = Toolkit.make(unexpectedTool)
const unexpectedToolLayer = unexpectedToolkit.toLayer({
  unexpected: () => Effect.die("unexpected tool call"),
})

describe("deterministic provider", () => {
  testLayer(
    Layer.mergeAll(
      allowAllAuthorization,
      deterministicLayer({ model: "local", response: "scripted response" }),
      ToolExecutor.layerTest({ execute: () => Effect.die("unexpected tool call") }),
      Approvals.layerAutoApprove,
      ModelMiddleware.layerIdentity,
      unexpectedToolLayer,
    ),
  )((test) => {
    test.effect("round-trips scripted output through Agent.run", () => {
      const agent = Agent.make({ name: "deterministic-agent", toolkit: unexpectedToolkit })
      return Effect.gen(function* () {
        const result = yield* ModelRegistry.withModel(
          { provider: "deterministic", model: "local" },
          Agent.run("hello")(agent),
        )

        expect(result).toBe("scripted response")
      })
    })
  })

  testLayer(
    ModelRegistry.layerMerged([
      deterministicLayer({ provider: "det-a", model: "model-a", metadata: { contextWindow: 1_024 } }),
      deterministicLayer({ provider: "det-b", model: "model-b", registrationKey: "secondary" }),
    ]),
  )((test) => {
    test.effect("composes registrations without dropping metadata or keys", () =>
      Effect.gen(function* () {
        const registrations = yield* ModelRegistry.registrations()
        expect(
          registrations.map(({ provider, model, registrationKey, metadata }) => ({
            provider,
            model,
            registrationKey,
            metadata,
          })),
        ).toEqual([
          { provider: "det-a", model: "model-a", registrationKey: undefined, metadata: { contextWindow: 1_024 } },
          { provider: "det-b", model: "model-b", registrationKey: "secondary", metadata: undefined },
        ])
      }),
    )
  })
})
