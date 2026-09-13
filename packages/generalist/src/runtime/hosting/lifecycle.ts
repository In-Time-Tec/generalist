import { Effect, Predicate, Stream } from "effect"
import type { Prompt } from "effect/unstable/ai"
import type { HeldRunHandle, SessionHandle, SessionService } from "../application.js"
import type {
  RunHandle,
  RunSendError,
  RunSendOptions,
  SendError,
  SendFunction,
  SendInput,
  Service as RuntimeService,
} from "../engine.js"
import type { RunReceipt } from "../run.js"
import type { SteeringReceipt } from "../run/steering.js"
import type { RuntimeLifecycleService } from "../state/layer.js"
import { copy as copyExportRuntime } from "../reward/export.js"
import { copy as copyArtifactRuntime } from "../artifact/export.js"
import { copyRuntimeBinding } from "../execution/scope.js"

const guardStream = <A, E, R>(lifecycle: RuntimeLifecycleService, stream: Stream.Stream<A, E, R>) =>
  Stream.fromEffect(lifecycle.run(Effect.void)).pipe(
    Stream.flatMap(() => stream.pipe(Stream.interruptWhen(lifecycle.run(Effect.never)))),
  )

const guardRunHandle = <Output>(lifecycle: RuntimeLifecycleService, handle: RunHandle<Output>): RunHandle<Output> => ({
  ...handle,
  send: (message, options) => lifecycle.run(handle.send(message, options)),
})

const guardHeldRunHandle = <Output>(
  lifecycle: RuntimeLifecycleService,
  handle: HeldRunHandle<Output>,
): HeldRunHandle<Output> => ({
  ...handle,
  send: (message, options) => lifecycle.run(handle.send(message, options)),
  activate: (commandId) => lifecycle.run(handle.activate(commandId)),
})

const guardSessionHandle = (lifecycle: RuntimeLifecycleService, handle: SessionHandle): SessionHandle => ({
  sessionId: handle.sessionId,
  inspect: lifecycle.run(handle.inspect),
  queue: lifecycle.run(handle.queue),
  submit: (agent, input, options) => lifecycle.run(handle.submit(agent, input, options)),
  update: (input) => lifecycle.run(handle.update(input)),
  remove: (input) => lifecycle.run(handle.remove(input)),
  events: (cursor) => guardStream(lifecycle, handle.events(cursor)),
  control: (action, commandId) => lifecycle.run(handle.control(action, commandId)),
})

const guardSessions = (lifecycle: RuntimeLifecycleService, sessions: SessionService): SessionService => ({
  create: (input) =>
    lifecycle.run(sessions.create(input)).pipe(Effect.map((handle) => guardSessionHandle(lifecycle, handle))),
  get: (sessionId) =>
    lifecycle.run(sessions.get(sessionId)).pipe(Effect.map((handle) => guardSessionHandle(lifecycle, handle))),
  list: lifecycle.run(sessions.list),
})

const guardSend = (runtime: RuntimeService, lifecycle: RuntimeLifecycleService): SendFunction => {
  function send(
    runId: string,
    prompt: Prompt.Prompt | string,
    options?: RunSendOptions,
  ): Effect.Effect<SteeringReceipt, RunSendError>
  function send(input: SendInput): Effect.Effect<RunReceipt, SendError>
  function send(
    input: SendInput | string,
    prompt?: Prompt.Prompt | string,
    options?: RunSendOptions,
  ): Effect.Effect<RunReceipt | SteeringReceipt, SendError | RunSendError> {
    return Predicate.isString(input)
      ? lifecycle.run(runtime.send(input, prompt ?? "", options))
      : lifecycle.run(runtime.send(input))
  }
  return send
}

const guardOperator = (
  operator: RuntimeService["operator"],
  lifecycle: RuntimeLifecycleService,
): RuntimeService["operator"] => ({
  ...operator,
  retry: (runId, identity, commandId) => lifecycle.run(operator.retry(runId, identity, commandId)),
  wake: (runId, identity, commandId) => lifecycle.run(operator.wake(runId, identity, commandId)),
  resolveUnknown: (runId, operationId, resolution, identity, commandId) =>
    lifecycle.run(operator.resolveUnknown(runId, operationId, resolution, identity, commandId)),
  resolveApproval: (token, decision, identity, commandId) =>
    lifecycle.run(operator.resolveApproval(token, decision, identity, commandId)),
  extendBudget: (runId, delta, identity, commandId) =>
    lifecycle.run(operator.extendBudget(runId, delta, identity, commandId)),
})

export const make = (boundary: {
  readonly runtime: RuntimeService
  readonly lifecycle: RuntimeLifecycleService
}): RuntimeService => {
  const { runtime, lifecycle } = boundary
  const guarded: RuntimeService = {
    ...runtime,
    operator: guardOperator(runtime.operator, lifecycle),
    sessions: guardSessions(lifecycle, runtime.sessions),
    activate: (input) => lifecycle.run(runtime.activate(input)),
    admit: (input) => lifecycle.run(runtime.admit(input)),
    cancel: (input) => lifecycle.run(runtime.cancel(input)),
    fanOut: (input) => lifecycle.run(runtime.fanOut(input)),
    fork: (runId, options) =>
      lifecycle.run(runtime.fork(runId, options)).pipe(Effect.map((handle) => guardRunHandle(lifecycle, handle))),
    getRun: (runId) => runtime.getRun(runId).pipe(Effect.map((handle) => guardRunHandle(lifecycle, handle))),
    controlSession: (input) => lifecycle.run(runtime.controlSession(input)),
    hold: (agent, input, options) =>
      lifecycle
        .run(runtime.hold(agent, input, options))
        .pipe(Effect.map((handle) => guardHeldRunHandle(lifecycle, handle))),
    messageSessionInput: (input) => lifecycle.run(runtime.messageSessionInput(input)),
    respond: (input) => lifecycle.run(runtime.respond(input)),
    respondApproval: (input) => lifecycle.run(runtime.respondApproval(input)),
    rewind: (runId, options) => lifecycle.run(runtime.rewind(runId, options)),
    resolveOperation: (input) => lifecycle.run(runtime.resolveOperation(input)),
    schedule: (agent, input, options) => lifecycle.run(runtime.schedule(agent, input, options)),
    send: guardSend(runtime, lifecycle),
    sendMessage: (input) => lifecycle.run(runtime.sendMessage(input)),
    signal: (input) => lifecycle.run(runtime.signal(input)),
    spawn: (input) => lifecycle.run(runtime.spawn(input)),
    start: (agent, input, options) =>
      lifecycle
        .run(runtime.start(agent, input, options))
        .pipe(Effect.map((handle) => guardRunHandle(lifecycle, handle))),
    startExecution: (input) => lifecycle.run(runtime.startExecution(input)),
    startTool: (tool, input, options) => lifecycle.run(runtime.startTool(tool, input, options)),
    startToolEncoded: (tool, input, options) => lifecycle.run(runtime.startToolEncoded(tool, input, options)),
    submitSessionInput: (input) => lifecycle.run(runtime.submitSessionInput(input)),
    extendBudget: (input) => lifecycle.run(runtime.extendBudget(input)),
    wake: (input) => lifecycle.run(runtime.wake(input)),
  }
  return copyRuntimeBinding({
    source: runtime,
    target: copyArtifactRuntime({
      source: runtime,
      target: copyExportRuntime({ source: runtime, target: guarded }),
    }),
  })
}
