import { Array, Effect, Result, Stream } from "effect"
import type { ChildSettlement, RunHandle, Service, SessionHandle } from "../application.js"
import type { Notification } from "../child/settlement.js"
import type { Event as PreviewEvent } from "../model-preview.js"
import { RuntimeUnavailable } from "../errors.js"
import type { Service as InspectionViews } from "../state/inspection/views.js"
import type { Service as EngineService } from "../engine.js"
import type { RuntimeLifecycleService } from "../state/layer.js"
import { copy as copyRewards } from "../reward/export.js"
import { copy as copyArtifacts } from "../artifact/export.js"
import { copyRuntimeBinding } from "../execution/scope.js"

const engines = new WeakMap<Service, EngineService>()

const settlement = (source: Notification): ChildSettlement => ({
  sequence: source.sequence,
  parentRunId: source.parentRunId,
  childRunId: source.childRunId,
  status: source.status,
})

export const make = (input: {
  readonly engine: EngineService
  readonly views: InspectionViews
  readonly lifecycle: RuntimeLifecycleService
}): Service => {
  const { engine, views, lifecycle } = input
  const runHandle = <Value>(handle: RunHandle<Value>): RunHandle<Value> => ({
    runId: handle.runId,
    await: lifecycle.run(handle.await),
    events: Stream.interruptWhen(
      Stream.unwrap(lifecycle.run(Effect.succeed(handle.events))),
      lifecycle.run(Effect.never),
    ),
    send: (message, options) => lifecycle.run(handle.send(message, options)),
  })
  const sessionHandle = (handle: SessionHandle): SessionHandle => ({
    sessionId: handle.sessionId,
    inspect: lifecycle.run(handle.inspect),
    queue: lifecycle.run(handle.queue),
    submit: (agent, value, options) => lifecycle.run(handle.submit(agent, value, options)),
    update: (request) => lifecycle.run(handle.update(request)),
    remove: (request) => lifecycle.run(handle.remove(request)),
    control: (action, commandId) => lifecycle.run(handle.control(action, commandId)),
    events: (cursor) =>
      Stream.interruptWhen(
        Stream.unwrap(lifecycle.run(Effect.succeed(handle.events(cursor)))),
        lifecycle.run(Effect.never),
      ),
  })
  const service = Object.freeze<Service>({
    start: (agent, value, options) => lifecycle.run(engine.start(agent, value, options)).pipe(Effect.map(runHandle)),
    hold: (agent, value, options) =>
      lifecycle.run(engine.hold(agent, value, options)).pipe(
        Effect.map((handle) => ({
          ...runHandle(handle),
          activate: (commandId: string) => lifecycle.run(handle.activate(commandId)),
        })),
      ),
    schedule: (agent, value, options) => lifecycle.run(engine.schedule(agent, value, options)),
    inspect: (runId: string) => lifecycle.run(views.run(runId)),
    list: (request: Parameters<Service["list"]>[0]) => lifecycle.run(views.list(request)),
    events: (request: Parameters<Service["events"]>[0]) =>
      Stream.interruptWhen(
        Stream.unwrap(lifecycle.run(Effect.succeed(engine.events(request)))),
        lifecycle.run(Effect.never),
      ),
    history: (request: Parameters<Service["history"]>[0]) => lifecycle.run(engine.history(request)),
    previews: (request: Parameters<Service["previews"]>[0]) =>
      Stream.unwrap(
        lifecycle.run(Effect.succeed(engine.previews(request))).pipe(Effect.orElseSucceed(() => Stream.empty)),
      ).pipe(
        Stream.filterMapEffect((event) =>
          lifecycle.run(engine.previewAuthority(request.runId)).pipe(
            Effect.orElseSucceed(() => undefined),
            Effect.map((fence) => {
              if (fence !== event.attemptFence) return Result.failVoid
              if (event._tag === "ModelPreviewCleared") {
                return Result.succeed<PreviewEvent>({
                  _tag: "ModelPreviewCleared",
                  runId: event.runId,
                  generation: event.generation,
                })
              }
              return Result.succeed<PreviewEvent>({
                _tag: "ModelPreview",
                runId: event.runId,
                turn: event.turn,
                modelCallId: event.modelCallId,
                modelAttemptId: event.modelAttemptId,
                attempt: event.attempt,
                generation: event.generation,
                sequence: event.sequence,
                changes: Array.map(event.changes, (change) => ({
                  channel: change.channel,
                  offset: change.offset,
                  delta: change.delta,
                })),
              })
            }),
          ),
        ),
        Stream.interruptWhen(lifecycle.run(Effect.never).pipe(Effect.orElseSucceed(() => undefined))),
      ),
    signal: (request) => lifecycle.run(engine.signal(request)),
    respond: (request) => lifecycle.run(engine.respond(request)),
    cancel: (request) => lifecycle.run(engine.cancel(request)),
    sessions: {
      create: (request) => lifecycle.run(engine.sessions.create(request)).pipe(Effect.map(sessionHandle)),
      get: (sessionId) => lifecycle.run(engine.sessions.get(sessionId)).pipe(Effect.map(sessionHandle)),
      list: lifecycle.run(engine.sessions.list),
    },
    children: {
      list: (parentRunId: string) => lifecycle.run(views.run(parentRunId).pipe(Effect.map((run) => run.children))),
      inspect: (request: Parameters<Service["children"]["inspect"]>[0]) => lifecycle.run(views.child(request)),
      settlements: (request: Parameters<Service["children"]["settlements"]>[0]) =>
        lifecycle.run(engine.childSettlements(request).pipe(Effect.map((entries) => entries.map(settlement)))),
      settlementChanges: (request: Parameters<Service["children"]["settlementChanges"]>[0]) =>
        Stream.interruptWhen(
          Stream.unwrap(
            lifecycle.run(Effect.succeed(engine.childSettlementChanges(request).pipe(Stream.map(settlement)))),
          ),
          lifecycle.run(Effect.never),
        ),
    },
    messaging: {
      send: (request: Parameters<Service["messaging"]["send"]>[0]) => lifecycle.run(engine.sendMessage(request)),
    },
    operator: {
      ...engine.operator,
      explain: (runId) => lifecycle.run(engine.operator.explain(runId)),
      verify: (runId) => lifecycle.run(engine.operator.verify(runId)),
      scanObligations: () =>
        Stream.interruptWhen(
          Stream.unwrap(lifecycle.run(Effect.succeed(engine.operator.scanObligations()))),
          lifecycle.run(Effect.never),
        ),
    },
  })
  engines.set(service, engine)
  copyRewards({ source: engine, target: service })
  copyArtifacts({ source: engine, target: service })
  copyRuntimeBinding({ source: engine, target: service })
  return service
}

export const engineFor = (service: Service): Effect.Effect<EngineService, RuntimeUnavailable> =>
  Effect.suspend(() => {
    const engine = engines.get(service)
    return engine === undefined
      ? RuntimeUnavailable.make({ message: "Runtime has no framework-owned host capability" })
      : Effect.succeed(engine)
  })
