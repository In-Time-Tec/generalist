import { ConfigProvider, Context, Effect, Function, type Scope } from "effect"

/** @experimental Values exposed by Cloudflare Worker bindings. */
export type BindingValue = string | number | boolean | null | undefined | object

/** @experimental */
export interface ExecutionContext {
  readonly waitUntil: (promise: Promise<unknown>) => void
  readonly passThroughOnException: () => void
}

/** @experimental */
export interface RequestContext {
  readonly bindings: object
  readonly executionContext: ExecutionContext
}

/** @experimental */
export class WorkerContext extends Context.Service<WorkerContext, RequestContext>()(
  "@generalist/cloudflare/workers/WorkerContext",
) {}

/** @experimental */
export const makeConfigProvider: {
  <Bindings extends object, Key extends keyof Bindings & string>(
    bindings: Bindings,
    keys: ReadonlyArray<Key>,
  ): ConfigProvider.ConfigProvider
  <Bindings extends object, Key extends keyof Bindings & string>(
    keys: ReadonlyArray<Key>,
  ): (bindings: Bindings) => ConfigProvider.ConfigProvider
} = Function.dual(
  2,
  <Bindings extends object, Key extends keyof Bindings & string>(
    bindings: Bindings,
    keys: ReadonlyArray<Key>,
  ): ConfigProvider.ConfigProvider =>
    ConfigProvider.fromUnknown(Object.fromEntries(keys.map((key) => [key, bindings[key]]))),
)

/** @experimental */
export interface Worker<Bindings extends object> {
  readonly fetch: (request: Request, bindings: Bindings, context: ExecutionContext) => Promise<Response>
}

/** @experimental */
export const make = <Bindings extends object, E>(
  handle: (request: Request) => Effect.Effect<Response, E, WorkerContext | Scope.Scope>,
): Worker<Bindings> => ({
  fetch: (request, bindings, executionContext) =>
    Effect.runPromise(
      Effect.scoped(
        Effect.suspend(() => handle(request)).pipe(
          Effect.provideService(WorkerContext, WorkerContext.of({ bindings, executionContext })),
        ),
      ),
    ),
})
