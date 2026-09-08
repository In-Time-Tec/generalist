import { Cause, Effect, Fiber, Schema, Stream } from "effect"
import { HttpServerRequest, HttpServerResponse } from "effect/unstable/http"
import { Socket } from "effect/unstable/socket"
import type { ArtifactError, ArtifactUpdate } from "../core/artifact.js"
import type { AgentDeclarations, Host } from "../host/index.js"
import { ArtifactClientCommand, ArtifactServerEvent } from "./api.js"
import { authorize, CurrentPrincipal, type Authorization } from "./auth.js"

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
export const handle = <Agents extends AgentDeclarations>(options: {
  readonly host: Host<Agents>
  readonly authorization: Authorization
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
        authorize({
          policy: options.authorization,
          resource: { type: "artifact", id: options.name },
          action: "observe",
        }).pipe(
          Effect.andThen(
            options.host.artifacts
              .read(options.name)
              .pipe(Effect.flatMap((document) => send({ _tag: "Update", update, document }))),
          ),
        ),
      ),
      Stream.runDrain,
      Effect.catchTags({
        "generalist/server/Forbidden": () => close(1008, "forbidden").pipe(Effect.asVoid),
        "generalist/server/Unauthorized": () => close(1008, "unauthorized").pipe(Effect.asVoid),
      }),
      Effect.catchTag("SocketError", () => Effect.void),
      Effect.catch((error) => closeForError(close, error)),
      Effect.catchCause((cause) =>
        Cause.hasInterrupts(cause) ? Effect.interrupt : close(1011, "artifact-stream-defect"),
      ),
      Effect.forkChild,
    )

    const dispatch = (data: string) =>
      Schema.decodeEffect(ClientCommandJson)(data).pipe(
        Effect.flatMap((command) =>
          authorize({
            policy: options.authorization,
            resource: { type: "artifact", id: options.name },
            action: "mutate",
          }).pipe(
            Effect.andThen(
              CurrentPrincipal.pipe(
                Effect.flatMap((principal) =>
                  Effect.suspend(() =>
                    options.host.artifacts.edit(options.name, {
                      ...command,
                      attribution: { _tag: "Human", actor: principal.id },
                    }),
                  ),
                ),
              ),
            ),
          ),
        ),
        Effect.asVoid,
        Effect.catchTags({
          SchemaError: () => close(1003, "malformed-artifact-command"),
          "generalist/server/Forbidden": () => close(1008, "forbidden"),
          "generalist/server/Unauthorized": () => close(1008, "unauthorized"),
        }),
        Effect.catchTag("SocketError", () => Effect.void),
        Effect.catch((error) => closeForError(close, error)),
      )

    yield* socket
      .runRaw((data) => (data instanceof Uint8Array ? close(1003, "binary-artifact-command") : dispatch(data)))
      .pipe(Effect.ensuring(Fiber.interrupt(updateFiber)))
    return HttpServerResponse.empty()
  })
