import { describe, expect, it } from "@effect/vitest"
import { Effect } from "effect"
import { Snapshot } from "../src/index.js"
import { runtimeLayer } from "./helpers.js"

describe("Snapshot", () => {
  it.effect("returns inspection state and a recovery cursor without a synthetic event", () =>
    Snapshot.get("run-1").pipe(
      Effect.provide(runtimeLayer()),
      Effect.map((snapshot) => {
        expect(snapshot.cursor).toBe(2)
        expect(snapshot.run.runId).toBe("run-1")
        expect(snapshot).not.toHaveProperty("_tag")
        expect(snapshot).not.toHaveProperty("sequence")
      }),
    ),
  )
})
