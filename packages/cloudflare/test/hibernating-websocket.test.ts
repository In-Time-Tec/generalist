/* oxlint-disable effecttsgo/async-function, effecttsgo/strict-effect-provide */
import { describe, expect, it } from "@effect/vitest"
import { Deferred, Effect, Ref } from "effect"
import { Wire } from "tenetkit/transport"
import {
  makeHibernatingWebSocket,
  type Attachment,
  type HibernatingWebSocket,
  type HibernatingWebSocketState,
} from "../src/durable-objects/index.js"
import { event, runtimeLayer } from "../../tenetkit/test/transport/fixtures.js"
import { Runtime } from "tenetkit/runtime"
import type { Service as RuntimeInterface } from "tenetkit/runtime/driver/service"

type StoredAttachment = Attachment | { readonly version: number }

class FakeSocket implements HibernatingWebSocket {
  attachment: StoredAttachment = { version: 1, state: "unattached" }
  readonly sent: Array<string> = []
  readonly closes: Array<readonly [number | undefined, string | undefined]> = []
  failSend = false
  send(message: string): void {
    if (this.failSend) throw new Error("send failed")
    this.sent.push(message)
  }
  close(code?: number, reason?: string): void {
    this.closes.push([code, reason])
  }
  serializeAttachment(attachment: Attachment): void {
    this.attachment = structuredClone(attachment)
  }
  deserializeAttachment(): StoredAttachment {
    return structuredClone(this.attachment)
  }
  setMalformedAttachment(attachment: { readonly version: number }): void {
    this.attachment = attachment
  }
}

class FakeState implements HibernatingWebSocketState {
  readonly sockets: Array<HibernatingWebSocket> = []
  acceptWebSocket(socket: HibernatingWebSocket): void {
    this.sockets.push(socket)
  }
  getWebSockets(): ReadonlyArray<HibernatingWebSocket> {
    return this.sockets
  }
}

const runtime = (layer = runtimeLayer()): RuntimeInterface =>
  Effect.runSync(Runtime.Runtime.pipe(Effect.provide(layer)))

