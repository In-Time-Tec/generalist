export const packages = [
  "a2a",
  "ag-ui",
  "core",
  "test",
  "skills",
  "harness",
  "memory",
  "providers",
  "mcp",
  "repl",
  "runtime",
  "transport",
  "foldkit",
] as const
export const compressedSizeLimits: Record<(typeof packages)[number], number> = {
  a2a: 50_000,
  "ag-ui": 30_000,
  core: 190_000,
  test: 8_000,
  skills: 13_000,
  harness: 19_000,
  memory: 10_000,
  providers: 36_000,
  mcp: 12_000,
  repl: 42_000,
  runtime: 230_000,
  transport: 30_000,
  foldkit: 16_000,
}

export const packedEffectDependencies: Record<(typeof packages)[number], ReadonlyArray<string>> = {
  a2a: [],
  "ag-ui": [],
  core: [],
  test: [],
  skills: [],
  harness: [],
  memory: [],
  providers: ["@effect/ai-anthropic", "@effect/ai-openai", "@effect/ai-openai-compat", "@effect/ai-openrouter"],
  mcp: [],
  repl: [],
  runtime: ["@effect/sql-mysql2", "@effect/sql-pg", "@effect/sql-sqlite-bun"],
  transport: [],
  foldkit: [],
}
export const packedProviderDependencies = {
  "@aws-sdk/client-bedrock-runtime": "3.859.0",
  "@aws-sdk/credential-provider-node": "3.859.0",
  "@smithy/types": "4.3.1",
} as const

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
