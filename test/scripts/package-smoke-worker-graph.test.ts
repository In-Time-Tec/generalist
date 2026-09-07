import { layer as bunLayer } from "@effect/platform-bun/BunServices"
import { describe, expect, it as test, layer } from "@effect/vitest"
import { Effect, FileSystem, Option, Path, Record as Rec, Result, Schema } from "effect"
import {
  isForbiddenTransportRuntime,
  isForbiddenWorkerRuntime,
  shippedBundleGraph,
} from "../../scripts/package-smoke-bundle-graph.js"
import { auditInstalledDependencyGraph, DependencyGraphFailed } from "../../scripts/package-smoke-dependency-graph.js"
import { minimumConsumerProfiles, type MinimumConsumerProfile } from "../../scripts/package-smoke-config.js"

const encodeJson = Schema.encodeSync(Schema.fromJsonString(Schema.Json))
type Import = { path: string; kind: string; external?: boolean }
type BundleOutput = {
  bytes: number
  inputs: Record<string, { bytesInOutput: number }>
  imports: Array<Import>
  exports: Array<string>
  entryPoint?: string
  cssBundle?: string
}
type BundleFixture = {
  inputs: Record<string, { bytes: number; imports: Array<Import>; format?: string }>
  outputs: Record<string, BundleOutput> & { "worker.js": BundleOutput }
}
const bundle = (): BundleFixture => ({
  inputs: { "entry.js": { bytes: 50, imports: [], format: "esm" } },
  outputs: {
    "worker.js": {
      bytes: 50,
      inputs: { "entry.js": { bytesInOutput: 50 } },
      imports: [],
      exports: [],
      entryPoint: "entry.js",
    },
  },
})

const graphCase = (name: string, metadata: Schema.Json, forbidden: ReadonlyArray<string>): void => {
  const source = encodeJson(metadata)
  test.effect(name, () =>
    Effect.gen(function* () {
      const graph = yield* shippedBundleGraph(source)
      expect(Array.from(graph).filter(isForbiddenWorkerRuntime)).toEqual(forbidden)
    }),
  )
}
const invalidCase = (name: string, metadata: Schema.Json): void => {
  const source = encodeJson(metadata)
  test.effect(`rejects ${name}`, () =>
    Effect.gen(function* () {
      expect(Result.isFailure(yield* Effect.result(shippedBundleGraph(source)))).toBe(true)
    }),
  )
}

