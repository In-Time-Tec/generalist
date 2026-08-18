import { expect, it } from "@effect/vitest"
import { Effect } from "effect"
import { NestedOperation } from "../../src/core/index.js"

/**
 * A projection decorates a nested operation that has already committed. A render the schema refuses
 * — a zero width, a fractional byte size — must therefore cost the projection and nothing else: the
 * operation succeeded, and killing the run over its decoration would lose work already journalled.
 */
it.effect("drops a projection the schema refuses rather than failing the operation", () =>
  Effect.gen(function* () {
    const data = yield* NestedOperation.progressData({
      kind: "attach",
      ordinal: 0,
      status: "succeeded",
      render: { _tag: "Artifact", path: "/w/a.png", mimeType: "image/png", byteSize: 4096, width: 0 } as never,
    })
    expect(data[NestedOperation.progressKey]).toEqual({ kind: "attach", ordinal: 0, status: "succeeded" })
  }),
)

it.effect("keeps a projection the schema accepts", () =>
  Effect.gen(function* () {
    const data = yield* NestedOperation.progressData({
      kind: "replace",
      ordinal: 1,
      status: "succeeded",
      render: { _tag: "Diff", path: "/w/a.ts", patch: "@@" },
    })
    expect(data[NestedOperation.progressKey]).toMatchObject({
      render: { _tag: "Diff", path: "/w/a.ts", patch: "@@" },
    })
  }),
)
