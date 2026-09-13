import { describe, expect, it } from "@effect/vitest"
import { Effect, Schema } from "effect"
import { Cursor } from "generalist/runtime"
import { Server } from "generalist/server"
import { CursorFromString, decodeCommand, encodeCommand } from "../../src/server/wire.js"

describe("Server event wire contract", () => {
  it.effect("round-trips an allowlisted committed event used by SSE and WebSocket", () =>
    Effect.gen(function* () {
      const event = Server.ClientEvent.make({
        _tag: "RunChanged",
        sessionId: "session-1",
        cursor: "4",
        run: {
          runId: "run-1",
          rootRunId: "run-1",
          agent: { name: "assistant", revision: "1" },
          status: "running",
          cursor: "3",
          turn: 1,
        },
      })
      expect(yield* Server.eventCodec.decode(yield* Server.eventCodec.encode(event))).toEqual(event)
    }),
  )

  it.effect("round-trips a memory-only client preview", () =>
    Effect.gen(function* () {
      const delivery = Server.ClientPreview.make({
        _tag: "Preview",
        sessionId: "session-1",
        runId: "run-1",
        attempt: 0,
        sequence: 0,
        channel: "final",
        append: "provisional",
      })
      expect(yield* Server.eventCodec.decode(yield* Server.eventCodec.encode(delivery))).toEqual(delivery)
    }),
  )

  it.effect("rejects internal preview authority fields and malformed event variants", () =>
    Effect.gen(function* () {
      const invalid = {
        _tag: "Preview",
        sessionId: "session-1",
        runId: "run-1",
        attempt: 0,
        sequence: 0,
        channel: "final",
        append: "provisional",
        authorityAttemptFence: 7,
      }
      const encoded = yield* Schema.encodeEffect(Schema.fromJsonString(Schema.Unknown))(invalid)
      expect((yield* Server.eventCodec.decode(encoded).pipe(Effect.flip))._tag).toBe(
        "generalist/server/WireCodecFailed",
      )
      expect(
        Schema.decodeUnknownOption(Server.ClientEvent)({
          _tag: "RunChanged",
          sessionId: "session-1",
          cursor: "4",
          run: { runId: "run-1" },
        })._tag,
      ).toBe("None")
    }),
  )

  it("decodes origin and applied cursors", () => {
    expect(Schema.decodeSync(CursorFromString)("-1")).toBe(Cursor.origin)
    expect(Schema.decodeSync(CursorFromString)("7")).toBe(7)
  })

  it.effect("requires caller identity on cancellation commands", () =>
    Effect.gen(function* () {
      const missingIdentity = yield* Schema.decodeEffect(Schema.fromJsonString(Server.ClientCommand))(
        yield* Schema.encodeEffect(Schema.fromJsonString(Schema.Unknown))({
          _tag: "Cancel",
          runId: "run-1",
          reason: "user",
        }),
      ).pipe(Effect.flip)
      expect(missingIdentity._tag).toBe("SchemaError")
      const emptyIdentity = yield* Schema.decodeEffect(Schema.fromJsonString(Server.ClientCommand))(
        yield* Schema.encodeEffect(Schema.fromJsonString(Schema.Unknown))({
          _tag: "Cancel",
          runId: "run-1",
          commandId: "",
        }),
      ).pipe(Effect.flip)
      expect(emptyIdentity._tag).toBe("SchemaError")
      const command = Server.ClientCommand.make({
        _tag: "Cancel",
        runId: "run-1",
        commandId: "cancel:run-1",
        reason: "user",
      })
      const encoded = yield* encodeCommand(command)
      const decoded = yield* decodeCommand(encoded)
      expect(decoded).toEqual(command)
      expect((yield* decodeCommand("not-json").pipe(Effect.flip))._tag).toBe("generalist/server/WireCodecFailed")
    }),
  )
})
