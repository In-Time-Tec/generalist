import { Context, Crypto, Effect, Layer, Schema } from "effect"
import { LanguageModel, Tool, Toolkit } from "effect/unstable/ai"
import { Agent, CodeExecutor, ModelRegistry } from "generalist"
import type { ObjectStore } from "generalist/durability/object-store"
import { CodeMode, Runtime } from "generalist/runtime"

type Equal<Left, Right> =
  (<Value>() => Value extends Left ? 1 : 2) extends <Value>() => Value extends Right ? 1 : 2 ? true : false
type Assert<Value extends true> = Value
type IsAssignable<Source, Target> = Source extends Target ? true : false

class SearchDependency extends Context.Service<SearchDependency, { readonly search: (query: string) => string }>()(
  "generalist/test/runtime/code-mode.types/SearchDependency",
) {}
class StepDependency extends Context.Service<StepDependency, { readonly write: (body: string) => boolean }>()(
  "generalist/test/runtime/code-mode.types/StepDependency",
) {}
class ReviewerToolDependency extends Context.Service<ReviewerToolDependency, { readonly review: () => boolean }>()(
  "generalist/test/runtime/code-mode.types/ReviewerToolDependency",
) {}
class ReviewerInputDecoding extends Context.Service<ReviewerInputDecoding, true>()(
  "generalist/test/runtime/code-mode.types/ReviewerInputDecoding",
) {}
class ReviewerInputEncoding extends Context.Service<ReviewerInputEncoding, true>()(
  "generalist/test/runtime/code-mode.types/ReviewerInputEncoding",
) {}
class ReviewerOutputDecoding extends Context.Service<ReviewerOutputDecoding, true>()(
  "generalist/test/runtime/code-mode.types/ReviewerOutputDecoding",
) {}
class ReviewerOutputEncoding extends Context.Service<ReviewerOutputEncoding, true>()(
  "generalist/test/runtime/code-mode.types/ReviewerOutputEncoding",
) {}
class StepInputDecoding extends Context.Service<StepInputDecoding, true>()(
  "generalist/test/runtime/code-mode.types/StepInputDecoding",
) {}
class StepOutputEncoding extends Context.Service<StepOutputEncoding, true>()(
  "generalist/test/runtime/code-mode.types/StepOutputEncoding",
) {}
class StepFailureEncoding extends Context.Service<StepFailureEncoding, true>()(
  "generalist/test/runtime/code-mode.types/StepFailureEncoding",
) {}

class WriteFailed extends Schema.TaggedError<WriteFailed>()("generalist/test/runtime/code-mode/WriteFailed", {
  reportId: Schema.String,
}) {}

const search = Tool.make("search", {
  parameters: Schema.Struct({ query: Schema.String }),
  success: Schema.Struct({ urls: Schema.Array(Schema.String) }),
}).addDependency(SearchDependency)

const reviewerLookup = Tool.make("reviewer_lookup", {
  parameters: Schema.String,
  success: Schema.Boolean,
}).addDependency(ReviewerToolDependency)

const reviewerInput = Schema.Struct({ draft: Schema.String }).pipe(
  Schema.middlewareDecoding((effect) => Effect.flatMap(ReviewerInputDecoding, () => effect)),
  Schema.middlewareEncoding((effect) => Effect.flatMap(ReviewerInputEncoding, () => effect)),
)
const reviewerOutput = Schema.Struct({ approved: Schema.Boolean }).pipe(
  Schema.middlewareDecoding((effect) => Effect.flatMap(ReviewerOutputDecoding, () => effect)),
  Schema.middlewareEncoding((effect) => Effect.flatMap(ReviewerOutputEncoding, () => effect)),
)

const reviewer = Agent.make({
  name: "code-mode-reviewer",
  model: { provider: "test", model: "reviewer" },
  tools: [reviewerLookup],
  input: reviewerInput,
  output: reviewerOutput,
})

