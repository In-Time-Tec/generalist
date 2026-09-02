import { Schema } from "effect"

const PackageManifest = Schema.Struct({
  name: Schema.String,
  version: Schema.String,
  generalist: Schema.Struct({
    skills: Schema.optionalKey(Schema.Array(Schema.String)),
    tools: Schema.optionalKey(Schema.String),
    instructions: Schema.optionalKey(Schema.Array(Schema.String)),
  }),
})

const RegistryVersion = Schema.Struct({
  name: Schema.String,
  version: Schema.String,
  dist: Schema.Struct({
    tarball: Schema.String,
    integrity: Schema.String,
  }),
})

const RegistryMetadata = Schema.Struct({
  "dist-tags": Schema.Record(Schema.String, Schema.String),
  versions: Schema.Record(Schema.String, RegistryVersion),
})

export const LockEntry = Schema.Struct({
  specifier: Schema.String,
  source: Schema.Literals(["npm", "github"]),
  name: Schema.String,
  resolved: Schema.String,
  archiveUrl: Schema.String,
  integrity: Schema.String,
})

const PackageLock = Schema.Struct({
  version: Schema.Literal(1),
  packages: Schema.Array(LockEntry),
})

export type LockEntry = typeof LockEntry.Type

export const lockCodec = Schema.fromJsonString(PackageLock)
export const manifestCodec = Schema.fromJsonString(PackageManifest)
export const registryCodec = Schema.fromJsonString(RegistryMetadata)
export const commitCodec = Schema.fromJsonString(Schema.Struct({ sha: Schema.String }))
