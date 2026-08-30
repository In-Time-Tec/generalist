import {
  AgentManifest as AgentManifestSchema,
  CompactionIdentity,
  ChildSelection,
  NamedCapability,
  PinnedContent,
  PolicyIdentity,
  PortablePolicy,
  ProgramAuthority,
  fromLiveAgent,
  make as makeAgentManifest,
} from "./durable/manifest/agent-manifest.js"
import {
  AgentEntry,
  ExecutableEntry,
  ExecutableTarget,
  ExecutableManifest as ExecutableManifestSchema,
  ExecutableRef,
  ProfileBinding,
  decode as decodeExecutableManifest,
  encode as encodeExecutableManifest,
  make as makeExecutableManifest,
  test as makeTestExecutableManifest,
  validateRef,
  ProgramEntry,
} from "./durable/manifest/executable-manifest.js"
import { AgentPin, CapabilityPin, ExecutablePin, ModelPin, Pin, ProgramPin } from "./durable/pin.js"
import {
  ProgramBudget,
  ProgramAgentCapability,
  ProgramCapabilityManifest,
  ProgramManifest as ProgramManifestSchema,
  ProgramSource,
  make as makeProgramManifest,
} from "./durable/manifest/program-manifest.js"
import { digest } from "./durable/canonical-json.js"
import { RunId } from "./durable/run-id.js"
import { DurableDriver } from "./durable/public/driver.js"
import { RunBudget } from "./durable/public/run-budget.js"
import { Agent } from "./agent/public/service.js"
import { ActiveModelResponse } from "./model/public/active-model-response.js"
import { AgentEvent } from "./agent/public/event.js"
import { AgentTool } from "./agent/public/tool.js"
import { Approvals } from "./policy/facade-approvals.js"
import { Compaction } from "./turn/facade-compaction.js"
import { ContextOverflow } from "./model/public/context-overflow.js"
import { Guardrail } from "./policy/facade-guardrail.js"
import { Handoff } from "./policy/facade-handoff.js"
import { Instructions } from "./context/public/instructions.js"
import { Memory } from "./context/public/memory.js"
import { ModelMiddleware } from "./model/public/middleware.js"
import { ModelRegistry } from "./model/public/registry.js"
import { ModelResilience } from "./model/public/resilience.js"
import { ModelStreamTermination } from "./model/public/stream-termination.js"
import { ModelTelemetry } from "./model/public/telemetry.js"
import { ModelToolCallValidation } from "./model/public/tool-call-validation.js"
import { Permissions } from "./policy/facade-permissions.js"
import { Session } from "./context/public/session.js"
import { SessionHistory } from "./context/public/session-history.js"
import { SessionSync } from "./context/public/session-sync.js"
import { SkillCatalog } from "./context/public/skill-catalog.js"
import { Steering } from "./turn/facade-steering.js"
import { ToolAuthorization } from "./tools/public/tool-authorization.js"
import { NestedOperation } from "./tools/public/nested-operation.js"
import { ToolContext } from "./tools/public/tool-context.js"
import { ToolExecutor } from "./tools/public/tool-executor.js"
import { ToolOutput } from "./tools/public/tool-output.js"
import { ToolPlacement } from "./tools/public/tool-placement.js"
import { TurnPolicy } from "./turn/facade-turn-policy.js"
import { make as makeAgentProgram, run as runAgentProgram } from "./program/agent-program.js"
import {
  CapabilityFailure,
  LogLevel,
  ProgramAgentFailure,
  ProgramAuthorizationFailure,
  ProgramBudgetExhausted,
  ProgramCancelled,
  ProgramCapabilities as ProgramCapabilitiesService,
  ProgramCapabilityDenied,
  ProgramCapabilityMissing,
  ProgramInvocationFailure,
  ProgramMemberKey,
  ProgramOperationUnknown,
  ProgramOperationName,
  ProgramReplayDivergence,
  ProgramSchemaFailure,
  ProgramStepFailure,
  ProgramSuspended,
  ProgramToolFailure,
} from "./program/capabilities.js"
import {
  ProgramReplayPolicy,
  agent as makeProgramAgentHandler,
  make as makeProgramHandlers,
  step as makeProgramStepHandler,
  tool as makeProgramToolHandler,
} from "./program/handlers.js"
import {
  ExecutionFailure as ProgramExecutionFailure,
  ProgramHandlerMismatch,
  ProgramRunner as ProgramRunnerService,
  ProgramIdentityMismatch,
  layerDirect as layerDirectProgramRunner,
  validateHandlers as validateProgramHandlers,
} from "./program/runner.js"
import {
  ExecutionFailure as SandboxExecutionFailureSchema,
  Identity as SandboxIdentity,
  Module as SandboxModule,
  Result as SandboxResult,
  CapabilityGrant as SandboxCapabilityGrant,
  admit as admitSandboxRequest,
  declareIdentity as declareSandboxIdentity,
  protocolVersion as sandboxProtocolVersion,
  sourceDigest as sandboxSourceDigest,
  validateResult as validateSandboxResult,
  SandboxCancelled,
  SandboxDeadlineExceeded,
  SandboxExecutionFailure,
  CodeExecutor as CodeExecutorService,
  SandboxGuaranteeUnavailable,
  SandboxInputInvalid,
  SandboxOutputInvalid,
  SandboxProtocolViolation,
  SandboxResourceExceeded,
  SandboxSourceInvalid,
  SandboxUnavailable,
  layerTest as layerTestCodeExecutor,
  request as makeSandboxRequest,
  make as makeTestCodeExecutor,
  testIdentity as testSandboxIdentity,
} from "./program/code-executor.js"

