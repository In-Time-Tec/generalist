import { Cause, Deferred, Effect, Layer, Queue, Ref, References, Semaphore, Stream } from "effect"
import type { Prompt, Response } from "effect/unstable/ai"
import {
  ConnectionClosed,
  ConnectionLost,
  DeliveryOverflow,
  EventsAlreadyConsumed,
  InvalidCommand,
  LiveProvider,
  UnsupportedCapability,
  type Capabilities,
  type ConnectOptions,
  type Connection,
  type Event,
  type EventFailure,
  type InputPart,
  type OutputPart,
  type Service,
  type TurnAssignment,
  type TurnRequest,
  type TurnResponse,
} from "../../live/index.js"

const defaultCapabilities: Capabilities = {
  input: [
    { modality: "text", mediaTypes: [] },
    { modality: "audio", mediaTypes: ["audio/pcm"] },
    { modality: "image", mediaTypes: ["image/png"] },
  ],
  output: [
    { modality: "text", mediaTypes: [] },
    { modality: "audio", mediaTypes: ["audio/pcm"] },
    { modality: "image", mediaTypes: ["image/png"] },
  ],
  tools: true,
  interruption: true,
}

const unsupported = (available: Capabilities, requested: Capabilities): UnsupportedCapability | undefined => {
  for (const direction of ["input", "output"] as const) {
    for (const requirement of requested[direction]) {
      const offered = available[direction].find(({ modality }) => modality === requirement.modality)
      if (offered === undefined) {
        return UnsupportedCapability.make({ direction, capability: requirement.modality })
      }
      for (const mediaType of requirement.mediaTypes) {
        if (!offered.mediaTypes.includes(mediaType)) {
          return UnsupportedCapability.make({ direction, capability: requirement.modality, mediaType })
        }
      }
    }
  }
  if (requested.tools && !available.tools) {
    return UnsupportedCapability.make({ direction: "operation", capability: "tools" })
  }
  if (requested.interruption && !available.interruption) {
    return UnsupportedCapability.make({ direction: "operation", capability: "interruption" })
  }
  return undefined
}

interface State {
  readonly status: "open" | "closed" | "lost"
  readonly sequence: number
  readonly active: TurnAssignment | undefined
  readonly pendingInput: number
  readonly turnIds: ReadonlySet<string>
  readonly callIds: ReadonlySet<string>
  readonly unresolved: ReadonlyMap<string, { readonly turnId: string; readonly name: string }>
}

/** Deterministic controls for one currently connected test provider. @experimental */
export interface Controls {
  readonly output: (part: OutputPart) => Effect.Effect<void, InvalidCommand | ConnectionClosed>
  readonly toolCall: (
    call: Response.ToolCallPart<string, unknown>,
  ) => Effect.Effect<void, InvalidCommand | ConnectionClosed>
  readonly complete: (response: TurnResponse) => Effect.Effect<void, InvalidCommand | ConnectionClosed>
  readonly lose: (reason: string) => Effect.Effect<void>
}

/** Isolated test Live provider and its deterministic controls. @experimental */
export interface Harness {
  readonly provider: Service
  readonly layer: Layer.Layer<LiveProvider>
  readonly controls: Controls
  readonly inputs: Effect.Effect<ReadonlyArray<InputPart | Prompt.ToolResultPart>>
  readonly requests: Effect.Effect<
    ReadonlyArray<{ readonly request: TurnRequest; readonly input: ReadonlyArray<InputPart | Prompt.ToolResultPart> }>
  >
  readonly resourceCount: Effect.Effect<number>
}

type ActiveControls = Controls
type EventWithoutSequence = Event extends infer Current
  ? Current extends Event
    ? Omit<Current, "sequence">
    : never
  : never

