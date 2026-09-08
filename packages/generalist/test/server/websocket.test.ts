import { objectRuntimeLayer, objectWorkerId } from "../runtime/execution/object.js"
import { expect, layer } from "@effect/vitest"
import { Deferred, Effect, Fiber, Layer, Option, Queue, Schema, Stream } from "effect"
import { LanguageModel, Response } from "effect/unstable/ai"
import { TestClock } from "effect/testing"
import { HttpServerRequest } from "effect/unstable/http"
import { Socket } from "effect/unstable/socket"
import { Agent, Approvals, Permissions } from "generalist"
import { Host } from "generalist/host"
import { ExecutableResolver, Runtime as RuntimeService, RunExecutor, RunStore } from "generalist/runtime"
import { Server, type ServerEvent } from "generalist/server"
import { handle } from "../../src/server/websocket.js"

interface FakeSocket {
  readonly socket: Socket.Socket
  readonly inbound: Queue.Queue<string | Uint8Array | Socket.CloseEvent>
  readonly outbound: Queue.Queue<string | Uint8Array | Socket.CloseEvent>
}

const makeFakeSocket = (): Effect.Effect<FakeSocket> =>
  Effect.gen(function* () {
    const inbound = yield* Queue.unbounded<string | Uint8Array | Socket.CloseEvent>()
    const outbound = yield* Queue.unbounded<string | Uint8Array | Socket.CloseEvent>()
    return {
      inbound,
      outbound,
      socket: Socket.make({
        runRaw: (dispatch) =>
          Effect.gen(function* () {
            while (true) {
              const message = yield* Queue.take(inbound)
              if (Socket.isCloseEvent(message)) return
              const handled = dispatch(message)
              if (Effect.isEffect(handled)) yield* handled
            }
          }),
        writer: Effect.succeed((chunk) => Queue.offer(outbound, chunk).pipe(Effect.asVoid)),
      }),
    }
  })

const request = (socket: Socket.Socket): HttpServerRequest.HttpServerRequest => {
  const value = HttpServerRequest.fromWeb(new Request("http://generalist.test/sessions/session-1/ws"))
  Object.defineProperty(value, "upgrade", { value: Effect.succeed(socket) })
  return value
}

const runtime = objectRuntimeLayer({ addresses: [] }).pipe(Layer.provide(ExecutableResolver.layerStatic([])))
let streamTextOverride: (() => Stream.Stream<Response.StreamPartEncoded>) | undefined
const model = Layer.effect(
  LanguageModel.LanguageModel,
  LanguageModel.make({
    generateText: () => Effect.succeed([{ type: "text", text: "unused" }]),
    streamText: () =>
      streamTextOverride?.() ??
      Stream.fromIterable<Response.StreamPartEncoded>([
        Response.makePart("text-delta", { id: "answer", delta: "live preview" }),
        Response.makePart("finish", {
          reason: "stop",
          usage: Response.Usage.make({
            inputTokens: { total: 1, uncached: 1, cacheRead: 0, cacheWrite: 0 },
            outputTokens: { total: 1, text: 1, reasoning: 0 },
          }),
          response: undefined,
        }),
      ]),
  }),
)

