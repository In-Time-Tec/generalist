export const packageName = "generalist"
export const packageDirectory = "packages/generalist"
export const compressedSizeLimit = 1_200_000
export const packedEffectDependencies = [
  "@effect/ai-anthropic",
  "@effect/ai-openai",
  "@effect/ai-openai-compat",
  "@effect/ai-openrouter",
] as const
export const packedProviderDependencies = [
  "@aws-sdk/client-bedrock-runtime",
  "@aws-sdk/client-s3",
  "@aws-sdk/credential-provider-node",
  "@smithy/fetch-http-handler",
  "@smithy/types",
] as const

/** Applies to bare specifiers, dependency names, emitted paths and bundled graph entries. */
export const isSqlGraphEntry = (value: string): boolean => {
  const normalized = value.replaceAll("\\", "/").toLowerCase()
  return (
    /@effect[+/]sql(?:[-/@]|$)/.test(normalized) ||
    /(?:^|[/+])(?:sql|sqlite3?|better-sqlite3|postgres(?:ql)?|mysql2?|pg|pgpass|@libsql|libsql|pglite|drizzle-orm|kysely)(?:[-/@+.]|$)/.test(
      normalized,
    ) ||
    normalized.startsWith("bun:sqlite")
  )
}

export type ConsumerRuntime = "bun" | "node" | "worker"
export interface ConsumerImport {
  readonly specifier: string
  readonly runtimes: ReadonlyArray<ConsumerRuntime>
  readonly exports?: ReadonlyArray<string>
}
export interface MinimumConsumerProfile {
  readonly name: string
  readonly peers: ReadonlyArray<string>
  readonly nativeHostPeers?: ReadonlyArray<string>
  readonly imports: ReadonlyArray<ConsumerImport>
}

const nodeAndBun = ["bun", "node"] as const
const bunOnly = ["bun"] as const
const nodeOnly = ["node"] as const
const workerOnly = ["worker"] as const

