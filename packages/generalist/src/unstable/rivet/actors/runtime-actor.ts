/* oxlint-disable effecttsgo/async-function -- Rivet actor hooks and actions are Promise-only host boundaries. */
/* oxlint-disable anti-slop-effect/no-service-constructor-imports -- the actor is the scoped object-runtime composition root. */
/* oxlint-disable effecttsgo/any-unknown-in-error-context -- the raw Rivet transport preserves Effect HTTP's platform error channel. */
import { Crypto, Effect, Layer, ManagedRuntime, Schema } from "effect"
import { Prompt } from "effect/unstable/ai"
import { DurabilityFailure } from "../../../durability/errors.js"
import type { ObjectStore } from "../../../durability/object-store.js"
import type { DrainResult } from "../../../runtime/execution/local-scheduler.js"
import type { ActivationFailure } from "../../../durability/internal/runtime.js"
import {
  actor,
  type ActionContext,
  type ActorContext,
  type ActorDefinition,
  type InstanceActorOptionsInput,
  type ScheduledFireInfo,
  type UniversalWebSocket,
} from "rivetkit"
import { Address } from "../../../runtime/address.js"
import { RuntimeUnavailable } from "../../../runtime/errors.js"
import { ExecutableResolver } from "../../../runtime/executable/resolver.js"
import { Metadata } from "../../../runtime/messaging/message.js"
import { ResolveOperationInput } from "../../../runtime/operation/resolution.js"
import { RuntimeInspectionResponse } from "../../../runtime/inspection.js"
import {
  Runtime,
  type CancelInput as RuntimeCancelInput,
  type RespondInput as RuntimeRespondInput,
  type SendInput as RuntimeSendInput,
  type Service as RuntimeService,
  type SignalInput as RuntimeSignalInput,
} from "../../../runtime/service.js"
import { TreePolicy } from "../../../runtime/tree/policy.js"
import { ActorRuntime, layerActorRuntime, type ActorRuntimeOptions, type ActorRuntimeServices } from "./runtime.js"
import { make as makeServer, type RuntimeActorServer, type RuntimeActorServerFactory } from "./server.js"
import type { AgentRegistry } from "../../../host/index.js"

const SendInput = Schema.Struct({
  runId: Schema.optionalKey(Schema.String),
  treePolicy: Schema.optionalKey(TreePolicy),
  to: Address,
  from: Schema.optionalKey(Address),
  sessionId: Schema.String,
  idempotencyKey: Schema.String,
  prompt: Schema.Union([Schema.String, Schema.toEncoded(Prompt.Prompt), Schema.Array(Schema.Unknown)]),
  messageId: Schema.optionalKey(Schema.String),
  causationId: Schema.optionalKey(Schema.String),
  correlationId: Schema.optionalKey(Schema.String),
  inReplyTo: Schema.optionalKey(Schema.String),
  metadata: Schema.optionalKey(Metadata),
})

const SignalInput = Schema.Struct({
  runId: Schema.String,
  commandId: Schema.String.check(Schema.isNonEmpty()),
  name: Schema.String,
  payload: Schema.optionalKey(Schema.Unknown),
})

const RespondInput = Schema.Struct({
  runId: Schema.String,
  waitId: Schema.String,
  resolution: Schema.Union([
    Schema.TaggedStruct("Approved", {}),
    Schema.TaggedStruct("Denied", { reason: Schema.optionalKey(Schema.String) }),
    Schema.TaggedStruct("ToolResult", { result: Schema.Unknown, encodedResult: Schema.Unknown }),
  ]),
})

const CancelInput = Schema.Struct({
  runId: Schema.String,
  commandId: Schema.String.check(Schema.isNonEmpty()),
  reason: Schema.optionalKey(Schema.String),
})

const actionInputSchemas = {
  runtime: {
    send: Schema.toStandardSchemaV1(Schema.Tuple([SendInput])),
    signal: Schema.toStandardSchemaV1(Schema.Tuple([SignalInput])),
    respond: Schema.toStandardSchemaV1(Schema.Tuple([RespondInput])),
    cancel: Schema.toStandardSchemaV1(Schema.Tuple([CancelInput])),
    resolveOperation: Schema.toStandardSchemaV1(Schema.Tuple([ResolveOperationInput])),
    inspect: Schema.toStandardSchemaV1(Schema.Tuple([Schema.String])),
  },
}