/** @experimental Stable identity of one Agent execution. */
export { RunId }

export const Pins = {
  AgentPin,
  ProgramPin,
  ModelPin,
  CapabilityPin,
  ExecutablePin,
  digest,
  makeModel: Pin.makeModel,
  makeCapability: Pin.makeCapability,
  makeProgram: Pin.makeProgram,
}
export namespace Pins {
  export type AgentPin = import("./durable/pin.js").AgentPin
  export type ProgramPin = import("./durable/pin.js").ProgramPin
  export type ModelPin = import("./durable/pin.js").ModelPin
  export type CapabilityPin = import("./durable/pin.js").CapabilityPin
  export type ExecutablePin = import("./durable/pin.js").ExecutablePin
}

type ProgramManifestFacade = typeof import("./durable/manifest/program-manifest.js")

export const ProgramManifest = {
  ProgramAgentCapability,
  ProgramBudget,
  ProgramCapabilityManifest,
  ProgramManifest: ProgramManifestSchema,
  ProgramSource,
  make: makeProgramManifest,
} satisfies ProgramManifestFacade
export namespace ProgramManifest {
  export type ProgramAgentCapability = import("./durable/manifest/program-manifest.js").ProgramAgentCapability
  export type ProgramBudget = import("./durable/manifest/program-manifest.js").ProgramBudget
  export type ProgramCapabilityManifest = import("./durable/manifest/program-manifest.js").ProgramCapabilityManifest
  export type ProgramManifest = import("./durable/manifest/program-manifest.js").ProgramManifest
  export type ProgramSource = import("./durable/manifest/program-manifest.js").ProgramSource
  export type PinnedProgram = import("./durable/manifest/program-manifest.js").PinnedProgram
}

export const AgentProgram = { make: makeAgentProgram, run: runAgentProgram }
export namespace AgentProgram {
  export type Program<I, IE, O, OE> = import("./program/agent-program.js").Program<I, IE, O, OE>
}

export const ProgramCapabilities = {
  CapabilityFailure,
  LogLevel,
  ProgramAgentFailure,
  ProgramAuthorizationFailure,
  ProgramBudgetExhausted,
  ProgramCancelled,
  ProgramCapabilities: ProgramCapabilitiesService,
  ProgramCapabilityDenied,
  ProgramCapabilityMissing,
  ProgramMemberKey,
  ProgramOperationUnknown,
  ProgramInvocationFailure,
  ProgramOperationName,
  ProgramReplayDivergence,
  ProgramSchemaFailure,
  ProgramStepFailure,
  ProgramSuspended,
  ProgramToolFailure,
}
export namespace ProgramCapabilities {
  export type CapabilityFailure = import("./program/capabilities.js").CapabilityFailure
  export type ProgramSuspended = import("./program/capabilities.js").ProgramSuspended
  export type ProgramBudgetExhausted = import("./program/capabilities.js").ProgramBudgetExhausted
  export type Service = import("./program/capabilities.js").Service
  export type ToolCallInput = import("./program/capabilities.js").ToolCallInput
  export type StepCallInput = import("./program/capabilities.js").StepCallInput
  export type AgentRunInput = import("./program/capabilities.js").AgentRunInput
  export type AgentRunResult = import("./program/capabilities.js").AgentRunResult
  export type AgentMapInput = import("./program/capabilities.js").AgentMapInput
  export type AgentFanOutInput = import("./program/capabilities.js").AgentFanOutInput
  export type AgentMemberResult = import("./program/capabilities.js").AgentMemberResult
  export type LogInput = import("./program/capabilities.js").LogInput
  export type ToolSummary = import("./program/capabilities.js").ToolSummary
  export type ToolDescription = import("./program/capabilities.js").ToolDescription
}