layer(Layer.mergeAll(runtime, model, Permissions.layerAllowAll, Approvals.layerAutoApprove))(
  "WebSocket server handler",
  (it) => {
    it.effect("streams the route Session and cancels only an explicitly named member Run", () =>
      Effect.gen(function* () {
        const agent = Agent.make({ name: "websocket-test" })
        const host = yield* Host.make({ revision: "local", agents: [agent] })
        const session = yield* host.sessions.create({ id: "session-1" })
        const run = yield* host.runs.start(session.id, agent, "wait")
        const fake = yield* makeFakeSocket()
        const events = yield* host.events.subscribe(session.id)
        const fiber = yield* handle<readonly [typeof agent]>({
          host,
          authorization: { tenantId: "test", authorize: () => Effect.succeed(true) },
          sessionId: session.id,
          request: request(fake.socket),
          events,
        }).pipe(
          Effect.provideService(Server.CurrentPrincipal, { id: "controller", tenantId: "test", role: "controller" }),
          Effect.forkChild,
        )

        const output = yield* Queue.take(fake.outbound)
        if (Socket.isCloseEvent(output) || output instanceof Uint8Array) return yield* Effect.die("expected HostEvent")
        expect(yield* Server.eventCodec.decode(output)).toMatchObject({ _tag: "RunStarted", runId: run.id })

        const command = yield* Schema.encodeEffect(Schema.fromJsonString(Server.ClientCommand))({
          _tag: "Cancel",
          runId: run.id,
          commandId: "cancel:websocket-run",
          reason: "user stopped",
        })
        yield* Queue.offer(fake.inbound, command)
        yield* Effect.yieldNow
        expect(yield* host.runs.inspect(run.id)).toMatchObject({ status: "cancelled" })

        yield* Queue.offer(fake.inbound, new Socket.CloseEvent(1000))
        yield* Fiber.join(fiber)
      }),
    )

    it.effect("streams only a storage-authorized memory preview for the current Session Run", () =>
      Effect.gen(function* () {
        const agent = Agent.make({ name: "websocket-preview-test" })
        const host = yield* Host.make({ revision: "local", agents: [agent] })
        const session = yield* host.sessions.create({ id: "session-preview" })
        const run = yield* host.runs.start(session.id, agent, "answer")
        const fake = yield* makeFakeSocket()
        const events = yield* host.events.subscribe(session.id)
        const fiber = yield* handle<readonly [typeof agent]>({
          host,
          authorization: { tenantId: "test", authorize: () => Effect.succeed(true) },
          sessionId: session.id,
          request: request(fake.socket),
          events,
        }).pipe(
          Effect.provideService(Server.CurrentPrincipal, { id: "observer", tenantId: "test", role: "controller" }),
          Effect.forkChild,
        )

        const started = yield* Queue.take(fake.outbound)
        if (Socket.isCloseEvent(started) || started instanceof Uint8Array)
          return yield* Effect.die("expected RunStarted")
        expect(yield* Server.eventCodec.decode(started)).toMatchObject({ _tag: "RunStarted", runId: run.id })

        const store = yield* RunStore.RunStore
        const executor = yield* RunExecutor.RunExecutor
        const claim = yield* store.claimExecution({
          commandId: "websocket-preview:claim",
          runId: run.id,
          ownerId: objectWorkerId,
        })
        yield* executor.execute(claim)

        let preview: ServerEvent | undefined
        for (let index = 0; index < 10 && preview === undefined; index += 1) {
          const output = yield* Queue.take(fake.outbound)
          if (Socket.isCloseEvent(output) || output instanceof Uint8Array) continue
          const decoded = yield* Server.eventCodec.decode(output)
          if (decoded._tag === "PreviewDelivery") preview = decoded
        }
        expect(preview).toMatchObject({
          _tag: "PreviewDelivery",
          sessionId: session.id,
          runId: run.id,
          authorityAttemptFence: claim.attemptFence,
          event: { _tag: "ModelPreview", attemptFence: claim.attemptFence },
        })

        yield* Queue.offer(fake.inbound, new Socket.CloseEvent(1000))
        yield* Fiber.join(fiber)
      }),
    )

    it.effect("requires Run observe authorization before subscribing to previews", () =>
      Effect.gen(function* () {
        const agent = Agent.make({ name: "websocket-preview-denied" })
        const host = yield* Host.make({ revision: "local", agents: [agent] })
        const session = yield* host.sessions.create({ id: "session-preview-denied" })
        yield* host.runs.start(session.id, agent, "answer")
        const fake = yield* makeFakeSocket()
        const events = yield* host.events.subscribe(session.id)
        const fiber = yield* handle<readonly [typeof agent]>({
          host,
          authorization: {
            tenantId: "test",
            authorize: ({ resource }) => Effect.succeed(resource.type !== "run"),
          },
          sessionId: session.id,
          request: request(fake.socket),
          events,
        }).pipe(
          Effect.provideService(Server.CurrentPrincipal, { id: "observer", tenantId: "test", role: "spectator" }),
          Effect.forkChild,
        )

        expect(yield* Queue.take(fake.outbound)).toMatchObject({ code: 1008, reason: "forbidden" })
        yield* Queue.offer(fake.inbound, new Socket.CloseEvent(1000))
        yield* Fiber.join(fiber)
      }),
    )

    it.effect("drops old-owner frames after storage authority is revoked", () =>
      Effect.gen(function* () {
        const releaseOldOwner = yield* Deferred.make<void>()
        streamTextOverride = () =>
          Stream.make(Response.makePart("text-delta", { id: "answer", delta: `authorized${"x".repeat(4_096)}` })).pipe(
            Stream.concat(
              Stream.fromEffect(Deferred.await(releaseOldOwner)).pipe(
                Stream.flatMap(() =>
                  Stream.make(Response.makePart("text-delta", { id: "answer", delta: `obsolete${"x".repeat(4_096)}` })),
                ),
              ),
            ),
            Stream.concat(Stream.never),
          )
        const agent = Agent.make({ name: "websocket-preview-revoked" })
        const runtimeService = yield* RuntimeService.Runtime
        let authorityReads = 0
        const host = yield* Host.make({ revision: "local", agents: [agent] }).pipe(
          Effect.provideService(
            RuntimeService.Runtime,
            RuntimeService.Runtime.of({
              ...runtimeService,
              previewAuthority: (runId) =>
                Effect.sync(() => {
                  authorityReads += 1
                }).pipe(Effect.andThen(runtimeService.previewAuthority(runId))),
            }),
          ),
        )
        const session = yield* host.sessions.create({ id: "session-preview-revoked" })
        const run = yield* host.runs.start(session.id, agent, "answer")
        const fake = yield* makeFakeSocket()
        const events = yield* host.events.subscribe(session.id)
        const socketFiber = yield* handle<readonly [typeof agent]>({
          host,
          authorization: { tenantId: "test", authorize: () => Effect.succeed(true) },
          sessionId: session.id,
          request: request(fake.socket),
          events,
        }).pipe(
          Effect.provideService(Server.CurrentPrincipal, { id: "observer", tenantId: "test", role: "controller" }),
          Effect.forkChild,
        )
        yield* Queue.take(fake.outbound)

        const store = yield* RunStore.RunStore
        const staleClaim = yield* store.claimExecution({
          commandId: "websocket-preview-revoked:stale-claim",
          runId: run.id,
          ownerId: objectWorkerId,
        })
        const executor = yield* RunExecutor.RunExecutor
        const execution = yield* executor.execute(staleClaim).pipe(Effect.forkChild)
        let authorized = false
        while (!authorized) {
          const output = yield* Queue.take(fake.outbound)
          if (Socket.isCloseEvent(output) || output instanceof Uint8Array) continue
          const decoded = yield* Server.eventCodec.decode(output)
          authorized =
            decoded._tag === "PreviewDelivery" &&
            decoded.event._tag === "ModelPreview" &&
            decoded.event.changes.some((change) => change.delta.startsWith("authorized"))
        }
        yield* Effect.yieldNow
        let pending = yield* Queue.poll(fake.outbound)
        while (Option.isSome(pending)) pending = yield* Queue.poll(fake.outbound)
        expect(authorityReads).toBe(2)

        yield* store.releaseExecution(staleClaim)
        const currentClaim = yield* store.claimExecution({
          commandId: "websocket-preview-revoked:current-claim",
          runId: run.id,
          ownerId: objectWorkerId,
        })
        expect(currentClaim.attemptFence).toBeGreaterThan(staleClaim.attemptFence)
        yield* Effect.yieldNow
        yield* TestClock.adjust("100 millis")
        yield* Deferred.succeed(releaseOldOwner, undefined)
        yield* Effect.yieldNow
        const queued = yield* Queue.poll(fake.outbound)
        if (Option.isSome(queued) && !Socket.isCloseEvent(queued.value) && !(queued.value instanceof Uint8Array)) {
          const decoded = yield* Server.eventCodec.decode(queued.value)
          expect(
            decoded._tag === "PreviewDelivery" &&
              decoded.event._tag === "ModelPreview" &&
              decoded.event.changes.some((change) => change.delta.startsWith("obsolete")),
          ).toBe(false)
        }
        expect(authorityReads).toBe(3)

        yield* Fiber.interrupt(execution)
        yield* Queue.offer(fake.inbound, new Socket.CloseEvent(1000))
        yield* Fiber.join(socketFiber)
        streamTextOverride = undefined
      }),
    )
  },
)
