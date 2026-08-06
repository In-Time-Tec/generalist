import {
  AgentManifest as AgentManifestSchema,
  CompactionIdentity,
  ChildBinding,
  NamedCapability,
  PolicyIdentity,
  PortablePolicy,
  ProgramAuthority,
  fromLiveAgent,
  make as makeAgentManifest,
} from "./durable/agent-manifest.js"
import {
  AgentEntry,
  ExecutableEntry,
  ExecutableTarget,
  ExecutableManifest as ExecutableManifestSchema,
  ExecutableRef,
  decode as decodeExecutableManifest,
  encode as encodeExecutableManifest,
  make as makeExecutableManifest,
  makeTest as makeTestExecutableManifest,
  validateRef,
  ProgramEntry,
} from "./durable/executable-manifest.js"
import {
  AgentPin,
  CapabilityPin,
  ExecutablePin,
  ModelPin,
  ProgramPin,
  makeCapability,
  makeModel,
  makeProgram,
} from "./durable/pin.js"
import {
  ProgramBudget,
  ProgramAgentCapability,
  ProgramCapabilityManifest,
  ProgramManifest as ProgramManifestSchema,
  ProgramSource,
  make as makeProgramManifest,
} from "./durable/program-manifest.js"
import { digest } from "./durable/canonical-json.js"
import { DurableDriver } from "./durable/facade-durableDriver.js"
import { RunBudget } from "./durable/facade-runBudget.js"
import { Agent } from "./agent/facade-agent.js"
import { AgentEvent } from "./agent/facade-agentEvent.js"
import { AgentTool } from "./agent/facade-agentTool.js"
import { Approvals } from "./policy/facade-approvals.js"
import { Compaction } from "./turn/facade-compaction.js"
import { ContextOverflow } from "./model/facade-contextOverflow.js"
import { Guardrail } from "./policy/facade-guardrail.js"
import { Handoff } from "./policy/facade-handoff.js"
import { Instructions } from "./context/facade-instructions.js"
import { Memory } from "./context/facade-memory.js"
import { ModelMiddleware } from "./model/facade-modelMiddleware.js"
import { ModelRegistry } from "./model/facade-modelRegistry.js"
import { ModelResilience } from "./model/facade-modelResilience.js"
import { ModelStreamTermination } from "./model/facade-modelStreamTermination.js"
import { ModelTelemetry } from "./model/facade-modelTelemetry.js"
import { ModelToolCallValidation } from "./model/facade-modelToolCallValidation.js"
import { Permissions } from "./policy/facade-permissions.js"
import { Session } from "./context/facade-session.js"
import { SessionSync } from "./context/facade-sessionSync.js"
import { SkillSource } from "./context/facade-skillSource.js"
import { Steering } from "./turn/facade-steering.js"
import { ToolAuthorization } from "./tools/facade-toolAuthorization.js"
import { ToolContext } from "./tools/facade-toolContext.js"
import { ToolExecutor } from "./tools/facade-toolExecutor.js"
import { ToolOutput } from "./tools/facade-toolOutput.js"
import { ToolPlacement } from "./tools/facade-toolPlacement.js"
import { TurnPolicy } from "./turn/facade-turnPolicy.js"
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
  ProgramMemberKey,
  ProgramOperationUnknown,
  ProgramOperationName,
  ProgramReplayDivergence,
  ProgramSchemaFailure,
  ProgramStepFailure,
  ProgramSuspended,
  ProgramToolFailure,
} from "./program/program-capabilities.js"
import {
  ProgramReplayPolicy,
  agent as makeProgramAgentBinding,
  make as makeProgramBindings,
  step as makeProgramStepBinding,
  tool as makeProgramToolBinding,
} from "./program/program-bindings.js"
import {
  ExecutionFailure as ProgramExecutionFailure,
  ProgramBindingMismatch,
  ProgramHost as ProgramHostService,
  ProgramIdentityMismatch,
  layerDirect as layerDirectProgramHost,
  validateBindings as validateProgramBindings,
} from "./program/program-host.js"
import {
  ExecutionFailure as SandboxExecutionFailureSchema,
  Identity as SandboxIdentity,
  SandboxExecutionFailure,
  SandboxExecutor as SandboxExecutorService,
  SandboxProtocolViolation,
  SandboxUnavailable,
  layerTest as layerTestSandboxExecutor,
  makeTest as makeTestSandboxExecutor,
  testIdentity as testSandboxIdentity,
} from "./program/sandbox-executor.js"

