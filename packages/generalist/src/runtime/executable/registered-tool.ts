import { Context, Effect, Option, Schema, SchemaRepresentation } from "effect"
import { Tool, Toolkit } from "effect/unstable/ai"
import { make as makeTool } from "../../core/durable/manifest/tool-manifest.js"
import { makeCapability } from "../../core/durable/pin.js"
import { Approvals } from "../../core/policy/approvals.js"
import { Permissions, RuleStore } from "../../core/policy/permissions.js"
import { make as makeAuthorizer } from "../../core/tools/tool-authorization.js"
import { ToolContext } from "../../core/tools/tool-context.js"
import { executeToolkit, ToolExecutor } from "../../core/tools/tool-executor.js"
import { ExecutableRegistrationInvalid } from "../errors.js"
import { make as makeExecutable } from "./manifest.js"
import { requiredPins, type ExecutableRegistration } from "./registration.js"
import type { ToolResolution } from "./resolver.js"
import { Identity, ToolIdentity } from "./tool-identity.js"

export type ToolServices<T extends Tool.Any> =
  | Tool.HandlersFor<Toolkit.ToolsByName<readonly [T]>>
  | Exclude<Tool.HandlerServices<T>, ToolContext>
  | T["parametersSchema"]["EncodingServices"]
  | T["parametersSchema"]["DecodingServices"]
  | T["successSchema"]["EncodingServices"]
  | T["successSchema"]["DecodingServices"]
  | T["failureSchema"]["EncodingServices"]
  | T["failureSchema"]["DecodingServices"]
  | Permissions
  | Approvals

export interface RegisteredTool {
  readonly source: Tool.Any
  readonly resolution: ToolResolution
  readonly registrations: ReadonlyArray<ExecutableRegistration>
  readonly context: Context.Context<unknown>
}

export const codec = "generalist/runtime/registered-tool"

export const capture = <T extends Tool.Any>(
  tool: T,
): Effect.Effect<RegisteredTool, ExecutableRegistrationInvalid, ToolServices<T>> =>
  Effect.gen(function* () {
    const annotated = Context.getOption(tool.annotations, ToolIdentity)
    if (Option.isNone(annotated))
      return yield* ExecutableRegistrationInvalid.make({
        message:
          "Independent Tool declarations require a ToolIdentity annotation with implementation and policy identities.",
      })
    const identity = yield* Schema.decodeEffect(Identity)(annotated.value).pipe(
      Effect.mapError((error) => ExecutableRegistrationInvalid.make({ message: error.message })),
    )
    const context = yield* Effect.context<ToolServices<T>>()
    const captured = Context.makeUnsafe<unknown>(context.pipe(Context.omit(ToolContext)).mapUnsafe)
    const permissions = yield* Permissions
    const approvals = yield* Approvals
    const executor = yield* Effect.serviceOption(ToolExecutor)
    const rules = yield* Effect.serviceOption(RuleStore)
    const ruleStore = Option.getOrElse(rules, () =>
      RuleStore.of({ rules: Effect.succeed([]), remember: () => Effect.void }),
    )
    const schemaPin = (schema: Schema.Top) =>
      makeCapability(SchemaRepresentation.toJson(SchemaRepresentation.toRepresentation(schema.ast)))
    const name = yield* Schema.decodeUnknownEffect(Schema.String)(tool.name).pipe(
      Effect.mapError((error) => ExecutableRegistrationInvalid.make({ message: error.message })),
    )
    const approval = tool.needsApproval ?? false
    const pinned = yield* Effect.try({
      try: () =>
        makeTool({
          name,
          tool: makeCapability({ runtime: codec, name, implementation: identity.implementation }),
          input: schemaPin(tool.parametersSchema),
          output: schemaPin(tool.successSchema),
          failure: schemaPin(tool.failureSchema),
          replay: "never",
          policy: makeCapability({
            runtime: codec,
            policy: identity.policy,
            needsApproval: Schema.is(Schema.Boolean)(approval) ? approval : "predicate",
          }),
        }),
      catch: (error) => ExecutableRegistrationInvalid.make({ message: String(error) }),
    })
    const executable = makeExecutable({ root: pinned.pin, entries: [{ _tag: "Tool", ...pinned }] })
    const toolkit = yield* Toolkit.make(tool).pipe(Effect.provideContext(captured))
    const closeCodec = <S extends Schema.Top>(schema: S): Schema.Codec<unknown, unknown> =>
      schema.pipe(
        Schema.middlewareDecoding((effect) => effect.pipe(Effect.provideContext(captured))),
        Schema.middlewareEncoding((effect) => effect.pipe(Effect.provideContext(captured))),
      )
    return {
      source: tool,
      context: captured,
      registrations: [...requiredPins(executable)].map((pin) => ({ pin, codec, version: "1", payload: {} })),
      resolution: {
        _tag: "Tool",
        pinned,
        tool,
        input: closeCodec(tool.parametersSchema),
        output: closeCodec(tool.successSchema),
        failure: closeCodec(tool.failureSchema),
        executor: Option.getOrElse(executor, () => ({
          execute: (request) => executeToolkit(toolkit, request).pipe(Effect.provideContext(captured)),
        })),
        authorizer: (runtimeApprovals) =>
          makeAuthorizer({
            permissions,
            approvals: Approvals.of({
              resolve: (pending) =>
                runtimeApprovals
                  .resolve(pending)
                  .pipe(
                    Effect.flatMap((resolution) =>
                      resolution._tag === "Pending" ? approvals.resolve(pending) : Effect.succeed(resolution),
                    ),
                  ),
            }),
            ruleStore,
          }),
        attestation: executable,
      },
    }
  })