type RuntimeHost = ManagedRuntime.ManagedRuntime<ActorRuntimeServices, ActivationFailure>

interface Host {
  readonly runtime: RuntimeHost
  readonly service: ActorRuntime["Service"]
  readonly server: RuntimeActorServer | undefined
  requests: number
  revision: number
  idleRevision: number | undefined
  released: (() => void) | undefined
}

interface Vars {
  host: Host | undefined
  opening: Promise<Host> | undefined
  closing: Promise<void> | undefined
  namespace: RuntimeActorNamespace | undefined
}

type Context = ActorContext<undefined, undefined, undefined, Vars, undefined, undefined>
type RuntimeActionContext = ActionContext<undefined, undefined, undefined, Vars, undefined, undefined>

type RuntimeActions = {
  readonly runtime: {
    readonly send: (
      c: RuntimeActionContext,
      input: RuntimeSendInput,
    ) => Promise<Effect.Success<ReturnType<RuntimeService["send"]>>>
    readonly signal: (c: RuntimeActionContext, input: RuntimeSignalInput) => Promise<void>
    readonly respond: (c: RuntimeActionContext, input: RuntimeRespondInput) => Promise<void>
    readonly cancel: (c: RuntimeActionContext, input: RuntimeCancelInput) => Promise<void>
    readonly resolveOperation: (c: RuntimeActionContext, input: ResolveOperationInput) => Promise<void>
    readonly inspect: (c: RuntimeActionContext, runId: string) => Promise<typeof RuntimeInspectionResponse.Encoded>
    readonly drain: (c: RuntimeActionContext, fire?: ScheduledFireInfo) => Promise<DrainResult>
  }
}

/** @experimental One typed Rivet Actor definition owning one Runtime partition. */
export type RuntimeActorDefinition = ActorDefinition<
  undefined,
  undefined,
  undefined,
  Vars,
  undefined,
  undefined,
  Record<never, never>,
  Record<never, never>,
  RuntimeActions
>

/** @experimental Canonical object namespace resolved for one actor instance. */
export const RuntimeActorNamespace = Schema.Struct({
  environment: Schema.String.check(Schema.isNonEmpty()),
  tenant: Schema.String.check(Schema.isNonEmpty()),
  partition: Schema.String.check(Schema.isNonEmpty()),
})

/** @experimental */
export type RuntimeActorNamespace = typeof RuntimeActorNamespace.Type

/** @experimental Stable actor identity available before Runtime construction. */
export interface RuntimeActorIdentity {
  readonly actorId: string
  readonly key: ReadonlyArray<string>
}

/** @experimental */
export interface RuntimeActorOptions<
  Agents extends AgentRegistry = AgentRegistry,
  ServerError = never,
  AuthError = never,
  AuthServices extends ActorRuntimeServices = never,
  ServerRequirements extends ActorRuntimeServices = ActorRuntimeServices,
> extends Omit<ActorRuntimeOptions, "drainAction" | "environment" | "tenant" | "partition"> {
  /** Cached for this incarnation; applications must preserve key-to-namespace routing across incarnations. */
  readonly namespace: (identity: RuntimeActorIdentity) => RuntimeActorNamespace
  /** Application-owned transport and cryptography; never actor-local durability. */
  readonly storage: Layer.Layer<ObjectStore | Crypto.Crypto>
  /** Application-owned executable reconstruction composed into each actor incarnation. */
  readonly resolver: Layer.Layer<ExecutableResolver>
  /** Server configuration constructed once inside this actor incarnation. */
  readonly server?: RuntimeActorServerFactory<Agents, ServerError, AuthError, AuthServices, ServerRequirements>
  /** Rivet process-lifecycle tuning; it never carries Runtime authority. */
  readonly actorOptions?: InstanceActorOptionsInput
}

interface ConfiguredActorOptions {
  options?: InstanceActorOptionsInput
}

