import { Cause, Effect, Fiber, Schema, Stream } from "effect"
import { HttpServerRequest, HttpServerResponse } from "effect/unstable/http"
import { Socket } from "effect/unstable/socket"
import type { Any as AnyAgent } from "../core/agent/service.js"
import type { ArtifactError, ArtifactUpdate } from "../core/artifact.js"
import type { Host } from "../host/index.js"
import { ArtifactClientCommand, ArtifactServerEvent } from "./api.js"

const ClientCommandJson = Schema.fromJsonString(ArtifactClientCommand)
const ServerEventJson = Schema.fromJsonString(ArtifactServerEvent)

const closeForError = (
  close: (code: number, reason: string) => Effect.Effect<void, Socket.SocketError>,
  error: ArtifactError,
) => {
  switch (error._tag) {
    case "generalist/artifact/ArtifactNotFound":
      return close(4004, "artifact-not-found")
    case "generalist/artifact/ArtifactVersionNotFound":
      return close(4001, `version-not-found:${error.version}`)
    case "generalist/artifact/ArtifactSubscriberLagged":
      return close(4000, `lagged:${error.lastDeliveredVersion}`)
    default:
      return close(1011, "artifact-operation-failed")
  }
}

/** Upgrade one authenticated Artifact route and join it as a human editing peer. */
export const handle = <Agents extends ReadonlyArray<AnyAgent>>(options: {
  readonly host: Host<Agents>
  readonly name: string
  readonly request: HttpServerRequest.HttpServerRequest
  readonly updates: Stream.Stream<ArtifactUpdate, ArtifactError>
}) =>
  Effect.gen(function* () {
    const socket = yield* options.request.upgrade
    const writer = yield* socket.writer
    const close = (code: number, reason: string) => writer(new Socket.CloseEvent(code, reason))
    const send = (event: ArtifactServerEvent) =>
      Schema.encodeEffect(ServerEventJson)(event).pipe(
        Effect.flatMap(writer),
        Effect.catchTag("SchemaError", () => close(1011, "artifact-encoding-failed")),
      )

    yield* options.host.artifacts.read(options.name).pipe(
      Effect.flatMap((document) => send({ _tag: "Snapshot", document })),
      Effect.catchTag("SocketError", () => Effect.void),
      Effect.catch((error) => closeForError(close, error)),
    )
    const updateFiber = yield* options.updates.pipe(
      Stream.mapEffect((update) =>
        options.host.artifacts
          .read(options.name)
          .pipe(Effect.flatMap((document) => send({ _tag: "Update", update, document }))),
      ),
      Stream.runDrain,
      Effect.catchTag("SocketError", () => Effect.void),
      Effect.catch((error) => closeForError(close, error)),
      Effect.catchCause((cause) =>
        Cause.hasInterrupts(cause) ? Effect.interrupt : close(1011, "artifact-stream-defect"),
      ),
      Effect.forkChild,
    )

    const dispatch = (data: string) =>
      Schema.decodeEffect(ClientCommandJson)(data).pipe(
        Effect.flatMap((command) => options.host.artifacts.edit(options.name, command)),
        Effect.asVoid,
        Effect.catchTag("SchemaError", () => close(1003, "malformed-artifact-command")),
        Effect.catchTag("SocketError", () => Effect.void),
        Effect.catch((error) => closeForError(close, error)),
      )

    yield* socket
      .runRaw((data) => (data instanceof Uint8Array ? close(1003, "binary-artifact-command") : dispatch(data)))
      .pipe(Effect.ensuring(Fiber.interrupt(updateFiber)))
    return HttpServerResponse.empty()
  })