const stepInput = Schema.Struct({ reportId: Schema.String, body: Schema.String }).pipe(
  Schema.middlewareDecoding((effect) => Effect.flatMap(StepInputDecoding, () => effect)),
)
const stepOutput = Schema.Struct({ stored: Schema.Boolean }).pipe(
  Schema.middlewareEncoding((effect) => Effect.flatMap(StepOutputEncoding, () => effect)),
)
const stepFailure = WriteFailed.pipe(
  Schema.middlewareEncoding((effect) => Effect.flatMap(StepFailureEncoding, () => effect)),
)

const writeReport = CodeMode.step({
  name: "write_report",
  handlerVersion: "2",
  input: stepInput,
  output: stepOutput,
  failure: stepFailure,
  replay: "idempotent",
  authorize: () => StepDependency.pipe(Effect.map(() => true)),
  execute: ({ reportId, body }) =>
    StepDependency.pipe(
      Effect.flatMap((writer) =>
        writer.write(body) ? Effect.succeed({ stored: true }) : Effect.fail(WriteFailed.make({ reportId })),
      ),
    ),
})

const researcher = Agent.make({
  name: "code-mode-researcher",
  tools: [search],
  codeMode: {
    tools: [{ tool: search, handlerVersion: "1", replay: "recorded" }],
    agents: [{ agent: reviewer, selection: "reviewer", handlerVersion: "3", replay: "recorded" }],
    steps: [writeReport],
    executor: CodeExecutor.testIdentity,
    maxSourceBytes: 32_768,
    budget: {
      agentRuns: 4,
      concurrency: 2,
      toolCalls: 20,
      tokens: 50_000,
      wallClockMillis: 60_000,
      logBytes: 8_192,
      outputBytes: 32_768,
    },
  },
})

type ResearcherRequirements = Agent.Requirements<typeof researcher>
type DirectDeclarationRequirements = CodeMode.Requirements<{
  readonly tools: readonly [{ readonly tool: typeof search; readonly handlerVersion: "1"; readonly replay: "recorded" }]
  readonly agents: readonly [
    {
      readonly agent: typeof reviewer
      readonly selection: "reviewer"
      readonly handlerVersion: "3"
      readonly replay: "recorded"
    },
  ]
  readonly steps: readonly [typeof writeReport]
  readonly executor: CodeExecutor.Identity
  readonly maxSourceBytes: number
  readonly budget: CodeMode.Budget
}>
type _DirectAgentPropertyPreservesInputDecoding = Assert<
  IsAssignable<
    ReviewerInputDecoding,
    (typeof reviewer)["input"]["DecodingServices"]
  >
>
type _DirectStepPropertyPreservesInputDecoding = Assert<
  IsAssignable<StepInputDecoding, (typeof writeReport)["input"]["DecodingServices"]>
>
type _DirectSelectedAgentInputDecodingIsInferred = Assert<
  IsAssignable<ReviewerInputDecoding, DirectDeclarationRequirements>
>
type _DirectStepInputDecodingIsInferred = Assert<IsAssignable<StepInputDecoding, DirectDeclarationRequirements>>
type _DirectStepOutputEncodingIsInferred = Assert<IsAssignable<StepOutputEncoding, DirectDeclarationRequirements>>
type _DirectStepFailureEncodingIsInferred = Assert<IsAssignable<StepFailureEncoding, DirectDeclarationRequirements>>
type _ReviewerInputDecodingStaysOnCodec = Assert<
  IsAssignable<ReviewerInputDecoding, (typeof reviewerInput)["DecodingServices"]>
>
type _StepInputDecodingStaysOnCodec = Assert<
  IsAssignable<StepInputDecoding, (typeof stepInput)["DecodingServices"]>
>
type _StepOutputEncodingStaysOnCodec = Assert<
  IsAssignable<StepOutputEncoding, (typeof stepOutput)["EncodingServices"]>