describe("shipped package bundle graphs", () => {
  graphCase("accepts a clean emitted Worker", bundle(), [])
  const sql = "node_modules/effect/dist/unstable/sql/SqlClient.js"
  const parsed = bundle()
  parsed.inputs[sql] = { bytes: 100, imports: [] }
  parsed.outputs["worker.js"].inputs[sql] = { bytesInOutput: 0 }
  graphCase("excludes parsed-only zero-byte third-party SQL", parsed, [])
  Reflect.deleteProperty(parsed.outputs["worker.js"].inputs, sql)
  graphCase("excludes parsed-only third-party SQL absent from outputs", parsed, [])
  parsed.outputs["worker.js"].inputs[sql] = { bytesInOutput: 1 }
  graphCase("retains emitted SQL in the forbidden graph", parsed, [sql])
  parsed.outputs["worker.js"].inputs[sql] = { bytesInOutput: 0 }
  parsed.outputs["chunk.js"] = { bytes: 1, inputs: { [sql]: { bytesInOutput: 1 } }, imports: [], exports: [] }
  graphCase("retains SQL emitted only in a secondary output", parsed, [sql])
  for (const name of ["node:fs", "fs/promises", "bun:sqlite", "@aws-sdk/client-s3", "@smithy/types"]) {
    const metadata = bundle()
    metadata.outputs["worker.js"].imports.push({ path: name, kind: "import-statement", external: true })
    graphCase(`retains forbidden external ${name}`, metadata, [name])
  }
  const builtin = bundle()
  builtin.inputs["node:fs"] = { bytes: 1, imports: [] }
  builtin.outputs["worker.js"].inputs["node:fs"] = { bytesInOutput: 1 }
  graphCase("retains an emitted builtin", builtin, ["node:fs"])
  const outputImport = bundle()
  outputImport.outputs["chunk.js"] = {
    bytes: 1,
    inputs: {},
    exports: [],
    imports: [{ path: "sql.js", kind: "dynamic-import", external: false }],
  }
  outputImport.outputs["sql.js"] = { bytes: 1, inputs: {}, exports: [], imports: [] }
  graphCase("inspects every output import regardless of its external flag", outputImport, ["sql.js"])

  invalidCase("missing inputs", { outputs: bundle().outputs })
  invalidCase("missing outputs", { inputs: bundle().inputs })
  invalidCase("an empty input graph", { ...bundle(), inputs: {} })
  invalidCase("an empty output graph", { ...bundle(), outputs: {} })
  const output = bundle().outputs["worker.js"]
  for (const field of ["bytes", "inputs", "imports", "exports"]) {
    invalidCase(`missing output ${field}`, {
      ...bundle(),
      outputs: { "worker.js": Object.fromEntries(Object.entries(output).filter(([key]) => key !== field)) },
    })
  }
  for (const value of [-1, 0.5, "1", null, {}, []]) {
    invalidCase(`invalid emitted byte count ${encodeJson(value)}`, {
      ...bundle(),
      outputs: { "worker.js": { ...output, inputs: { "entry.js": { bytesInOutput: value } } } },
    })
  }
  invalidCase("a missing emitted byte count", {
    ...bundle(),
    outputs: { "worker.js": { ...output, inputs: { "entry.js": {} } } },
  })
  invalidCase("an unknown graph field", { ...bundle(), unknownDependencies: ["pg"] })
  invalidCase("an unknown output field", {
    ...bundle(),
    outputs: { "worker.js": { ...output, unknownImports: ["node:fs"] } },
  })
  invalidCase("an unknown emitted input", {
    ...bundle(),
    outputs: { "worker.js": { ...output, inputs: { "unknown.js": { bytesInOutput: 1 } } } },
  })
  invalidCase("missing parsed input imports", { ...bundle(), inputs: { "entry.js": { bytes: 50 } } })
  for (const [name, item] of [
    ["an invalid import kind", { path: "pg", kind: "unknown" }],
    ["an invalid external flag", { path: "pg", kind: "import-statement", external: "true" }],
    ["an empty import path", { path: "", kind: "import-statement" }],
    ["an untracked output import", { path: "unknown.js", kind: "import-statement" }],
  ] as const) {
    invalidCase(name, { ...bundle(), outputs: { "worker.js": { ...output, imports: [item] } } })
  }
  invalidCase("an untracked parsed internal import", {
    ...bundle(),
    inputs: { "entry.js": { bytes: 50, imports: [{ path: "unknown.js", kind: "import-statement" }] } },
  })
  invalidCase("an unknown entrypoint", {
    ...bundle(),
    outputs: { "worker.js": { ...output, entryPoint: "unknown.js" } },
  })
  invalidCase("an unknown CSS output", {
    ...bundle(),
    outputs: { "worker.js": { ...output, cssBundle: "unknown.css" } },
  })
  for (const [name, source] of [
    ["malformed JSON", "{"],
    ["a nonfinite byte count", encodeJson(bundle()).replace('"bytesInOutput":50', '"bytesInOutput":1e309')],
  ] as const) {
    test.effect(`rejects ${name}`, () =>
      Effect.gen(function* () {
        expect(Result.isFailure(yield* Effect.result(shippedBundleGraph(source)))).toBe(true)
      }),
    )
  }
})