describe("hibernating WebSocket", () => {
  it("reconstructs from attachments, uses bounded fuel, and persists after send", async () => {
    const state = new FakeState()
    const socket = new FakeSocket()
    const first = makeHibernatingWebSocket({ state, runtime: runtime(), pageSize: 1, fuel: 1 })
    first.accept(socket)
    await first.webSocketMessage(
      socket,
      await Effect.runPromise(Wire.encodeCommand({ _tag: "Attach", runId: "run-1" })),
    )
    expect(socket.sent).toHaveLength(1)
    expect(socket.attachment).toMatchObject({ version: 1, state: "attached", cursor: 0 })

    const reconstructed = makeHibernatingWebSocket({ state, runtime: runtime(), pageSize: 1, fuel: 2 })
    const flushed = await reconstructed.flush("run-1")
    expect(flushed.frames).toBe(2)
    expect(socket.attachment).toMatchObject({ cursor: 2 })
    expect(socket.sent).toHaveLength(3)
  })

  it("does not persist a cursor when send fails", async () => {
    const state = new FakeState()
    const socket = new FakeSocket()
    const adapter = makeHibernatingWebSocket({ state, runtime: runtime(), pageSize: 1 })
    adapter.accept(socket)
    socket.failSend = true
    await expect(
      adapter.webSocketMessage(socket, await Effect.runPromise(Wire.encodeCommand({ _tag: "Attach", runId: "run-1" }))),
    ).rejects.toThrow("send failed")
    expect(socket.attachment).toMatchObject({ cursor: -1 })
  })

  it("cancels only explicitly and closes malformed persisted state", async () => {
    const cancelled = await Effect.runPromise(Ref.make<Array<string>>([]))
    const layer = runtimeLayer({ cancel: ({ runId }) => Ref.update(cancelled, (ids) => [...ids, runId]) })
    const state = new FakeState()
    const socket = new FakeSocket()
    const adapter = makeHibernatingWebSocket({ state, runtime: runtime(layer) })
    adapter.accept(socket)
    await adapter.webSocketMessage(
      socket,
      await Effect.runPromise(Wire.encodeCommand({ _tag: "Attach", runId: "run-1", cursor: 2 })),
    )
    adapter.webSocketClose(socket)
    adapter.webSocketError(socket)
    expect(await Effect.runPromise(Ref.get(cancelled))).toEqual([])
    await adapter.webSocketMessage(
      socket,
      await Effect.runPromise(Wire.encodeCommand({ _tag: "Cancel", runId: "run-1" })),
    )
    expect(await Effect.runPromise(Ref.get(cancelled))).toEqual(["run-1"])

    socket.setMalformedAttachment({ version: 99 })
    await adapter.flushSocket(socket)
    expect(socket.closes.at(-1)).toEqual([1002, "malformed-attachment"])
  })

  it("rejects malformed commands without resetting attachment", async () => {
    const state = new FakeState()
    const socket = new FakeSocket()
    const adapter = makeHibernatingWebSocket({ state, runtime: runtime() })
    adapter.accept(socket)
    await adapter.webSocketMessage(socket, "not-json")
    expect(socket.closes).toEqual([[1002, "malformed-command"]])
    expect(socket.attachment).toEqual({ version: 1, state: "unattached" })
  })

  it("never rewinds an attached same-run cursor", async () => {
    const state = new FakeState()
    const socket = new FakeSocket()
    const adapter = makeHibernatingWebSocket({ state, runtime: runtime(), pageSize: 1, fuel: 1 })
    adapter.accept(socket)
    socket.attachment = { version: 1, state: "attached", runId: "run-1", cursor: 2 }

    await adapter.webSocketMessage(
      socket,
      await Effect.runPromise(Wire.encodeCommand({ _tag: "Attach", runId: "run-1", cursor: 0 })),
    )

    expect(socket.attachment).toEqual({ version: 1, state: "attached", runId: "run-1", cursor: 2 })
    expect(socket.sent).toEqual([])
  })

  it("serializes concurrent flushes for one socket", async () => {
    const state = new FakeState()
    const socket = new FakeSocket()
    const adapter = makeHibernatingWebSocket({ state, runtime: runtime(), pageSize: 1, fuel: 1 })
    adapter.accept(socket)
    socket.attachment = { version: 1, state: "attached", runId: "run-1", cursor: -1 }

    const flushed = await Promise.all([adapter.flushSocket(socket), adapter.flushSocket(socket)])

    expect(flushed.map((result) => result.frames)).toEqual([1, 1])
    expect(socket.sent).toHaveLength(2)
    expect(new Set(socket.sent).size).toBe(2)
    expect(socket.attachment).toMatchObject({ cursor: 1 })
  })

  it("serializes concurrent same-run attachment updates", async () => {
    const state = new FakeState()
    const socket = new FakeSocket()
    const adapter = makeHibernatingWebSocket({ state, runtime: runtime(), pageSize: 1, fuel: 1 })
    adapter.accept(socket)
    socket.attachment = { version: 1, state: "attached", runId: "run-1", cursor: 2 }

    await Promise.all([
      adapter.webSocketMessage(
        socket,
        await Effect.runPromise(Wire.encodeCommand({ _tag: "Attach", runId: "run-1", cursor: 100 })),
      ),
      adapter.webSocketMessage(
        socket,
        await Effect.runPromise(Wire.encodeCommand({ _tag: "Attach", runId: "run-1", cursor: 0 })),
      ),
    ])

    expect(socket.attachment).toEqual({ version: 1, state: "attached", runId: "run-1", cursor: 100 })
  })

  it("serializes attachment advancement with an in-flight flush", async () => {
    const entered = await Effect.runPromise(Deferred.make<void>())
    const release = await Effect.runPromise(Deferred.make<void>())
    const layer = runtimeLayer({
      history: ({ cursor }) =>
        Deferred.succeed(entered, undefined).pipe(
          Effect.andThen(Deferred.await(release)),
          Effect.as([event(0), event(1), event(2)].filter((item) => item.sequence > (cursor ?? -1))),
        ),
    })
    const state = new FakeState()
    const socket = new FakeSocket()
    const flushHandler = makeHibernatingWebSocket({ state, runtime: runtime(layer), pageSize: 1, fuel: 1 })
    const messageHandler = makeHibernatingWebSocket({ state, runtime: runtime(layer), pageSize: 1, fuel: 1 })
    flushHandler.accept(socket)
    socket.attachment = { version: 1, state: "attached", runId: "run-1", cursor: -1 }

    const flushing = flushHandler.flushSocket(socket)
    await Effect.runPromise(Deferred.await(entered))
    const attaching = messageHandler.webSocketMessage(
      socket,
      await Effect.runPromise(Wire.encodeCommand({ _tag: "Attach", runId: "run-1", cursor: 2 })),
    )
    await Effect.runPromise(Deferred.succeed(release, undefined))
    await Promise.all([flushing, attaching])

    expect(socket.attachment).toEqual({ version: 1, state: "attached", runId: "run-1", cursor: 2 })
  })

  it("preserves arrival order for concurrent attachment and cancellation commands", async () => {
    const cancelled = await Effect.runPromise(Ref.make<Array<string>>([]))
    const layer = runtimeLayer({ cancel: ({ runId }) => Ref.update(cancelled, (ids) => [...ids, runId]) })
    const state = new FakeState()
    const socket = new FakeSocket()
    const adapter = makeHibernatingWebSocket({ state, runtime: runtime(layer), pageSize: 1, fuel: 1 })
    adapter.accept(socket)
    const attach = await Effect.runPromise(Wire.encodeCommand({ _tag: "Attach", runId: "run-1", cursor: 2 }))
    const cancel = await Effect.runPromise(Wire.encodeCommand({ _tag: "Cancel", runId: "run-1" }))

    await Promise.all([adapter.webSocketMessage(socket, attach), adapter.webSocketMessage(socket, cancel)])

    expect(await Effect.runPromise(Ref.get(cancelled))).toEqual(["run-1"])
    expect(socket.closes).toEqual([])
  })
})
