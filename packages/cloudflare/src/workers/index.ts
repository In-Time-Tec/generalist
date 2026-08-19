import { ConfigProvider, Context, Effect, Function } from "effect"

/** @experimental */
export interface ExecutionContext {
  readonly waitUntil: (promise: Promise<unknown>) => void
  readonly passThroughOnException: () => void
}

/** @experimental */
export interface RequestContext {
  readonly bindings: Readonly<Record<string, unknown>>
  readonly executionContext: ExecutionContext
}

/** @experimental */
export class WorkerContext extends Context.Service<WorkerContext, RequestContext>()(
  "@tenetkit/cloudflare/workers/WorkerContext",
) {}

/** @experimental */
export const makeConfigProvider: {
  <Bindings extends Readonly<Record<string, unknown>>, Key extends keyof Bindings & string>(
    bindings: Bindings,
    keys: ReadonlyArray<Key>,
  ): ConfigProvider.ConfigProvider
  <Bindings extends Readonly<Record<string, unknown>>, Key extends keyof Bindings & string>(
    keys: ReadonlyArray<Key>,
  ): (bindings: Bindings) => ConfigProvider.ConfigProvider
} = Function.dual(
  2,
  <Bindings extends Readonly<Record<string, unknown>>, Key extends keyof Bindings & string>(
    bindings: Bindings,
    keys: ReadonlyArray<Key>,
  ): ConfigProvider.ConfigProvider =>
    ConfigProvider.fromUnknown(Object.fromEntries(keys.map((key) => [key, bindings[key]]))),
)

/** @experimental */
export interface Worker<Bindings extends Readonly<Record<string, unknown>>> {
  readonly fetch: (request: Request, bindings: Bindings, context: ExecutionContext) => Promise<Response>
}

/** @experimental */
export const make = <Bindings extends Readonly<Record<string, unknown>>, E>(
  handle: (request: Request) => Effect.Effect<Response, E, WorkerContext>,
): Worker<Bindings> => ({
  fetch: (request, bindings, executionContext) =>
    Effect.runPromise(
      handle(request).pipe(Effect.provideService(WorkerContext, WorkerContext.of({ bindings, executionContext }))),
    ),
})
