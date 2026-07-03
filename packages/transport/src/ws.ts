import { Cause, Effect, Fiber, Option, Ref, Schema, Scope, Stream } from "effect"
import { HttpServerError, HttpServerRequest, HttpServerResponse } from "effect/unstable/http"
import { Socket } from "effect/unstable/socket"
import * as Ai from "effect/unstable/ai"
import * as Errors from "./errors"
import * as SessionRegistry from "./session-registry"
import * as Wire from "./wire"

const ClientFrameJson = Schema.fromJsonString(Wire.ClientFrame)

const transportError = (message: string): Errors.TransportError => new Errors.TransportError({ message })

const encodeServerFrame =
  <T extends Ai.Toolkit.Any | Ai.Toolkit.WithHandler<Record<string, Ai.Tool.Any>>>(toolkit: T) =>
  (frame: Wire.LooseServerFrameType): string =>
    JSON.stringify(Schema.encodeUnknownSync(Wire.ServerFrame(toolkit))(frame))

const decodeClientFrame = (text: string): Effect.Effect<Wire.ClientFrameType, Errors.TransportError> =>
  Schema.decodeUnknownEffect(ClientFrameJson)(text).pipe(
    Effect.mapError(() => transportError("malformed client frame")),
  )

/** @experimental One-session-per-socket WebSocket handler. */
export const handle = <T extends Ai.Toolkit.Any | Ai.Toolkit.WithHandler<Record<string, Ai.Tool.Any>>>(
  toolkit: T,
): Effect.Effect<
  HttpServerResponse.HttpServerResponse,
  HttpServerError.HttpServerError | Socket.SocketError,
  HttpServerRequest.HttpServerRequest | SessionRegistry.SessionRegistry | Scope.Scope
> =>
  Effect.gen(function* () {
    const request = yield* HttpServerRequest.HttpServerRequest
    const registry = yield* SessionRegistry.SessionRegistry
    const scope = yield* Effect.scope
    const socket = yield* request.upgrade
    const writer = yield* socket.writer
    const attachment = yield* Ref.make<Option.Option<Fiber.Fiber<void, Socket.SocketError>>>(Option.none())
    const encodeFrame = encodeServerFrame(toolkit)

    const interruptAttachment = Ref.get(attachment).pipe(
      Effect.flatMap(
        Option.match({
          onNone: () => Effect.void,
          onSome: (fiber) => Fiber.interrupt(fiber).pipe(Effect.asVoid),
        }),
      ),
      Effect.andThen(Ref.set(attachment, Option.none())),
    )

    const close = (code: number, reason: string) => writer(new Socket.CloseEvent(code, reason))

    const writeFrame = (frame: Wire.LooseServerFrameType) => writer(encodeFrame(frame))

    const startAttach = (sessionId: string, afterSeq: number | undefined) =>
      interruptAttachment.pipe(
        Effect.andThen(
          registry.attach(sessionId, afterSeq).pipe(
            Stream.runForEach(writeFrame),
            Effect.catchTag("@batonfx/transport/SubscriberLagged", () => close(4000, "lagged")),
            Effect.catchTag("@batonfx/transport/SessionError", (error) => close(1011, error.message)),
            Effect.catchCause((cause) =>
              Cause.hasInterrupts(cause) ? Effect.interrupt : close(1011, "attachment failed"),
            ),
            Effect.forkIn(scope),
          ),
        ),
        Effect.flatMap((fiber) => Ref.set(attachment, Option.some(fiber))),
      )

    const dispatch = (frame: Wire.ClientFrameType) => {
      switch (frame._tag) {
        case "Attach":
          return startAttach(frame.sessionId, frame.afterSeq)
        case "SendMessage":
          return registry.send(frame.sessionId, frame.prompt)
        case "ResolveApproval":
          return registry.resolveApproval(frame.sessionId, frame.token, frame.decision)
        case "Cancel":
          return registry.interrupt(frame.sessionId)
      }
    }

    const handleText = (text: string) =>
      decodeClientFrame(text).pipe(
        Effect.flatMap(dispatch),
        Effect.catchTag("@batonfx/transport/TransportError", () => close(1003, "malformed client frame")),
        Effect.catchTag("@batonfx/transport/SessionBusy", () => close(1011, "session busy")),
        Effect.catchTag("@batonfx/transport/SessionError", (error) => close(1011, error.message)),
      )

    const handleRaw = (data: string | Uint8Array) =>
      typeof data === "string" ? handleText(data) : close(1003, "binary client frame")

    yield* socket.runRaw(handleRaw).pipe(Effect.ensuring(interruptAttachment))
    return HttpServerResponse.empty()
  })
