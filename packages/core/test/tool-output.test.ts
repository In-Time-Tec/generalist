import { describe, expect, it } from "@effect/vitest"
import { Effect, Option } from "effect"
import { ToolOutput, ToolExecutor } from "../src/index"

const success = (encodedResult: unknown): ToolExecutor.Success => ({
  _tag: "Success",
  result: encodedResult,
  encodedResult,
})

describe("ToolOutput", () => {
  it.effect("leaves outputs unchanged when no store is present", () =>
    Effect.gen(function* () {
      const result = success("x".repeat(100))

      const bounded = yield* ToolOutput.bound(result, { toolCallId: "tool-call-absent", maxBytes: 8 })

      expect(bounded).toBe(result)
    }),
  )

  it.effect("leaves outputs unchanged when the no-op store declines spill", () =>
    Effect.gen(function* () {
      const result = success("x".repeat(100))

      const bounded = yield* ToolOutput.bound(result, { toolCallId: "tool-call-noop", maxBytes: 8 })

      expect(bounded).toBe(result)
    }).pipe(Effect.provide(ToolOutput.layerNoop)),
  )

  it.effect("leaves outputs unchanged when encoded size is within the max", () => {
    let stores = 0
    return Effect.gen(function* () {
      const result = success({ ok: true })

      const bounded = yield* ToolOutput.bound(result, { toolCallId: "tool-call-small", maxBytes: 1_000 })

      expect(bounded).toBe(result)
      expect(stores).toBe(0)
    }).pipe(
      Effect.provide(
        ToolOutput.testLayer({
          put: () => {
            stores += 1
            return Effect.succeed(Option.some("mem:unexpected"))
          },
        }),
      ),
    )
  })

  it.effect("stores oversized outputs and returns a bounded inline envelope", () => {
    let stored: unknown
    return Effect.gen(function* () {
      const full = "abcdef".repeat(20)

      const bounded = yield* ToolOutput.bound(success(full), { toolCallId: "tool-call-large", maxBytes: 12 })

      expect(stored).toEqual({ result: full, encodedResult: full })
      expect(bounded.result).toEqual(bounded.encodedResult)
      expect(bounded.encodedResult).toMatchObject({
        inline: { truncated: true, bytes: expect.any(Number), maxBytes: 12, preview: expect.any(String) },
        outputPaths: ["mem:tool-call-large"],
      })
      expect(JSON.stringify(bounded.encodedResult)).not.toContain(full)
    }).pipe(
      Effect.provide(
        ToolOutput.testLayer({
          put: (_toolCallId, content) => {
            stored = content
            return Effect.succeed(Option.some("mem:tool-call-large"))
          },
        }),
      ),
    )
  })
})