export const ProgramHandlers = {
  ProgramReplayPolicy,
  agent: makeProgramAgentHandler,
  make: makeProgramHandlers,
  step: makeProgramStepHandler,
  tool: makeProgramToolHandler,
}
export namespace ProgramHandlers {
  export type Handlers = import("./program/handlers.js").Handlers
  export type TypedTool = import("./program/handlers.js").TypedTool
  export type TypedStep = import("./program/handlers.js").TypedStep
  export type ToolHandler<I, IE, O, OE, E = never> = import("./program/handlers.js").ToolHandler<I, IE, O, OE, E>
  export type StepHandler<I, IE, O, OE, E = never> = import("./program/handlers.js").StepHandler<I, IE, O, OE, E>
  export type AgentHandler<
    I extends import("effect/unstable/ai").Prompt.RawInput,
    IE,
    E = never,
  > = import("./program/handlers.js").AgentHandler<I, IE, E>
  export type AnyTool = import("./program/handlers.js").AnyTool
  export type AnyStep = import("./program/handlers.js").AnyStep
  export type AnyAgent = import("./program/handlers.js").AnyAgent
  export type Authorize<I> = import("./program/handlers.js").Authorize<I>
  export type Invocation = import("./program/handlers.js").Invocation
  export type AgentInvocation = import("./program/handlers.js").AgentInvocation
  export type ProgramReplayPolicy = import("./program/handlers.js").ProgramReplayPolicy
}

export const ProgramRunner = {
  ExecutionFailure: ProgramExecutionFailure,
  ProgramHandlerMismatch,
  ProgramRunner: ProgramRunnerService,
  ProgramIdentityMismatch,
  layerDirect: layerDirectProgramRunner,
  validateHandlers: validateProgramHandlers,
}
export namespace ProgramRunner {
  export type ProgramRunner = import("./program/runner.js").ProgramRunner
  export type Service = import("./program/runner.js").Service
  export type Request = import("./program/runner.js").Request
  export type ExecutionFailure = import("./program/runner.js").ExecutionFailure
}

export const CodeExecutor = {
  CapabilityGrant: SandboxCapabilityGrant,
  ExecutionFailure: SandboxExecutionFailureSchema,
  Identity: SandboxIdentity,
  Module: SandboxModule,
  Result: SandboxResult,
  admit: admitSandboxRequest,
  declareIdentity: declareSandboxIdentity,
  SandboxCancelled,
  SandboxDeadlineExceeded,
  SandboxExecutionFailure,
  CodeExecutor: CodeExecutorService,
  SandboxGuaranteeUnavailable,
  SandboxInputInvalid,
  SandboxOutputInvalid,
  SandboxProtocolViolation,
  SandboxResourceExceeded,
  SandboxSourceInvalid,
  SandboxUnavailable,
  layerTest: layerTestCodeExecutor,
  makeRequest: makeSandboxRequest,
  makeTest: makeTestCodeExecutor,
  protocolVersion: sandboxProtocolVersion,
  sourceDigest: sandboxSourceDigest,
  testIdentity: testSandboxIdentity,
  validateResult: validateSandboxResult,
}
export namespace CodeExecutor {
  export type CodeExecutor = import("./program/code-executor.js").CodeExecutor
  export type CapabilityGrant = import("./program/code-executor.js").CapabilityGrant
  export type ExecutionFailure = import("./program/code-executor.js").ExecutionFailure
  export type Identity = import("./program/code-executor.js").Identity
  export type Module = import("./program/code-executor.js").Module
  export type Request = import("./program/code-executor.js").Request
  export type Result = import("./program/code-executor.js").Result
  export type Service = import("./program/code-executor.js").Service
  export type TestExecute = import("./program/code-executor.js").TestExecute
}

type AgentManifestFacade = typeof import("./durable/manifest/agent-manifest.js")