describe("transport bundle profile restrictions", () => {
  for (const profile of ["core-runtime", "durability-s3", "durability-r2"]) {
    test.effect(`${profile} rejects emitted SQL without exempting the signed S3 profile`, () =>
      Effect.gen(function* () {
        const metadata = bundle()
        const sql = "node_modules/effect/dist/unstable/sql/SqlClient.js"
        metadata.inputs[sql] = { bytes: 1, imports: [] }
        metadata.outputs["worker.js"].inputs[sql] = { bytesInOutput: 1 }
        const graph = yield* shippedBundleGraph(encodeJson(metadata))
        expect(Array.from(graph).filter((item) => isForbiddenTransportRuntime({ profile, item }))).toEqual([sql])
      }),
    )
    test.effect(`${profile} preserves its AWS dependency boundary`, () =>
      Effect.gen(function* () {
        const metadata = bundle()
        const aws = ["@aws-sdk/client-s3", "@smithy/types"]
        metadata.outputs["worker.js"].imports = aws.map((path) => ({ path, kind: "import-statement", external: true }))
        const graph = yield* shippedBundleGraph(encodeJson(metadata))
        expect(Array.from(graph).filter((item) => isForbiddenTransportRuntime({ profile, item }))).toEqual(
          profile === "durability-s3" ? [] : aws,
        )
      }),
    )
  }
  for (const transport of ["s3", "r2"]) {
    test(`core cannot bundle the ${transport} transport`, () => {
      expect(
        isForbiddenTransportRuntime({ profile: "core-runtime", item: `generalist/dist/durability/${transport}.js` }),
      ).toBe(true)
      expect(
        isForbiddenTransportRuntime({
          profile: `durability-${transport}`,
          item: `generalist/dist/durability/${transport}.js`,
        }),
      ).toBe(false)
    })
  }
})

type Manifest = {
  name: string
  version?: string
  dependencies?: Record<string, string>
  optionalDependencies?: Record<string, string>
  peerDependencies?: Record<string, string>
  peerDependenciesMeta?: Record<string, { optional: boolean }>
}
type InstalledFixture = {
  consumer: Manifest
  packages: Record<string, Manifest>
  profiles: Array<MinimumConsumerProfile>
  forbidAws?: boolean
  links?: Record<string, string>
}
const installed = (fixture: InstalledFixture, name: string): Manifest =>
  Option.getOrThrow(Rec.get(fixture.packages, name))
const coreProfile = minimumConsumerProfiles.find((profile) => profile.name === "core-runtime")!
const hostProfile = minimumConsumerProfiles.find((profile) => profile.name === "rivet")!
const core = (): InstalledFixture => ({
  consumer: { name: "consumer", dependencies: { generalist: "*", effect: "*" } },
  packages: {
    "node_modules/generalist": {
      name: "generalist",
      peerDependencies: { effect: "*", rivetkit: "*" },
      peerDependenciesMeta: { rivetkit: { optional: true } },
    },
    "node_modules/effect": { name: "effect" },
  },
  profiles: [coreProfile],
})
const native = (): InstalledFixture => {
  const fixture = core()
  fixture.consumer.dependencies!.rivetkit = "*"
  fixture.packages["node_modules/rivetkit"] = { name: "rivetkit", dependencies: { "drizzle-orm": "*" } }
  fixture.packages["node_modules/drizzle-orm"] = {
    name: "drizzle-orm",
    peerDependencies: { "better-sqlite3": "*" },
    peerDependenciesMeta: { "better-sqlite3": { optional: true } },
  }
  fixture.packages["node_modules/better-sqlite3"] = { name: "better-sqlite3" }
  fixture.profiles = [hostProfile]
  return fixture
}

