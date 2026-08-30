import { Cause, Effect, Fiber, Scope, Stream, SynchronizedRef } from "effect"
import { HttpServerError, HttpServerRequest, HttpServerResponse } from "effect/unstable/http"
import { Socket } from "effect/unstable/socket"
import { Runtime, type EventsInput } from "../runtime/service.js"
import type { RunEvent } from "../runtime/run/event.js"
import { NotAttached, RunMismatch } from "./errors.js"
import { decodeCommand, observerCodec, type ClientCommand } from "./wire.js"

type Handle = Effect.Effect<
  HttpServerResponse.HttpServerResponse,
  HttpServerError.HttpServerError | Socket.SocketError,
  HttpServerRequest.HttpServerRequest | Runtime | Scope.Scope
>

type SocketState =
  | { readonly _tag: "Unattached" }
  | { readonly _tag: "Attached"; readonly runId: string; readonly fiber: Fiber.Fiber<void, Socket.SocketError> }
  | { readonly _tag: "Closed"; readonly fiber: Fiber.Fiber<void, Socket.SocketError> | undefined }

const Unattached: SocketState = { _tag: "Unattached" }

const authorize = (
  state: Exclude<SocketState, { readonly _tag: "Closed" }>,
  runId: string,
): Effect.Effect<void, NotAttached | RunMismatch> => {
  if (state._tag === "Unattached") return Effect.fail(NotAttached.make({}))
  return state.runId === runId
    ? Effect.void
    : Effect.fail(RunMismatch.make({ attachedRunId: state.runId, requestedRunId: runId }))
}

/** @experimental One-Run-per-WebSocket canonical RunEvent handler. */
export const handle: Handle = Effect.gen(function* () {
  const request = yield* HttpServerRequest.HttpServerRequest
  const runtime = yield* Runtime
  const scope = yield* Effect.scope
  const socket = yield* request.upgrade
  const writer = yield* socket.writer
  const state = yield* SynchronizedRef.make<SocketState>(Unattached)

  const interruptAttachment = SynchronizedRef.modifyEffect(state, (current) => {
    if (current._tag === "Attached") {
      return Fiber.interrupt(current.fiber).pipe(Effect.as([undefined, Unattached] as const))
    }
    if (current._tag === "Closed" && current.fiber !== undefined) {
      return Fiber.interrupt(current.fiber).pipe(Effect.as([undefined, { _tag: "Closed", fiber: undefined }] as const))
    }
    return Effect.succeed([undefined, current] as const)
  })

  const close = (code: number, reason: string) =>
    SynchronizedRef.modify(state, (current) => {
      if (current._tag === "Closed") return [false, current] as const
      return [true, { _tag: "Closed", fiber: current._tag === "Attached" ? current.fiber : undefined }] as const
    }).pipe(Effect.flatMap((shouldClose) => (shouldClose ? writer(new Socket.CloseEvent(code, reason)) : Effect.void)))

  const writeEvent = (event: RunEvent) =>
    (event._tag === "ModelResponseCommitted" || event._tag === "ModelResponseInterrupted"
      ? runtime.resolveModelResponse(event).pipe(Effect.map((response) => ({ ...event, response })))
      : Effect.succeed(event)
    ).pipe(
      Effect.flatMap(observerCodec.encode),
      Effect.flatMap(writer),
      Effect.catchTag("tenetkit/transport/WireCodecFailed", (error) =>
        close(1011, "wire encoding failed").pipe(Effect.andThen(Effect.fail(error))),
      ),
    )

  const attach = (runId: string, cursor: number | undefined) =>
    SynchronizedRef.modifyEffect(state, (current) => {
      if (current._tag === "Closed") return Effect.succeed([undefined, current] as const)
      if (current._tag === "Attached") {
        return current.runId === runId
          ? Effect.succeed([undefined, current] as const)
          : Effect.fail(RunMismatch.make({ attachedRunId: current.runId, requestedRunId: runId }))
      }
      const options: EventsInput = cursor === undefined ? { runId } : { runId, cursor }
      return runtime.events(options).pipe(
        Stream.runForEach(writeEvent),
        Effect.catchTags({
          "tenetkit/transport/WireCodecFailed": () => Effect.void,
          "tenetkit/runtime/SubscriberLagged": (error) => close(4000, `lagged:${error.lastDeliveredSequence}`),
          "tenetkit/runtime/CursorExpired": (error) => close(4001, `cursor-expired:${error.earliestSequence}`),
          "tenetkit/runtime/RunNotFound": () => close(4004, "run-not-found"),
          "tenetkit/runtime/RuntimeUnavailable": () => close(1011, "runtime-unavailable"),
        }),
        Effect.catchCause((cause) =>
          Cause.hasInterrupts(cause) ? Effect.interrupt : close(1011, "attachment-failed"),
        ),
        Effect.forkIn(scope),
        Effect.map((fiber) => [undefined, { _tag: "Attached", runId, fiber }] as const),
      )
    })

  const dispatch = (command: ClientCommand) => {
    if (command._tag === "Attach") return attach(command.runId, command.cursor)
    return SynchronizedRef.get(state).pipe(
      Effect.flatMap((current) => {
        if (current._tag === "Closed") return Effect.void
        return authorize(current, command.runId).pipe(
          Effect.andThen(
            runtime.cancel(
              command.reason === undefined
                ? { runId: command.runId }
                : {
                    runId: command.runId,
                    reason: command.reason,
                  },
            ),
          ),
        )
      }),
    )
  }

  const handleText = (text: string) =>
    decodeCommand(text).pipe(
      Effect.flatMap(dispatch),
      Effect.catchTags({
        "tenetkit/transport/WireCodecFailed": () => close(1003, "malformed-command"),
        "tenetkit/transport/NotAttached": () => close(1008, "not-attached"),
        "tenetkit/transport/RunMismatch": () => close(1008, "run-mismatch"),
        "tenetkit/runtime/RunNotFound": () => close(4004, "run-not-found"),
        "tenetkit/runtime/RuntimeUnavailable": () => close(1011, "runtime-unavailable"),
      }),
    )

  yield* socket
    .runRaw((data) => (data instanceof Uint8Array ? close(1003, "binary-command") : handleText(data)))
    .pipe(Effect.ensuring(interruptAttachment))
  return HttpServerResponse.empty()
})
