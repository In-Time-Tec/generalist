import { describe, expect, it } from "@effect/vitest"
import { Effect, Exit, Fiber, Ref, Schema, Scope, Stream } from "effect"
import { Prompt, Response, Tool, Toolkit } from "effect/unstable/ai"
import {
  inputFilePart,
  type Capabilities,
  type ConnectOptions,
  type Connection,
  type Event,
  type InputPart,
  type OutputPart,
  type TurnAssignment,
  type TurnRequest,
  type TurnResponse,
} from "../../live/index.js"
import type { Harness } from "./provider.js"

/** Baseline capabilities exercised by Live provider conformance. @experimental */
export const capabilities: Capabilities = {
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

const options = (
  requirements: Capabilities,
  capacity = 8,
  delivery: "Backpressure" | "Fail" = "Backpressure",
): ConnectOptions => ({
  capabilities: requirements,
  delivery: { _tag: delivery, capacity },
})

const request = (
  assignment: TurnAssignment,
  context = Prompt.empty,
  toolkit: Toolkit.Any = Toolkit.empty,
): TurnRequest => ({
  assignment,
  context,
  toolkit,
})

/** Fresh instrumented provider required by the reusable Live conformance suite. @experimental */
export interface ConformanceOptions<E = never> {
  readonly name: string
  readonly make: Effect.Effect<Harness, E>
  readonly capabilities?: Capabilities
  readonly input?: ReadonlyArray<InputPart>
  readonly output?: ReadonlyArray<OutputPart>
  readonly response?: TurnResponse
}

const use = <A, E, MakeError>(
  make: Effect.Effect<Harness, MakeError>,
  body: (harness: Harness, connection: Connection) => Effect.Effect<A, E, Scope.Scope>,
  connectOptions: ConnectOptions,
): Effect.Effect<
  A,
  E | MakeError | import("../../live/index.js").ConnectionFailed | import("../../live/index.js").UnsupportedCapability
> =>
  Effect.scoped(
    Effect.gen(function* () {
      const harness = yield* make
      const connection = yield* harness.provider.connect(connectOptions)
      return yield* body(harness, connection)
    }),
  )

/** Register provider-neutral scoped Live conformance tests. @experimental */
export const register = <E>(configuration: ConformanceOptions<E>): void => {
  const requirements = configuration.capabilities ?? capabilities
  const input = configuration.input ?? [
    Prompt.textPart({ text: "inspect" }),
    inputFilePart({ mediaType: "audio/pcm", data: new Uint8Array([1, 2]) }),
    inputFilePart({ mediaType: "image/png", data: new Uint8Array([3, 4]) }),
  ]
  const output = configuration.output ?? [
    Response.makePart("text-delta", { id: "text-1", delta: "ready" }),
    Response.makePart("file", { mediaType: "audio/pcm", data: new Uint8Array([5]) }),
    Response.makePart("file", { mediaType: "image/png", data: new Uint8Array([6]) }),
  ]
  const response = configuration.response ?? [Response.makePart("text", { text: "ready" })]
  const activeToolkit = requirements.tools
    ? Toolkit.make(
        Tool.make("lookup", {
          parameters: Schema.Struct({ id: Schema.Int }),
          success: Schema.Struct({ found: Schema.Boolean }),
        }),
      )
    : Toolkit.empty
  if (input.length === 0 || output.length === 0)
    throw new Error("Live conformance requires representative input and output")

  describe(`Live provider: ${configuration.name}`, () => {
    it.effect("negotiates modalities and rejects an unsupported media type", () =>
      Effect.scoped(
        Effect.gen(function* () {
          const harness = yield* configuration.make
          const failure = yield* harness.provider
            .connect({
              ...options(requirements),
              capabilities: {
                ...requirements,
                input: [{ modality: requirements.input[0]!.modality, mediaTypes: ["application/x-unsupported"] }],
              },
            })
            .pipe(Effect.flip)
          expect(failure).toMatchObject({
            _tag: "@generalist/live/UnsupportedCapability",
            direction: "input",
            capability: requirements.input[0]!.modality,
            mediaType: "application/x-unsupported",
          })
        }),
      ),
    )

    it.effect("orders provisional multimodal output before one complete semantic turn", () =>
      use(
        configuration.make,
        (harness, connection) =>
          Effect.gen(function* () {
            const assignment = { turnId: "turn-1", assignmentId: "operation-7" }
            const observed = yield* Stream.runCollect(connection.events).pipe(
              Effect.forkChild({ startImmediately: true }),
            )
            for (const part of input) yield* connection.send(part)
            const context = Prompt.fromMessages([
              Prompt.makeMessage("system", { content: "authoritative instructions" }),
              Prompt.makeMessage("assistant", {
                content: [
                  Prompt.makePart("tool-call", {
                    id: "historical-call",
                    name: "lookup",
                    params: { id: 0 },
                    providerExecuted: false,
                  }),
                ],
              }),
              Prompt.makeMessage("tool", {
                content: [
                  Prompt.makePart("tool-result", {
                    id: "historical-call",
                    name: "lookup",
                    isFailure: false,
                    result: { found: false },
                    providerExecuted: false,
                  }),
                ],
              }),
            ])
            const firstRequest = request(assignment, context, activeToolkit)
            yield* connection.commitInput(firstRequest)
            for (const part of output) yield* harness.controls.output(part)
            const call = requirements.tools
              ? Response.toolCallPart({
                  id: "call-1",
                  name: "lookup",
                  params: { id: 1 },
                  providerExecuted: false,
                })
              : undefined
            if (call !== undefined) yield* harness.controls.toolCall(call)
            yield* harness.controls.complete(call === undefined ? response : [...response, call])
            if (call !== undefined) {
              yield* connection.sendToolResult(
                Prompt.toolResultPart({
                  id: "call-1",
                  name: "lookup",
                  isFailure: false,
                  result: { found: true },
                  providerExecuted: false,
                }),
              )
              yield* connection.commitInput(
                request({ turnId: "turn-2", assignmentId: "operation-8" }, Prompt.empty, Toolkit.empty),
              )
              yield* harness.controls.complete(response)
            }
            yield* connection.close
            const events = Array.from(yield* Fiber.join(observed))
            const firstResponse = call === undefined ? response : [...response, call]
            const expected: Array<Event> = [
              { _tag: "TurnStarted", sequence: 0, assignment },
              ...output.map(
                (part, index): Event => ({
                  _tag: "Output",
                  sequence: index + 1,
                  assignment,
                  provisional: true,
                  part,
                }),
              ),
            ]
            if (call !== undefined) {
              expected.push({
                _tag: "ToolCall",
                sequence: expected.length,
                assignment,
                call,
              })
            }
            expected.push({
              _tag: "TurnCompleted",
              sequence: expected.length,
              assignment,
              response: firstResponse,
            })
            if (call !== undefined) {
              const continuation = { turnId: "turn-2", assignmentId: "operation-8" }
              expected.push({ _tag: "TurnStarted", sequence: expected.length, assignment: continuation })
              expected.push({
                _tag: "TurnCompleted",
                sequence: expected.length,
                assignment: continuation,
                response,
              })
            }
            expected.push({ _tag: "Closed", sequence: expected.length })
            expect(events).toEqual(expected)
            expect(yield* harness.inputs).toHaveLength(input.length + (call === undefined ? 0 : 1))
            const requests = yield* harness.requests
            expect(requests[0]).toEqual({ request: firstRequest, input })
            if (call !== undefined) {
              expect(requests[1]?.request.toolkit).toBe(Toolkit.empty)
              expect(requests[1]?.request.context).toBe(Prompt.empty)
              expect(requests[1]?.input).toHaveLength(1)
            }
          }),
        options(requirements),
      ),
    )

    it.effect("accepts canonical history on a fresh connection only through an explicit turn request", () =>
      use(
        configuration.make,
        (harness, connection) =>
          Effect.gen(function* () {
            const context = Prompt.fromMessages([
              Prompt.makeMessage("system", { content: "fresh connection instructions" }),
              Prompt.makeMessage("assistant", {
                content: [
                  Prompt.makePart("tool-call", {
                    id: "prior-call",
                    name: "lookup",
                    params: { id: 1 },
                    providerExecuted: false,
                  }),
                ],
              }),
              Prompt.makeMessage("tool", {
                content: [
                  Prompt.makePart("tool-result", {
                    id: "prior-call",
                    name: "lookup",
                    isFailure: false,
                    result: { found: true },
                    providerExecuted: false,
                  }),
                ],
              }),
            ])
            const observed = yield* Stream.runCollect(connection.events).pipe(
              Effect.forkChild({ startImmediately: true }),
            )
            expect(observed.pollUnsafe()).toBeUndefined()
            const turnRequest = request({ turnId: "turn-context-only" }, context, Toolkit.empty)
            yield* connection.commitInput(turnRequest)
            yield* harness.controls.complete(response)
            yield* connection.close
            expect(Array.from(yield* Fiber.join(observed)).map(({ _tag }) => _tag)).toEqual([
              "TurnStarted",
              "TurnCompleted",
              "Closed",
            ])
            expect(yield* harness.requests).toEqual([{ request: turnRequest, input: [] }])
          }),
        options(requirements),
      ),
    )

    it.effect("targets sequential fresh connections through one provider layer", () =>
      Effect.gen(function* () {
        const harness = yield* configuration.make
        const run = (turnId: string, text: string) =>
          Effect.scoped(
            Effect.gen(function* () {
              const connection = yield* harness.provider.connect(options(requirements))
              const events = yield* Stream.runCollect(connection.events).pipe(
                Effect.forkChild({ startImmediately: true }),
              )
              const context = Prompt.fromMessages([
                Prompt.makeMessage("system", { content: text }),
                Prompt.makeMessage("user", { content: [Prompt.makePart("text", { text: "continue" })] }),
              ])
              yield* connection.commitInput(request({ turnId }, context, Toolkit.empty))
              yield* harness.controls.complete(response)
              yield* connection.close
              return Array.from(yield* Fiber.join(events)).map(({ _tag }) => _tag)
            }),
          )
        expect(yield* run("fresh-1", "first history")).toEqual(["TurnStarted", "TurnCompleted", "Closed"])
        expect(yield* run("fresh-2", "replacement history")).toEqual(["TurnStarted", "TurnCompleted", "Closed"])
        const requests = yield* harness.requests
        expect(requests.map(({ request: current }) => current.assignment.turnId)).toEqual(["fresh-1", "fresh-2"])
        expect(requests.every(({ input: current }) => current.length === 0)).toBe(true)
      }),
    )

    if (requirements.interruption)
      it.effect("interrupts only the named live turn and rejects reused identities", () =>
        use(
          configuration.make,
          (harness, connection) =>
            Effect.gen(function* () {
              const events = yield* Stream.runCollect(connection.events).pipe(
                Effect.forkChild({ startImmediately: true }),
              )
              yield* connection.send(input[0]!)
              yield* connection.commitInput(request({ turnId: "turn-current" }, Prompt.empty, Toolkit.empty))
              if (requirements.tools)
                yield* harness.controls.toolCall(
                  Response.toolCallPart({
                    id: "call-interrupted",
                    name: "lookup",
                    params: {},
                    providerExecuted: false,
                  }),
                )
              const stale = yield* connection.interrupt("turn-stale").pipe(Effect.flip)
              expect(stale).toMatchObject({ _tag: "@generalist/live/InvalidCommand" })
              yield* connection.interrupt("turn-current")
              if (requirements.tools) {
                const late = yield* connection
                  .sendToolResult(
                    Prompt.toolResultPart({
                      id: "call-interrupted",
                      name: "lookup",
                      isFailure: false,
                      result: null,
                      providerExecuted: false,
                    }),
                  )
                  .pipe(Effect.flip)
                expect(late).toMatchObject({ _tag: "@generalist/live/InvalidCommand" })
              }
              yield* connection.send(input[0]!)
              expect(
                yield* connection
                  .commitInput(request({ turnId: "turn-current" }, Prompt.empty, Toolkit.empty))
                  .pipe(Effect.flip),
              ).toMatchObject({
                _tag: "@generalist/live/InvalidCommand",
              })
              yield* connection.commitInput(request({ turnId: "turn-successor" }, Prompt.empty, Toolkit.empty))
              expect(yield* connection.interrupt("turn-current").pipe(Effect.flip)).toMatchObject({
                _tag: "@generalist/live/InvalidCommand",
              })
              yield* connection.interrupt("turn-successor")
              yield* connection.close
              expect(Array.from(yield* Fiber.join(events)).map(({ _tag }) => _tag)).toEqual([
                "TurnStarted",
                ...(requirements.tools ? (["ToolCall"] as const) : []),
                "TurnInterrupted",
                "TurnStarted",
                "TurnInterrupted",
                "Closed",
              ])
            }),
          options(requirements),
        ),
      )

    if (requirements.interruption)
      it.effect("rolls back a canceled blocked command while the connection stays open", () =>
        use(
          configuration.make,
          (_harness, connection) =>
            Effect.gen(function* () {
              yield* connection.send(input[0]!)
              yield* connection.commitInput(request({ turnId: "turn-canceled-admission" }, Prompt.empty, Toolkit.empty))
              const canceled = yield* connection
                .interrupt("turn-canceled-admission")
                .pipe(Effect.forkChild({ startImmediately: true }))
              expect(canceled.pollUnsafe()).toBeUndefined()
              yield* Fiber.interrupt(canceled)
              const events = yield* Stream.runCollect(connection.events).pipe(
                Effect.forkChild({ startImmediately: true }),
              )
              yield* connection.interrupt("turn-canceled-admission")
              yield* connection.close
              expect(Array.from(yield* Fiber.join(events)).map(({ sequence }) => sequence)).toEqual([0, 1, 2])
            }),
          options(requirements, 1),
        ),
      )

    if (requirements.interruption)
      it.effect("keeps contiguous ordering when close races blocked-command cancellation", () =>
        use(
          configuration.make,
          (_harness, connection) =>
            Effect.gen(function* () {
              yield* connection.send(input[0]!)
              yield* connection.commitInput(request({ turnId: "turn-canceled-admission" }, Prompt.empty, Toolkit.empty))
              const blocked = yield* connection
                .interrupt("turn-canceled-admission")
                .pipe(Effect.forkChild({ startImmediately: true }))
              expect(blocked.pollUnsafe()).toBeUndefined()
              const closing = yield* connection.close.pipe(Effect.forkChild({ startImmediately: true }))
              const canceling = yield* Fiber.interrupt(blocked).pipe(Effect.forkChild({ startImmediately: true }))
              const collecting = yield* Stream.runCollect(connection.events).pipe(
                Effect.forkChild({ startImmediately: true }),
              )
              yield* Fiber.join(canceling)
              yield* Fiber.join(closing)
              const events = Array.from(yield* Fiber.join(collecting))
              expect(events.map(({ sequence }) => sequence)).toEqual(events.map((_, index) => index))
              expect(events[0]).toMatchObject({ _tag: "TurnStarted" })
              expect(events.at(-1)).toMatchObject({ _tag: "Closed" })
            }),
          options(requirements, 1),
        ),
      )

    it.effect("preserves the accepted prefix and fails typed on connection loss", () =>
      use(
        configuration.make,
        (harness, connection) =>
          Effect.gen(function* () {
            const observed = yield* Ref.make<ReadonlyArray<Event>>([])
            const failure = yield* connection.events.pipe(
              Stream.tap((event) => Ref.update(observed, (events) => [...events, event])),
              Stream.runDrain,
              Effect.flip,
              Effect.forkChild({ startImmediately: true }),
            )
            yield* connection.send(input[0]!)
            yield* connection.commitInput(request({ turnId: "turn-loss" }, Prompt.empty, Toolkit.empty))
            yield* harness.controls.lose("socket ended")
            expect(yield* Fiber.join(failure)).toMatchObject({ _tag: "@generalist/live/ConnectionLost" })
            expect(yield* Ref.get(observed)).toEqual([
              {
                _tag: "TurnStarted",
                sequence: 0,
                assignment: { turnId: "turn-loss" },
              },
            ])
          }),
        options(requirements),
      ),
    )

    it.effect("fails bounded delivery without dropping an accepted prefix", () =>
      use(
        configuration.make,
        (harness, connection) =>
          Effect.gen(function* () {
            const observed = yield* Ref.make<ReadonlyArray<Event>>([])
            yield* connection.send(input[0]!)
            yield* connection.commitInput(request({ turnId: "turn-overflow" }, Prompt.empty, Toolkit.empty))
            yield* harness.controls.output(output[0]!)
            const failure = yield* connection.events.pipe(
              Stream.tap((event) => Ref.update(observed, (events) => [...events, event])),
              Stream.runDrain,
              Effect.flip,
            )
            expect(failure).toMatchObject({
              _tag: "@generalist/live/DeliveryOverflow",
              capacity: 1,
            })
            expect(yield* Ref.get(observed)).toEqual([
              {
                _tag: "TurnStarted",
                sequence: 0,
                assignment: { turnId: "turn-overflow" },
              },
            ])
          }),
        options(requirements, 1, "Fail"),
      ),
    )

    it.effect("backpressures the producer at the configured event capacity", () =>
      use(
        configuration.make,
        (harness, connection) =>
          Effect.gen(function* () {
            yield* connection.send(input[0]!)
            yield* connection.commitInput(request({ turnId: "turn-backpressure" }, Prompt.empty, Toolkit.empty))
            const blocked = yield* harness.controls
              .output(output[0]!)
              .pipe(Effect.forkChild({ startImmediately: true }))
            expect(blocked.pollUnsafe()).toBeUndefined()
            const events = yield* Stream.runCollect(connection.events).pipe(
              Effect.forkChild({ startImmediately: true }),
            )
            yield* Fiber.join(blocked)
            yield* harness.controls.complete(response)
            yield* connection.close
            expect(Array.from(yield* Fiber.join(events)).map(({ _tag }) => _tag)).toEqual([
              "TurnStarted",
              "Output",
              "TurnCompleted",
              "Closed",
            ])
          }),
        options(requirements, 1),
      ),
    )

    it.effect("closes behind a blocked producer without deadlocking or changing the terminal cause", () =>
      use(
        configuration.make,
        (harness, connection) =>
          Effect.gen(function* () {
            yield* connection.send(input[0]!)
            yield* connection.commitInput(request({ turnId: "turn-close-race" }, Prompt.empty, Toolkit.empty))
            const blocked = yield* harness.controls
              .output(output[0]!)
              .pipe(Effect.forkChild({ startImmediately: true }))
            expect(blocked.pollUnsafe()).toBeUndefined()
            yield* connection.close
            yield* harness.controls.lose("too late")
            const events = yield* Stream.runCollect(connection.events).pipe(
              Effect.forkChild({ startImmediately: true }),
            )
            yield* Fiber.join(blocked)
            expect(Array.from(yield* Fiber.join(events)).map(({ _tag }) => _tag)).toEqual([
              "TurnStarted",
              "Output",
              "Closed",
            ])
            expect(yield* connection.send(input[0]!).pipe(Effect.flip)).toMatchObject({
              _tag: "@generalist/live/ConnectionClosed",
            })
          }),
        options(requirements, 1),
      ),
    )

    it.effect("preserves connection loss behind a blocked producer", () =>
      use(
        configuration.make,
        (harness, connection) =>
          Effect.gen(function* () {
            yield* connection.send(input[0]!)
            yield* connection.commitInput(request({ turnId: "turn-loss-race" }, Prompt.empty, Toolkit.empty))
            const blocked = yield* harness.controls
              .output(output[0]!)
              .pipe(Effect.forkChild({ startImmediately: true }))
            expect(blocked.pollUnsafe()).toBeUndefined()
            yield* harness.controls.lose("socket ended")
            const failure = yield* Stream.runCollect(connection.events).pipe(
              Effect.flip,
              Effect.forkChild({ startImmediately: true }),
            )
            yield* Fiber.join(blocked)
            expect(yield* Fiber.join(failure)).toMatchObject({ _tag: "@generalist/live/ConnectionLost" })
            expect(yield* connection.send(input[0]!).pipe(Effect.flip)).toMatchObject({
              _tag: "@generalist/live/ConnectionClosed",
            })
          }),
        options(requirements, 1),
      ),
    )

    it.effect("stops blocked admission when the sole consumer stops early", () =>
      use(
        configuration.make,
        (harness, connection) =>
          Effect.gen(function* () {
            yield* connection.send(input[0]!)
            yield* connection.commitInput(request({ turnId: "turn-consumer-stop" }, Prompt.empty, Toolkit.empty))
            const blocked = yield* harness.controls
              .output(output[0]!)
              .pipe(Effect.forkChild({ startImmediately: true }))
            expect(blocked.pollUnsafe()).toBeUndefined()
            yield* Stream.runDrain(Stream.take(connection.events, 1))
            yield* Fiber.await(blocked)
            expect(yield* connection.send(input[0]!).pipe(Effect.flip)).toMatchObject({
              _tag: "@generalist/live/ConnectionClosed",
            })
          }),
        options(requirements, 1),
      ),
    )

    it.effect("rejects a second event-stream materialization", () =>
      use(
        configuration.make,
        (_harness, connection) =>
          Effect.gen(function* () {
            const first = yield* Stream.runDrain(connection.events).pipe(Effect.forkChild({ startImmediately: true }))
            const second = yield* Stream.runDrain(connection.events).pipe(Effect.flip)
            expect(second).toMatchObject({ _tag: "@generalist/live/EventsAlreadyConsumed" })
            yield* connection.close
            yield* Fiber.join(first)
          }),
        options(requirements),
      ),
    )

    it.effect("releases the provider resource when its owning scope exits", () =>
      Effect.gen(function* () {
        const harness = yield* configuration.make
        const scope = yield* Scope.make()
        const connection = yield* harness.provider
          .connect(options(requirements))
          .pipe(Effect.provideService(Scope.Scope, scope))
        expect(yield* harness.resourceCount).toBe(1)
        yield* Scope.close(scope, Exit.void)
        expect(yield* harness.resourceCount).toBe(0)
        expect(yield* connection.send(input[0]!).pipe(Effect.flip)).toMatchObject({
          _tag: "@generalist/live/ConnectionClosed",
        })
      }),
    )

    it.effect("scope exit releases a producer blocked on bounded delivery", () =>
      Effect.gen(function* () {
        const harness = yield* configuration.make
        const scope = yield* Scope.make()
        const connection = yield* harness.provider
          .connect(options(requirements, 1))
          .pipe(Effect.provideService(Scope.Scope, scope))
        yield* connection.send(input[0]!)
        yield* connection.commitInput(request({ turnId: "turn-scope-race" }, Prompt.empty, Toolkit.empty))
        const blocked = yield* harness.controls.output(output[0]!).pipe(Effect.forkChild({ startImmediately: true }))
        expect(blocked.pollUnsafe()).toBeUndefined()
        yield* Scope.close(scope, Exit.void)
        expect(yield* Fiber.join(blocked).pipe(Effect.flip)).toMatchObject({
          _tag: "@generalist/live/ConnectionClosed",
        })
        expect(yield* harness.resourceCount).toBe(0)
      }),
    )
  })
}
