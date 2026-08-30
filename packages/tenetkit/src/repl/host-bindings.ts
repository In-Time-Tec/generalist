import { Context, Effect, Layer, Option, Schema } from "effect"
import { ToolContext, type Service as ToolContextService } from "../core/tools/tool-context.js"

/** @experimental Every host operation failure is tagged, so a cell can discriminate it as data. */
export interface Tagged {
  readonly _tag: string
}

/** @experimental One Schema-typed operation a host mounts into the kernel namespace. */
export interface Operation<
  Input extends Schema.Constraint = Schema.Constraint,
  Output extends Schema.Constraint = Schema.Constraint,
  Failure extends Schema.Constraint = Schema.Constraint,
  R = never,
> {
  readonly name: string
  readonly input: Input
  readonly output: Output
  readonly failure: Failure
  readonly handle: (input: Input["Type"]) => Effect.Effect<Output["Type"], Failure["Type"] & Tagged, R>
}

/** @experimental */
type BoundarySchema = Schema.Codec<unknown, unknown, never, never>

export type AnyOperation<R = never> = Operation<BoundarySchema, BoundarySchema, BoundarySchema, R>

/** @experimental One named module of operations, mounted as a single kernel binding. */
export interface Module<R = never> {
  readonly name: string
  readonly operations: ReadonlyArray<AnyOperation<R>>
}

/** @experimental A request from an executing cell to a mounted host module. */
export interface Request {
  readonly module: string
  readonly operation: string
  readonly input: unknown
  /** @experimental The Session whose cell raised this request. */
  readonly sessionId?: string
  /** @experimental The cell that raised this request. */
  readonly cellId?: string
}

/** @experimental Encoded outcome returned to the cell that issued the request. */
export type Response =
  | { readonly _tag: "Success"; readonly output: unknown }
  | { readonly _tag: "Failure"; readonly failure: unknown }

/** @experimental The cell addressed a module or operation that is not mounted. */
export class HostModuleNotFound extends Schema.TaggedError<HostModuleNotFound>()("tenetkit/repl/HostModuleNotFound", {
  module: Schema.String,
  operation: Schema.optionalKey(Schema.String),
}) {}

/** @experimental Two modules or two operations claimed the same mounted name. */
export class HostModuleConflict extends Schema.TaggedError<HostModuleConflict>()("tenetkit/repl/HostModuleConflict", {
  module: Schema.String,
  operation: Schema.optionalKey(Schema.String),
}) {}

/** @experimental A host request or reply did not match the operation's declared schema. */
export class HostModuleSchemaFailure extends Schema.TaggedError<HostModuleSchemaFailure>()(
  "tenetkit/repl/HostModuleSchemaFailure",
  {
    module: Schema.String,
    operation: Schema.String,
    stage: Schema.Literals(["decode-input", "encode-output", "encode-failure"]),
    message: Schema.String,
  },
) {}

/** @experimental Closed union of host-module boundary failures. */
export type BindingFailure = HostModuleNotFound | HostModuleSchemaFailure

/** @experimental The mounted surface a cell can see, without any handler. */
export interface Descriptor {
  readonly module: string
  readonly operations: ReadonlyArray<string>
}

/**
 * @experimental The seam by which a host mounts named Schema-typed modules into the kernel
 * namespace and answers requests from an executing cell.
 */
export interface Service {
  readonly descriptors: ReadonlyArray<Descriptor>
  readonly resolve: (request: Request) => Effect.Effect<AnyOperation, HostModuleNotFound>
  readonly invoke: (request: Request) => Effect.Effect<Response, BindingFailure>
}

/** @experimental */
export class HostBindings extends Context.Service<HostBindings, Service>()(
  "tenetkit/repl/host-bindings/HostBindings",
) {}

const schemaMessage = (error: { readonly message: string }): string => error.message

const index = <R>(modules: ReadonlyArray<Module<R>>): Map<string, Map<string, AnyOperation<R>>> => {
  const mounted = new Map<string, Map<string, AnyOperation<R>>>()
  for (const module of modules) {
    if (mounted.has(module.name)) throw HostModuleConflict.make({ module: module.name })
    const operations = new Map<string, AnyOperation<R>>()
    for (const operation of module.operations) {
      if (operations.has(operation.name)) {
        throw HostModuleConflict.make({ module: module.name, operation: operation.name })
      }
      operations.set(operation.name, operation)
    }
    mounted.set(module.name, operations)
  }
  return mounted
}