/** Make a provider that performs no model work until its controls emit events. @experimental */
export const make = (capabilities: Capabilities = defaultCapabilities): Effect.Effect<Harness> =>
  Effect.gen(function* () {
    const inputs = yield* Ref.make<ReadonlyArray<InputPart | Prompt.ToolResultPart>>([])
    const requests = yield* Ref.make<
      ReadonlyArray<{ readonly request: TurnRequest; readonly input: ReadonlyArray<InputPart | Prompt.ToolResultPart> }>
    >([])
    const resources = yield* Ref.make(0)
    const connected = yield* Deferred.make<ActiveControls>()
    const latestControls = yield* Ref.make<ActiveControls | undefined>(undefined)
    let connectionCount = 0

    const connect = Effect.fn("LiveTestProvider.connect")(function* (options: ConnectOptions) {
      const missing = unsupported(capabilities, options.capabilities)
      if (missing !== undefined) return yield* missing
      if (!Number.isSafeInteger(options.delivery.capacity) || options.delivery.capacity <= 0) {
        return yield* UnsupportedCapability.make({ direction: "delivery", capability: "positive-capacity" })
      }

      const id = `test-live-${++connectionCount}`
      const state = yield* Ref.make<State>({
        status: "open",
        sequence: 0,
        active: undefined,
        pendingInput: 0,
        turnIds: new Set(),
        callIds: new Set(),
        unresolved: new Map(),
      })
      const consumed = yield* Ref.make(false)
      const buffered = yield* Ref.make<ReadonlyArray<InputPart | Prompt.ToolResultPart>>([])
      const graceful = yield* Deferred.make<void>()
      const lock = yield* Semaphore.make(1)
      const makeQueue =
        options.delivery._tag === "Backpressure"
          ? Queue.bounded<Event, EventFailure | Cause.Done>(options.delivery.capacity)
          : Queue.dropping<Event, EventFailure | Cause.Done>(options.delivery.capacity)
      const queue = yield* Effect.acquireRelease(
        makeQueue.pipe(Effect.tap(() => Ref.update(resources, (n) => n + 1))),
        (current) =>
          Ref.update(state, (value) =>
            value.status === "open" ? ({ ...value, status: "closed" } satisfies State) : value,
          ).pipe(Effect.andThen(Queue.shutdown(current)), Effect.andThen(Ref.update(resources, (n) => n - 1))),
      )

      const closed = () => ConnectionClosed.make({ connectionId: id })
      const withOpen = <A, E>(
        effect: (current: State) => Effect.Effect<A, E>,
      ): Effect.Effect<A, E | ConnectionClosed> =>
        lock.withPermit(
          Effect.flatMap(
            Ref.get(state),
            (current): Effect.Effect<A, E | ConnectionClosed> =>
              current.status === "open" ? effect(current) : Effect.fail(closed()),
          ),
        )
      const withSequence = (event: EventWithoutSequence, sequence: number): Event => {
        switch (event._tag) {
          case "TurnStarted":
          case "Output":
          case "ToolCall":
          case "TurnCompleted":
          case "TurnInterrupted":
            return { ...event, sequence }
          case "Closed":
            return { ...event, sequence }
        }
      }
      const updateOpen = (next: State): Effect.Effect<boolean> =>
        Ref.modify(state, (latest) => (latest.status === "open" ? [true, next] : [false, latest]))
      const offer = (next: State, event: EventWithoutSequence): Effect.Effect<void, ConnectionClosed> =>
        Effect.gen(function* () {
          const previous = yield* Ref.get(state)
          if (previous.status !== "open") return yield* closed()
          const reserved = yield* updateOpen({ ...next, sequence: previous.sequence + 1 })
          if (!reserved) return yield* closed()
          const accepted = yield* Queue.offer(queue, withSequence(event, previous.sequence)).pipe(
            Effect.onInterrupt(() =>
              Ref.update(state, (latest) =>
                latest.status === "open" && latest.sequence === previous.sequence + 1
                  ? ({ ...previous, status: latest.status } satisfies State)
                  : latest,
              ),
            ),
          )
          if (accepted) return
          if (options.delivery._tag === "Fail") {
            yield* Ref.update(state, (latest) =>
              latest.status === "open" ? ({ ...latest, status: "lost" } satisfies State) : latest,
            )
            yield* Queue.fail(queue, DeliveryOverflow.make({ connectionId: id, capacity: options.delivery.capacity }))
            return
          }
          return yield* closed()
        }).pipe(Effect.provideService(References.PreventSchedulerYield, true))

      const active = (current: State): Effect.Effect<TurnAssignment, InvalidCommand> =>
        current.active === undefined
          ? InvalidCommand.make({ connectionId: id, reason: "no active turn" })
          : Effect.succeed(current.active)

      const controls: ActiveControls = {
        output: (part) =>
          withOpen((current) =>
            Effect.gen(function* () {
              const assignment = yield* active(current)
              yield* offer(current, { _tag: "Output", assignment, provisional: true, part })
            }),
          ),
        toolCall: (call) =>
          withOpen((current) =>
            Effect.gen(function* () {
              const assignment = yield* active(current)
              if (current.callIds.has(call.id)) {
                return yield* InvalidCommand.make({ connectionId: id, reason: `duplicate tool call ${call.id}` })
              }
              const callIds = new Set(current.callIds).add(call.id)
              const unresolved = new Map(current.unresolved)
              unresolved.set(call.id, { turnId: assignment.turnId, name: call.name })
              yield* offer({ ...current, callIds, unresolved }, { _tag: "ToolCall", assignment, call })
            }),
          ),
        complete: (response) =>
          withOpen((current) =>
            Effect.gen(function* () {
              const assignment = yield* active(current)
              yield* offer({ ...current, active: undefined }, { _tag: "TurnCompleted", assignment, response })
            }),
          ),
        lose: (reason) =>
          Ref.modify(state, (current) => [
            current.status === "open",
            current.status === "open" ? ({ ...current, status: "lost" } satisfies State) : current,
          ]).pipe(
            Effect.flatMap((changed) =>
              changed ? Queue.fail(queue, ConnectionLost.make({ connectionId: id, reason })) : Effect.void,
            ),
            Effect.asVoid,
            Effect.provideService(References.PreventSchedulerYield, true),
          ),
      }
      yield* Ref.set(latestControls, controls)
      yield* Deferred.succeed(connected, controls)

      const dispose = Ref.update(state, (current) =>
        current.status === "open" ? ({ ...current, status: "closed" } satisfies State) : current,
      ).pipe(Effect.andThen(Queue.shutdown(queue)), Effect.provideService(References.PreventSchedulerYield, true))

      const connection: Connection = {
        id,
        capabilities: options.capabilities,
        events: Stream.unwrap(
          Ref.modify<boolean, Stream.Stream<Event, EventFailure>>(consumed, (started) => [
            started
              ? Stream.fail(EventsAlreadyConsumed.make({ connectionId: id }))
              : Stream.concat(
                  Stream.fromQueue(queue),
                  Stream.fromEffect(
                    Deferred.await(graceful).pipe(
                      Effect.andThen(Ref.get(state)),
                      Effect.map((current): Event => ({ _tag: "Closed", sequence: current.sequence })),
                    ),
                  ),
                ).pipe(Stream.ensuring(dispose)),
            true,
          ]),
        ),
        send: (part) =>
          withOpen((current) =>
            Effect.gen(function* () {
              let modality: "text" | "audio" | "image" = "text"
              if (part.type === "file") modality = part.mediaType.startsWith("audio/") ? "audio" : "image"
              const supported = options.capabilities.input.find((item) => item.modality === modality)
              if (supported === undefined || (part.type === "file" && !supported.mediaTypes.includes(part.mediaType))) {
                return yield* UnsupportedCapability.make({
                  direction: "input",
                  capability: modality,
                  ...(part.type === "file" ? { mediaType: part.mediaType } : undefined),
                })
              }
              yield* Effect.uninterruptible(
                Effect.gen(function* () {
                  const accepted = yield* updateOpen({
                    ...current,
                    pendingInput: current.pendingInput + 1,
                  })
                  if (!accepted) return yield* closed()
                  yield* Ref.update(inputs, (currentInputs) => [...currentInputs, part])
                  yield* Ref.update(buffered, (currentInput) => [...currentInput, part])
                }),
              )
            }),
          ),
        commitInput: (request) =>
          withOpen((current) =>
            Effect.gen(function* () {
              if (current.pendingInput === 0 && request.context.content.length === 0) {
                return yield* InvalidCommand.make({ connectionId: id, reason: "request context and input are empty" })
              }
              if (current.active !== undefined) {
                return yield* InvalidCommand.make({
                  connectionId: id,
                  reason: `turn ${current.active.turnId} is active`,
                })
              }
              if (current.unresolved.size > 0) {
                return yield* InvalidCommand.make({ connectionId: id, reason: "tool results are pending" })
              }
              if (!options.capabilities.tools && Object.keys(request.toolkit.tools).length > 0) {
                return yield* UnsupportedCapability.make({ direction: "operation", capability: "tools" })
              }
              const assignment = request.assignment
              if (current.turnIds.has(assignment.turnId)) {
                return yield* InvalidCommand.make({
                  connectionId: id,
                  reason: `turn ${assignment.turnId} was already used`,
                })
              }
              const turnIds = new Set(current.turnIds).add(assignment.turnId)
              yield* offer(
                { ...current, active: assignment, pendingInput: 0, turnIds },
                { _tag: "TurnStarted", assignment },
              )
              yield* Effect.uninterruptible(
                Effect.gen(function* () {
                  const input = yield* Ref.getAndSet(buffered, [])
                  yield* Ref.update(requests, (currentRequests) => [...currentRequests, { request, input }])
                }),
              )
            }),
          ).pipe(Effect.provideService(References.PreventSchedulerYield, true)),
        sendToolResult: (result) =>
          withOpen((current) =>
            Effect.gen(function* () {
              const call = current.unresolved.get(result.id)
              if (call === undefined || call.name !== result.name) {
                return yield* InvalidCommand.make({ connectionId: id, reason: `unknown tool result ${result.id}` })
              }
              const unresolved = new Map(current.unresolved)
              unresolved.delete(result.id)
              yield* Effect.uninterruptible(
                Effect.gen(function* () {
                  const accepted = yield* updateOpen({
                    ...current,
                    pendingInput: current.pendingInput + 1,
                    unresolved,
                  })
                  if (!accepted) return yield* closed()
                  yield* Ref.update(inputs, (currentInputs) => [...currentInputs, result])
                  yield* Ref.update(buffered, (currentInput) => [...currentInput, result])
                }),
              )
            }),
          ),
        interrupt: (turnId) =>
          withOpen((current) =>
            Effect.gen(function* () {
              if (!options.capabilities.interruption) {
                return yield* UnsupportedCapability.make({ direction: "operation", capability: "interruption" })
              }
              const assignment = yield* active(current)
              if (assignment.turnId !== turnId) {
                return yield* InvalidCommand.make({ connectionId: id, reason: `turn ${turnId} is not active` })
              }
              const unresolved = new Map(
                [...current.unresolved].filter(([, call]) => call.turnId !== assignment.turnId),
              )
              yield* offer({ ...current, active: undefined, unresolved }, { _tag: "TurnInterrupted", assignment })
            }),
          ),
        close: Ref.modify(state, (current): [boolean, State] => {
          if (current.status !== "open") return [false, current]
          return [true, { ...current, status: "closed" }]
        }).pipe(
          Effect.flatMap((changed) =>
            !changed
              ? Effect.void
              : Deferred.succeed(graceful, undefined).pipe(Effect.andThen(Queue.end(queue)), Effect.asVoid),
          ),
          Effect.provideService(References.PreventSchedulerYield, true),
        ),
      }
      return connection
    })

    const provider: Service = { capabilities, connect }
    const currentControls = Ref.get(latestControls).pipe(
      Effect.flatMap((current) => (current === undefined ? Deferred.await(connected) : Effect.succeed(current))),
    )
    const controls: Controls = {
      output: (part) => currentControls.pipe(Effect.flatMap((current) => current.output(part))),
      toolCall: (call) => currentControls.pipe(Effect.flatMap((current) => current.toolCall(call))),
      complete: (response) => currentControls.pipe(Effect.flatMap((current) => current.complete(response))),
      lose: (reason) => currentControls.pipe(Effect.flatMap((current) => current.lose(reason))),
    }
    return {
      provider,
      layer: Layer.succeed(LiveProvider, provider),
      controls,
      inputs: Ref.get(inputs),
      requests: Ref.get(requests),
      resourceCount: Ref.get(resources),
    }
  })