export const minimumConsumerProfiles = [
  {
    name: "core-runtime",
    peers: [],
    imports: [
      { specifier: "generalist", runtimes: nodeAndBun, exports: ["Agent", "Session", "Tasks"] },
      { specifier: "generalist/approvals", runtimes: nodeAndBun },
      {
        specifier: "generalist/blob-store",
        runtimes: ["bun", "node", "worker"],
        exports: ["BlobStore", "layer"],
      },
      {
        specifier: "generalist/durability",
        runtimes: ["bun", "node", "worker"],
        exports: ["layer", "layerRunStore", "activate", "Activation", "DurabilityFailure"],
      },
      { specifier: "generalist/durability/discovery", runtimes: nodeAndBun, exports: ["page", "inspect"] },
      {
        specifier: "generalist/durability/fs",
        runtimes: nodeAndBun,
        exports: ["make", "layer", "makeMaintenance", "layerMaintenance"],
      },
      { specifier: "generalist/durability/host", runtimes: nodeAndBun, exports: ["reconcilePage"] },
      {
        specifier: "generalist/durability/object-store",
        runtimes: ["bun", "node", "worker"],
        exports: ["ObjectStore", "ObjectMaintenance", "ObjectStoreFailure"],
      },
      { specifier: "generalist/compaction", runtimes: nodeAndBun },
      { specifier: "generalist/hooks", runtimes: nodeAndBun, exports: ["Hooks", "onToolCall"] },
      { specifier: "generalist/eval", runtimes: nodeAndBun, exports: ["score", "runSuite"] },
      { specifier: "generalist/host", runtimes: nodeAndBun, exports: ["Host"] },
      { specifier: "generalist/server", runtimes: nodeAndBun, exports: ["Server"] },
      { specifier: "generalist/permissions", runtimes: nodeAndBun },
      { specifier: "generalist/providers/deterministic", runtimes: nodeAndBun, exports: ["layer"] },
      { specifier: "generalist/providers/model-catalog", runtimes: nodeAndBun, exports: ["layer"] },
      { specifier: "generalist/unstable/providers/model-route", runtimes: nodeAndBun, exports: ["make"] },
      { specifier: "generalist/unstable/providers/openai-account-auth", runtimes: nodeAndBun },
      { specifier: "generalist/unstable/providers/openai-account-auth-http", runtimes: nodeAndBun },
      {
        specifier: "generalist/unstable/learning",
        runtimes: ["bun", "node", "worker"],
        exports: ["Proposal", "declaration", "layer", "proposeWithModel"],
      },
      { specifier: "generalist/memory", runtimes: nodeAndBun },
      { specifier: "generalist/media", runtimes: ["bun", "node", "worker"], exports: ["File", "Ref", "fromPath"] },
      { specifier: "generalist/repl", runtimes: nodeAndBun },
      { specifier: "generalist/repl/bun", runtimes: bunOnly },
      { specifier: "generalist/runtime", runtimes: nodeAndBun, exports: ["Runtime"] },
      { specifier: "generalist/runtime/native-layer-environment", runtimes: nodeAndBun },
      { specifier: "generalist/tasks", runtimes: nodeAndBun, exports: ["layer", "update"] },
      {
        specifier: "generalist/components",
        runtimes: nodeAndBun,
        exports: ["make", "layer", "command", "read", "CommandTool"],
      },
      { specifier: "generalist/testing/model", runtimes: nodeAndBun, exports: ["layer", "object", "text"] },
      { specifier: "generalist/trajectory", runtimes: nodeAndBun, exports: ["fromJournal", "export"] },
      {
        specifier: "generalist/unstable/rl-export",
        runtimes: ["bun", "node", "worker"],
        exports: ["Reward", "dag", "export"],
      },
      {
        specifier: "generalist/unstable/capability",
        runtimes: nodeAndBun,
        exports: ["Scope", "Source", "grant", "attenuate", "revoke", "check", "requireUntainted"],
      },
      { specifier: "generalist/unstable/runtime/external-child-placement", runtimes: nodeAndBun },
      {
        specifier: "generalist/unstable/runtime/external-child-reconciliation",
        runtimes: nodeAndBun,
        exports: ["reconcilePage"],
      },
      { specifier: "generalist/unstable/runtime/external-child-store", runtimes: nodeAndBun },
      { specifier: "generalist/instructions", runtimes: nodeAndBun, exports: ["load"] },
      { specifier: "generalist/instructions/skills", runtimes: nodeAndBun },
      { specifier: "generalist/memo", runtimes: nodeAndBun, exports: ["pure", "layerMemory"] },
    ],
  },
  {
    name: "durability-s3",
    peers: ["@aws-sdk/client-s3", "@smithy/fetch-http-handler"],
    imports: [{ specifier: "generalist/durability/s3", runtimes: nodeAndBun, exports: ["make", "layer"] }],
  },
  {
    name: "durability-r2",
    peers: [],
    imports: [
      { specifier: "generalist/durability/r2", runtimes: ["bun", "node", "worker"], exports: ["make", "layer"] },
    ],
  },
  {
    name: "test-durability",
    peers: [],
    imports: [
      {
        specifier: "generalist/testing/durability",
        runtimes: nodeAndBun,
        exports: ["make", "layer", "atomicCreates", "freshReads", "listing", "byteIntegrity"],
      },
    ],
  },
  {
    name: "sandbox",
    peers: ["@rivet-dev/agentos", "es-module-lexer", "modal"],
    nativeHostPeers: ["@rivet-dev/agentos"],
    imports: [
      {
        specifier: "generalist/sandbox",
        runtimes: nodeAndBun,
        exports: ["Sandbox", "SandboxProvider", "layerBunKernel"],
      },
      {
        specifier: "generalist/unstable/sandbox/e2b",
        runtimes: nodeAndBun,
        exports: ["layer", "makeProvider"],
      },
      {
        specifier: "generalist/unstable/sandbox/daytona",
        runtimes: nodeAndBun,
        exports: ["layer", "makeProvider"],
      },
      {
        specifier: "generalist/unstable/sandbox/fly-sprites",
        runtimes: nodeAndBun,
        exports: ["layer", "makeProvider"],
      },
      {
        specifier: "generalist/unstable/sandbox/modal",
        runtimes: nodeAndBun,
        exports: ["layer", "makeProvider"],
      },
      {
        specifier: "generalist/unstable/sandbox/agentos",
        runtimes: nodeAndBun,
        exports: ["layer", "makeProvider"],
      },
    ],
  },
  {
    name: "mcp",
    peers: ["@modelcontextprotocol/sdk"],
    imports: [
      { specifier: "generalist/unstable/mcp", runtimes: nodeAndBun },
      { specifier: "generalist/unstable/mcp/client", runtimes: nodeAndBun },
      { specifier: "generalist/unstable/mcp/client/http", runtimes: nodeAndBun },
      { specifier: "generalist/unstable/mcp/client/stdio", runtimes: nodeAndBun },
      { specifier: "generalist/unstable/mcp/oauth", runtimes: nodeAndBun },
      { specifier: "generalist/unstable/mcp/tools", runtimes: nodeAndBun },
    ],
  },
  {
    name: "foldkit",
    peers: ["foldkit"],
    imports: [{ specifier: "generalist/unstable/foldkit", runtimes: nodeAndBun }],
  },
  {
    name: "artifact",
    peers: ["yjs"],
    imports: [
      {
        specifier: "generalist/unstable/artifact",
        runtimes: nodeAndBun,
        exports: ["Artifact", "ArtifactCrdt", "Yjs", "layer", "open", "readTool", "tool"],
      },
    ],
  },
  {
    name: "a2a",
    peers: ["@a2a-js/sdk"],
    imports: [{ specifier: "generalist/unstable/a2a", runtimes: nodeAndBun }],
  },
  {
    name: "ag-ui",
    peers: ["@ag-ui/core"],
    imports: [{ specifier: "generalist/unstable/ag-ui", runtimes: nodeAndBun }],
  },
  {
    name: "test-host",
    peers: ["@effect/vitest", "vitest"],
    imports: [
      { specifier: "generalist/testing", runtimes: nodeAndBun, exports: ["TestModel", "Testing"] },
      { specifier: "generalist/testing/runtime-driver", runtimes: nodeAndBun, exports: ["runtimeDriver"] },
    ],
  },
  {
    name: "anthropic",
    peers: ["@effect/ai-anthropic"],
    imports: [{ specifier: "generalist/providers/anthropic", runtimes: nodeAndBun, exports: ["layer"] }],
  },
  {
    name: "openai",
    peers: ["@effect/ai-openai"],
    imports: [
      { specifier: "generalist/providers/openai", runtimes: nodeAndBun, exports: ["layer"] },
      { specifier: "generalist/providers/openai-embedding", runtimes: nodeAndBun },
      { specifier: "generalist/providers/openai-responses", runtimes: nodeAndBun },
    ],
  },
  {
    name: "openai-compatible",
    peers: ["@effect/ai-openai-compat"],
    imports: [
      { specifier: "generalist/providers/openai-chat-completions", runtimes: nodeAndBun },
      { specifier: "generalist/providers/openai-compatible", runtimes: nodeAndBun },
      { specifier: "generalist/providers/openai-compatible-embedding", runtimes: nodeAndBun },
    ],
  },
  {
    name: "openrouter",
    peers: ["@effect/ai-openrouter"],
    imports: [{ specifier: "generalist/providers/openrouter", runtimes: nodeAndBun, exports: ["layer"] }],
  },
  {
    name: "amazon-bedrock",
    peers: ["@aws-sdk/client-bedrock-runtime", "@aws-sdk/credential-provider-node", "@smithy/types"],
    imports: [{ specifier: "generalist/providers/amazon-bedrock", runtimes: nodeOnly, exports: ["layer"] }],
  },
  {
    name: "cloudflare",
    peers: ["es-module-lexer"],
    imports: [
      {
        specifier: "generalist/unstable/cloudflare/durable-objects",
        runtimes: workerOnly,
        exports: ["layerRunStore", "make", "reconcile"],
      },
      { specifier: "generalist/unstable/cloudflare/dynamic-workers", runtimes: workerOnly, exports: ["layer", "make"] },
      { specifier: "generalist/unstable/cloudflare/workers", runtimes: workerOnly, exports: ["make"] },
      {
        specifier: "generalist/unstable/sandbox/cloudflare",
        runtimes: workerOnly,
        exports: ["layer", "makeProvider"],
      },
      {
        specifier: "generalist/unstable/sandbox/worker-loader",
        runtimes: workerOnly,
        exports: ["layerWorkerLoader", "makeWorkerLoaderProvider"],
      },
    ],
  },
  {
    name: "rivet",
    peers: ["@standard-schema/spec", "rivetkit"],
    nativeHostPeers: ["rivetkit"],
    imports: [
      {
        specifier: "generalist/unstable/rivet",
        runtimes: nodeAndBun,
        exports: ["makeRuntimeActor", "RuntimeActorNamespace", "ActorRuntime", "layerActorRuntime"],
      },
    ],
  },
] as const satisfies ReadonlyArray<MinimumConsumerProfile>

