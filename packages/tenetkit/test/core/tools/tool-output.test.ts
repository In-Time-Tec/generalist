import { describe, expect, it } from "@effect/vitest"
import { Json } from "../json.js"
import { Cause, Effect, Option, Schema } from "effect"
import { ToolOutput, ToolExecutor } from "../../../src/index"
import { ItLayer } from "../it-layer.js"

const success = (encodedResult: ToolExecutor.Success["result"]): ToolExecutor.Success => ({
  _tag: "Success",
  result: encodedResult,
  encodedResult,
})

describe("ToolOutput", () => {
  it.effect("bounds oversized outputs inline when no store is present", () =>
    Effect.gen(function* () {
      const result = success("x".repeat(100))

      const bounded = yield* ToolOutput.bound(result, { toolCallId: "tool-call-absent", maxBytes: 8 })

      expect(bounded.outputPaths).toEqual([])
      expect(bounded.result).toEqual(bounded.encodedResult)
      expect(bounded.encodedResult).toEqual({
        inline: {
          truncated: true,
          bytes: 102,
          maxBytes: 8,
          digest: "10a9270a01f7334f95712ee341cefe458d56e59e817f4f15f4e3e4834d4b42a9",
          preview: '"xxxxxxx',
        },
        outputPaths: [],
      })
    }),
  )

  ItLayer.make(
    it,
    "bounds oversized outputs inline when the store declines spill",
    () =>
      [
        ToolOutput.layerNoop,
        Effect.gen(function* () {
          const result = success("x".repeat(100))

          const bounded = yield* ToolOutput.bound(result, { toolCallId: "tool-call-noop", maxBytes: 8 })

          expect(bounded.outputPaths).toEqual([])
          expect(bounded.encodedResult).toMatchObject({
            inline: {
              truncated: true,
              bytes: 102,
              maxBytes: 8,
              digest: "10a9270a01f7334f95712ee341cefe458d56e59e817f4f15f4e3e4834d4b42a9",
              preview: '"xxxxxxx',
            },
            outputPaths: [],
          })
        }),
      ] as const,
  )

  ItLayer.make(it, "recovers a typed store failure as bounded inline success", () => [
    ToolOutput.layerTest({
      put: () => Effect.fail(ToolOutput.Error.make({ message: "store unavailable" })),
    }),
    Effect.gen(function* () {
      const bounded = yield* ToolOutput.bound(success("😀".repeat(20)), {
        toolCallId: "tool-call-failing",
        maxBytes: 6,
      })

      expect(bounded.outputPaths).toEqual([])
      expect(bounded.encodedResult).toEqual({
        inline: {
          truncated: true,
          bytes: 82,
          maxBytes: 6,
          digest: "894b8ac90b489dbfead5391ee0fa71b3a903c3051e194fd7ef84df89d6d00d21",
          preview: '"😀',
        },
        outputPaths: [],
      })
    }),
  ])

  ItLayer.make(it, "preserves store interruption", () => [
    ToolOutput.layerTest({ put: () => Effect.interrupt }),
    Effect.gen(function* () {
      const exit = yield* ToolOutput.bound(success("x".repeat(100)), {
        toolCallId: "tool-call-interrupted",
        maxBytes: 8,
      }).pipe(Effect.exit)

      expect(exit._tag).toBe("Failure")
      if (exit._tag === "Failure") expect(Cause.hasInterruptsOnly(exit.cause)).toBe(true)
    }),
  ])

  ItLayer.make(it, "preserves interruption combined with a typed store failure", () => [
    ToolOutput.layerTest({
      put: () =>
        Effect.failCause(
          Cause.combine(Cause.fail(ToolOutput.Error.make({ message: "store unavailable" })), Cause.interrupt()),
        ),
    }),
    Effect.gen(function* () {
      const exit = yield* ToolOutput.bound(success("x".repeat(100)), {
        toolCallId: "tool-call-composite-interrupt",
        maxBytes: 8,
      }).pipe(Effect.exit)

      expect(exit._tag).toBe("Failure")
      if (exit._tag === "Failure") expect(Cause.hasInterruptsOnly(exit.cause)).toBe(true)
    }),
  ])

  it.effect("bounds multibyte previews at very small UTF-8 limits", () =>
    Effect.gen(function* () {
      const bounded = yield* ToolOutput.bound(success("😀"), { toolCallId: "tool-call-small-limit", maxBytes: 2 })
      const empty = yield* ToolOutput.bound(success("😀"), { toolCallId: "tool-call-zero-limit", maxBytes: 0 })
      const fractional = yield* ToolOutput.bound(success("😀"), {
        toolCallId: "tool-call-fractional-limit",
        maxBytes: 2.5,
      })

      expect(bounded.outputPaths).toEqual([])
      expect(bounded.encodedResult).toEqual({
        inline: {
          truncated: true,
          bytes: 6,
          maxBytes: 2,
          digest: "7a0c50b92434b015545fe93ab723db2d4b2cdd14a441405624a9ce8be29f1d5a",
          preview: '"',
        },
        outputPaths: [],
      })
      expect(empty.encodedResult).toEqual({
        inline: {
          truncated: true,
          bytes: 6,
          maxBytes: 0,
          digest: "7a0c50b92434b015545fe93ab723db2d4b2cdd14a441405624a9ce8be29f1d5a",
          preview: "",
        },
        outputPaths: [],
      })
      expect(fractional.encodedResult).toEqual({
        inline: {
          truncated: true,
          bytes: 6,
          maxBytes: 2.5,
          digest: "7a0c50b92434b015545fe93ab723db2d4b2cdd14a441405624a9ce8be29f1d5a",
          preview: '"',
        },
        outputPaths: [],
      })
    }),
  )

  ItLayer.make(it, "leaves outputs unchanged when encoded size is within the max", () => {
    let stores = 0
    return [
      ToolOutput.layerTest({
        put: () => {
          stores += 1
          return Effect.succeed(Option.some("mem:unexpected"))
        },
      }),
      Effect.gen(function* () {
        const result = success({ ok: true })

        const bounded = yield* ToolOutput.bound(result, { toolCallId: "tool-call-small", maxBytes: 1_000 })

        expect(bounded).toEqual({ ...result, outputPaths: [] })
        expect(bounded.result).toBe(result.result)
        expect(bounded.encodedResult).toBe(result.encodedResult)
        expect(stores).toBe(0)
      }),
    ] as const
  })

  ItLayer.make(it, "stores oversized outputs and returns a bounded inline Output value", () => {
    let stores = 0
    let stored: unknown
    return [
      ToolOutput.layerTest({
        put: (_toolCallId, content) => {
          stores += 1
          stored = content
          return Effect.succeed(Option.some("mem:tool-call-large"))
        },
      }),
      Effect.gen(function* () {
        const full = "abcdef".repeat(20)

        const bounded = yield* ToolOutput.bound(success(full), { toolCallId: "tool-call-large", maxBytes: 12 })
        const rebound = yield* ToolOutput.bound(bounded, { toolCallId: "tool-call-large", maxBytes: 12 })

        expect(stores).toBe(1)
        expect(stored).toEqual({ result: full, encodedResult: full })
        expect(bounded.outputPaths).toEqual(["mem:tool-call-large"])
        expect(rebound.outputPaths).toEqual(bounded.outputPaths)
        expect(rebound.encodedResult).toEqual(bounded.encodedResult)
        expect(bounded.result).toEqual(bounded.encodedResult)
        const encoded = yield* Schema.decodeUnknownEffect(
          Schema.Struct({
            inline: Schema.Struct({
              truncated: Schema.Boolean,
              bytes: Schema.Finite,
              maxBytes: Schema.Finite,
              digest: Schema.String,
              preview: Schema.String,
            }),
            outputPaths: Schema.Array(Schema.String),
          }),
        )(bounded.encodedResult)
        expect(encoded.inline.truncated).toBe(true)
        expect(encoded.inline.maxBytes).toBe(12)
        expect(encoded.inline.digest).toBe("c9079fae035831639214ac3d4700622ed3b69714baa15d4952d945c676ef8579")
        expect(encoded.outputPaths).toEqual(["mem:tool-call-large"])
        expect(Json.stringify(bounded.encodedResult)).not.toContain(full)
      }),
    ] as const
  })

  ItLayer.make(it, "tightens existing Output values without storing or changing their paths", () => {
    let stores = 0
    return [
      ToolOutput.layerTest({
        put: () => {
          stores += 1
          return Effect.succeed(Option.some("mem:unexpected"))
        },
      }),
      Effect.gen(function* () {
        const value: ToolOutput.Output = {
          inline: { truncated: true, bytes: 100, maxBytes: 8, digest: "a".repeat(64), preview: '"xxxxxxx' },
          outputPaths: ["mem:original", "s3:original"],
        }

        const bounded = yield* ToolOutput.bound(success(value), { toolCallId: "tool-call-repeat", maxBytes: 1 })

        expect(stores).toBe(0)
        expect(bounded.outputPaths).toEqual(["mem:original", "s3:original"])
        expect(bounded.result).toEqual(bounded.encodedResult)
        expect(bounded.encodedResult).toEqual({
          inline: { truncated: true, bytes: 100, maxBytes: 1, digest: "a".repeat(64), preview: '"' },
          outputPaths: ["mem:original", "s3:original"],
        })
      }),
    ] as const
  })

  ItLayer.make(it, "does not mistake domain values for canonical Output values", () => {
    let stores = 0
    return [
      ToolOutput.layerTest({
        put: () => {
          stores += 1
          return Effect.succeed(Option.some("mem:actual-value"))
        },
      }),
      Effect.gen(function* () {
        const value = { inline: "x".repeat(100), outputPaths: ["domain:path"] }

        const bounded = yield* ToolOutput.bound(success(value), { toolCallId: "tool-call-domain-value", maxBytes: 8 })

        expect(stores).toBe(1)
        expect(bounded.outputPaths).toEqual(["mem:actual-value"])
      }),
    ] as const
  })

  ItLayer.make(it, "recognizes canonical Output values with omitted optional paths", () => {
    let stores = 0
    return [
      ToolOutput.layerTest({
        put: () => {
          stores += 1
          return Effect.succeed(Option.some("mem:unexpected"))
        },
      }),
      Effect.gen(function* () {
        const value: ToolOutput.Output = {
          inline: { truncated: true, bytes: 100, maxBytes: 8, digest: "a".repeat(64), preview: '"xxxxxxx' },
        }

        const bounded = yield* ToolOutput.bound(success(value), { toolCallId: "tool-call-no-paths", maxBytes: 8 })

        expect(stores).toBe(0)
        expect(bounded.outputPaths).toEqual([])
        expect(bounded.encodedResult).toEqual({ ...value, outputPaths: [] })
      }),
    ] as const
  })
})
