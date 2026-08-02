import { Cause, Effect, Fiber, Schema, Scope, Stream, SynchronizedRef } from "effect"
import { HttpServerError, HttpServerRequest, HttpServerResponse } from "effect/unstable/http"
import { Socket } from "effect/unstable/socket"
import { Tool, Toolkit } from "effect/unstable/ai"
import { NotAttached, SessionMismatch, TransportError } from "./errors.js"
import { SessionRegistry } from "../session/session-registry.js"
import { ClientFrame, codec } from "./wire.js"
import type { Capability, ClientFrameType, LooseServerFrameType, WireCodec } from "./wire.js"
const ClientFrameJson = Schema.fromJsonString(ClientFrame)

type ToolkitInput = Toolkit.Any | Toolkit.WithHandler<Record<string, Tool.Any>>
type Handle = Effect.Effect<
  HttpServerResponse.HttpServerResponse,
  HttpServerError.HttpServerError | Socket.SocketError,
  HttpServerRequest.HttpServerRequest | SessionRegistry | Scope.Scope
>

type CommandFrame = Exclude<ClientFrameType, { readonly _tag: "Attach" }>

type SocketState =
  | { readonly _tag: "Unattached" }
  | {
      readonly _tag: "Attached"
      readonly sessionId: string
      readonly fiber: Fiber.Fiber<void, Socket.SocketError>
    }
  | {
      readonly _tag: "Closed"
      readonly fiber: Fiber.Fiber<void, Socket.SocketError> | undefined
    }

const Unattached: SocketState = { _tag: "Unattached" }

const transportError = (message: string): TransportError => TransportError.make({ message })

const decodeClientFrame = (text: string): Effect.Effect<ClientFrameType, TransportError> =>
  Schema.decodeUnknownEffect(ClientFrameJson)(text).pipe(
    Effect.mapError(() => transportError("malformed client frame")),
  )

const authorizeCommand = (
  state: Exclude<SocketState, { readonly _tag: "Closed" }>,
  frame: CommandFrame,
): Effect.Effect<void, NotAttached | SessionMismatch> => {
  if (state._tag === "Unattached") return Effect.fail(NotAttached.make({}))
  return state.sessionId === frame.sessionId
    ? Effect.void
    : Effect.fail(SessionMismatch.make({ attachedSessionId: state.sessionId, requestedSessionId: frame.sessionId }))
}

/** @experimental One-session-per-socket fixed-tool WebSocket handler using the supplied toolkit. */
export function handle<T extends ToolkitInput>(toolkit: T): Handle
/** @experimental One-session-per-socket fixed-tool WebSocket handler using an explicit capability. */
export function handle<T extends ToolkitInput>(capability: {
  readonly capability: "fixed"
  readonly toolkit: T
}): Handle
/** @experimental One-session-per-socket runtime-dynamic WebSocket handler. */
export function handle(capability: { readonly capability: "runtime-dynamic" }): Handle
/** @experimental One-session-per-socket WebSocket handler using a caller-selected capability. */
export function handle<T extends ToolkitInput>(capability: Capability<T>): Handle
export function handle<T extends ToolkitInput>(input: T | Capability<T>): Handle {
  const capability = "tools" in input ? ({ capability: "fixed", toolkit: input } as const) : input
  const wireCodec: WireCodec<LooseServerFrameType> = codec(capability)
  return Effect.gen(function* () {
    const request = yield* HttpServerRequest.HttpServerRequest
    const registry = yield* SessionRegistry
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
      }).pipe(
        Effect.flatMap((shouldClose) => (shouldClose ? writer(new Socket.CloseEvent(code, reason)) : Effect.void)),
      )

    const writeFrame = (frame: LooseServerFrameType) =>
      wireCodec.encodeServer(frame).pipe(
        Effect.flatMap(writer),
        Effect.catchTag("@batonfx/transport/WireEncodeFailed", (error) =>
          close(1011, "wire encoding failed").pipe(Effect.andThen(Effect.fail(error))),
        ),
      )

    const startAttach = (sessionId: string, afterSeq: number | undefined) =>
      SynchronizedRef.modifyEffect(state, (current) => {
        if (current._tag === "Closed") return Effect.succeed([undefined, current] as const)
        if (current._tag === "Attached") {
          return current.sessionId === sessionId
            ? Effect.succeed([undefined, current] as const)
            : Effect.fail(SessionMismatch.make({ attachedSessionId: current.sessionId, requestedSessionId: sessionId }))
        }
        return registry.attach(sessionId, afterSeq).pipe(
          Stream.runForEach(writeFrame),
          Effect.catchTags({
            "@batonfx/transport/WireEncodeFailed": () => Effect.void,
            "@batonfx/transport/SubscriberLagged": () => close(4000, "lagged"),
            "@batonfx/transport/SessionError": (error) => close(1011, error.message),
          }),
          Effect.catchCause((cause) =>
            Cause.hasInterrupts(cause) ? Effect.interrupt : close(1011, "attachment failed"),
          ),
          Effect.forkIn(scope),
          Effect.map((fiber) => [undefined, { _tag: "Attached", sessionId, fiber }] as const),
        )
      })

    const dispatchCommand = (frame: CommandFrame) =>
      SynchronizedRef.get(state).pipe(
        Effect.flatMap((current) => {
          if (current._tag === "Closed") return Effect.void
          return authorizeCommand(current, frame).pipe(
            Effect.andThen(() => {
              switch (frame._tag) {
                case "SendMessage":
                  return registry.send(frame.sessionId, frame.prompt)
                case "ResolveApproval":
                  return registry.resolveApproval(frame.sessionId, frame.token, frame.decision)
                case "Cancel":
                  return registry.interrupt(frame.sessionId)
              }
            }),
          )
        }),
      )

    const dispatch = (frame: ClientFrameType) => {
      switch (frame._tag) {
        case "Attach":
          return startAttach(frame.sessionId, frame.afterSeq)
        default:
          return dispatchCommand(frame)
      }
    }

    const handleText = (text: string) =>
      decodeClientFrame(text).pipe(
        Effect.flatMap(dispatch),
        Effect.catchTags({
          "@batonfx/transport/TransportError": () => close(1003, "malformed client frame"),
          "@batonfx/transport/NotAttached": () => close(1008, "not attached"),
          "@batonfx/transport/SessionMismatch": () => close(1008, "session mismatch"),
          "@batonfx/transport/SessionBusy": () => close(1011, "session busy"),
          "@batonfx/transport/SessionQueueFull": () => close(1013, "session queue full"),
          "@batonfx/transport/SessionError": (error) => close(1011, error.message),
        }),
      )

    const handleRaw = (data: string | Uint8Array) =>
      typeof data === "string" ? handleText(data) : close(1003, "binary client frame")

    yield* socket.runRaw(handleRaw).pipe(Effect.ensuring(interruptAttachment))
    return HttpServerResponse.empty()
  })
}
