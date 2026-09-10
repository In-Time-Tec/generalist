import manifest from "../../package.json" with { type: "json" }
import firstAgent from "../../examples/docs-snippets/website/first-agent.ts?raw"
import tools from "../../examples/docs-snippets/website/tools.ts?raw"
import repositoryTools from "../../examples/docs-snippets/website/repository.ts?raw"
import liveModel from "../../examples/docs-snippets/website/live-model.ts?raw"
import structuredOutput from "../../examples/docs-snippets/website/structured-output.ts?raw"
import approvals from "../../examples/docs-snippets/website/approvals.ts?raw"
import streaming from "../../examples/docs-snippets/website/streaming.ts?raw"
import instructions from "../../examples/docs-snippets/website/instructions.ts?raw"
import sessions from "../../examples/docs-snippets/website/sessions.ts?raw"
import tasks from "../../examples/docs-snippets/website/tasks.ts?raw"
import fanOut from "../../examples/docs-snippets/website/fan-out.ts?raw"
import qualityGates from "../../examples/docs-snippets/website/quality-gates.ts?raw"
import middleware from "../../examples/docs-snippets/website/middleware.ts?raw"
import memo from "../../examples/docs-snippets/website/memo.ts?raw"
import compaction from "../../examples/docs-snippets/website/compaction.ts?raw"
import agentTest from "../../examples/docs-snippets/website/test/agent.test.ts?raw"
import hooks from "../../examples/docs-snippets/website/hooks.ts?raw"
import mcpServer from "../../examples/docs-snippets/website/mcp-server.ts?raw"
import mcpClient from "../../examples/docs-snippets/website/mcp-client.ts?raw"
import memory from "../../examples/docs-snippets/website/memory.ts?raw"
import skills from "../../examples/docs-snippets/website/skills.ts?raw"
import sandbox from "../../examples/docs-snippets/website/sandbox.ts?raw"
import { websiteCheckpoints } from "../../examples/docs-snippets/website/checkpoints"
import codingFixture from "../../examples/coding-agent-rivet/src/fixture.ts?raw"
import codingAgents from "../../examples/coding-agent-rivet/src/agents.ts?raw"
import codingModel from "../../examples/coding-agent-rivet/src/model.ts?raw"
import codingServices from "../../examples/coding-agent-rivet/src/services.ts?raw"
import codingMessaging from "../../examples/coding-agent-rivet/src/messaging.ts?raw"
import codingExecutable from "../../examples/coding-agent-rivet/src/executable.ts?raw"
import codingConfig from "../../examples/coding-agent-rivet/src/config.ts?raw"
import codingCommand from "../../examples/coding-agent-rivet/src/command.ts?raw"
import codingActor from "../../examples/coding-agent-rivet/src/actor.ts?raw"
import codingRegistry from "../../examples/coding-agent-rivet/src/registry.ts?raw"
import codingErrors from "../../examples/coding-agent-rivet/src/errors.ts?raw"
import codingMain from "../../examples/coding-agent-rivet/src/main.ts?raw"
import codingDemo from "../../examples/coding-agent-rivet/src/demo.ts?raw"
import codingTest from "../../examples/coding-agent-rivet/test/coding-agent.test.ts?raw"
import codingCompose from "../../examples/coding-agent-rivet/compose.yaml?raw"
import codingEnvironment from "../../examples/coding-agent-rivet/.env.example?raw"
import type { DiagramName } from "./diagrams"

export const version = manifest.version
export const effectVersion = manifest.workspaces.catalog.effect

export type CodeExample = Readonly<{
  id: string
  title: string
  language: "typescript" | "bash" | "text" | "json" | "yaml" | "dockerfile"
  source: string
}>
export type Block =
  | Readonly<{ kind: "paragraph"; text: string }>
  | Readonly<{ kind: "heading"; text: string }>
  | Readonly<{ kind: "code"; example: CodeExample }>
  | Readonly<{ kind: "note"; title: string; text: string }>
  | Readonly<{ kind: "list"; items: ReadonlyArray<string> }>
  | Readonly<{ kind: "links"; items: ReadonlyArray<{ title: string; description: string; href: string }> }>
  | Readonly<{ kind: "table"; headings: readonly [string, string]; rows: ReadonlyArray<readonly [string, string]> }>
  | Readonly<{ kind: "diagram"; name: DiagramName }>

export type Section = Readonly<{
  id: string
  title: string
  label: string
  description: string
  group: "Start" | "Build" | "Control" | "Coordinate" | "Keep work" | "Connect"
  blocks: ReadonlyArray<Block>
}>

const p = (text: string): Block => ({ kind: "paragraph", text })
const heading = (text: string): Block => ({ kind: "heading", text })
const diagram = (name: DiagramName): Block => ({ kind: "diagram", name })
const note = (title: string, text: string): Block => ({ kind: "note", title, text })
const code = (id: string, title: string, source: string, language: CodeExample["language"] = "typescript"): Block => ({
  kind: "code",
  example: { id, title, source, language },
})
const links = (items: ReadonlyArray<{ title: string; description: string; href: string }>): Block => ({
  kind: "links",
  items,
})
const table = (headings: readonly [string, string], rows: ReadonlyArray<readonly [string, string]>): Block => ({
  kind: "table",
  headings,
  rows,
})
const list = (items: ReadonlyArray<string>): Block => ({ kind: "list", items })

const checkpointSources = {
  memory,
  skills,
  sandbox,
  hooks,
  "first-agent": firstAgent,
  tools,
  repository: repositoryTools,
  "structured-output": structuredOutput,
  approvals,
  "quality-gates": qualityGates,
  streaming,
  instructions,
  sessions,
  tasks,
  middleware,
  memo,
  compaction,
  "fan-out": fanOut,
}
export const checkpoints = websiteCheckpoints.map((step) => ({ ...step, source: checkpointSources[step.name] }))

const checkpoint = (name: (typeof checkpoints)[number]["name"]): ReadonlyArray<Block> => {
  const step = checkpoints.find((candidate) => candidate.name === name)!
  return [
    p(`Run this complete example in the tutorial project with \`bun ${name}.ts\`.`),
    code(name, `${name}.ts`, step.source),
    code(`${name}-output`, "Expected output", step.output, "text"),
  ]
}

