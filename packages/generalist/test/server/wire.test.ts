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

  it.effect("round-trips a memory-only preview with separate Host authority", () =>
    Effect.gen(function* () {
      const delivery = Server.PreviewDelivery.make({
        _tag: "PreviewDelivery",
        sessionId: "session-1",
        runId: "run-1",
        authorityAttemptFence: 7,
        event: {
          _tag: "ModelPreview",
          runId: "run-1",
          attemptFence: 7,
          turn: 1,
          modelCallId: "model-call-1",
          modelAttemptId: "model-attempt-1",
          attempt: 0,
          generation: 1,
          sequence: 0,
          changes: [{ channel: "text", offset: 0, delta: "provisional" }],
        },
      })
      expect(yield* Server.eventCodec.decode(yield* Server.eventCodec.encode(delivery))).toEqual(delivery)
    }),
  )

  it("rejects a preview frame whose combined changes exceed the wire bound", () => {
    const invalid = {
      _tag: "PreviewDelivery",
      sessionId: "session-1",
      runId: "run-1",
      authorityAttemptFence: 7,
      event: {
        _tag: "ModelPreview",
        runId: "run-1",
        attemptFence: 7,
        turn: 1,
        modelCallId: "model-call-1",
        modelAttemptId: "model-attempt-1",
        attempt: 0,
        generation: 1,
        sequence: 0,
        changes: [
          { channel: "text", offset: 0, delta: "x".repeat(4_096) },
          { channel: "reasoning", offset: 0, delta: "y" },
        ],
      },
    }
    expect(Schema.decodeUnknownOption(Server.ServerEvent)(invalid)._tag).toBe("None")
  })

  it("rejects a wrapper whose Runtime event belongs to another Host event category", () => {
    const event = hostEvent(4)
    const invalid = { ...event, _tag: "Completed" }
    expect(Schema.decodeUnknownOption(Server.HostEvent)(invalid)._tag).toBe("None")
  })

  it("decodes origin and applied cursors", () => {
    expect(Schema.decodeSync(Server.CursorFromString)("-1")).toBe(Cursor.origin)
    expect(Schema.decodeSync(Server.CursorFromString)("7")).toBe(7)
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
      const decoded = yield* Schema.decodeEffect(Schema.fromJsonString(Server.ClientCommand))(
        yield* Schema.encodeEffect(Schema.fromJsonString(Server.ClientCommand))(command),
      )
      expect(decoded).toEqual(command)
    }),
  )
})
