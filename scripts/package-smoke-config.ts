export const packages = ["tenetkit", "pg", "mysql", "cloudflare"] as const
export const packageNames: Record<(typeof packages)[number], string> = {
  tenetkit: "tenetkit",
  pg: "@tenetkit/pg",
  mysql: "@tenetkit/mysql",
  cloudflare: "@tenetkit/cloudflare",
}
export const compressedSizeLimits: Record<(typeof packages)[number], number> = {
  tenetkit: 700_000,
  pg: 180_000,
  mysql: 120_000,
  cloudflare: 120_000,
}
export const packedEffectDependencies: Record<(typeof packages)[number], ReadonlyArray<string>> = {
  tenetkit: [
    "@effect/ai-anthropic",
    "@effect/ai-openai",
    "@effect/ai-openai-compat",
    "@effect/ai-openrouter",
    "@effect/sql-sqlite-bun",
  ],
  pg: ["@effect/sql-pg"],
  mysql: ["@effect/sql-mysql2"],
  cloudflare: ["@effect/sql-sqlite-do"],
}
export const packedProviderDependencies = {
  "@aws-sdk/client-bedrock-runtime": "3.859.0",
  "@aws-sdk/credential-provider-node": "3.859.0",
  "@smithy/types": "4.3.1",
} as const
export const packageExports = [
  "tenetkit",
  "tenetkit/runtime",
  "tenetkit/ai",
  "tenetkit/mcp",
  "tenetkit/skills",
  "tenetkit/memory",
  "tenetkit/harness",
  "tenetkit/transport",
  "tenetkit/foldkit",
  "tenetkit/test",
  "tenetkit/a2a",
  "tenetkit/ag-ui",
  "tenetkit/repl",
  "tenetkit/ai/catalog",
  "tenetkit/ai/openai",
  "tenetkit/ai/openai-account-auth",
  "tenetkit/ai/openai-account-auth-http",
  "tenetkit/ai/anthropic",
  "tenetkit/ai/amazon-bedrock",
  "tenetkit/ai/openrouter",
  "tenetkit/ai/openai-compat",
  "tenetkit/ai/deterministic",
  "tenetkit/ai/presets",
  "tenetkit/ai/embedding",
  "tenetkit/mcp/tools",
  "tenetkit/repl/bun",
  "tenetkit/transport/client",
  "tenetkit/transport/errors",
  "tenetkit/transport/sse",
  "tenetkit/transport/ws",
  "tenetkit/transport/wire",
  "tenetkit/transport/snapshot",
  "tenetkit/runtime/driver",
  "tenetkit/runtime/driver/sql",
  "tenetkit/runtime/driver/run-store",
  "tenetkit/runtime/driver/sql/store",
  "@tenetkit/cloudflare/workers",
  "@tenetkit/cloudflare/durable-objects",
  "@tenetkit/cloudflare/dynamic-workers",
  "@tenetkit/cloudflare/testing",
] as const
export const forbiddenPackageExports = ["@tenetkit/cloudflare"] as const
export const sortRecord = (value: Record<string, string> | undefined): Record<string, string> =>
  Object.fromEntries(Object.entries(value ?? {}).toSorted(([left], [right]) => left.localeCompare(right)))
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

export const tarballName = (input: { readonly packageName: string; readonly version: string }): string =>
  input.packageName === "tenetkit"
    ? `tenetkit-${input.version}.tgz`
    : `tenetkit-${input.packageName}-${input.version}.tgz`
