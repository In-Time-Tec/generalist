import { expect, layer } from "@effect/vitest"
import { Effect } from "effect"
import { Snapshot } from "../../src/transport/index.js"
import { runtimeLayer } from "./fixtures.js"

layer(runtimeLayer())("Snapshot", (it) => {
  it.effect("returns inspection state and a recovery cursor without a synthetic event", () =>
    Snapshot.get("run-1").pipe(
      Effect.map((snapshot) => {
        expect(snapshot.cursor).toBe(2)
        expect(snapshot.run.runId).toBe("run-1")
        expect(snapshot).not.toHaveProperty("_tag")
        expect(snapshot).not.toHaveProperty("sequence")
      }),
    ),
  )
})