const dualPeer = (): InstalledFixture => {
  const fixture = native()
  fixture.consumer.dependencies!["@rivet-dev/agentos"] = "0.2.19"
  delete fixture.consumer.dependencies!.rivetkit
  const generalist = installed(fixture, "node_modules/generalist")
  generalist.peerDependencies!.rivetkit = "2.3.15"
  generalist.peerDependencies!["@rivet-dev/agentos"] = "0.2.19"
  generalist.peerDependenciesMeta!["@rivet-dev/agentos"] = { optional: true }
  installed(fixture, "node_modules/rivetkit").version = "2.3.15"
  installed(fixture, "node_modules/drizzle-orm").version = "0.45.2"
  fixture.packages["node_modules/@rivet-dev/agentos"] = {
    name: "@rivet-dev/agentos",
    version: "0.2.19",
    dependencies: { rivetkit: "2.3.10" },
  }
  fixture.packages["node_modules/@rivet-dev/agentos/node_modules/rivetkit"] = {
    name: "rivetkit",
    version: "2.3.10",
    dependencies: { "drizzle-orm": "0.44.7" },
  }
  fixture.packages["node_modules/@rivet-dev/agentos/node_modules/drizzle-orm"] = {
    name: "drizzle-orm",
    version: "0.44.7",
  }
  fixture.profiles = [
    { name: "sandbox", peers: ["@rivet-dev/agentos"], nativeHostPeers: ["@rivet-dev/agentos"], imports: [] },
  ]
  return fixture
}

