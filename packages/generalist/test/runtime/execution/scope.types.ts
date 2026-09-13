import { Context, Crypto, Effect, Layer, Schema, SchemaTransformation, Stream } from "effect"
import { LanguageModel } from "effect/unstable/ai"
import { Agent } from "generalist"
import type { ObjectStore } from "generalist/durability/object-store"
import { Runtime } from "generalist/runtime"

declare const storage: Layer.Layer<ObjectStore | Crypto.Crypto>

const model = Layer.effect(
  LanguageModel.LanguageModel,
  LanguageModel.make({
    generateText: () => Effect.succeed([]),
    streamText: () => Stream.empty,
  }),
)

class InputPrefix extends Context.Service<InputPrefix, string>()(
  "generalist/test/runtime/execution/scope.types/InputPrefix",
) {}
class FactoryDependency extends Context.Service<FactoryDependency, string>()(
  "generalist/test/runtime/execution/scope.types/FactoryDependency",
) {}
class FactoryFailure extends Schema.TaggedError<FactoryFailure>()("generalist/test/execution-scope/FactoryFailure", {
  message: Schema.String,
}) {}

const servicefulInput = Schema.String.pipe(
  Schema.decodeTo(
    Schema.String,
    SchemaTransformation.transformOrFail({
      decode: (value) => Effect.succeed(value),
      encode: (value) => Effect.map(InputPrefix, (prefix) => `${prefix}${value}`),
    }),
  ),
)

const agent = Agent.make({ name: "scope-types", input: servicefulInput })
const agents = { "scope-types": agent }

Runtime.layer({
  agents,
  revision: "scope-types-v1",
  services: Layer.succeed(InputPrefix, ""),
  executionServices: (scope) => {
    const child: Effect.Effect<
      Runtime.ChildReceipt<"scope-types", string>,
      Runtime.ChildCapabilityFailure
    > = scope.children.start({ agent: "scope-types", input: "typed-input", commandId: "typed-command" })
    void child
    // @ts-expect-error Agent names remain constrained to the declared registry
    const missingAgent = scope.children.start({ agent: "missing", input: "typed-input", commandId: "missing-agent" })
    // @ts-expect-error Child input remains inferred from the selected Agent
    const invalidInput = scope.children.start({ agent: "scope-types", input: 123, commandId: "invalid-input" })
    void missingAgent
    void invalidInput
    return model
  },
  storage,
  namespace: { environment: "test", tenant: "types", partition: "local" },
})

const runtimeBoundModel: Layer.Layer<LanguageModel.LanguageModel, never, Runtime.Runtime> = Layer.effect(
  LanguageModel.LanguageModel,
  Effect.flatMap(Runtime.Runtime, () =>
    LanguageModel.make({ generateText: () => Effect.succeed([]), streamText: () => Stream.empty }),
  ),
)

const runtimeAgents = { runtime: Agent.make({ name: "runtime" }) }
const runtimeRequirement = Runtime.layer({
  agents: runtimeAgents,
  revision: "scope-types-runtime-requirement",
  services: Layer.empty,
  executionServices: (_scope: Runtime.ExecutionScope<typeof runtimeAgents>) => runtimeBoundModel,
  storage,
  namespace: { environment: "test", tenant: "types", partition: "local" },
})

Runtime.layer({
  agents,
  revision: "scope-types-missing-input-base",
  services: Layer.empty,
  // @ts-expect-error input encoding happens before child admission and must be covered by base services
  executionServices: () => Layer.merge(model, Layer.succeed(InputPrefix, "")),
  storage,
  namespace: { environment: "test", tenant: "types", partition: "local" },
})

Runtime.layer({
  agents: { plain: Agent.make({ name: "plain" }) },
  revision: "scope-types-missing-factory-dependency",
  services: Layer.empty,
  // @ts-expect-error execution factory dependencies must be covered by base services or ready Runtime
  executionServices: () =>
    Layer.effect(
      LanguageModel.LanguageModel,
      Effect.flatMap(FactoryDependency, () =>
        LanguageModel.make({ generateText: () => Effect.succeed([]), streamText: () => Stream.empty }),
      ),
    ),
  storage,
  namespace: { environment: "test", tenant: "types", partition: "local" },
})

Runtime.layer({
  agents: { plain: Agent.make({ name: "plain" }) },
  revision: "scope-types-fallible-factory",
  services: Layer.empty,
  // @ts-expect-error per-execution Layers are infallible; fallible resources belong in base services
  executionServices: () =>
    Layer.effect(LanguageModel.LanguageModel, Effect.fail(FactoryFailure.make({ message: "cannot acquire" }))),
  storage,
  namespace: { environment: "test", tenant: "types", partition: "local" },
})

type Registry = typeof agents
declare const childCapabilities: Runtime.ChildCapabilities<Registry>

// @ts-expect-error ExecutionScope carries a declaration-private nominal identity
const forgedScope: Runtime.ExecutionScope<Registry> = {
  runId: "forged",
  sessionId: "forged",
  children: childCapabilities,
}

// @ts-expect-error ChildReceipt carries a declaration-private nominal identity
const forgedReceipt: Runtime.ChildReceipt<"scope-types", string> = {
  childRunId: "forged",
  sessionId: "forged",
  agent: "scope-types",
  placement: { partition: "local" },
  duplicate: false,
}

const historicalDefinition = {
  agents,
  revision: "scope-types-v1",
  services: Layer.succeed(InputPrefix, ""),
  executionServices: () => model,
} satisfies Runtime.ExecutionRevisionDefinition<Registry, InputPrefix, never, never, LanguageModel.LanguageModel, never>

const versioned: Runtime.VersionedExecutionServicesOptions<
  Registry,
  InputPrefix,
  never,
  never,
  never,
  never,
  LanguageModel.LanguageModel,
  never,
  Registry,
  InputPrefix,
  never,
  never,
  never,
  never,
  LanguageModel.LanguageModel,
  never
> = {
  agents,
  revision: "scope-types-v2",
  services: Layer.succeed(InputPrefix, ""),
  executionServices: () => model,
  storage,
  namespace: { environment: "test", tenant: "types", partition: "local" },
  loadRevision: () => Effect.succeed({ _tag: "Found", definition: historicalDefinition }),
}

const invalidVersioned: typeof versioned = {
  ...versioned,
  loadRevision: () =>
    Effect.succeed({
      _tag: "Found" as const,
      // @ts-expect-error a loaded execution revision must retain its own exact factory
      definition: { agents, revision: "scope-types-v1", services: Layer.succeed(InputPrefix, "") },
    }),
}

void forgedScope
void forgedReceipt
void runtimeRequirement
void versioned
void invalidVersioned