export const Pins = {
  AgentPin,
  ProgramPin,
  ModelPin,
  CapabilityPin,
  ExecutablePin,
  digest,
  makeModel,
  makeCapability,
  makeProgram,
}
export namespace Pins {
  export type AgentPin = import("./durable/pin.js").AgentPin
  export type ProgramPin = import("./durable/pin.js").ProgramPin
  export type ModelPin = import("./durable/pin.js").ModelPin
  export type CapabilityPin = import("./durable/pin.js").CapabilityPin
  export type ExecutablePin = import("./durable/pin.js").ExecutablePin
}

type ProgramManifestFacade = typeof import("./durable/program-manifest.js")

export const ProgramManifest = {
  ProgramAgentCapability,
  ProgramBudget,
  ProgramCapabilityManifest,
  ProgramManifest: ProgramManifestSchema,
  ProgramSource,
  make: makeProgramManifest,
} as ProgramManifestFacade
export namespace ProgramManifest {
  export type ProgramAgentCapability = import("./durable/program-manifest.js").ProgramAgentCapability
  export type ProgramBudget = import("./durable/program-manifest.js").ProgramBudget
  export type ProgramCapabilityManifest = import("./durable/program-manifest.js").ProgramCapabilityManifest
  export type ProgramManifest = import("./durable/program-manifest.js").ProgramManifest
  export type ProgramSource = import("./durable/program-manifest.js").ProgramSource
  export type PinnedProgram = import("./durable/program-manifest.js").PinnedProgram
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
  ProgramOperationName,
  ProgramReplayDivergence,
  ProgramSchemaFailure,
  ProgramStepFailure,
  ProgramSuspended,
  ProgramToolFailure,
}
export namespace ProgramCapabilities {
  export type CapabilityFailure = import("./program/program-capabilities.js").CapabilityFailure
  export type ProgramBudgetExhausted = import("./program/program-capabilities.js").ProgramBudgetExhausted
  export type Interface = import("./program/program-capabilities.js").Interface
  export type ToolCallInput = import("./program/program-capabilities.js").ToolCallInput
  export type StepCallInput = import("./program/program-capabilities.js").StepCallInput
  export type AgentRunInput = import("./program/program-capabilities.js").AgentRunInput
  export type AgentRunResult = import("./program/program-capabilities.js").AgentRunResult
  export type AgentMapInput = import("./program/program-capabilities.js").AgentMapInput
  export type AgentFanOutInput = import("./program/program-capabilities.js").AgentFanOutInput
  export type AgentMemberResult = import("./program/program-capabilities.js").AgentMemberResult
  export type LogInput = import("./program/program-capabilities.js").LogInput
  export type ToolSummary = import("./program/program-capabilities.js").ToolSummary
  export type ToolDescription = import("./program/program-capabilities.js").ToolDescription
}

export const ProgramBindings = {
  ProgramReplayPolicy,
  agent: makeProgramAgentBinding,
  make: makeProgramBindings,
  step: makeProgramStepBinding,
  tool: makeProgramToolBinding,
}
export namespace ProgramBindings {
  export type Bindings = import("./program/program-bindings.js").Bindings
  export type ToolBinding<I, IE, O, OE, E = never> = import("./program/program-bindings.js").ToolBinding<
    I,
    IE,
    O,
    OE,
    E
  >
  export type StepBinding<I, IE, O, OE, E = never> = import("./program/program-bindings.js").StepBinding<
    I,
    IE,
    O,
    OE,
    E
  >
  export type AgentBinding<
    I extends import("effect/unstable/ai").Prompt.RawInput,
    IE,
    E = never,
  > = import("./program/program-bindings.js").AgentBinding<I, IE, E>
  export type AnyTool = import("./program/program-bindings.js").AnyTool
  export type AnyStep = import("./program/program-bindings.js").AnyStep
  export type AnyAgent = import("./program/program-bindings.js").AnyAgent
  export type Authorize<I> = import("./program/program-bindings.js").Authorize<I>
  export type Invocation = import("./program/program-bindings.js").Invocation
  export type AgentInvocation = import("./program/program-bindings.js").AgentInvocation
  export type ProgramReplayPolicy = import("./program/program-bindings.js").ProgramReplayPolicy
}

export const ProgramHost = {
  ExecutionFailure: ProgramExecutionFailure,
  ProgramBindingMismatch,
  ProgramHost: ProgramHostService,
  ProgramIdentityMismatch,
  layerDirect: layerDirectProgramHost,
  validateBindings: validateProgramBindings,
}
export namespace ProgramHost {
  export type ProgramHost = import("./program/program-host.js").ProgramHost
  export type Interface = import("./program/program-host.js").Interface
  export type Request = import("./program/program-host.js").Request
  export type ExecutionFailure = import("./program/program-host.js").ExecutionFailure
}

