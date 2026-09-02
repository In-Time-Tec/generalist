import { Cause, Effect, Fiber, Stream } from "effect"
import { HttpServerRequest, HttpServerResponse } from "effect/unstable/http"
import { Socket } from "effect/unstable/socket"
import type { Any as AnyAgent } from "../core/agent/service.js"
import type { HostEvent } from "../host/event.js"
import type { Host } from "../host/index.js"
import type { SessionEventsError } from "../runtime/session/host.js"
import { decodeCommand, eventCodec } from "./wire.js"

const closeForStreamError = (
  writer: (chunk: string | Uint8Array | Socket.CloseEvent) => Effect.Effect<void, Socket.SocketError>,
  error: SessionEventsError,
): Effect.Effect<void, Socket.SocketError> => {
  switch (error._tag) {
    case "generalist/host/SessionSubscriberLagged":
      return writer(new Socket.CloseEvent(4000, `lagged:${error.lastDeliveredCursor}`))
    case "generalist/host/SessionCursorExpired":
      return writer(new Socket.CloseEvent(4001, `cursor-expired:${error.earliestCursor}`))
    case "generalist/host/SessionNotFound":
      return writer(new Socket.CloseEvent(4004, "session-not-found"))
    case "generalist/runtime/RuntimeUnavailable":
      return writer(new Socket.CloseEvent(1011, "event-stream-failed"))
  }
}

const runBelongsTo = <Agents extends ReadonlyArray<AnyAgent>>(
  host: Host<Agents>,
  sessionId: string,
  runId: string,
): Effect.Effect<boolean> =>
  host.runs.list(sessionId).pipe(
    Effect.map((runs) => runs.some((run) => run.runId === runId)),
    Effect.orElseSucceed(() => false),
  )

/** Upgrade one authenticated Session route and stream its HostEvents. */
export const handle = <Agents extends ReadonlyArray<AnyAgent>>(options: {
  readonly host: Host<Agents>
  readonly sessionId: string
  readonly request: HttpServerRequest.HttpServerRequest
  readonly events: Stream.Stream<HostEvent, SessionEventsError>
}) =>
  Effect.gen(function* () {
    const socket = yield* options.request.upgrade
    const writer = yield* socket.writer
    const close = (code: number, reason: string) => writer(new Socket.CloseEvent(code, reason))

    const eventFiber = yield* options.events.pipe(
      Stream.mapEffect((event) =>
        eventCodec.encode(event).pipe(
          Effect.flatMap(writer),
          Effect.catchTag("generalist/server/WireCodecFailed", () => close(1011, "wire-encoding-failed")),
        ),
      ),
      Stream.runDrain,
      Effect.catchTag("SocketError", () => Effect.void),
      Effect.catch((error) => closeForStreamError(writer, error)),
      Effect.catchCause((cause) =>
        Cause.hasInterrupts(cause) ? Effect.interrupt : close(1011, "event-stream-defect"),
      ),
      Effect.forkChild,
    )

    const dispatch = (text: string) =>
      decodeCommand(text).pipe(
        Effect.flatMap((command) =>
          runBelongsTo(options.host, options.sessionId, command.runId).pipe(
            Effect.flatMap((allowed) => {
              if (!allowed) return close(1008, "run-not-in-session")
              return options.host.runs.cancel(command.runId, command.reason).pipe(
                Effect.catchTags({
                  "generalist/runtime/RunNotFound": () => close(4004, "run-not-found"),
                  "generalist/runtime/RuntimeUnavailable": () => close(1011, "runtime-unavailable"),
                }),
              )
            }),
          ),
        ),
        Effect.catchTag("generalist/server/WireCodecFailed", () => close(1003, "malformed-command")),
      )

    yield* socket
      .runRaw((data) => (data instanceof Uint8Array ? close(1003, "binary-command") : dispatch(data)))
      .pipe(Effect.ensuring(Fiber.interrupt(eventFiber)))
    return HttpServerResponse.empty()
  })