layer(bunLayer)("installed package ownership", (it) => {
  const ownershipCase = (name: string, fixture: InstalledFixture, expectedSql: number | "reject"): void => {
    const consumer = encodeJson(fixture.consumer)
    const packages = Object.entries(fixture.packages).map(
      ([relative, manifest]) => [relative, encodeJson(manifest)] as const,
    )
    const links = Object.entries(fixture.links ?? {})
    const profiles = [...fixture.profiles]
    const forbidAws = fixture.forbidAws ?? false
    it.effect(name, () =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem
        const path = yield* Path.Path
        const directory = yield* fs.makeTempDirectoryScoped()
        yield* fs.writeFileString(path.join(directory, "package.json"), consumer)
        const manifests: Array<string> = []
        for (const [relative, manifest] of packages) {
          yield* fs.makeDirectory(path.join(directory, relative), { recursive: true })
          yield* fs.writeFileString(path.join(directory, relative, "package.json"), manifest)
          manifests.push(`${relative}/package.json`)
        }
        for (const [relative, target] of links) {
          yield* fs.makeDirectory(path.dirname(path.join(directory, relative)), { recursive: true })
          yield* fs.symlink(path.join(directory, target), path.join(directory, relative))
        }
        const audit = auditInstalledDependencyGraph({ directory, manifests, profiles, forbidAws })
        if (expectedSql === "reject") {
          expect(yield* Effect.flip(audit)).toBeInstanceOf(DependencyGraphFailed)
        } else {
          expect((yield* audit).nativeSql).toHaveLength(expectedSql)
        }
      }),
    )
  }

  ownershipCase("accepts core-only without SQL", core(), 0)
  for (const field of ["dependencies", "optionalDependencies", "peerDependencies"] as const) {
    const fixture = native()
    const generalist = installed(fixture, "node_modules/generalist")
    generalist[field] = { ...generalist[field], pg: "*" }
    ownershipCase(`rejects Generalist direct SQL ${field} even with native context`, fixture, "reject")
  }
  const coreSql = core()
  installed(coreSql, "node_modules/effect").dependencies = { "better-sqlite3": "*" }
  coreSql.packages["node_modules/better-sqlite3"] = { name: "better-sqlite3" }
  ownershipCase("rejects SQL in the default dependency closure", coreSql, "reject")
  const stray = core()
  stray.packages["node_modules/drizzle-orm"] = { name: "drizzle-orm" }
  ownershipCase("rejects unattributed installed SQL", stray, "reject")
  ownershipCase("distinguishes hoisted native implementation dependencies", native(), 2)
  const shared = native()
  installed(shared, "node_modules/effect").dependencies = { "drizzle-orm": "*" }
  ownershipCase("rejects shared native/protected hoisted SQL", shared, "reject")
  const required = native()
  installed(required, "node_modules/generalist").dependencies = { rivetkit: "*" }
  ownershipCase("protects Generalist required host dependencies", required, "reject")
  const ordinaryHost = native()
  installed(ordinaryHost, "node_modules/effect").dependencies = { rivetkit: "*" }
  ownershipCase("protects ordinary dependencies reaching a native host", ordinaryHost, "reject")
  const transitivePeer = native()
  transitivePeer.consumer.dependencies!["@rivet-dev/agentos"] = "*"
  delete transitivePeer.consumer.dependencies!.rivetkit
  installed(transitivePeer, "node_modules/generalist").peerDependencies!["@rivet-dev/agentos"] = "*"
  installed(transitivePeer, "node_modules/generalist").peerDependenciesMeta!["@rivet-dev/agentos"] = { optional: true }
  transitivePeer.packages["node_modules/@rivet-dev/agentos"] = {
    name: "@rivet-dev/agentos",
    dependencies: { rivetkit: "*" },
  }
  transitivePeer.profiles = [
    { name: "sandbox", peers: ["@rivet-dev/agentos"], nativeHostPeers: ["@rivet-dev/agentos"], imports: [] },
  ]
  ownershipCase("keeps host-owned transitive optional peers out of Generalist dependencies", transitivePeer, 2)
  transitivePeer.packages["node_modules/@rivet-dev/agentos/node_modules/rivetkit"] = {
    name: "rivetkit",
    dependencies: { "drizzle-orm": "*" },
  }
  transitivePeer.packages["node_modules/@rivet-dev/agentos/node_modules/drizzle-orm"] = { name: "drizzle-orm" }
  transitivePeer.packages["node_modules/unrequested/node_modules/rivetkit"] = {
    name: "rivetkit",
    dependencies: { "drizzle-orm": "*" },
  }
  transitivePeer.packages["node_modules/unrequested/node_modules/drizzle-orm"] = { name: "drizzle-orm" }
  ownershipCase("rejects native ownership for an unrequested optional host copy", transitivePeer, "reject")
  ownershipCase("links a reached native dependency to its distinct Generalist optional peer instance", dualPeer(), 3)
  const noSelectedHost = dualPeer()
  noSelectedHost.profiles = [coreProfile]
  ownershipCase("requires an explicitly selected native host before linking peer instances", noSelectedHost, "reject")
  const unrelatedPeer = dualPeer()
  installed(unrelatedPeer, "node_modules/generalist").peerDependencies!.unrelated = "*"
  installed(unrelatedPeer, "node_modules/generalist").peerDependenciesMeta!.unrelated = { optional: true }
  unrelatedPeer.packages["node_modules/unrelated"] = { name: "unrelated", dependencies: { pg: "*" } }
  unrelatedPeer.packages["node_modules/pg"] = { name: "pg" }
  ownershipCase(
    "does not link an unrelated optional peer absent from the native dependency closure",
    unrelatedPeer,
    "reject",
  )
  const metadataOnly = dualPeer()
  delete installed(metadataOnly, "node_modules/generalist").peerDependencies!.rivetkit
  ownershipCase("requires an actual optional peer declaration rather than metadata alone", metadataOnly, "reject")
  for (const field of ["dependencies", "optionalDependencies"] as const) {
    const mandatory = dualPeer()
    installed(mandatory, "node_modules/generalist")[field] = { rivetkit: "2.3.15" }
    ownershipCase(`does not link Generalist own ${field} as an optional peer`, mandatory, "reject")
  }
  const mandatoryPeer = dualPeer()
  installed(mandatoryPeer, "node_modules/generalist").peerDependenciesMeta!.rivetkit = { optional: false }
  ownershipCase("does not link a required Generalist peer", mandatoryPeer, "reject")
  const sharedLinkedSql = dualPeer()
  installed(sharedLinkedSql, "node_modules/effect").dependencies = { "drizzle-orm": "0.45.2" }
  ownershipCase("preserves protected-root precedence over linked peer SQL", sharedLinkedSql, "reject")
  const directLinkedSql = dualPeer()
  directLinkedSql.consumer.dependencies!["drizzle-orm"] = "0.45.2"
  ownershipCase("rejects direct consumer SQL even when reached through a linked peer", directLinkedSql, "reject")
  const alias = dualPeer()
  installed(alias, "node_modules/@rivet-dev/agentos").dependencies = { "rivet-alias": "2.3.10" }
  alias.links = {
    "node_modules/@rivet-dev/agentos/node_modules/rivet-alias": "node_modules/@rivet-dev/agentos/node_modules/rivetkit",
  }
  ownershipCase("requires the reached dependency name rather than an aliased package name", alias, "reject")
  const mismatchedPeer = dualPeer()
  installed(mismatchedPeer, "node_modules/rivetkit").name = "unrelated"
  ownershipCase("requires a matching Generalist-resolved peer manifest name", mismatchedPeer, "reject")
  const isolatedDual = dualPeer()
  isolatedDual.links = {}
  for (const [relative, manifest] of Object.entries(isolatedDual.packages)) {
    const canonical = `node_modules/.bun/${manifest.name.replaceAll("/", "+")}@${manifest.version ?? "1"}/node_modules/${manifest.name}`
    isolatedDual.packages[canonical] = manifest
    Reflect.deleteProperty(isolatedDual.packages, relative)
    isolatedDual.links[relative] = canonical
  }
  isolatedDual.links["node_modules/.bun/rivetkit@2.3.10/node_modules/drizzle-orm"] =
    "node_modules/.bun/drizzle-orm@0.44.7/node_modules/drizzle-orm"
  ownershipCase("links distinct peer instances through canonical isolated realpaths", isolatedDual, 3)
  const implicit = native()
  implicit.profiles = [coreProfile]
  ownershipCase("rejects the same native graph without explicit profile context", implicit, "reject")
  const directConsumer = native()
  directConsumer.consumer.dependencies!["better-sqlite3"] = "*"
  ownershipCase("rejects consumer direct SQL even when also host-owned", directConsumer, "reject")
  const nested = native()
  installed(nested, "node_modules/effect").dependencies = { "drizzle-orm": "*" }
  nested.packages["node_modules/effect/node_modules/drizzle-orm"] = { name: "drizzle-orm" }
  ownershipCase("does not exempt a separate protected copy by package name", nested, "reject")
  const notOptional = native()
  installed(notOptional, "node_modules/generalist").peerDependenciesMeta = {}
  ownershipCase("requires native roots to be declared optional peers", notOptional, "reject")
  const notExplicit = native()
  delete notExplicit.consumer.dependencies!.rivetkit
  ownershipCase("requires native roots to be explicitly installed", notExplicit, "reject")
  const aws = native()
  installed(aws, "node_modules/rivetkit").dependencies!["@aws-sdk/client-s3"] = "*"
  aws.packages["node_modules/@aws-sdk/client-s3"] = { name: "@aws-sdk/client-s3" }
  aws.forbidAws = true
  ownershipCase("does not bypass the portable AWS ban through native ownership", aws, "reject")
  const isolated = native()
  isolated.links = {}
  for (const [relative, manifest] of Object.entries(isolated.packages)) {
    const canonical = `node_modules/.bun/${manifest.name.replaceAll("/", "+")}@1/node_modules/${manifest.name}`
    isolated.packages[canonical] = manifest
    Reflect.deleteProperty(isolated.packages, relative)
    isolated.links[relative] = canonical
  }
  ownershipCase("distinguishes native SQL through Bun isolated realpaths", isolated, 2)
})
