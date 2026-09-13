import { expect, layer } from "@effect/vitest"
import { Effect, Schema } from "effect"
import { RuntimeInspectionResponse } from "../../../../src/runtime/execution/inspection/response.js"
import { Runtime } from "../../../../src/runtime/engine.js"
import { clientProjection } from "../../../../src/server/projection/index.js"
import { assistantAddress, objectLayer } from "../fixtures.js"

layer(objectLayer)("custom-host inspection", (it) => {
  it.effect("keeps diagnostics readable without inventing a public executable revision", () =>
    Effect.gen(function* () {
      const runtime = yield* Runtime
      const receipt = yield* runtime.send({
        to: assistantAddress,
        sessionId: "session:custom-host-inspection",
        idempotencyKey: "custom-host-inspection",
        prompt: "Inspect without executing",
      })
      const inspection = yield* runtime.inspect(receipt.runId)
      expect(inspection.runId).toBe(receipt.runId)
      expect(inspection).not.toHaveProperty("revision")
      const encoded = yield* Schema.encodeEffect(RuntimeInspectionResponse)(inspection)
      expect(encoded).not.toHaveProperty("revision")
      const decoded = yield* Schema.decodeEffect(RuntimeInspectionResponse)(encoded)
      expect(decoded.runId).toBe(receipt.runId)
      expect(decoded).not.toHaveProperty("revision")
      expect(() =>
        clientProjection.projectClientRun(decoded, {
          sessionId: "session:custom-host-inspection",
          rootRunId: receipt.runId,
        }),
      ).toThrow("Executable has no public Agent identity")
    }),
  )
})