>
type _StepFailureEncodingStaysOnCodec = Assert<
  IsAssignable<StepFailureEncoding, (typeof stepFailure)["EncodingServices"]>
>
type _ExecutorIsInferred = Assert<IsAssignable<CodeExecutor.CodeExecutor, ResearcherRequirements>>
type _ToolDependencyIsInferred = Assert<IsAssignable<SearchDependency, ResearcherRequirements>>
type _StepDependencyIsInferred = Assert<IsAssignable<StepDependency, ResearcherRequirements>>
type _SelectedAgentDependencyIsInferred = Assert<IsAssignable<ModelRegistry.ModelRegistry, ResearcherRequirements>>
type _SelectedAgentToolHandlerIsInferred = Assert<
  IsAssignable<Tool.HandlersFor<{ readonly reviewer_lookup: typeof reviewerLookup }>, ResearcherRequirements>
>
type _SelectedAgentToolDependencyIsInferred = Assert<IsAssignable<ReviewerToolDependency, ResearcherRequirements>>
type _SelectedAgentInputDecodingIsInferred = Assert<IsAssignable<ReviewerInputDecoding, ResearcherRequirements>>
type _SelectedAgentInputEncodingIsInferred = Assert<IsAssignable<ReviewerInputEncoding, ResearcherRequirements>>
type _SelectedAgentOutputDecodingIsInferred = Assert<IsAssignable<ReviewerOutputDecoding, ResearcherRequirements>>
type _SelectedAgentOutputEncodingIsInferred = Assert<IsAssignable<ReviewerOutputEncoding, ResearcherRequirements>>
type _StepInputDecodingIsInferred = Assert<IsAssignable<StepInputDecoding, ResearcherRequirements>>
type _StepOutputEncodingIsInferred = Assert<IsAssignable<StepOutputEncoding, ResearcherRequirements>>
type _StepFailureEncodingIsInferred = Assert<IsAssignable<StepFailureEncoding, ResearcherRequirements>>
type _RootModelIsInferred = Assert<IsAssignable<LanguageModel.LanguageModel, ResearcherRequirements>>
type _RequirementsAreNotUnknown = Assert<Equal<unknown extends ResearcherRequirements ? true : false, false>>
type _StepRequirementsStayExact = Assert<Equal<CodeMode.StepRequirements<typeof writeReport>, StepDependency>>
type _StepFailureStaysExact = Assert<Equal<CodeMode.StepFailure<typeof writeReport>, WriteFailed>>
type _ToolParametersStayExact = Assert<Equal<Tool.Parameters<typeof search>, { readonly query: string }>>
type _ToolResultStaysExact = Assert<Equal<Tool.Success<typeof search>, { readonly urls: ReadonlyArray<string> }>>
type _AgentInputStaysExact = Assert<Equal<Agent.Input<typeof reviewer>, { readonly draft: string }>>
type _AgentOutputStaysExact = Assert<Equal<Agent.Output<typeof reviewer>, { readonly approved: boolean }>>
type _ClaimAssemblyIsNotPublic = Assert<Equal<"make" extends keyof typeof CodeMode ? true : false, false>>
type _ToolAssemblyIsNotPublic = Assert<Equal<"withTool" extends keyof typeof CodeMode ? true : false, false>>

const delegatedTool = Tool.make("delegated_tool", {
  parameters: Schema.String,
  success: Schema.String,
})
type DelegatedTools = Toolkit.ToolsByName<readonly [typeof delegatedTool]>
declare const selectedAgentWithTool: Agent.Agent<
  DelegatedTools,
  ModelRegistry.ModelRegistry,
  ModelRegistry.ModelRegistry,
  ModelRegistry.ModelRegistry