export const AgentManifest = {
  AgentManifest: AgentManifestSchema,
  CompactionIdentity,
  ChildSelection,
  NamedCapability,
  PinnedContent,
  PolicyIdentity,
  PortablePolicy,
  ProgramAuthority,
  fromLiveAgent,
  make: makeAgentManifest,
} satisfies AgentManifestFacade
export namespace AgentManifest {
  export type AgentManifest = import("./durable/manifest/agent-manifest.js").AgentManifest
  export type PinnedAgent = import("./durable/manifest/agent-manifest.js").PinnedAgent
  export type NamedCapability = import("./durable/manifest/agent-manifest.js").NamedCapability
  export type PinnedContent = import("./durable/manifest/agent-manifest.js").PinnedContent
  export type ChildSelection = import("./durable/manifest/agent-manifest.js").ChildSelection
  export type PolicyIdentity = import("./durable/manifest/agent-manifest.js").PolicyIdentity
  export type CompactionIdentity = import("./durable/manifest/agent-manifest.js").CompactionIdentity
  export type PortablePolicy = import("./durable/manifest/agent-manifest.js").PortablePolicy
  export type ProgramAuthority = import("./durable/manifest/agent-manifest.js").ProgramAuthority
}

type ExecutableManifestFacade = Omit<typeof import("./durable/manifest/executable-manifest.js"), "test"> & {
  readonly makeTest: typeof import("./durable/manifest/executable-manifest.js").test
}

export const ExecutableManifest = {
  AgentEntry,
  ExecutableEntry,
  ProgramEntry,
  ExecutableTarget,
  ExecutableManifest: ExecutableManifestSchema,
  ExecutableRef,
  ProfileBinding,
  decode: decodeExecutableManifest,
  encode: encodeExecutableManifest,
  make: makeExecutableManifest,
  makeTest: makeTestExecutableManifest,
  validateRef,
} satisfies ExecutableManifestFacade
export namespace ExecutableManifest {
  export type ExecutableManifest = import("./durable/manifest/executable-manifest.js").ExecutableManifest
  export type ExecutableRef = import("./durable/manifest/executable-manifest.js").ExecutableRef
  export type PinnedExecutable = import("./durable/manifest/executable-manifest.js").PinnedExecutable
  export type AgentEntry = import("./durable/manifest/executable-manifest.js").AgentEntry
  export type ExecutableEntry = import("./durable/manifest/executable-manifest.js").ExecutableEntry
  export type ProgramEntry = import("./durable/manifest/executable-manifest.js").ProgramEntry
  export type ProfileBinding = import("./durable/manifest/executable-manifest.js").ProfileBinding
  export type ExecutableTarget = import("./durable/manifest/executable-manifest.js").ExecutableTarget
}

export { withCacheBreakpoints } from "./model/prompt-cache.js"

export {
  ActiveModelResponse,
  Agent,
  AgentEvent,
  AgentTool,
  Approvals,
  Compaction,
  ContextOverflow,
  DurableDriver,
  Guardrail,
  Handoff,
  Instructions,
  Memory,
  ModelMiddleware,
  ModelRegistry,
  ModelResilience,
  ModelStreamTermination,
  ModelTelemetry,
  ModelToolCallValidation,
  NestedOperation,
  Permissions,
  RunBudget,
  Session,
  SessionHistory,
  SessionSync,
  SkillCatalog,
  Steering,
  ToolAuthorization,
  ToolContext,
  ToolExecutor,
  ToolOutput,
  ToolPlacement,
  TurnPolicy,
}

export type AgentFacade = typeof import("./agent/service.js")
export type AgentEventFacade = typeof import("./agent/event.js")
export type ModelTelemetryFacade = typeof import("./model/telemetry/events.js")
export type ToolExecutorFacade = typeof import("./tools/tool-executor.js")
export type TurnPolicyFacade = typeof import("./turn/policy.js")
export type ModelRegistryFacade = typeof import("./model/registry.js")
export type SkillCatalogFacade = typeof import("./context/skill-catalog.js")
export type CoreAgent = import("./agent/service.js").Agent
export type CoreMemory = import("./context/memory.js").Memory
export type CoreSkillCatalog = import("./context/skill-catalog.js").SkillCatalog
export type CoreSkillCatalogError = import("./context/skill-catalog.js").SkillCatalogError
export type CoreModelRegistry = import("./model/registry.js").ModelRegistry
export type CoreModelRegistryRegistration = import("./model/registry.js").Registration

export {
  AiError,
  Chat,
  EmbeddingModel,
  IdGenerator,
  LanguageModel,
  Model,
  Prompt,
  Response,
  Telemetry,
  Tokenizer,
  Tool,
  Toolkit,
} from "effect/unstable/ai"