export const SandboxExecutor = {
  ExecutionFailure: SandboxExecutionFailureSchema,
  Identity: SandboxIdentity,
  SandboxExecutionFailure,
  SandboxExecutor: SandboxExecutorService,
  SandboxProtocolViolation,
  SandboxUnavailable,
  layerTest: layerTestSandboxExecutor,
  makeTest: makeTestSandboxExecutor,
  testIdentity: testSandboxIdentity,
}
export namespace SandboxExecutor {
  export type ExecutionFailure = import("./program/sandbox-executor.js").ExecutionFailure
  export type Identity = import("./program/sandbox-executor.js").Identity
  export type Interface = import("./program/sandbox-executor.js").Interface
  export type Request = import("./program/sandbox-executor.js").Request
}

type AgentManifestFacade = typeof import("./durable/agent-manifest.js")

export const AgentManifest = {
  AgentManifest: AgentManifestSchema,
  CompactionIdentity,
  ChildBinding,
  NamedCapability,
  PolicyIdentity,
  PortablePolicy,
  ProgramAuthority,
  fromLiveAgent,
  make: makeAgentManifest,
} as AgentManifestFacade
export namespace AgentManifest {
  export type AgentManifest = import("./durable/agent-manifest.js").AgentManifest
  export type PinnedAgent = import("./durable/agent-manifest.js").PinnedAgent
  export type NamedCapability = import("./durable/agent-manifest.js").NamedCapability
  export type ChildBinding = import("./durable/agent-manifest.js").ChildBinding
  export type PolicyIdentity = import("./durable/agent-manifest.js").PolicyIdentity
  export type CompactionIdentity = import("./durable/agent-manifest.js").CompactionIdentity
  export type PortablePolicy = import("./durable/agent-manifest.js").PortablePolicy
  export type ProgramAuthority = import("./durable/agent-manifest.js").ProgramAuthority
}

type ExecutableManifestFacade = typeof import("./durable/executable-manifest.js")

export const ExecutableManifest = {
  AgentEntry,
  ExecutableEntry,
  ProgramEntry,
  ExecutableTarget,
  ExecutableManifest: ExecutableManifestSchema,
  ExecutableRef,
  decode: decodeExecutableManifest,
  encode: encodeExecutableManifest,
  make: makeExecutableManifest,
  makeTest: makeTestExecutableManifest,
  validateRef,
} as ExecutableManifestFacade
export namespace ExecutableManifest {
  export type ExecutableManifest = import("./durable/executable-manifest.js").ExecutableManifest
  export type ExecutableRef = import("./durable/executable-manifest.js").ExecutableRef
  export type PinnedExecutable = import("./durable/executable-manifest.js").PinnedExecutable
  export type AgentEntry = import("./durable/executable-manifest.js").AgentEntry
  export type ExecutableEntry = import("./durable/executable-manifest.js").ExecutableEntry
  export type ProgramEntry = import("./durable/executable-manifest.js").ProgramEntry
  export type ExecutableTarget = import("./durable/executable-manifest.js").ExecutableTarget
}

export {
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
  Permissions,
  RunBudget,
  Session,
  SessionSync,
  SkillSource,
  Steering,
  ToolAuthorization,
  ToolContext,
  ToolExecutor,
  ToolOutput,
  ToolPlacement,
  TurnPolicy,
}

export type AgentFacade = typeof import("./agent/agent.js")
export type AgentEventFacade = typeof import("./agent/agent-event.js")
export type ModelTelemetryFacade = typeof import("./model/model-telemetry.js")
export type ToolExecutorFacade = typeof import("./tools/tool-executor.js")
export type TurnPolicyFacade = typeof import("./turn/turn-policy.js")
export type ModelRegistryFacade = typeof import("./model/model-registry.js")
export type SkillSourceFacade = typeof import("./context/skill-source.js")
export type CoreAgent = import("./agent/agent.js").Agent
export type CoreMemory = import("./context/memory.js").Memory
export type CoreSkillSource = import("./context/skill-source.js").SkillSource
export type CoreSkillSourceError = import("./context/skill-source.js").SkillSourceError
export type CoreModelRegistry = import("./model/model-registry.js").ModelRegistry
export type CoreModelRegistryRegistration = import("./model/model-registry.js").Registration

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
