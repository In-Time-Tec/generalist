import { Context, Effect, Layer, Schema } from "effect"

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
export type AnyOperation<R = never> = Operation<Schema.Constraint, Schema.Constraint, Schema.Constraint, R>

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
export class HostBindingNotFound extends Schema.TaggedErrorClass<HostBindingNotFound>()(
  "@batonfx/repl/HostBindingNotFound",
  {
    module: Schema.String,
    operation: Schema.optionalKey(Schema.String),
  },
) {}

/** @experimental Two modules or two operations claimed the same mounted name. */
export class HostBindingConflict extends Schema.TaggedErrorClass<HostBindingConflict>()(
  "@batonfx/repl/HostBindingConflict",
  {
    module: Schema.String,
    operation: Schema.optionalKey(Schema.String),
  },
) {}

/** @experimental A host request or reply did not match the operation's declared schema. */
export class HostBindingSchemaFailure extends Schema.TaggedErrorClass<HostBindingSchemaFailure>()(
  "@batonfx/repl/HostBindingSchemaFailure",
  {
    module: Schema.String,
    operation: Schema.String,
    stage: Schema.Literals(["decode-input", "encode-output", "encode-failure"]),
    message: Schema.String,
  },
) {}

/** @experimental Closed union of host-binding boundary failures. */
export type BindingFailure = HostBindingNotFound | HostBindingSchemaFailure

/** @experimental The mounted surface a cell can see, without any handler. */
export interface Descriptor {
  readonly module: string
  readonly operations: ReadonlyArray<string>
}

/**
 * @experimental The seam by which a host mounts named Schema-typed modules into the kernel
 * namespace and answers requests from an executing cell.
 */
export interface Interface {
  readonly descriptors: ReadonlyArray<Descriptor>
  readonly resolve: (request: Request) => Effect.Effect<AnyOperation, HostBindingNotFound>
  readonly invoke: (request: Request) => Effect.Effect<Response, BindingFailure>
}

/** @experimental */
export class HostBindingRegistry extends Context.Service<HostBindingRegistry, Interface>()(
  "@batonfx/repl/repl/host-binding-registry/HostBindingRegistry",
) {}

const codecView = <S extends Schema.Constraint>(schema: S): Schema.Codec<S["Type"], S["Encoded"], never, never> =>
  schema as unknown as Schema.Codec<S["Type"], S["Encoded"], never, never>

const schemaMessage = (error: unknown): string =>
  error instanceof Error ? error.message : typeof error === "string" ? error : String(error)

const index = <R>(modules: ReadonlyArray<Module<R>>): Map<string, Map<string, AnyOperation<R>>> => {
  const mounted = new Map<string, Map<string, AnyOperation<R>>>()
  for (const module of modules) {
    if (mounted.has(module.name)) throw HostBindingConflict.make({ module: module.name })
    const operations = new Map<string, AnyOperation<R>>()
    for (const operation of module.operations) {
      if (operations.has(operation.name)) {
        throw HostBindingConflict.make({ module: module.name, operation: operation.name })
      }
      operations.set(operation.name, operation)
    }
    mounted.set(module.name, operations)
  }
  return mounted
}

/** @experimental Mount modules and reject duplicate module or operation names. */
export const make = <R>(modules: ReadonlyArray<Module<R>>): Effect.Effect<Interface, HostBindingConflict, R> =>
  Effect.contextWith((context: Context.Context<R>) =>
    Effect.try({
      try: () => index(modules),
      catch: (error) => error as HostBindingConflict,
    }).pipe(
      Effect.map((mounted): Interface => {
        const resolve = (request: Request): Effect.Effect<AnyOperation, HostBindingNotFound> => {
          const operations = mounted.get(request.module)
          if (operations === undefined) return Effect.fail(HostBindingNotFound.make({ module: request.module }))
          const operation = operations.get(request.operation)
          return operation === undefined
            ? Effect.fail(HostBindingNotFound.make({ module: request.module, operation: request.operation }))
            : Effect.succeed(operation as AnyOperation)
        }
        const schemaFailure = (
          request: Request,
          stage: HostBindingSchemaFailure["stage"],
          error: unknown,
        ): HostBindingSchemaFailure =>
          HostBindingSchemaFailure.make({
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
                Schema.decodeUnknownEffect(codecView(operation.input))(request.input).pipe(
                  Effect.mapError((error) => schemaFailure(request, "decode-input", error)),
                  Effect.flatMap((input) =>
                    operation.handle(input).pipe(
                      Effect.matchEffect({
                        onSuccess: (output) =>
                          Schema.encodeUnknownEffect(codecView(operation.output))(output).pipe(
                            Effect.mapError((error) => schemaFailure(request, "encode-output", error)),
                            Effect.map((encoded): Response => ({ _tag: "Success", output: encoded })),
                          ),
                        onFailure: (failure) =>
                          Schema.encodeUnknownEffect(codecView(operation.failure))(failure).pipe(
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
                       */
                      Effect.updateContext((ambient: Context.Context<never>) => Context.merge(context, ambient)),
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
export const layer = <R>(modules: ReadonlyArray<Module<R>>): Layer.Layer<HostBindingRegistry, HostBindingConflict, R> =>
  Layer.effect(HostBindingRegistry, make(modules))

/** @experimental */
export const layerTest = (implementation: Interface): Layer.Layer<HostBindingRegistry> =>
  Layer.succeed(HostBindingRegistry, HostBindingRegistry.of(implementation))
