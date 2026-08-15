import { Cause, Effect, Fiber, Scope, Stream, SynchronizedRef } from "effect"
import { HttpServerError, HttpServerRequest, HttpServerResponse } from "effect/unstable/http"
import { Socket } from "effect/unstable/socket"
import { Runtime } from "@batonfx/runtime"
import type { RunEvent } from "@batonfx/runtime"
import { NotAttached, RunMismatch } from "./errors.js"
import { decodeCommand, observerCodec } from "./wire.js"
import type { ClientCommand } from "./wire.js"

type Handle = Effect.Effect<
  HttpServerResponse.HttpServerResponse,
  HttpServerError.HttpServerError | Socket.SocketError,
  HttpServerRequest.HttpServerRequest | Runtime.Runtime | Scope.Scope
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

/** @experimental One-Run-per-socket canonical RunEvent handler. */
export const handle: Handle = Effect.gen(function* () {
  const request = yield* HttpServerRequest.HttpServerRequest
  const runtime = yield* Runtime.Runtime
  const scope = yield* Effect.scope
  const socket = yield* request.upgrade
  const writer = yield* socket.writer
  const state = yield* SynchronizedRef.make<SocketState>(Unattached)

  const interruptAttachment = SynchronizedRef.modifyEffect(state, (current) =>
    current._tag === "Attached"
      ? Fiber.interrupt(current.fiber).pipe(Effect.as([undefined, Unattached] as const))
      : current._tag === "Closed" && current.fiber !== undefined
        ? Fiber.interrupt(current.fiber).pipe(Effect.as([undefined, { _tag: "Closed", fiber: undefined }] as const))
        : Effect.succeed([undefined, current] as const),
  )

  const close = (code: number, reason: string) =>
    SynchronizedRef.modify(state, (current) => {
      if (current._tag === "Closed") return [false, current] as const
      return [true, { _tag: "Closed", fiber: current._tag === "Attached" ? current.fiber : undefined }] as const
    }).pipe(Effect.flatMap((shouldClose) => (shouldClose ? writer(new Socket.CloseEvent(code, reason)) : Effect.void)))

  const writeEvent = (event: RunEvent.RunEvent) =>
    (event._tag === "ModelResponseCommitted" || event._tag === "ModelResponseInterrupted"
      ? runtime.resolveModelResponse(event).pipe(Effect.map((response) => ({ ...event, response })))
      : Effect.succeed(event)
    ).pipe(
      Effect.flatMap(observerCodec.encode),
      Effect.flatMap(writer),
      Effect.catchTag("@batonfx/transport/WireEncodeFailed", (error) =>
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
      return runtime.events({ runId, ...(cursor === undefined ? {} : { cursor }) }).pipe(
        Stream.runForEach(writeEvent),
        Effect.catchTags({
          "@batonfx/transport/WireEncodeFailed": () => Effect.void,
          "@batonfx/runtime/SubscriberLagged": (error) => close(4000, `lagged:${error.lastDeliveredSequence}`),
          "@batonfx/runtime/CursorExpired": (error) => close(4001, `cursor-expired:${error.earliestSequence}`),
          "@batonfx/runtime/RunNotFound": () => close(4004, "run-not-found"),
          "@batonfx/runtime/RuntimeUnavailable": () => close(1011, "runtime-unavailable"),
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
            runtime.cancel({
              runId: command.runId,
              ...(command.reason === undefined ? {} : { reason: command.reason }),
            }),
          ),
        )
      }),
    )
  }

  const handleText = (text: string) =>
    decodeCommand(text).pipe(
      Effect.flatMap(dispatch),
      Effect.catchTags({
        "@batonfx/transport/WireEncodeFailed": () => close(1003, "malformed-command"),
        "@batonfx/transport/NotAttached": () => close(1008, "not-attached"),
        "@batonfx/transport/RunMismatch": () => close(1008, "run-mismatch"),
        "@batonfx/runtime/RunNotFound": () => close(4004, "run-not-found"),
        "@batonfx/runtime/RuntimeUnavailable": () => close(1011, "runtime-unavailable"),
      }),
    )

  yield* socket
    .runRaw((data) => (typeof data === "string" ? handleText(data) : close(1003, "binary-command")))
    .pipe(Effect.ensuring(interruptAttachment))
  return HttpServerResponse.empty()
})
