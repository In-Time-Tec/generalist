/* oxlint-disable effecttsgo/async-function, no-await-in-loop */
import { Effect, Option, Schema } from "effect"
import { Cursor, Runtime } from "generalist/runtime"
import { page } from "generalist/transport/replay"
import { decodeCommand } from "generalist/transport/wire"

const Attachment = Schema.Union([
  Schema.Struct({ version: Schema.Literal(1), state: Schema.Literal("unattached") }),
  Schema.Struct({
    version: Schema.Literal(1),
    state: Schema.Literal("attached"),
    runId: Schema.String,
    cursor: Cursor.Cursor,
  }),
])

/** @experimental Persisted hibernating socket attachment. */
export type Attachment = typeof Attachment.Type

/** @experimental Narrow Cloudflare hibernating WebSocket surface. */
export interface Socket {
  readonly send: (message: string) => void
  readonly close: (code?: number, reason?: string) => void
  readonly serializeAttachment: (attachment: Attachment) => void
  readonly deserializeAttachment: () => Schema.Json
}

/** @experimental Narrow Cloudflare Durable Object hibernation surface. */
export interface State {
  readonly acceptWebSocket: (socket: Socket, tags?: ReadonlyArray<string>) => void
  readonly getWebSockets: (tag?: string) => ReadonlyArray<Socket>
}

/** @experimental Bounded adapter configuration. */
export interface Options {
  readonly state: State
  readonly runtime: Runtime.Service
  readonly pageSize?: number
  readonly fuel?: number
}

/** @experimental Result of a host-invoked bounded flush. */
export interface FlushResult {
  readonly sockets: number
  readonly frames: number
  readonly hasMore: boolean
}

const tag = "generalist:replay:v1"
const maxAttachmentBytes = 2_048
const textEncoder = new TextEncoder()
const operations = new WeakMap<Socket, Promise<unknown>>()

const decodeAttachment = (socket: Socket): Option.Option<Attachment> =>
  Schema.decodeUnknownOption(Attachment)(socket.deserializeAttachment())

const persist = (socket: Socket, attachment: Attachment): boolean => {
  if (textEncoder.encode(JSON.stringify(attachment)).byteLength > maxAttachmentBytes) return false
  socket.serializeAttachment(attachment)
  return true
}

const close = (socket: Socket, code: number, reason: string): void => socket.close(code, reason)

/** @experimental Construct native handlers with no resident subscription, fiber, or timer. */
export const make = (options: Options) => {
  const pageSize = Math.min(Math.max(Math.trunc(options.pageSize ?? 64), 1), 1_000)
  const fuel = Math.min(Math.max(Math.trunc(options.fuel ?? 4), 1), 32)
  const runPage = (runId: string, cursor: Cursor.Cursor) =>
    Effect.runPromise(
      page({ runId, cursor, limit: pageSize }).pipe(Effect.provideService(Runtime.Runtime, options.runtime)),
    )

  const drainSocket = async (socket: Socket): Promise<FlushResult> => {
    const decoded = decodeAttachment(socket)
    if (Option.isNone(decoded)) {
      close(socket, 1002, "malformed-attachment")
      return { sockets: 1, frames: 0, hasMore: false }
    }
    let attachment = decoded.value
    if (attachment.state === "unattached") return { sockets: 1, frames: 0, hasMore: false }
    let frames = 0
    let hasMore = false
    for (let pageFuel = 0; pageFuel < fuel; pageFuel++) {
      const loaded = await runPage(attachment.runId, attachment.cursor)
      hasMore = loaded.hasMore
      for (const frame of loaded.frames) {
        if (frame.sequence <= attachment.cursor) {
          close(socket, 1011, "non-monotonic-replay")
          return { sockets: 1, frames, hasMore: false }
        }
        socket.send(frame.data)
        attachment = { version: 1, state: "attached", runId: attachment.runId, cursor: frame.sequence }
        if (!persist(socket, attachment)) {
          close(socket, 1009, "attachment-too-large")
          return { sockets: 1, frames: frames + 1, hasMore: false }
        }
        frames++
      }
      if (!loaded.hasMore || loaded.frames.length === 0) break
    }
    return { sockets: 1, frames, hasMore }
  }

  const enqueue = <A>(socket: Socket, operation: () => Promise<A>): Promise<A> => {
    const previous = operations.get(socket)
    const current = (previous === undefined ? Promise.resolve() : previous.catch(() => undefined)).then(operation)
    operations.set(socket, current)
    const clear = () => {
      if (operations.get(socket) === current) operations.delete(socket)
    }
    void current.then(clear, clear)
    return current
  }

  const flushSocket = (socket: Socket): Promise<FlushResult> => enqueue(socket, () => drainSocket(socket))

  const flush = async (runId?: string): Promise<FlushResult> => {
    let frames = 0
    let sockets = 0
    let hasMore = false
    for (const socket of options.state.getWebSockets(tag)) {
      const decoded = decodeAttachment(socket)
      if (
        Option.isSome(decoded) &&
        decoded.value.state === "attached" &&
        runId !== undefined &&
        decoded.value.runId !== runId
      )
        continue
      const result = await flushSocket(socket)
      frames += result.frames
      sockets += result.sockets
      hasMore ||= result.hasMore
    }
    return { sockets, frames, hasMore }
  }

  return {
    accept(socket: Socket): void {
      const attachment: Attachment = { version: 1, state: "unattached" }
      if (!persist(socket, attachment)) return close(socket, 1009, "attachment-too-large")
      options.state.acceptWebSocket(socket, [tag])
    },
    async webSocketMessage(socket: Socket, message: string | ArrayBuffer): Promise<void> {
      if (message instanceof ArrayBuffer) return close(socket, 1003, "binary-command")
      await enqueue(socket, async () => {
        const command = await Effect.runPromiseExit(decodeCommand(message))
        if (command._tag === "Failure") return close(socket, 1002, "malformed-command")
        const decodedAttachment = decodeAttachment(socket)
        if (Option.isNone(decodedAttachment)) return close(socket, 1002, "malformed-attachment")
        if (command.value._tag === "Attach") {
          if (decodedAttachment.value.state === "attached" && decodedAttachment.value.runId !== command.value.runId) {
            return close(socket, 1008, "run-mismatch")
          }
          const requestedCursor = command.value.cursor ?? Cursor.origin
          const cursor =
            decodedAttachment.value.state === "attached"
              ? Math.max(decodedAttachment.value.cursor, requestedCursor)
              : requestedCursor
          const attachment: Attachment = {
            version: 1,
            state: "attached",
            runId: command.value.runId,
            cursor,
          }
          if (!persist(socket, attachment)) return close(socket, 1009, "attachment-too-large")
          await drainSocket(socket)
          return
        }
        if (decodedAttachment.value.state !== "attached") return close(socket, 1008, "not-attached")
        if (decodedAttachment.value.runId !== command.value.runId) return close(socket, 1008, "run-mismatch")
        await Effect.runPromise(
          options.runtime.cancel(
            command.value.reason === undefined
              ? { runId: command.value.runId }
              : { runId: command.value.runId, reason: command.value.reason },
          ),
        )
      })
    },
    webSocketClose(_socket: Socket): void {},
    webSocketError(_socket: Socket): void {},
    flush,
    flushSocket,
  }
}