const callContext = <R>(request: Request, base: Context.Context<R>): Context.Context<R> => {
  if (request.sessionId === undefined) return base
  const ambient = Option.getOrUndefined(Context.getOption(base, ToolContext))
  if (ambient === undefined) return base
  const toolContext: ToolContextService =
    request.cellId === undefined
      ? { ...ambient, sessionId: request.sessionId }
      : { ...ambient, sessionId: request.sessionId, toolCallId: request.cellId }
  return Context.add(base, ToolContext, ToolContext.of(toolContext))
}

/** @experimental Mount modules and reject duplicate module or operation names. */
export const make = <R>(modules: ReadonlyArray<Module<R>>): Effect.Effect<Service, HostModuleConflict, R> =>
  Effect.contextWith((context: Context.Context<R>) =>
    Effect.try({
      try: () => index(modules),
      catch: (error) =>
        Schema.is(HostModuleConflict)(error)
          ? error
          : HostModuleConflict.make({ module: "Host module construction failed" }),
    }).pipe(
      Effect.map((mounted): Service => {
        const resolve = (request: Request): Effect.Effect<AnyOperation, HostModuleNotFound> => {
          const operations = mounted.get(request.module)
          if (operations === undefined) return Effect.fail(HostModuleNotFound.make({ module: request.module }))
          const operation = operations.get(request.operation)
          if (operation === undefined) {
            return Effect.fail(HostModuleNotFound.make({ module: request.module, operation: request.operation }))
          }
          return Effect.succeed({
            ...operation,
            handle: (input) =>
              operation
                .handle(input)
                .pipe(Effect.updateContext((ambient: Context.Context<never>) => Context.merge(context, ambient))),
          })
        }
        const schemaFailure = (
          request: Request,
          stage: HostModuleSchemaFailure["stage"],
          error: { readonly message: string },
        ): HostModuleSchemaFailure =>
          HostModuleSchemaFailure.make({
            module: request.module,
            operation: request.operation,
            stage,
            message: schemaMessage(error),
          })
        return {
          descriptors: Array.from(mounted, ([module, operations]) => ({
            module,
            operations: Array.from(operations.keys()),
          })),
          resolve,
          invoke: (request) =>
            resolve(request).pipe(
              Effect.flatMap((operation) =>
                Schema.decodeUnknownEffect(operation.input)(request.input).pipe(
                  Effect.mapError((error) => schemaFailure(request, "decode-input", error)),
                  Effect.flatMap((input) =>
                    operation.handle(input).pipe(
                      Effect.matchEffect({
                        onSuccess: (output) =>
                          Schema.encodeUnknownEffect(operation.output)(output).pipe(
                            Effect.mapError((error) => schemaFailure(request, "encode-output", error)),
                            Effect.map((encoded): Response => ({ _tag: "Success", output: encoded })),
                          ),
                        onFailure: (failure) =>
                          Schema.encodeUnknownEffect(operation.failure)(failure).pipe(
                            Effect.mapError((error) => schemaFailure(request, "encode-failure", error)),
                            Effect.map((encoded): Response => ({ _tag: "Failure", failure: encoded })),
                          ),
                      }),
                      /**
                       * The mounted surface is built once and shared by every Session a pool
                       * serves, so the context captured here is the host's static one. A caller
                       * that installs a per-call context — the tool call's own identity, its
                       * cancellation signal, its durable operation key — must win over it, or
                       * every Session would answer with one Session's identity. Merging under
                       * the ambient context keeps the build-time services available while
                       * letting the call supply the ones it owns.
                       *
                       * The request names the Session and cell it came from, and a kernel answers
                       * a cell on a fiber forked from its own boot rather than from any tool call,
                       * so that naming is the only thing tying a host request back to its cell.
                       * It is applied last, over both, for that reason.
                       */
                      Effect.updateContext((ambient: Context.Context<never>) =>
                        callContext(request, Context.merge(context, ambient)),
                      ),
                    ),
                  ),
                ),
              ),
            ),
        }
      }),
    ),
  )

/** @experimental */
export const layer = <R>(modules: ReadonlyArray<Module<R>>): Layer.Layer<HostBindings, HostModuleConflict, R> =>
  Layer.effect(HostBindings, make(modules))

/** @experimental */
export const layerTest = (implementation: Service): Layer.Layer<HostBindings> =>
  Layer.succeed(HostBindings, HostBindings.of(implementation))
