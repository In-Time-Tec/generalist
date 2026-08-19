/* oxlint-disable effecttsgo/async-function, no-await-in-loop */
import { Effect, Option, Schema } from "effect"
import { Cursor, origin } from "tenetkit/runtime/driver/cursor"
import { Runtime, type Interface } from "tenetkit/runtime/driver/runtime"
import { page } from "tenetkit/transport/replay"
import { decodeCommand } from "tenetkit/transport/wire"

const Attachment = Schema.Union([
  Schema.Struct({ version: Schema.Literal(1), state: Schema.Literal("unattached") }),
  Schema.Struct({
    version: Schema.Literal(1),
    state: Schema.Literal("attached"),
    runId: Schema.String,
    cursor: Cursor,
  }),
])

/** @experimental Persisted hibernating socket attachment. */
export type Attachment = typeof Attachment.Type

/** @experimental Narrow Cloudflare hibernating WebSocket surface. */
export interface HibernatingWebSocket {
  readonly send: (message: string) => void
  readonly close: (code?: number, reason?: string) => void
  readonly serializeAttachment: (attachment: unknown) => void
  readonly deserializeAttachment: () => unknown
}

/** @experimental Narrow Cloudflare Durable Object hibernation surface. */
export interface HibernatingWebSocketState {
  readonly acceptWebSocket: (socket: HibernatingWebSocket, tags?: ReadonlyArray<string>) => void
  readonly getWebSockets: (tag?: string) => ReadonlyArray<HibernatingWebSocket>
}

/** @experimental Bounded adapter configuration. */
export interface HibernatingWebSocketOptions {
  readonly state: HibernatingWebSocketState
  readonly runtime: Interface
  readonly pageSize?: number
  readonly fuel?: number
}

/** @experimental Result of a host-invoked bounded flush. */
export interface FlushResult {
  readonly sockets: number
  readonly frames: number
  readonly hasMore: boolean
}

const tag = "tenetkit:replay:v1"
const maxAttachmentBytes = 2_048
const textEncoder = new TextEncoder()

const decodeAttachment = (socket: HibernatingWebSocket): Option.Option<Attachment> =>
  Schema.decodeUnknownOption(Attachment)(socket.deserializeAttachment())

const persist = (socket: HibernatingWebSocket, attachment: Attachment): boolean => {
  if (textEncoder.encode(JSON.stringify(attachment)).byteLength > maxAttachmentBytes) return false
  socket.serializeAttachment(attachment)
  return true
}

const close = (socket: HibernatingWebSocket, code: number, reason: string): void => socket.close(code, reason)

/** @experimental Construct native handlers with no resident subscription, fiber, or timer. */
export const makeHibernatingWebSocket = (options: HibernatingWebSocketOptions) => {
  const pageSize = Math.min(Math.max(Math.trunc(options.pageSize ?? 64), 1), 1_000)
  const fuel = Math.min(Math.max(Math.trunc(options.fuel ?? 4), 1), 32)
  const flushing = new WeakMap<HibernatingWebSocket, Promise<FlushResult>>()
  const runPage = (runId: string, cursor: Cursor) =>
    Effect.runPromise(page({ runId, cursor, limit: pageSize }).pipe(Effect.provideService(Runtime, options.runtime)))

  const drainSocket = async (socket: HibernatingWebSocket): Promise<FlushResult> => {
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
        attachment = { ...attachment, cursor: frame.sequence }
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

  const flushSocket = (socket: HibernatingWebSocket): Promise<FlushResult> => {
    const previous = flushing.get(socket)
    const current = (previous === undefined ? Promise.resolve() : previous.catch(() => undefined)).then(() =>
      drainSocket(socket),
    )
    flushing.set(socket, current)
    const clear = () => {
      if (flushing.get(socket) === current) flushing.delete(socket)
    }
    void current.then(clear, clear)
    return current
  }

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
    accept(socket: HibernatingWebSocket): void {
      const attachment: Attachment = { version: 1, state: "unattached" }
      if (!persist(socket, attachment)) return close(socket, 1009, "attachment-too-large")
      options.state.acceptWebSocket(socket, [tag])
    },
    async webSocketMessage(socket: HibernatingWebSocket, message: string | ArrayBuffer): Promise<void> {
      if (typeof message !== "string") return close(socket, 1003, "binary-command")
      const decodedAttachment = decodeAttachment(socket)
      if (Option.isNone(decodedAttachment)) return close(socket, 1002, "malformed-attachment")
      const command = await Effect.runPromiseExit(decodeCommand(message))
      if (command._tag === "Failure") return close(socket, 1002, "malformed-command")
      if (command.value._tag === "Attach") {
        if (decodedAttachment.value.state === "attached" && decodedAttachment.value.runId !== command.value.runId) {
          return close(socket, 1008, "run-mismatch")
        }
        const requestedCursor = command.value.cursor ?? origin
        const attachment: Attachment = {
          version: 1,
          state: "attached",
          runId: command.value.runId,
          cursor:
            decodedAttachment.value.state === "attached"
              ? Math.max(decodedAttachment.value.cursor, requestedCursor)
              : requestedCursor,
        }
        if (!persist(socket, attachment)) return close(socket, 1009, "attachment-too-large")
        await flushSocket(socket)
        return
      }
      if (decodedAttachment.value.state !== "attached") return close(socket, 1008, "not-attached")
      if (decodedAttachment.value.runId !== command.value.runId) return close(socket, 1008, "run-mismatch")
      await Effect.runPromise(
        options.runtime.cancel({
          runId: command.value.runId,
          ...(command.value.reason === undefined ? {} : { reason: command.value.reason }),
        }),
      )
    },
    webSocketClose(_socket: HibernatingWebSocket): void {},
    webSocketError(_socket: HibernatingWebSocket): void {},
    flush,
    flushSocket,
  }
}