>
declare const codeModeStorage: Layer.Layer<ObjectStore | Crypto.Crypto>
declare const modelRegistryAndExecutor: Layer.Layer<ModelRegistry.ModelRegistry | CodeExecutor.CodeExecutor>
declare const modelExecutorAndStep: Layer.Layer<
  ModelRegistry.ModelRegistry | CodeExecutor.CodeExecutor | StepDependency
>

const selectedToolRoot = Agent.make({
  name: "selected-tool-root",
  model: { provider: "test", model: "root" },
  codeMode: {
    tools: [],
    agents: [{ agent: selectedAgentWithTool, selection: "delegated", handlerVersion: "1", replay: "recorded" }],
    steps: [],
    executor: CodeExecutor.testIdentity,
    maxSourceBytes: 1,
    budget: {
      agentRuns: 1,
      concurrency: 1,
      toolCalls: 0,
      tokens: 1,
      wallClockMillis: 1,
      logBytes: 0,
      outputBytes: 1,
    },
  },
})

Runtime.layer({
  agents: { "selected-tool-root": selectedToolRoot },
  revision: "selected-tool-root-v1",
  // @ts-expect-error a selected Agent's own Tool handler Layer is part of the root declaration environment.
  services: modelRegistryAndExecutor,
  storage: codeModeStorage,
  namespace: { environment: "test", tenant: "code-mode-types", partition: "local" },
})

const stepCodecRoot = Agent.make({
  name: "step-codec-root",
  model: { provider: "test", model: "root" },
  codeMode: {
    tools: [],
    agents: [],
    steps: [writeReport],
    executor: CodeExecutor.testIdentity,
    maxSourceBytes: 1,
    budget: {
      agentRuns: 0,
      concurrency: 1,
      toolCalls: 0,
      tokens: 1,
      wallClockMillis: 1,
      logBytes: 0,
      outputBytes: 1,
    },
  },
})

Runtime.layer({
  agents: { "step-codec-root": stepCodecRoot },
  revision: "step-codec-root-v1",
  // @ts-expect-error step input decoding, output encoding, and failure encoding Layers cannot be omitted.
  services: modelExecutorAndStep,
  storage: codeModeStorage,
  namespace: { environment: "test", tenant: "code-mode-types", partition: "local" },
})

void (() => {
  // @ts-expect-error every Tool grant requires a stable handler version.
  const missingHandlerVersion: CodeMode.ToolGrant<typeof search> = { tool: search, replay: "recorded" }
  void missingHandlerVersion

  Agent.make({
    name: "missing-budget-member",
    codeMode: {
      tools: [],
      agents: [],
      steps: [],
      executor: CodeExecutor.testIdentity,
      maxSourceBytes: 1,
      // @ts-expect-error every budget dimension is explicit.
      budget: {
        agentRuns: 0,
        concurrency: 1,
        toolCalls: 0,
        tokens: 0,
        wallClockMillis: 1,
        logBytes: 0,
      },
    },
  })

  Agent.make({
    name: "forged-step",
    codeMode: {
      tools: [],
      agents: [],
      steps: [
        // @ts-expect-error steps carry declaration-private nominal identity and typed callbacks.
        {
          name: "forged",
          handlerVersion: "1",
          input: Schema.String,
          output: Schema.String,
          failure: Schema.Never,
          replay: "recorded",
        },
      ],
      executor: CodeExecutor.testIdentity,
      maxSourceBytes: 1,
      budget: {
        agentRuns: 0,
        concurrency: 1,
        toolCalls: 0,
        tokens: 0,
        wallClockMillis: 1,
        logBytes: 0,
        outputBytes: 1,
      },
    },
  })

  CodeMode.step({
    name: "wrong-output",
    handlerVersion: "1",
    input: Schema.String,
    output: Schema.Finite,
    failure: Schema.Never,
    replay: "recorded",
    authorize: () => Effect.succeed(true),
    // @ts-expect-error step execution must produce the declared decoded output.
    execute: () => Effect.succeed("not-a-number"),
  })
})

void researcher
