import { describe, expect, it } from "@effect/vitest"
import { Json } from "./json"
import { Effect, Option } from "effect"
import { ToolOutput, ToolExecutor } from "../src/index"
import { ItLayer } from "./it-layer"

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

  ItLayer.make(
    it,
    "leaves outputs unchanged when the no-op store declines spill",
    () =>
      [
        ToolOutput.layerNoop,
        Effect.gen(function* () {
          const result = success("x".repeat(100))

          const bounded = yield* ToolOutput.bound(result, { toolCallId: "tool-call-noop", maxBytes: 8 })

          expect(bounded).toBe(result)
        }),
      ] as const,
  )

  ItLayer.make(it, "leaves outputs unchanged when encoded size is within the max", () => {
    let stores = 0
    return [
      ToolOutput.testLayer({
        put: () => {
          stores += 1
          return Effect.succeed(Option.some("mem:unexpected"))
        },
      }),
      Effect.gen(function* () {
        const result = success({ ok: true })

        const bounded = yield* ToolOutput.bound(result, { toolCallId: "tool-call-small", maxBytes: 1_000 })

        expect(bounded).toBe(result)
        expect(stores).toBe(0)
      }),
    ] as const
  })

  ItLayer.make(it, "stores oversized outputs and returns a bounded inline envelope", () => {
    let stored: unknown
    return [
      ToolOutput.testLayer({
        put: (_toolCallId, content) => {
          stored = content
          return Effect.succeed(Option.some("mem:tool-call-large"))
        },
      }),
      Effect.gen(function* () {
        const full = "abcdef".repeat(20)

        const bounded = yield* ToolOutput.bound(success(full), { toolCallId: "tool-call-large", maxBytes: 12 })

        expect(stored).toEqual({ result: full, encodedResult: full })
        expect(bounded.result).toEqual(bounded.encodedResult)
        expect(bounded.encodedResult).toMatchObject({
          inline: { truncated: true, bytes: expect.any(Number), maxBytes: 12, preview: expect.any(String) },
          outputPaths: ["mem:tool-call-large"],
        })
        expect(Json.stringify(bounded.encodedResult)).not.toContain(full)
      }),
    ] as const
  })
})
