/* oxlint-disable effecttsgo/async-function -- Rivet actor hooks and actions are Promise-only host boundaries. */
/* oxlint-disable anti-slop-effect/no-service-constructor-imports -- the actor is the scoped object-runtime composition root. */
import { Crypto, Effect, Layer, ManagedRuntime, Schema } from "effect"
import { Prompt } from "effect/unstable/ai"
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
} from "rivetkit"
import { Address } from "../../../runtime/address.js"
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
}

interface Vars {
  host: Host | undefined
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

/** @experimental */
export interface RuntimeActorOptions extends Omit<ActorRuntimeOptions, "drainAction"> {
  /** Application-owned transport and cryptography; never actor-local durability. */
  readonly storage: Layer.Layer<ObjectStore | Crypto.Crypto>
  /** Application-owned executable reconstruction composed into each actor incarnation. */
  readonly resolver: Layer.Layer<ExecutableResolver>
  /** Rivet process-lifecycle tuning; it never carries Runtime authority. */
  readonly actorOptions?: InstanceActorOptionsInput
}

interface ConfiguredActorOptions {
  options?: InstanceActorOptionsInput
}

const requireHost = (c: Context): Host => {
  if (c.vars.host === undefined) throw new Error("Generalist Runtime host is not awake")
  return c.vars.host
}

const runAction = async <A, E>(c: Context, effect: (runtime: RuntimeService) => Effect.Effect<A, E>): Promise<A> => {
  const host = requireHost(c)
  return c.keepAwake(
    host.runtime.runPromise(
      Effect.flatMap(Runtime, effect).pipe(Effect.tap(() => Effect.flatMap(ActorRuntime, (runtime) => runtime.notify))),
      { signal: c.abortSignal },
    ),
  )
}

const dispose = async (c: Context): Promise<void> => {
  const host = c.vars.host
  c.vars.host = undefined
  if (host !== undefined) await host.runtime.dispose()
}

/**
 * @experimental Build one Rivet Actor per Runtime partition.
 *
 * The object journal is the only Runtime authority. Schedules and cron are wake hints.
 */
export const makeRuntimeActor = (options: RuntimeActorOptions): RuntimeActorDefinition => {
  const { actorOptions, resolver, storage, ...storeOptions } = options
  const configuredOptions: ConfiguredActorOptions = {}
  if (actorOptions !== undefined) configuredOptions.options = actorOptions

  return actor({
    createVars: (): Vars => ({ host: undefined }),
    ...configuredOptions,
    actionInputSchemas,
    onWake: async (c) => {
      const runtime = ManagedRuntime.make(
        layerActorRuntime(c, { ...storeOptions, drainAction: "runtime.drain" }).pipe(
          Layer.provide(resolver),
          Layer.provide(storage),
        ),
      )
      try {
        await runtime.runPromise(ActorRuntime, { signal: c.abortSignal })
        c.vars.host = { runtime }
      } catch (cause) {
        c.vars.host = undefined
        await runtime.dispose()
        throw cause
      }
    },
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
        inspect: (c, runId: string) => {
          const host = requireHost(c)
          return c.keepAwake(
            host.runtime.runPromise(
              Effect.flatMap(Runtime, (runtime) => runtime.inspect(runId)).pipe(
                Effect.flatMap(Schema.encodeEffect(RuntimeInspectionResponse)),
              ),
              {
                signal: c.abortSignal,
              },
            ),
          )
        },
        drain: (c, _fire?: ScheduledFireInfo) =>
          c.keepAwake(
            requireHost(c).runtime.runPromise(
              Effect.flatMap(ActorRuntime, (runtime) => runtime.drain),
              { signal: c.abortSignal },
            ),
          ),
      },
    },
  })
}
