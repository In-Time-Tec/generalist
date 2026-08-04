import {
  AgentManifest as AgentManifestSchema,
  ChildBinding,
  NamedCapability,
  PolicyIdentity,
  PortablePolicy,
  fromLiveAgent,
  make as makeAgentManifest,
} from "./durable/agent-manifest.js"
import {
  AgentEntry,
  ExecutableManifest as ExecutableManifestSchema,
  ExecutableRef,
  decode as decodeExecutableManifest,
  encode as encodeExecutableManifest,
  make as makeExecutableManifest,
  makeTest as makeTestExecutableManifest,
  validateRef,
} from "./durable/executable-manifest.js"
import { AgentPin, CapabilityPin, ExecutablePin, ModelPin, makeCapability, makeModel } from "./durable/pin.js"
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

export const Pins = { AgentPin, ModelPin, CapabilityPin, ExecutablePin, digest, makeModel, makeCapability }
export namespace Pins {
  export type AgentPin = import("./durable/pin.js").AgentPin
  export type ModelPin = import("./durable/pin.js").ModelPin
  export type CapabilityPin = import("./durable/pin.js").CapabilityPin
  export type ExecutablePin = import("./durable/pin.js").ExecutablePin
}

type AgentManifestFacade = typeof import("./durable/agent-manifest.js")

export const AgentManifest = {
  AgentManifest: AgentManifestSchema,
  ChildBinding,
  NamedCapability,
  PolicyIdentity,
  PortablePolicy,
  fromLiveAgent,
  make: makeAgentManifest,
} as AgentManifestFacade
export namespace AgentManifest {
  export type AgentManifest = import("./durable/agent-manifest.js").AgentManifest
  export type PinnedAgent = import("./durable/agent-manifest.js").PinnedAgent
  export type NamedCapability = import("./durable/agent-manifest.js").NamedCapability
  export type ChildBinding = import("./durable/agent-manifest.js").ChildBinding
  export type PolicyIdentity = import("./durable/agent-manifest.js").PolicyIdentity
  export type PortablePolicy = import("./durable/agent-manifest.js").PortablePolicy
}

type ExecutableManifestFacade = typeof import("./durable/executable-manifest.js")

export const ExecutableManifest = {
  AgentEntry,
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