export const sections: ReadonlyArray<Section> = [
  {
    id: "home",
    title: "Build an agent. Keep its work.",
    label: "Home",
    description:
      "Generalist is an Effect-native TypeScript framework for agents that use tools, work with people, and keep going across host lifetimes. Start with a function call. Add durability when the work needs it.",
    group: "Start",
    blocks: [
      heading("A small place to start"),
      p(
        "An agent is a definition. Its model is a service. This complete example runs a scripted model in your process, with no API key, server, or storage.",
      ),
      code("home-agent", "A process-local agent", firstAgent),
      code("home-output", "Output", checkpoints.find((step) => step.name === "first-agent")!.output, "text"),
      p(
        "The quickstart provides the install command and turns this first response into a coding agent that reads source, applies a patch, and runs real tests.",
      ),
      heading("Why we created Generalist"),
      p(
        "Calling a model is the easy part. The hard part is keeping track of its work: which tool finished, which decision is still waiting on a person, and which action is safe to retry after a crash.",
      ),
      p(
        "Generalist makes those boundaries explicit. Typed tools and Effect services keep behavior composable. The optional durable Runtime records accepted commands, ownership, and outcomes so a replacement host can recover from evidence instead of starting the conversation over.",
      ),
      heading("Start local. Keep what matters."),
      p(
        "Short-lived work can stay a normal Effect. When a task crosses tool calls, human decisions, or host lifetimes, add the object-backed Runtime. S3 or native R2 owns the durable state; your process, server, Rivet actor, or Cloudflare host executes the work.",
      ),
      links([
        {
          title: "Build your first agent",
          description: "A runnable progression from one response to a tested change.",
          href: "/docs/quickstart",
        },
        {
          title: "Understand durable execution",
          description: "What persists, who owns it, and how work recovers.",
          href: "/docs/durability",
        },
      ]),
    ],
  },
  {
    id: "why",
    title: "Why Generalist",
    label: "Why Generalist",
    description: "An agent should be able to own work, not just produce the next answer.",
    group: "Start",
    blocks: [
      heading("The work outlives the response"),
      p(
        "An agent might read a repository, ask before making a change, delegate a review, and wait for tests. Those steps cross several systems. A chat transcript alone cannot establish which external actions completed or what a replacement process may safely repeat.",
      ),
      p(
        "Generalist supplies an execution framework around the model loop. The process-local entry point stays small, while the durable Runtime adds explicit authority for accepted commands, recorded results, conversation history, and recovery.",
      ),
      heading("Keep composition in the type system"),
      p(
        "Models, tools, policies, and application capabilities are Effect services. Layers compose their implementations. Errors, interruption, resource lifetimes, and service requirements stay visible instead of being hidden behind an additional asynchronous programming model.",
      ),
      code("why-agent", "An Effect-native agent", firstAgent),
      p(
        "This example is deliberately scripted. Replace the model Layer when you need live reasoning; keep the same agent contract. You do not need storage or a deployment platform to begin.",
      ),
      heading("Separate the work from its host"),
      diagram("durability"),
      p(
        "Generalist has one production durability engine, backed by object storage over S3 or native R2. Compute hosts can be replaced when their code, configuration, and resource access can reconstruct the accepted work. Actor memory, caches, and notifications are not the commit authority.",
      ),
      heading("Preserve the consequences"),
      p(
        "A rewind can change the active conversation without erasing retained history, immutable receipts, or incurred costs. A tool whose external outcome is uncertain stays uncertain until it is resolved; recovery is not a promise of exactly-once side effects.",
      ),
      heading("Know the boundaries"),
      p(
        "Generalist is a framework, not a hosted service, identity system, or deployment platform. Your application authenticates callers, authorizes resources, registers executable definitions, and chooses its hosting environment. Mutations within one durable partition serialize; independent partitions do not imply automatic scaling.",
      ),
      links([
        {
          title: "Start with one agent",
          description: "Run the quickstart without credentials, then add the capabilities you need.",
          href: "/docs/quickstart",
        },
      ]),
    ],
  },
  {
    id: "quickstart",
    title: "Start with one coding agent",
    label: "Quickstart",
    description: "Run your first coding agent as an Effect. No API key or storage required.",
    group: "Start",
    blocks: [
      p(
        "We’ll build an agent that fixes a small bug: `average([])` returns `NaN`, but the application expects `0`. Start with one answer. Then give the same coding agent tools, context, verification, durable state, and a team.",
      ),
      heading("Create the project"),
      p(
        "Use Bun 1.4.0. The runnable checkpoints use scripted models unless a step explicitly says it calls a live service. You can learn the loop without an API key; the later repository checkpoint really edits and tests a temporary fixture.",
      ),
      code(
        "install",
        "Terminal",
        `mkdir coding-agent && cd coding-agent\nbun init -y\nbun add generalist@${version} effect@${effectVersion} @effect/platform-bun@${effectVersion}`,
        "bash",
      ),
      ...checkpoint("first-agent"),
      p(
        "`Agent.make` is a value, not a running worker. `Agent.run` returns an Effect. The model Layer supplies its dependency; `yield*` composes the work; `BunRuntime.runMain` owns the process boundary.",
      ),
      note(
        "What this proves",
        "The scripted model returns the supplied text. It does not inspect a repository or reason about the bug. The run is process-local: no conversation or interrupted work survives an exit yet.",
      ),
      p(
        "If an import fails, check the versions above. Keep all Effect packages on the same release candidate. If a model service is missing, check the `Effect.provide` call rather than starting another runtime inside the agent.",
      ),
    ],
  },
  {
    id: "tools",
    title: "Let the agent inspect code",
    label: "Tools and the agent loop",
    description: "Give a model typed capabilities and let the loop carry their results into the next turn.",
    group: "Build",
    blocks: [
      p(
        "The agent should read the source before proposing a patch. Give it a `read_file` tool with a validated path, then provide the handler through an Effect Layer.",
      ),
      ...checkpoint("tools"),
      p(
        "The scripted model first asks for `read_file`. Generalist validates the arguments and authorization, executes the handler, and returns the result to the model. The next scripted response proposes the guard. This handler returns fixture text; the next checkpoint replaces that boundary with real file access.",
      ),
      note(
        "Use Effect AI’s types",
        "`Prompt`, `Response`, `Tool`, and `Toolkit` come directly from `effect/unstable/ai`. Tool metadata tells the model what it may request; your handler is an Effect with its own failures and service requirements.",
      ),
      p(
        "A missing handler usually means its key does not match the tool name, or its Layer was not provided. A schema-valid path is not permission to read it: authorization is a separate boundary.",
      ),
    ],
  },
  {
    id: "repository",
    title: "Read, patch, and test a real file",
    label: "Repository tools",
    description: "Read a file, apply a small patch, and verify the result with real tests.",
    group: "Build",
    blocks: [
      p(
        "Now make the result observable. Create a temporary coding workspace, let the agent read and replace `src/average.ts`, then run two regression tests before reporting success.",
      ),
      ...checkpoint("repository"),
      p(
        "This program uses real Effect filesystem and process services. It writes only inside the temporary directory it owns, accepts one literal source path, invokes a fixed `bun test` command, and removes the workspace when its scope closes. The model is still scripted; the file changes and tests are real.",
      ),
      note(
        "A fixture is not a hostile-code sandbox",
        "Auto-approval is confined to this disposable exercise. Before pointing a coding agent at a real repository, give it an authorized root, validate paths and symlinks, select an isolation provider, and put writes and command execution behind policy. Never give model-authored strings an unrestricted shell.",
      ),
      p(
        "If `VerificationFailed` occurs, the error contains the captured test output. A model saying “fixed” cannot override the process exit code. Keep this deterministic verification step when you connect a live model.",
      ),
    ],
  },
  {
    id: "models",
    title: "Replace the script with a live model",
    label: "Models and providers",
    description: "Swap the model Layer without replacing your agent or its tools.",
    group: "Build",
    blocks: [
      p(
        "Keep the agent definition and change the model Layer. This checkpoint asks OpenAI to explain the same empty-array bug. It needs an API key with model access and incurs provider costs.",
      ),
      code(
        "install-openai",
        "Terminal",
        `bun add @effect/ai-openai@${effectVersion}\nread -s OPENAI_API_KEY\nexport OPENAI_API_KEY`,
        "bash",
      ),
      p(
        "Enter the key at the hidden prompt, save `live-model.ts`, and run `bun live-model.ts`. Store credentials in the host environment, never in instructions or browser code.",
      ),
      code("live-model", "live-model.ts · live provider", liveModel),
      p(
        "The program prints the model’s answer; wording varies. To connect the repository checkpoint, replace its scripted model Layer with this provider Layer while retaining its toolkit, authorization, and final test check. This guide does not claim to have run the live request.",
      ),
      table(
        ["Choose a provider", "How it fits"],
        [
          [
            "OpenAI, Anthropic, Bedrock, OpenRouter",
            "Provide the matching client configuration, model Layer, and required HTTP/platform services.",
          ],
          [
            "OpenAI-compatible endpoint",
            "Use the compatible provider rather than assuming every endpoint implements all OpenAI features.",
          ],
          [
            "ModelRegistry and model catalog",
            "Register selections and inspect metadata when the application chooses models by identity.",
          ],
          [
            "ModelResilience and model routing",
            "Configure retry/fallback behavior around model calls; do not turn an uncertain external tool outcome into a generic retry.",
          ],
          [
            "Embedding providers",
            "Use the embedding subpaths for retrieval workflows; they are separate from a chat model’s generation contract.",
          ],
        ],
      ),
      p(
        "For authentication failures, check the key and account quota. For model-access errors, select a model your account can use. For incompatible types, check that there is one matching Effect installation.",
      ),
    ],
  },
  {
    id: "structured-output",
    title: "Return a change report, not text to parse",
    label: "Structured output",
    description: "Turn the agent’s final response into a value your application can validate and use.",
    group: "Build",
    blocks: [
      p(
        "Your application needs a file, a proposed change, and regression cases. Declare that output Schema so the caller receives a typed value instead of scraping prose.",
      ),
      ...checkpoint("structured-output"),
      p(
        "The loop runs first, then a terminal structured-output turn requests the declared shape. The scripted model supplies both responses. Invalid output fails with `InvalidOutput`; a valid shape still says nothing about whether the patch passes tests.",
      ),
    ],
  },
  {
    id: "approvals",
    title: "Decide before applying a patch",
    label: "Permissions and approvals",
    description: "Decide which operations may execute before a tool handler runs.",
    group: "Control",
    blocks: [
      p(
        "An instruction to “ask before editing” is not an execution boundary. Mark the write tool `needsApproval: true` and provide the approval service that owns the decision.",
      ),
      ...checkpoint("approvals"),
      p(
        "This checkpoint deliberately denies the write. The handler fails if it is reached, and the program handles only the expected `PermissionDenied` failure. No file changes.",
      ),
      table(
        ["Decision", "Result"],
        [
          ["Approved", "The allowed handler can execute."],
          ["Denied", "The run fails with PermissionDenied before dispatch."],
          ["Pending", "The process-local run suspends with AgentSuspended and an approval token."],
        ],
      ),
      note(
        "Own the authority",
        "The default auto-approve service is not a human approval flow. Your application authenticates the person deciding and authorizes access to the repository and run. Capabilities may narrow tool authority, but parsing a tool name or address does not grant access.",
      ),
      p(
        "Use a terminal approval Layer for an in-process CLI, or an application approval service for a UI. When a person may answer after the host exits, use the durable wait and response path later in this guide.",
      ),
    ],
  },
  {
    id: "quality-gates",
    title: "Set a condition for completion",
    label: "Gates and budgets",
    description: "Make completion depend on evidence, and put deliberate limits on the work.",
    group: "Control",
    blocks: [
      p(
        "A coding agent should not finish because its last sentence sounds confident. Put the acceptance condition in a completion gate and bound how far the loop can continue.",
      ),
      ...checkpoint("quality-gates"),
      p(
        "This predicate checks that the structured report contains the empty-input regression case. It does not execute that case. For real verification, retain the repository checkpoint’s test command or use `Gate.command` with an Agent-owned Sandbox that supports Process execution.",
      ),
      table(
        ["Control", "Use it for"],
        [
          ["Policy.recurs", "Bound follow-up turns; the first model turn still occurs."],
          ["Gate.predicate", "Check decoded output with application code."],
          ["Gate.command", "Run a completion command in the agent’s Sandbox."],
          ["Gate.verifier", "Ask an independent agent for structured verification evidence."],
          [
            "RunBudget",
            "Bound tokens, cost, and child admission across a durable tree; child budgets may narrow, not widen, parent authority.",
          ],
        ],
      ),
      p(
        "Set `onGateFailure` to `fail` when a rejected completion must stop. A retry policy is a deliberate choice, not an excuse to drop the failed evidence.",
      ),
    ],
  },
  {
    id: "streaming",
    title: "Show progress without inventing completion",
    label: "Events and streaming",
    description: "Show progress as it happens without confusing a preview with committed work.",
    group: "Connect",
    blocks: [
      p(
        "Use `Agent.stream` when a CLI or UI needs progress during the run. It exposes the same loop as `Agent.run`; this checkpoint selects the terminal output.",
      ),
      ...checkpoint("streaming"),
      p(
        "A richer client can consume model parts, tool events, turn events, and completion evidence. Scope the consumer to the connection that owns it so disconnects preserve interruption and cleanup.",
      ),
      note(
        "Keep previews provisional",
        "In durable execution, a model preview belongs to an attempt. It is not proof that a tool committed. Reconnecting clients reconstruct committed state from snapshots and authoritative replay cursors.",
      ),
      p(
        "Model telemetry separates attempts, first output, completed calls, usage, and committed responses. Use those events to explain latency and incurred cost instead of treating a whole run as one model call.",
      ),
    ],
  },
  {
    id: "instructions",
    title: "Give the coding agent repository rules",
    label: "Instructions and skills",
    description: "Give the agent reusable context and load specialized guidance when it needs it.",
    group: "Build",
    blocks: [
      p(
        "Separate reusable repository rules from the current bug report. An ordered instruction registry lets each turn use the same baseline without repeating it in every request.",
      ),
      ...checkpoint("instructions"),
      p(
        "Use file-backed instructions when the repository owns the rules. Use a skill catalog when a capability should be discovered and activated with its own instructions and tools. Generalist supplies filesystem, GitHub, HTTP, and S3 skill-catalog adapters; their credentials and authorization remain application configuration.",
      ),
      heading("Load review instructions only when needed"),
      ...checkpoint("skills"),
      p(
        "The catalog advertises the skill first. The scripted model calls `activate_skill`, which loads the instruction body once. A skill can also add declared tools for later turns; their handlers and authorization still need to be provided. This checkpoint loads guidance only, not an actual reviewer.",
      ),
      note(
        "Instructions are not permissions",
        "Repository text and skill descriptions can guide a model, but they cannot authorize filesystem access, expand a child’s capabilities, or replace a Sandbox. Treat repository and tool content as data at untrusted boundaries.",
      ),
    ],
  },
  {
    id: "sessions",
    title: "Continue the same coding conversation",
    label: "Sessions",
    description: "Keep related requests in the same coding conversation.",
    group: "Coordinate",
    blocks: [
      p(
        "The next request is “add a regression test,” not a new explanation of the whole bug. Use a stable Session identity to keep the conversation’s history together.",
      ),
      ...checkpoint("sessions"),
      p(
        "Both runs use `fix-average` and the same scoped service graph. A Session groups the conversation; a Run is one accepted execution. The scripted second answer is supplied in advance, so this is a wiring example rather than a model-recall evaluation.",
      ),
      note(
        "Local history is not durable execution",
        "`Session.layerMemory` is process-local conversation storage. It does not recover an interrupted run and it is not a production durability backend. The later object Runtime owns durable Sessions, commands, claims, and replay.",
      ),
      table(
        ["Need", "Boundary"],
        [
          ["Conversation entries and active context", "Session and SessionHistory."],
          ["Reconnect a viewer", "SessionSync plus snapshot-first transport and replay cursors."],
          ["Relevant knowledge across conversations", "Memory with an explicit key and configured provider."],
          ["Work that survives host replacement", "Object-backed Runtime, not a local memory Layer."],
        ],
      ),
    ],
  },
  {
    id: "context",
    title: "Keep useful context within the model window",
    label: "Memory and compaction",
    description: "Retain useful context while leaving room for the next model response.",
    group: "Build",
    blocks: [
      p(
        "Long coding sessions accumulate source, test output, and decisions. Keep recent work available while making room for the next model response.",
      ),
      heading("Keep a bounded working memory"),
      ...checkpoint("memory"),
      p(
        "The program checks the memory service itself, rather than trusting a scripted answer to prove recall. `WorkingMemory` stores a bounded window inside this service graph; it disappears when the process closes. Use a configured semantic-memory provider for retrieved knowledge, and the object Runtime for restart-safe execution. These are separate storage contracts.",
      ),
      heading("Configure compaction for longer work"),
      ...checkpoint("compaction"),
      p(
        "This short run configures the compaction policy but does not reach its threshold. For a real long session, summarization consumes model calls and must retain the lineage needed to reconstruct context. Tool-output bounds and media compaction solve different size problems than dropping arbitrary history.",
      ),
      table(
        ["Mechanism", "What it changes"],
        [
          [
            "Compaction",
            "The active model context, while retained history remains available under its owning storage contract.",
          ],
          [
            "Memory",
            "Retrieves relevant knowledge using an explicit agent/subject key and a configured memory service.",
          ],
          [
            "Instruction guidance",
            "Keeps selected guidance relevant to the current task without granting execution authority.",
          ],
          [
            "Provider prompt caching",
            "Reuses a provider-recognized prompt prefix; it is not Generalist’s journal or a tool receipt.",
          ],
        ],
      ),
      p(
        "If compaction fails, check the summary model’s services and the configured window. Do not repair recovery by deleting production history.",
      ),
    ],
  },
  {
    id: "memoization",
    title: "Reuse analysis of unchanged source",
    label: "Memoization",
    description: "Reuse pure analysis when its arguments and source dependencies have not changed.",
    group: "Build",
    blocks: [
      p(
        "Reading the same revision twice should not repeat expensive pure analysis. Mark only genuinely reusable tools with `Memo.pure` and include the dependencies that determine their result.",
      ),
      ...checkpoint("memo"),
      p(
        "Two identical calls at `fixture-v1` execute the handler once. The key includes the tenant, capability scope, arguments, and declared dependency versions. Change the repository revision when source changes. Never mark a write, payment, or other externally effectful operation as pure.",
      ),
      note(
        "Memoization is not replay",
        "The local cache is disposable reuse storage. Durable operation replay and immutable receipts belong to the driver and journal. A cache hit cannot establish whether an uncertain external write happened.",
      ),
    ],
  },
  {
    id: "tasks",
    title: "Keep a plan and accept steering",
    label: "Tasks and steering",
    description: "Keep a visible plan and change direction without starting the conversation over.",
    group: "Coordinate",
    blocks: [
      p(
        "Give the coding agent a task list it can update as it reads, patches, and verifies. Then distinguish edits to that plan from a new conversation or an interruption.",
      ),
      ...checkpoint("tasks"),
      p(
        "`Tasks.layer()` adds `tasks_read` and `tasks_write`; a write replaces the complete list. The statuses are `todo`, `doing`, and `done`. Task text is a plan, not evidence that a test actually ran.",
      ),
      p(
        "Use `Tasks.update` to build a steering prompt for partial task edits. In a durable Run, steering enters the same authoritative inbox as other messages. Choose whether a message should steer the next turn, interrupt work, or wait; preserve its command identity on retries.",
      ),
      note(
        "Do not confuse the queue and the inbox",
        "Pending Session inputs are future Runs. Steering targets an already accepted Run. Editing a queued input must not mutate the prompt of a Run that has already been admitted.",
      ),
    ],
  },
  {
    id: "middleware",
    title: "Customize the loop at explicit boundaries",
    label: "Middleware and hooks",
    description: "Customize the loop at declared boundaries while preserving its execution contract.",
    group: "Control",
    blocks: [
      p(
        "Inject branch context through middleware instead of hiding it inside every tool. The coding agent still uses the same model and tool contracts.",
      ),
      ...checkpoint("middleware"),
      p(
        "`ModelMiddleware` transforms prompts or model parts. Preserve recalled-memory lineage, and never drop a tool-call part: doing so breaks the model/tool conversation and fails with `MiddlewareViolation`.",
      ),
      heading("Add context at the Run boundary"),
      ...checkpoint("hooks"),
      p(
        "This pure Run-start hook adds repository guidance. The stable key and version identify its definition; a durable host must reconstruct the same behavior. Other hook decisions can block or shape work at their declared boundaries, rather than smuggling control into prompt text.",
      ),
      table(
        ["Extension", "Choose it when"],
        [
          ["ModelMiddleware", "You need a turn-scoped prompt or response transformation."],
          [
            "Hooks",
            "You need a declared decision at Run, turn, model, tool, approval, compaction, child, steering, or completion boundaries.",
          ],
          [
            "Guardrails and gates",
            "You need an explicit policy or acceptance decision rather than a display-only transformation.",
          ],
          [
            "Pins and capabilities",
            "You need durable reconstruction identity or narrowed authority, not arbitrary executable compatibility.",
          ],
        ],
      ),
      p(
        "Durable hook decisions carry replay policy and reconstruction identity. Keep definitions available to replacement hosts; do not change a persisted identity while silently changing what its code does.",
      ),
    ],
  },
  {
    id: "testing",
    title: "Test behavior before paying for evaluations",
    label: "Testing and evaluations",
    description: "Prove deterministic behavior first. Evaluate model quality separately.",
    group: "Control",
    blocks: [
      p(
        "Start with deterministic tests for configuration, tool calls, denials, and typed output. Keep a separate evaluation for whether a live model actually solves coding tasks well.",
      ),
      code(
        "test-install",
        "Terminal",
        `bun add -d @effect/vitest@${effectVersion} vitest@${manifest.workspaces.catalog.vitest}`,
        "bash",
      ),
      p("Save the test as `agent.test.ts`. The test host owns the Effect; the test does not start another runtime."),
      code("agent-test", "agent.test.ts", agentTest),
      code("run-agent-test", "Terminal", "bun --bun vitest run agent.test.ts", "bash"),
      p(
        "Expect one passing test. Add assertions on actual handler calls and side effects, like the repository checkpoint’s real file and test verification. A canned final sentence cannot prove an operation happened.",
      ),
      table(
        ["Evaluation surface", "Evidence it provides"],
        [
          ["Eval.outputMatches", "The recorded output decodes through a Schema."],
          ["Eval.gatesPassed", "The latest completion-gate verdicts pass."],
          ["Eval.toolCalledAtMost / usageUnder", "The recorded trajectory stays within authored call or usage bounds."],
          ["Eval.judge / runSuite", "Model-judged or suite-level evaluation with explicit services and costs."],
          [
            "Trajectory and RL export",
            "Recorded execution evidence for analysis or training export; not a live-provider performance claim.",
          ],
        ],
      ),
      p(
        "For durable behavior, test a close-and-reopen boundary and replay from an authoritative cursor without redispatch. Use the shared Runtime driver suite for host conformance rather than copying generic tests into every host.",
      ),
    ],
  },
  {
    id: "sandbox",
    title: "Choose where untrusted code executes",
    label: "Sandboxes",
    description: "Choose an execution environment with explicit capabilities and limits.",
    group: "Connect",
    blocks: [
      p(
        "A coding agent eventually needs to run code it did not author safely. Keep that execution behind the Sandbox or REPL service rather than giving every tool access to the host process.",
      ),
      ...checkpoint("sandbox"),
      p(
        "This creates a disposable Git directory and runs two real Bun tests through the Sandbox service. It does not make a commit, snapshot, or fork. The worktree provider executes in its configured directory and declares `process` isolation with no CPU, memory, or wall-clock enforcement. It is suitable for this trusted fixture, not hostile code.",
      ),
      table(
        ["Surface", "What to use it for"],
        [
          [
            "Sandbox",
            "An explicit provider for Process, TypeScript, or JavaScript-module execution, with declared isolation, limits, and capabilities.",
          ],
          [
            "Worktree provider",
            "Repository branches and snapshots for coding workflows; process isolation is not a security boundary against hostile code.",
          ],
          [
            "REPL / TypeScript cells",
            "Execute typed cells through a kernel with explicit host bindings, resource ownership, snapshots, and lifecycle.",
          ],
          [
            "E2B, Daytona, Fly Sprites, Modal, AgentOS, Cloudflare",
            "Optional provider adapters. Check the actual provider’s capabilities, credentials, limits, and deployment requirements.",
          ],
          ["Completion command gates", "Run verification through the Sandbox owned by the agent proposing completion."],
        ],
      ),
      p(
        "The earlier repository checkpoint intentionally uses a fixed test command in a disposable fixture. Before replacing that command with model-authored execution, select the provider and grant only the required host bindings and repository access. Interrupt and dispose the sandbox when its owning scope ends.",
      ),
    ],
  },
  {
    id: "mcp",
    title: "Connect external development tools",
    label: "MCP",
    description: "Discover and call remote development tools through the same typed toolkit boundary.",
    group: "Connect",
    blocks: [
      p(
        "Keep the coding agent’s toolkit contract when a capability lives in another process or service. Use MCP to expose remote tools, and scope the client connection with the execution that owns it.",
      ),
      heading("Start a local repository tool server"),
      p(
        "Save these two files in the tutorial project. The server listens only on loopback and returns fixture source; it does not read your filesystem and requires no credentials. Keep it running in one terminal while the client runs in another.",
      ),
      code("mcp-server", "mcp-server.ts", mcpServer),
      code("mcp-server-command", "Terminal 1", "bun mcp-server.ts", "bash"),
      heading("Call it from the coding agent"),
      code("mcp-client", "mcp-client.ts", mcpClient),
      code("mcp-client-command", "Terminal 2", "bun mcp-client.ts", "bash"),
      code("mcp-client-output", "Expected output", "The MCP source confirms that empty input divides by zero.", "text"),
      p(
        "The client discovers the server's Schema-backed tool and exposes it as `repository_read_file`. The model is scripted, but discovery and the HTTP tool call are real. If connection fails, start the server first or set `MCP_URL` to the correct endpoint. Stop the server with Ctrl-C when finished.",
      ),
      table(
        ["Protocol or adapter", "Its job"],
        [
          [
            "MCP HTTP / stdio clients",
            "Connect an external tool server and adapt its tool declarations. Credentials, OAuth, server trust, and host process permissions remain yours.",
          ],
          [
            "A2A",
            "Expose or consume the agent-facing protocol at an application boundary; it is not the internal durable Run inbox.",
          ],
          [
            "AG-UI",
            "Adapt execution events for an interactive client; provisional output still is not committed history.",
          ],
          [
            "Generalist transport",
            "Serve command, snapshot, and replay flows over an application-owned authenticated server.",
          ],
          [
            "Foldkit Chat / Connection",
            "Headless client state and connection handling; your Foldkit application owns the UI and styling.",
          ],
        ],
      ),
      note(
        "A connection does not grant trust",
        "Remote tool output is untrusted data. Authorize each requested operation and keep credentials out of model prompts, durable reconstruction metadata, and browser bundles.",
      ),
    ],
  },
  {
    id: "multi-agent",
    title: "Give the coder a reviewer and a test writer",
    label: "Child agents",
    description: "Delegate independent tasks to specialists and collect their results.",
    group: "Coordinate",
    blocks: [
      p(
        "Review and test design can proceed independently. Delegate those jobs to child agents, bound concurrency, and keep the results in the order you requested them.",
      ),
      ...checkpoint("fan-out"),
      p(
        "This checkpoint is process-local. Each child has isolated Run identity and returns an `Exit` when `onFailure` is `collect`. The deterministic provider supplies the same fixture result to both children; it does not perform a real code review.",
      ),
      table(
        ["Composition", "Identity and ownership"],
        [
          [
            "Agent.fanOut + Agent.child",
            "Application-authored, typed process-local child work with bounded concurrency.",
          ],
          ["AgentTool.asTool", "One specialist exposed to the parent as a tool; the child gets a fresh Run."],
          [
            "AgentTool.fanOut",
            "A bounded, declared set of specialists the model may spawn; durable execution journals child admission and joins.",
          ],
          ["Handoff.supervisor", "Switch the active agent within the same Run rather than create a child."],
          [
            "Inheritance",
            "Choose history, tools, permissions, budget, sandbox, instructions, memory, and task inheritance in the declaration, not in model-authored arguments.",
          ],
        ],
      ),
      p(
        "Use durable fan-out when children must survive their original process. A child may receive narrower authority and budget; it cannot exceed the parent. Retain spent usage when a child fails or a conversation rewinds.",
      ),
    ],
  },
  {
    id: "coding-team",
    title: "Build the durable coding team",
    label: "Coding-team capstone",
    description: "Assemble a lead, reviewer, and test writer, then run their work through an S3-backed Rivet actor.",
    group: "Coordinate",
    blocks: [
      p(
        "This capstone keeps one parent Run, two specialist Runs, their Sessions, and their messages in one durable partition. The model is scripted and the coding tools operate on allowlisted source snapshots; they do not read or edit your checkout. MinIO and a local Rivet engine provide real storage and hosting without cloud credentials.",
      ),
      heading("Prepare the project"),
      p(
        "Continue in the quickstart project with Bun 1.4.0 and Docker running. Add the S3 transport and Rivet dependencies, then create the source and test directories. Every required module appears on the following pages; save each block at the path named in its surrounding instructions.",
      ),
      code(
        "coding-team-install",
        "Terminal",
        `bun add @aws-sdk/client-s3@${manifest.workspaces.catalog["@aws-sdk/client-s3"]} @smithy/fetch-http-handler@${manifest.workspaces.catalog["@smithy/fetch-http-handler"]} @standard-schema/spec@${manifest.workspaces.catalog["@standard-schema/spec"]} rivetkit@${manifest.workspaces.catalog.rivetkit}\nbun add -d @effect/vitest@${effectVersion} vitest@${manifest.workspaces.catalog.vitest} @types/bun@${manifest.workspaces.catalog["@types/bun"]} typescript@${manifest.workspaces.catalog.typescript}\nmkdir -p src test`,
        "bash",
      ),
      p(
        "Replace the tutorial project's `tsconfig.json` with this configuration. It checks the complete service and recovery test without depending on this repository's build settings.",
      ),
      code(
        "coding-team-tsconfig",
        "TypeScript configuration",
        `{
  "compilerOptions": {
    "target": "ESNext",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "lib": ["ESNext", "DOM", "DOM.Iterable"],
    "types": ["bun"],
    "strict": true,
    "exactOptionalPropertyTypes": true,
    "skipLibCheck": true,
    "noEmit": true
  },
  "include": ["src/**/*.ts", "test/**/*.ts"]
}`,
        "json",
      ),
      heading("Bound the coding environment"),
      p(
        "Save this as `src/fixture.ts`. The workspace can read one fixture revision, validate its one permitted patch, and run three fixed cases. It never evaluates supplied source text. A scoped service closes the workspace when its Run releases it.",
      ),
      code("coding-fixture", "Fixture workspace", codingFixture),
      heading("Declare the lead and specialists"),
      p(
        "Save this as `src/agents.ts`. The reviewer may inspect the fixture; the test writer may run the fixture tests. Both receive the parent-note tool from the messaging page. Their tools and budgets stay within the lead's authority.",
      ),
      code("coding-agents", "Coding team", codingAgents),
      heading("Make the demonstration deterministic"),
      p(
        "Save this as `src/model.ts`. This provider chooses a fixed sequence of tool calls from the tool results already in the prompt. It tests the execution protocol, not a model's ability to solve an unfamiliar coding task.",
      ),
      code("coding-model", "Scripted model", codingModel),
      p(
        "Save this composition as `src/services.ts`. Permission and approval defaults are appropriate only for these allowlisted fixtures; replace them before granting access to a real repository.",
      ),
      code("coding-services", "Agent services", codingServices),
      links([
        {
          title: "Wire the specialist messages",
          description: "Keep sender identity in the Runtime and retries under explicit command keys.",
          href: "/docs/messaging",
        },
      ]),
    ],
  },
  {
    id: "architecture",
    title: "How durable state stays honest",
    label: "Architecture",
    description: "The boundaries between the agent loop, the durable Runtime, its compute hosts, and object storage.",
    group: "Keep work",
    blocks: [
      p(
        "An agent can outlive the process that started it. Generalist separates the code that executes a turn from the state that proves which work was accepted, completed, or left uncertain.",
      ),
      table(
        ["Boundary", "What it owns"],
        [
          [
            "Core agent loop",
            "Model turns, tools, policies, approvals, and typed events. It runs without Runtime or storage; its events are not crash recovery.",
          ],
          [
            "Runtime",
            "Addressable Runs, executable identities, journaled operations, Sessions, waits, budgets, and recovery. `generalist/durability` is its sole production engine.",
          ],
          [
            "Compute host",
            "A process, server, Cloudflare Durable Object, or Rivet actor that runs and wakes the engine. It is replaceable compute, not a storage backend.",
          ],
          [
            "Object storage",
            "The canonical record, through the S3 or native R2 transport. Recovery also needs the registered executable code and services; stored state is not stored code.",
          ],
        ],
      ),
      heading("A partition is the commit boundary"),
      p(
        "Every Runtime names an explicit environment, tenant, and partition. The partition is the serialization and atomicity boundary: put related Runs, children, and Sessions together when a transition must update them atomically. Writes inside a partition serialize, and there are no cross-partition transactions. Independent partitions can progress separately, but that is not automatic scaling: the application chooses routing and operates enough compute to serve them.",
      ),
      heading("Commands commit through conditional creates"),
      p(
        "Two hosts can race to change the same partition; a local mutex cannot order their writes. The engine resolves commits at the object boundary. A command carries a stable identity and input digest: an exact retry returns the original receipt, including its original `duplicate` field, and the same identity with different input fails rather than taking a second meaning.",
      ),
      list([
        "Reconstruct the partition from validated canonical records, using snapshots to bound replay.",
        "Check the command receipt before evaluating the deterministic transition.",
        "Conditionally create the next numbered commit slot; the create succeeding establishes the commit.",
        "On a conflict, read the winning record and re-evaluate the transition within a bounded retry limit — never repeat a model or tool call to win a storage race.",
        "If an attempted write's outcome cannot be established, stop with an indeterminate failure instead of writing again under a fresh identity.",
      ]),
      p(
        "The provider must supply atomic absent-key creation, complete bytes, strong direct reads of acknowledged writes, and correct paginated listing. An S3-shaped API alone does not establish those properties, and an ETag is not a content hash.",
      ),
      note(
        "Fencing is not time travel",
        "A newer claim fences a replaced owner's late canonical writes, so an old owner cannot publish results after losing authority. No fence can retract an external request already sent to a provider.",
      ),
      heading("A wakeup is a hint, not authority"),
      p(
        "An alarm succeeding does not prove a command committed; an alarm failing does not erase accepted work. Hosts reconcile independently, so a crash between commit and wake delivery cannot strand a Run. Replay consumes recorded outcomes from an authoritative cursor without redispatching them; an operation whose external outcome is unknown needs evidence or an authorized resolution, not a blind retry.",
      ),
      diagram("recovery"),
      heading("Two snapshot meanings, two output lanes"),
      p(
        "A storage snapshot accelerates partition reconstruction. A client Session snapshot is different: a bounded canonical projection plus the exact durable cursor from which observation continues. Live model previews ride a separate lossy lane — bounded, ephemeral frames that never advance the durable cursor — so reconnecting clients rebuild committed state rather than trusting the last preview they saw.",
      ),
      heading("A familiar pattern, not the same system"),
      p(
        "Other systems — turbopuffer's namespace-scoped object storage, WarpStream's object-storage data plane, SlateDB's embedded engine over objects — put object storage on their primary write path. Those first-party designs explain the storage/compute separation pattern, not Generalist's feature set: they establish no cost, throughput, or benchmark equivalence, and Generalist's live AWS and R2 behavior remains unqualified by local emulator evidence.",
      ),
      links([
        {
          title: "Configure the durable engine",
          description: "Compose the object Runtime with S3, Crypto, and executable resolution.",
          href: "/docs/durability",
        },
        {
          title: "Read the recovery rules",
          description: "Replay, uncertain outcomes, and explicit resolution.",
          href: "/docs/recovery",
        },
      ]),
    ],
  },
  {
    id: "durability",
    title: "Move accepted work into S3",
    label: "Durable Runtime",
    description: "Move accepted work into object storage so it can survive the execution host.",
    group: "Keep work",
    blocks: [
      p(
        "The coding team now has work worth keeping. Put accepted Runs, Sessions, ownership, and results in Generalist’s object engine so another host can continue them.",
      ),
      diagram("durability"),
      p(
        "Compose `generalist/durability` with `generalist/durability/s3`, Crypto, and executable resolution. Choose a fresh, explicit environment / tenant / partition namespace. The S3 bucket is storage; the process or actor that executes a claim is compute.",
      ),
      table(
        ["Step", "What it establishes"],
        [
          ["Construct the Layer", "Configure services; construction remains read-only."],
          [
            "Register agents / executable definitions",
            "Make the required code and service environment available in the current host.",
          ],
          ["Start with a stable idempotency key", "Admit the work once under its command identity."],
          ["Activate in an owned scope", "Allow this host to claim and execute eligible work."],
          ["Close and reopen", "Reconstruct the same state from objects, not from retained JavaScript values."],
        ],
      ),
      p(
        "The coding-team capstone supplies the concrete composition across this page and the Rivet host page. You need a bucket with the required conditional-create, read-after-write, and listing semantics. Its local MinIO configuration requires no AWS account.",
      ),
      heading("Load the host configuration"),
      p(
        "In the capstone project, save this as `src/config.ts`. Credentials remain on the host; they are not part of an executable manifest or model prompt. A custom S3 endpoint requires an explicit acknowledgement of the transport assumptions.",
      ),
      code("coding-config", "Host configuration", codingConfig),
      heading("Register reconstructible behavior"),
      p(
        "Save this as `src/executable.ts`. The registrations identify the lead and both child selections, including their model, tool, and policy pins. The resolver closes each agent over its services so a replacement host can reconstruct the same accepted definition.",
      ),
      code("coding-executable", "Executable registration", codingExecutable),
      note(
        "One engine, not several backends",
        "S3 and native R2 are transports for the same production durability engine. There is no production SQL, memory, or filesystem Runtime. Separate partitions can progress independently, but mutations inside a partition serialize.",
      ),
    ],
  },
  {
    id: "durable-sessions",
    title: "Admit work into a durable Session",
    label: "Durable sessions",
    description: "Order accepted inputs and preserve command identities across reconnects and retries.",
    group: "Keep work",
    blocks: [
      p(
        "Give each coding conversation a stable identity. A request to fix the bug and a later request to add documentation should be ordered work, not competing writers to one transcript.",
      ),
      p(
        "Save the capstone's admission command as `src/command.ts`. The actor client sends this same value on retries. Its tree policy admits the lead and at most two children; a new partition is a new coding family, not a retry of this one.",
      ),
      code("coding-command", "Stable admission command", codingCommand),
      table(
        ["Operation", "Contract to preserve"],
        [
          [
            "start",
            "A stable sessionId and idempotencyKey identify an exact accepted request. Reuse them after an ambiguous outcome.",
          ],
          [
            "Session input queue",
            "Pending input describes future Runs. Editing or removing it uses revision checks and immutable command receipts.",
          ],
          ["Session writer claim", "Only the lane head owns the writer; other Sessions can progress independently."],
          ["inspect / events", "Read authoritative state and replay events, not actor memory or client optimism."],
          [
            "cancel",
            "An explicit user cancellation request with its own command identity; host shutdown is not cancellation.",
          ],
        ],
      ),
      p(
        "A receipt answers what a command accepted, even if the Session queue has since changed. Exact retries return the original receipt, including its original duplicate field. Keep command identities at the caller across disconnects and retries.",
      ),
    ],
  },
  {
    id: "recovery",
    title: "Recover, branch, and resolve uncertain outcomes",
    label: "Recovery",
    description: "Resume from recorded evidence instead of blindly repeating external actions.",
    group: "Keep work",
    blocks: [
      p(
        "A replacement host must distinguish a completed operation from one whose external outcome is unknown. Read the recorded evidence before deciding what can execute again.",
      ),
      diagram("recovery"),
      table(
        ["Situation", "Recovery rule"],
        [
          ["A result is recorded", "Replay from the authoritative cursor; do not redispatch that operation."],
          [
            "An external effect may have happened",
            "Surface needs-resolution when replay policy cannot safely retry. Resolve the outcome explicitly.",
          ],
          [
            "A person has not answered",
            "Keep the durable wait and accept the decision with its command identity; the old host need not remain alive.",
          ],
          [
            "The old owner writes late",
            "A newer claim fences obsolete canonical writes; it cannot undo an external request already sent.",
          ],
          [
            "Fork or rewind",
            "Change the active conversation while retaining history, receipts, external consequences, and incurred cost.",
          ],
        ],
      ),
      p(
        "Do not repair an unfamiliar namespace by deleting objects. Do not rename executable identities to hide a reconstruction mismatch. A replacement host needs the registered code, pins, configuration, and access that the accepted work requires.",
      ),
      note(
        "Qualification has a scope",
        "A close-and-reopen test establishes its exercised recovery scenario. MinIO and Miniflare/workerd tests are local evidence, not certification of live AWS S3, deployed R2, or a hosted Rivet deployment.",
      ),
      heading("Prove the capstone survives a fresh Layer"),
      p(
        "After assembling the capstone modules, save this as `test/coding-agent.test.ts`. It admits work without starting a worker, closes that Layer, reconnects to the same object simulator, and runs the parent and both children. Each specialist sends its own note. Retrying those notes leaves exactly two inbox entries, and a final fresh Layer observes the completed family without executing it again.",
      ),
      code("coding-recovery-test", "Recovery test", codingTest),
      code(
        "coding-recovery-command",
        "Terminal",
        "bun --bun vitest run test/coding-agent.test.ts --no-file-parallelism\nbun --bun tsc --noEmit",
        "bash",
      ),
      p(
        "Expect two passing tests and no type errors. The simulator is test-only; it is not an alternate production Runtime or evidence that a hosted provider has been qualified.",
      ),
    ],
  },
  {
    id: "messaging",
    title: "Let related agents communicate",
    label: "Agent messaging",
    description: "Let related Runs exchange messages under an explicit authorization policy.",
    group: "Coordinate",
    blocks: [
      p(
        "The test writer should be able to tell the lead which regression cases matter. Address a related Run through the Runtime directory and admit the message into the same authoritative inbox used for steering.",
      ),
      p(
        "For the coding-team capstone, save this as `src/messaging.ts`. The tool derives its sender and parent from the Runtime-owned execution context; the model supplies only the note and its stable command key. The host helper exercises exact retries in the recovery test, not arbitrary client impersonation.",
      ),
      code("coding-messaging", "Family messaging", codingMessaging),
      diagram("agents"),
      table(
        ["Address", "Resolution"],
        [
          ["Run address", "An exact Run identity."],
          ["Session address", "The newest Run in that Session at send time."],
          ["Scoped name", "A host-assigned unique name within the authorized root or parent scope."],
          [
            "Steering toolkit",
            "Model-callable send_to_child / send_to_parent using the same directory and inbox admission.",
          ],
          [
            "Messaging policy",
            "Checks the sender’s canonical identity and allowed relationship; a parsed address grants no authority.",
          ],
        ],
      ),
      p(
        "Preserve the message and idempotency identities across retries. Keep coordinated child Runs in the parent’s partition. Do not equate a family-scoped message with arbitrary communication between unrelated actors or tenants.",
      ),
      links([
        {
          title: "Register the durable definitions",
          description: "Give replacement hosts the code and services they need to recover the team.",
          href: "/docs/durability",
        },
      ]),
    ],
  },
  {
    id: "rivet",
    title: "Host each coding family in a Rivet actor",
    label: "Rivet actors",
    description: "Host a coordinated agent family without making actor memory the source of truth.",
    group: "Keep work",
    blocks: [
      p(
        "Use one stable actor key for a coordinated coding partition. The actor provides wake, sleep, scheduling, and execution scope; S3 keeps the canonical work.",
      ),
      diagram("durability"),
      p(
        "`makeRuntimeActor` wires the host lifecycle around the object Runtime. Map an authorized key such as `[tenant, rootSessionId]` to a deterministic namespace. The lead, reviewer, and test-writer children stay in that partition; a child conversation is not automatically another actor.",
      ),
      heading("Bind one authorized coding family"),
      p(
        "Save this as `src/actor.ts`. This host accepts only the configured tenant and partition. It composes the S3 transport, Crypto, and executable resolver around the actor's scoped Runtime. It does not derive authorization from arbitrary actor-key text.",
      ),
      code("coding-actor", "Runtime actor", codingActor),
      p(
        "Save this as `src/registry.ts`. Rivet owns actor routing and lifecycle; its local engine can be managed by the demo process or replaced with an explicitly configured hosted endpoint.",
      ),
      code("coding-registry", "Actor registry", codingRegistry),
      table(
        ["Lifecycle", "What the host does"],
        [
          [
            "Wake",
            "Resolve the namespace, reconstruct services, and arrange background execution without blocking control actions.",
          ],
          ["Drain", "Claim eligible canonical work and observe active work under the host’s scope."],
          ["Reconciliation", "Use scheduled and periodic wake hints to discover outstanding journal obligations."],
          [
            "Sleep / destroy",
            "Dispose the scoped runtime. Recovery must not depend on a shutdown callback having completed.",
          ],
          [
            "Control actions",
            "Validate commands and admit them through Runtime, even while long model or tool operations are active.",
          ],
        ],
      ),
      note(
        "Scale by ownership boundaries",
        "Independent actor partitions can progress separately. That is not automatic sharding, unlimited throughput in one hot partition, or portable credentials. Your application owns routing, identity, authorization, capacity, and executable registration.",
      ),
    ],
  },
  {
    id: "deployment",
    title: "Deploy the coding-agent service",
    label: "Deployment",
    description: "Configure the services, credentials, and execution host your durable agent needs.",
    group: "Keep work",
    blocks: [
      p(
        "Deploy code that can reconstruct accepted work, not a process with irreplaceable memory. Keep the same actor-key mapping, namespace, executable definitions, and storage configuration across replacements.",
      ),
      table(
        ["Configure", "Before sending real work"],
        [
          ["Rivet", "Register the actor definition and route each authorized coding root to its stable key."],
          [
            "S3",
            "Provision the bucket and scoped credentials; verify the transport’s required consistency and conditional-write behavior.",
          ],
          [
            "Model",
            "Provide the selected model and credentials on the execution host. The scripted mode has no provider cost.",
          ],
          [
            "Coding environment",
            "Provide a checked-out repository or Sandbox with explicit capabilities and a trusted verification command.",
          ],
          [
            "Public entrypoint",
            "Authenticate and authorize callers before they select a tenant, Session, actor, or repository.",
          ],
          [
            "Recovery",
            "Exercise a replacement host, an interrupted operation, and strict replay with the exact deployed configuration.",
          ],
        ],
      ),
      p(
        "The following modules complete the coding-team capstone. A local run exercises MinIO and a managed local Rivet engine; it does not establish live AWS S3 behavior or a hosted Rivet deployment.",
      ),
      heading("Own startup and shutdown"),
      p(
        "Save the typed host failure as `src/errors.ts` and the long-running entrypoint as `src/main.ts`. The process boundary starts Rivet, holds its scope open, and closes it on interruption. Host shutdown does not cancel accepted Runs.",
      ),
      code("coding-errors", "Host failures", codingErrors),
      code("coding-main", "Service entrypoint", codingMain),
      heading("Submit and observe the coding task"),
      p(
        "Save this as `src/demo.ts`. It owns both the registry and client, sends the stable command, and waits for the parent and specialists to settle. It prints identifiers from the actual execution; those identifiers will differ between fresh namespaces.",
      ),
      code("coding-demo", "Local demo", codingDemo),
      heading("Start local storage"),
      p(
        "Save the following configuration as `compose.yaml` and the local-only environment as `.env`. Do not commit `.env`. These credentials belong only to the loopback MinIO fixture and must not be reused for a public service.",
      ),
      code("coding-compose", "Local object storage", codingCompose, "yaml"),
      code("coding-environment", "Local environment", codingEnvironment, "bash"),
      code(
        "coding-start",
        "Terminal",
        "docker compose up -d minio\ndocker compose run --rm create-bucket\nbun src/demo.ts",
        "bash",
      ),
      p(
        "Success prints JSON with a succeeded parent and two succeeded children, then keeps the actor host running. Press Ctrl-C to release its scope. Starting the demo again with the same namespace and command key observes that original Run. Choose a fresh `GENERALIST_PARTITION` for a separate task; do not delete stored objects to make recovery work.",
      ),
      p(
        "A connection refusal usually means MinIO or the bucket-creation step is not ready. A Rivet registration timeout can mean the configured Rivet namespace does not exist: the local engine starts with `default`. A reconstruction mismatch means definitions changed under an existing identity: restore the expected code, or use a fresh Generalist namespace for a new experiment. `docker compose stop` stops MinIO without deleting its named volume.",
      ),
      heading("Run the service on a hosted worker"),
      p(
        "Run `bun src/main.ts` when the caller lives elsewhere. Set `RIVET_START_ENGINE=false` and supply `RIVET_ENDPOINT`, `RIVET_NAMESPACE`, `RIVET_POOL_NAME`, and any required `RIVET_TOKEN`. Configure the S3 environment for a pre-created bucket. The bucket's credentials and the Rivet token stay in your host's secret store.",
      ),
      p(
        "For a containerized worker, save this as `Dockerfile` beside the tutorial project's manifest and committed lockfile. Build it from that project, then configure the worker and its secrets in your Rivet deployment. This image has no application-authentication endpoint; authorize callers before giving them actor access.",
      ),
      code(
        "coding-worker-image",
        "Worker image",
        'FROM oven/bun:1.4.0\nWORKDIR /app\nCOPY package.json bun.lock ./\nRUN bun install --frozen-lockfile\nCOPY src ./src\nCMD ["bun", "src/main.ts"]',
        "dockerfile",
      ),
    ],
  },
  {
    id: "interfaces",
    title: "Connect a UI and other compute hosts",
    label: "Clients and hosts",
    description: "Connect an interface to accepted work without coupling execution to that interface.",
    group: "Connect",
    blocks: [
      p(
        "Keep the coding agent’s execution contract independent of its interface. A CLI, Foldkit application, protocol adapter, server, or alternate compute host should observe the same accepted work.",
      ),
      table(
        ["Surface", "Ownership"],
        [
          [
            "Host / Server",
            "Application process boundaries, registration, and serving. Authentication and resource authorization remain yours.",
          ],
          ["Transport", "Commands plus snapshot-first observation and replay. Reconnect from committed state."],
          ["Foldkit", "Headless Chat and Connection state for your own rendered interface."],
          [
            "Cloudflare Workers / Durable Objects",
            "Compute hosts using the same object engine, with native R2 or S3 transport as configured.",
          ],
          [
            "Dynamic Workers / worker loader",
            "Explicitly supported dynamic execution boundaries, not unrestricted portable JavaScript.",
          ],
          [
            "Triggers / watchers",
            "Admit or wake work under configured policy; notifications are not the commit authority.",
          ],
        ],
      ),
    ],
  },
  {
    id: "artifacts",
    title: "Keep the evidence produced by the team",
    label: "Artifacts and evidence",
    description: "Keep the results of tools and verification attached to their actual storage owners.",
    group: "Connect",
    blocks: [
      p(
        "A coding run produces more than an answer: a patch, test output, decisions, and possibly screenshots or other media. Keep those artifacts attached to their actual execution and storage owners.",
      ),
      table(
        ["Module", "Use it for"],
        [
          [
            "BlobStore / Media",
            "Typed references to media bytes and provider resolution; do not treat a transient URL as durable content identity.",
          ],
          ["Artifacts", "Artifacts, with their own authorization and persistence requirements."],
          ["Trajectory", "Recorded run, tool, gate, and usage evidence for inspection and evaluation."],
          [
            "Learning / instruction refinement",
            "Explicit mechanisms for improving future guidance from retained evidence, not an automatic claim that the model learned.",
          ],
          [
            "RL export",
            "Export supported trajectory data for downstream training or analysis; retain provenance and incurred costs.",
          ],
          [
            "Components / capabilities / pins",
            "Declare composition, authority, and reconstruction identity at the boundaries that use them.",
          ],
        ],
      ),
      p(
        "A successful model response is not evidence that a file persisted, an artifact synchronized, or a test passed. Show the concrete result of the corresponding operation.",
      ),
    ],
  },
]

export const codeExamples = sections.flatMap((section) =>
  section.blocks.flatMap((block) => (block.kind === "code" ? [block.example] : [])),
)
