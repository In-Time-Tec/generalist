import { describe, expect, it } from "@effect/vitest"
import { Effect, Schema } from "effect"
import { Cursor } from "generalist/runtime"
import { Server } from "generalist/server"
import { hostEvent } from "./fixtures.js"

describe("Server event wire contract", () => {
  it.effect("round-trips the same HostEvent used by SSE and WebSocket", () =>
    Effect.gen(function* () {
      const event = hostEvent(4)
      expect(yield* Server.eventCodec.decode(yield* Server.eventCodec.encode(event))).toEqual(event)
    }),
  )

  it("rejects a wrapper whose Runtime event belongs to another Host event category", () => {
    const event = hostEvent(4)
    const invalid = { ...event, _tag: "Completed" }
    expect(Schema.decodeUnknownOption(Server.HostEvent)(invalid)._tag).toBe("None")
  })

  it("decodes origin and applied cursors", () => {
    expect(Schema.decodeSync(Server.CursorFromString)("-1")).toBe(Cursor.origin)
    expect(Schema.decodeSync(Server.CursorFromString)("7")).toBe(7)
  })

  it.effect("encodes explicit cancellation commands", () =>
    Effect.gen(function* () {
      const command = Server.ClientCommand.make({ _tag: "Cancel", runId: "run-1", reason: "user" })
      const decoded = yield* Schema.decodeEffect(Schema.fromJsonString(Server.ClientCommand))(
        yield* Schema.encodeEffect(Schema.fromJsonString(Server.ClientCommand))(command),
      )
      expect(decoded).toEqual(command)
    }),
  )
})