export const workerSafePackageExports = [
  "generalist",
  "generalist/blob-store",
  "generalist/components",
  "generalist/durability",
  "generalist/durability/object-store",
  "generalist/durability/r2",
  "generalist/hooks",
  "generalist/host",
  "generalist/server",
  "generalist/unstable/mcp",
  "generalist/unstable/mcp/client",
  "generalist/unstable/mcp/client/http",
  "generalist/unstable/mcp/oauth",
  "generalist/unstable/mcp/tools",
  "generalist/unstable/learning",
  "generalist/providers/openrouter",
  "generalist/runtime",
  "generalist/sandbox",
  "generalist/eval",
  "generalist/memo",
  "generalist/media",
  "generalist/tasks",
  "generalist/trajectory",
  "generalist/unstable/rl-export",
] as const

export const wildcardExportExamples = [] as const
export const forbiddenPackageExports = [
  "generalist/unstable/rlm",
  "generalist/durability/auxiliary",
  "generalist/pg",
  "generalist/mysql",
  "generalist/runtime/sql-driver",
  "generalist/runtime/sqlite-bun",
  "generalist/a2a",
  "generalist/ag-ui",
  "generalist/cloudflare",
  "generalist/foldkit",
  "generalist/mcp",
  "generalist/rivet",
  "generalist/transport",
  "generalist/ai",
  "generalist/ai/index",
  "generalist/ai/provider/openrouter",
  "generalist/core",
  "generalist/providers",
  "generalist/providers/index",
  "generalist/providers/provider/openrouter",
  "generalist/core/agent/service",
  "generalist/runtime/service",
  "generalist/runtime/execution/run-executor-internal",
] as const

