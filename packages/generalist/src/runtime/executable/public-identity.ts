import { Option, Schema } from "effect"
import type { ExecutableManifest, ExecutableRef } from "./manifest.js"
import type { ExecutableRegistration } from "./registration.js"

const RevisionPayload = Schema.Struct({
  revision: Schema.String.check(Schema.isNonEmpty(), Schema.isMaxLength(255)),
})

export interface Source {
  readonly executableRef: ExecutableRef
  readonly executableManifest: ExecutableManifest
  readonly registrations: ReadonlyArray<ExecutableRegistration>
}

export interface PublicIdentity {
  readonly name: string
  readonly revision: string
}

export const executableName = (source: Pick<Source, "executableRef" | "executableManifest">): string | undefined =>
  source.executableManifest.entries.find((entry) => entry.pin === source.executableRef.active)?.manifest.name

export const executableRevision = (registrations: Source["registrations"]): string | undefined => {
  let revision: string | undefined
  for (const registration of registrations) {
    if (
      registration.codec !== "generalist/runtime/registered-agent" &&
      registration.codec !== "generalist/runtime/registered-tool"
    )
      continue
    const decoded = Schema.decodeUnknownOption(RevisionPayload)(registration.payload)
    if (Option.isNone(decoded)) continue
    if (revision !== undefined && revision !== decoded.value.revision) return undefined
    revision = decoded.value.revision
  }
  return revision
}

export const publicIdentity = (source: Source): PublicIdentity | undefined => {
  const name = executableName(source)
  const revision = executableRevision(source.registrations)
  return name === undefined || revision === undefined ? undefined : { name, revision }
}
