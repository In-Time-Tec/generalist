export const packageName = "generalist"
export const packageDirectory = "packages/generalist"
export const compressedSizeLimit = 1_200_000
export const packedEffectDependencies = [
  "@effect/ai-anthropic",
  "@effect/ai-openai",
  "@effect/ai-openai-compat",
  "@effect/ai-openrouter",
  "@effect/sql-mysql2",
  "@effect/sql-pg",
  "@effect/sql-sqlite-bun",
  "@effect/sql-sqlite-do",
] as const
export const packedProviderDependencies = {
  "@aws-sdk/client-bedrock-runtime": "3.859.0",
  "@aws-sdk/credential-provider-node": "3.859.0",
  "@smithy/types": "4.3.1",
} as const

export type ConsumerRuntime = "bun" | "node" | "worker"
export interface ConsumerImport {
  readonly specifier: string
  readonly runtimes: ReadonlyArray<ConsumerRuntime>
  readonly exports?: ReadonlyArray<string>
}
export interface MinimumConsumerProfile {
  readonly name: string
  readonly peers: ReadonlyArray<string>
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
      { specifier: "generalist", runtimes: nodeAndBun, exports: ["Agent", "Session"] },
      { specifier: "generalist/approvals", runtimes: nodeAndBun },
      { specifier: "generalist/compaction", runtimes: nodeAndBun },
      { specifier: "generalist/eval", runtimes: nodeAndBun, exports: ["score", "runSuite"] },
      { specifier: "generalist/permissions", runtimes: nodeAndBun },
      { specifier: "generalist/providers/deterministic", runtimes: nodeAndBun, exports: ["layer"] },
      { specifier: "generalist/providers/model-catalog", runtimes: nodeAndBun, exports: ["layer"] },
      { specifier: "generalist/unstable/providers/model-route", runtimes: nodeAndBun, exports: ["make"] },
      { specifier: "generalist/unstable/providers/openai-account-auth", runtimes: nodeAndBun },
      { specifier: "generalist/unstable/providers/openai-account-auth-http", runtimes: nodeAndBun },
      { specifier: "generalist/memory", runtimes: nodeAndBun },
      { specifier: "generalist/repl", runtimes: nodeAndBun },
      { specifier: "generalist/repl/bun", runtimes: bunOnly },
      { specifier: "generalist/runtime", runtimes: nodeAndBun, exports: ["Runtime"] },
      { specifier: "generalist/trajectory", runtimes: nodeAndBun, exports: ["fromJournal", "export"] },
      { specifier: "generalist/unstable/runtime/external-child-placement", runtimes: nodeAndBun },
      { specifier: "generalist/unstable/runtime/external-child-store", runtimes: nodeAndBun },
      { specifier: "generalist/runtime/sql-driver", runtimes: nodeAndBun },
      { specifier: "generalist/instructions", runtimes: nodeAndBun, exports: ["load"] },
      { specifier: "generalist/instructions/skills", runtimes: nodeAndBun },
      { specifier: "generalist/unstable/transport", runtimes: nodeAndBun },
      { specifier: "generalist/unstable/transport/errors", runtimes: nodeAndBun },
      { specifier: "generalist/unstable/transport/replay", runtimes: nodeAndBun },
      { specifier: "generalist/unstable/transport/run-client", runtimes: nodeAndBun },
      { specifier: "generalist/unstable/transport/snapshot", runtimes: nodeAndBun },
      { specifier: "generalist/unstable/transport/sse", runtimes: nodeAndBun },
      { specifier: "generalist/unstable/transport/websocket", runtimes: nodeAndBun },
      { specifier: "generalist/unstable/transport/wire", runtimes: nodeAndBun },
    ],
  },
  {
    name: "sqlite-bun",
    peers: ["@effect/sql-sqlite-bun"],
    imports: [{ specifier: "generalist/runtime/sqlite-bun", runtimes: bunOnly, exports: ["Runtime", "RunStore"] }],
  },
  {
    name: "sandbox",
    peers: ["es-module-lexer"],
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
    name: "sql-adapters",
    peers: ["@effect/sql-pg", "@effect/sql-mysql2"],
    imports: [
      { specifier: "generalist/pg", runtimes: nodeAndBun, exports: ["layer", "RuntimeSchema"] },
      { specifier: "generalist/mysql", runtimes: nodeAndBun, exports: ["layer", "RuntimeSchema"] },
    ],
  },
  {
    name: "cloudflare",
    peers: ["@effect/sql-sqlite-do", "es-module-lexer"],
    imports: [
      {
        specifier: "generalist/unstable/cloudflare/durable-objects",
        runtimes: workerOnly,
        exports: ["HibernatingWebSocket", "layerRunStore"],
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
    imports: [{ specifier: "generalist/unstable/rivet", runtimes: nodeAndBun, exports: ["makeRuntimeActor"] }],
  },
] as const satisfies ReadonlyArray<MinimumConsumerProfile>

export const workerSafePackageExports = [
  "generalist",
  "generalist/unstable/mcp",
  "generalist/unstable/mcp/client",
  "generalist/unstable/mcp/client/http",
  "generalist/unstable/mcp/oauth",
  "generalist/unstable/mcp/tools",
  "generalist/providers/openrouter",
  "generalist/runtime",
  "generalist/runtime/sql-driver",
  "generalist/sandbox",
  "generalist/eval",
  "generalist/trajectory",
] as const

export const wildcardExportExamples = [] as const
export const forbiddenPackageExports = [
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
  "./compaction",
  "./eval",
  "./instructions",
  "./instructions/skills",
  "./memory",
  "./mysql",
  "./permissions",
  "./pg",
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
  "./runtime/sql-driver",
  "./runtime/sqlite-bun",
  "./sandbox",
  "./testing",
  "./testing/runtime-driver",
  "./trajectory",
  "./unstable/a2a",
  "./unstable/ag-ui",
  "./unstable/cloudflare/durable-objects",
  "./unstable/cloudflare/dynamic-workers",
  "./unstable/cloudflare/workers",
  "./unstable/foldkit",
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
  "./unstable/runtime/external-child-placement",
  "./unstable/runtime/external-child-store",
  "./unstable/sandbox/cloudflare",
  "./unstable/sandbox/daytona",
  "./unstable/sandbox/e2b",
  "./unstable/sandbox/fly-sprites",
  "./unstable/sandbox/worker-loader",
  "./unstable/transport",
  "./unstable/transport/errors",
  "./unstable/transport/replay",
  "./unstable/transport/run-client",
  "./unstable/transport/snapshot",
  "./unstable/transport/sse",
  "./unstable/transport/websocket",
  "./unstable/transport/wire",
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