export const exactPackageExports = [
  ".",
  "./approvals",
  "./blob-store",
  "./compaction",
  "./components",
  "./durability",
  "./durability/discovery",
  "./durability/fs",
  "./durability/host",
  "./durability/object-store",
  "./durability/r2",
  "./durability/s3",
  "./eval",
  "./hooks",
  "./host",
  "./instructions",
  "./instructions/skills",
  "./media",
  "./memo",
  "./memory",
  "./permissions",
  "./providers/amazon-bedrock",
  "./providers/anthropic",
  "./providers/deterministic",
  "./providers/model-catalog",
  "./providers/openai",
  "./providers/openai-chat-completions",
  "./providers/openai-compatible",
  "./providers/openai-compatible-embedding",
  "./providers/openai-embedding",
  "./providers/openai-responses",
  "./providers/openrouter",
  "./repl",
  "./repl/bun",
  "./runtime",
  "./runtime/native-layer-environment",
  "./sandbox",
  "./server",
  "./tasks",
  "./testing",
  "./testing/durability",
  "./testing/model",
  "./testing/runtime-driver",
  "./trajectory",
  "./unstable/a2a",
  "./unstable/ag-ui",
  "./unstable/artifact",
  "./unstable/capability",
  "./unstable/cloudflare/durable-objects",
  "./unstable/cloudflare/dynamic-workers",
  "./unstable/cloudflare/workers",
  "./unstable/foldkit",
  "./unstable/learning",
  "./unstable/mcp",
  "./unstable/mcp/client",
  "./unstable/mcp/client/http",
  "./unstable/mcp/client/stdio",
  "./unstable/mcp/oauth",
  "./unstable/mcp/tools",
  "./unstable/providers/model-route",
  "./unstable/providers/openai-account-auth",
  "./unstable/providers/openai-account-auth-http",
  "./unstable/rivet",
  "./unstable/rl-export",
  "./unstable/runtime/external-child-placement",
  "./unstable/runtime/external-child-reconciliation",
  "./unstable/runtime/external-child-store",
  "./unstable/sandbox/agentos",
  "./unstable/sandbox/cloudflare",
  "./unstable/sandbox/daytona",
  "./unstable/sandbox/e2b",
  "./unstable/sandbox/fly-sprites",
  "./unstable/sandbox/modal",
  "./unstable/sandbox/worker-loader",
] as const

const sorted = <A>(values: Iterable<A>, compare: (left: A, right: A) => number): Array<A> =>
  Array.from(values).reduce<Array<A>>((result, value) => {
    const index = result.findIndex((item) => compare(value, item) < 0)
    result.splice(index < 0 ? result.length : index, 0, value)
    return result
  }, [])
export const sortRecord = (value: Readonly<Record<string, string>> | undefined): Record<string, string> => {
  const entries = sorted(Object.entries(value ?? {}), ([left], [right]) => left.localeCompare(right))
  return Object.fromEntries(entries)
}
export const catalogVersion = (input: {
  readonly rootManifest: {
    readonly workspaces: {
      readonly catalog: Readonly<Record<string, string>>
      readonly catalogs?: Readonly<Record<string, Readonly<Record<string, string>>>>
    }
  }
  readonly dependency: string
  readonly reference: string
}): string | undefined => {
  const catalogName = input.reference.slice("catalog:".length)
  const catalog =
    catalogName.length === 0
      ? input.rootManifest.workspaces.catalog
      : input.rootManifest.workspaces.catalogs?.[catalogName]
  return catalog?.[input.dependency]
}

export const tarballName = (version: string): string => `generalist-${version}.tgz`
