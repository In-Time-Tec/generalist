import { describe, expect, it } from "@effect/vitest"
import { Effect, Ref } from "effect"
import { Wire } from "tenetkit/transport"
import {
  makeHibernatingWebSocket,
  type HibernatingWebSocket,
  type HibernatingWebSocketState,
} from "../src/durable-objects/index.js"
import { runtimeLayer } from "../../tenetkit/test/transport/helpers.js"
import { Runtime } from "tenetkit/runtime"

class FakeSocket implements HibernatingWebSocket {
  attachment: unknown
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
  serializeAttachment(attachment: unknown): void {
    this.attachment = structuredClone(attachment)
  }
  deserializeAttachment(): unknown {
    return structuredClone(this.attachment)
  }
}

class FakeState implements HibernatingWebSocketState {
  readonly sockets: Array<FakeSocket> = []
  acceptWebSocket(socket: HibernatingWebSocket): void {
    this.sockets.push(socket as FakeSocket)
  }
  getWebSockets(): ReadonlyArray<HibernatingWebSocket> {
    return this.sockets
  }
}

const runtime = (layer = runtimeLayer()): Runtime.Interface =>
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

    socket.attachment = { version: 99 }
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
})