const retire = (c: Context, host: Host): Promise<void> => {
  if (c.vars.host !== host) return c.vars.closing ?? Promise.resolve()
  c.vars.host = undefined
  const closing = (async () => {
    if (host.requests !== 0) {
      const released = Promise.withResolvers<void>()
      host.released = released.resolve
      await released.promise
    }
    await host.runtime.dispose()
  })().finally(() => {
    if (c.vars.closing === closing) c.vars.closing = undefined
  })
  c.vars.closing = closing
  return closing
}

/**
 * @experimental Build one Rivet Actor per Runtime partition.
 *
 * The object journal is the only Runtime authority. Schedules and cron are wake hints.
 */
export const makeRuntimeActor = <
  Agents extends AgentRegistry = AgentRegistry,
  ServerError = never,
  AuthError = never,
  AuthServices extends ActorRuntimeServices = never,
  ServerRequirements extends ActorRuntimeServices = ActorRuntimeServices,
>(
  options: RuntimeActorOptions<Agents, ServerError, AuthError, AuthServices, ServerRequirements>,
): RuntimeActorDefinition => {
  const { actorOptions, namespace, resolver, storage, ...storeOptions } = options
  const configuredOptions: ConfiguredActorOptions = {}
  if (actorOptions !== undefined) configuredOptions.options = actorOptions

  const getHost = async (c: Context): Promise<Host> => {
    if (c.vars.closing !== undefined) return c.vars.closing.then(() => getHost(c))
    if (c.abortSignal.aborted) throw RuntimeUnavailable.make({ message: "Rivet Runtime actor is stopping" })
    if (c.vars.host !== undefined) return c.vars.host
    if (c.vars.opening !== undefined) return c.vars.opening
    const opening = (async () => {
      const resolved =
        c.vars.namespace ??
        (await Effect.runPromise(
          Effect.try({
            try: () => namespace({ actorId: c.actorId, key: [...c.key] }),
            catch: () =>
              DurabilityFailure.make({ reason: "configuration", message: "Rivet Runtime namespace resolver failed" }),
          }).pipe(
            Effect.flatMap((value) =>
              Schema.decodeEffect(RuntimeActorNamespace)(value, { onExcessProperty: "error" }).pipe(
                Effect.mapError(() =>
                  DurabilityFailure.make({ reason: "configuration", message: "Invalid Rivet Runtime namespace" }),
                ),
              ),
            ),
          ),
          { signal: c.abortSignal },
        ))
      c.vars.namespace = Object.freeze(resolved)
      const runtime = ManagedRuntime.make(
        layerActorRuntime(c, { ...storeOptions, ...resolved, drainAction: "runtime.drain" }).pipe(
          Layer.provide(resolver),
          Layer.provide(storage),
        ),
      )
      try {
        const service = await runtime.runPromise(ActorRuntime, { signal: c.abortSignal })
        const server =
          options.server === undefined
            ? undefined
            : await runtime.runPromise(
                Effect.flatMap(
                  options.server.make({ actorId: c.actorId, key: [...c.key], namespace: resolved }),
                  (config) => makeServer({ config, memoMap: runtime.memoMap, scope: runtime.scope }),
                ),
                { signal: c.abortSignal },
              )
        const host: Host = {
          runtime,
          service,
          server,
          requests: 0,
          revision: 0,
          idleRevision: undefined,
          released: undefined,
        }
        c.vars.host = host
        void runtime.runPromise(service.failure, { signal: c.abortSignal }).catch(() => c.waitUntil(retire(c, host)))
        return host
      } catch (cause) {
        c.vars.host = undefined
        await runtime.dispose()
        throw cause
      }
    })().finally(() => {
      if (c.vars.opening === opening) c.vars.opening = undefined
    })
    c.vars.opening = opening
    return opening
  }

  const useHost = <A, E>(
    c: Context,
    recover: boolean,
    effect: (host: Host) => Effect.Effect<A, E, ActorRuntimeServices>,
  ): Promise<A> =>
    (async () => {
      const host = await getHost(c)
      if (c.vars.host !== host) return useHost(c, recover, effect)
      host.requests++
      try {
        return await host.runtime.runPromise(
          Effect.suspend(() => effect(host)).pipe(
            Effect.raceFirst(host.service.failure),
            Effect.ensuring(recover ? host.service.notify : Effect.void),
          ),
          {
            signal: c.abortSignal,
          },
        )
      } finally {
        host.requests--
        if (host.requests === 0) {
          host.released?.()
          if (host.server === undefined && host.idleRevision === host.revision) await retire(c, host)
        }
      }
    })()

  const runAction = <A, E>(c: Context, effect: (runtime: RuntimeService) => Effect.Effect<A, E>): Promise<A> =>
    useHost(c, true, (host) => {
      host.revision++
      host.idleRevision = undefined
      return Effect.flatMap(Runtime, effect).pipe(
        Effect.onExit(() =>
          Effect.sync(() => {
            host.revision++
            host.idleRevision = undefined
          }),
        ),
      )
    })

  const drain = (c: Context): Promise<DrainResult> =>
    useHost(c, false, (host) => {
      const revision = host.revision
      return host.service.drain.pipe(
        Effect.tap((result) =>
          Effect.sync(() => {
            if (!result.hasMore && host.revision === revision) host.idleRevision = revision
          }),
        ),
      )
    })

  const dispose = async (c: Context): Promise<void> => {
    await c.vars.opening?.catch(() => undefined)
    if (c.vars.host !== undefined) await retire(c, c.vars.host)
    await c.vars.closing
  }

  const serverHooks =
    options.server === undefined
      ? {}
      : {
          onRequest: (c: Context, request: Request) =>
            useHost(c, false, (host) =>
              host.server === undefined
                ? Effect.fail(RuntimeUnavailable.make({ message: "Rivet Server is not ready" }))
                : host.server.handle(request, undefined, c.abortSignal).pipe(Effect.ensuring(host.service.notify)),
            ),
          onWebSocket: (c: Context, websocket: UniversalWebSocket) =>
            useHost(c, false, (host) =>
              host.server === undefined || c.request === undefined
                ? Effect.fail(RuntimeUnavailable.make({ message: "Rivet Server is not ready" }))
                : Effect.forkIn(host.runtime.scope, { startImmediately: true })(
                    host.server.handle(c.request, websocket, c.abortSignal).pipe(
                      Effect.flatMap((response) =>
                        response.status >= 400
                          ? Effect.sync(() => websocket.close(1008, "request-rejected"))
                          : Effect.void,
                      ),
                      Effect.catchCause(() => Effect.sync(() => websocket.close(1011, "request-failed"))),
                      Effect.ensuring(host.service.notify),
                    ),
                  ).pipe(Effect.asVoid),
            ),
        }

  return actor({
    createVars: (): Vars => ({ host: undefined, opening: undefined, closing: undefined, namespace: undefined }),
    ...configuredOptions,
    ...serverHooks,
    actionInputSchemas,
    onWake: async (c) => {
      await getHost(c)
    },
    run: (c) => drain(c).then(() => undefined),
    onSleep: dispose,
    onDestroy: dispose,
    actions: {
      runtime: {
        send: (c, input: RuntimeSendInput) => runAction(c, (runtime) => runtime.send(input)),
        signal: (c, input: RuntimeSignalInput) => runAction(c, (runtime) => runtime.signal(input)),
        respond: (c, input: RuntimeRespondInput) => runAction(c, (runtime) => runtime.respond(input)),
        cancel: (c, input: RuntimeCancelInput) => runAction(c, (runtime) => runtime.cancel(input)),
        resolveOperation: (c, input: ResolveOperationInput) =>
          runAction(c, (runtime) => runtime.resolveOperation(input)),
        inspect: (c, runId: string) =>
          useHost(c, true, () =>
            Effect.flatMap(Runtime, (runtime) => runtime.inspect(runId)).pipe(
              Effect.flatMap(Schema.encodeEffect(RuntimeInspectionResponse)),
            ),
          ),
        drain: (c, _fire?: ScheduledFireInfo) => drain(c),
      },
    },
  })
}
