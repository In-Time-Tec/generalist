import { describe, expect, it } from "@effect/vitest"
import { Schema } from "effect"
import { KernelProfile } from "../../src/repl/index"

const runtime: KernelProfile.Runtime = { name: "bun", version: "1.3.14", digest: "runtime-digest" }
const workspace: KernelProfile.Workspace = { root: "/workspace", dataRoot: "/data" }
const limits: KernelProfile.Limits = { sourceBytes: 65_536, cellDeadlineMillis: 120_000 }
const execution = {
  provider: "bun-local",
  image: { kind: "runtime", reference: "bun@1.3.14", digest: "runtime-digest" },
  isolation: "host-process",
  checkpoints: { liveProcess: false, filesystem: true, namespace: true },
} as const

const profile = KernelProfile.make({
  ...execution,
  runtime,
  bindingsDigest: KernelProfile.bindingsDigest(["workspace", "agents"]),
  workspace,
  limits,
})

describe("KernelProfile", () => {
  it("pins the contract and protocol versions", () => {
    expect(profile.contractVersion).toBe(KernelProfile.contractVersion)
    expect(profile.protocolVersion).toBe(KernelProfile.protocolVersion)
  })

  it("round-trips through its codec", () => {
    const encoded = Schema.encodeSync(KernelProfile.KernelProfile)(profile)
    expect(Schema.decodeSync(KernelProfile.KernelProfile)(encoded)).toEqual(profile)
  })

  it("rejects a foreign protocol version", () => {
    const encoded = Schema.encodeSync(KernelProfile.KernelProfile)(profile)
    expect(() => Schema.decodeUnknownSync(KernelProfile.KernelProfile)({ ...encoded, protocolVersion: 99 })).toThrow()
  })

  it("rejects a non-positive limit", () => {
    expect(() => KernelProfile.Limits.make({ sourceBytes: 0, cellDeadlineMillis: 1 })).toThrow()
  })

  it("rejects a fractional limit", () => {
    expect(() => KernelProfile.Limits.make({ sourceBytes: 1.5, cellDeadlineMillis: 1 })).toThrow()
  })

  it("rejects an empty runtime digest", () => {
    expect(() => KernelProfile.Runtime.make({ name: "bun", version: "1.3.14", digest: "" })).toThrow()
  })

  it("rejects an unknown physical isolation boundary", () => {
    expect(() => Schema.decodeUnknownSync(KernelProfile.Isolation)("secure")).toThrow()
  })

  it("declares no secret-bearing field: the encoded profile carries only contract fields", () => {
    const encoded = Schema.encodeSync(KernelProfile.KernelProfile)(profile)
    expect(Object.keys(encoded).toSorted()).toEqual([
      "bindingsDigest",
      "checkpoints",
      "contractVersion",
      "image",
      "isolation",
      "limits",
      "protocolVersion",
      "provider",
      "runtime",
      "workspace",
    ])
  })

  it("drops any undeclared field a host tries to smuggle in", () => {
    const smuggled = {
      ...Schema.encodeSync(KernelProfile.KernelProfile)(profile),
      apiKey: "sk-live-secret",
      env: { ANTHROPIC_API_KEY: "sk-live-secret" },
    }
    const decoded = Schema.decodeSync(KernelProfile.KernelProfile)(smuggled)
    const text = JSON.stringify(Schema.encodeSync(KernelProfile.KernelProfile)(decoded))
    expect(text).not.toContain("sk-live-secret")
    expect(text).not.toContain("apiKey")
  })

  it("keeps a smuggled field out of the digest as well as the encoded form", () => {
    const smuggled = { ...Schema.encodeSync(KernelProfile.KernelProfile)(profile), apiKey: "sk-live-secret" }
    const decoded = Schema.decodeSync(KernelProfile.KernelProfile)(smuggled)
    expect(KernelProfile.digest(decoded)).toBe(KernelProfile.digest(profile))
  })

  it("does not scan free-text path content: a host-embedded secret survives verbatim", () => {
    const leaky = KernelProfile.make({
      ...execution,
      runtime,
      bindingsDigest: profile.bindingsDigest,
      workspace: { root: "/workspace?token=sk-live-secret", dataRoot: "/data" },
      limits,
    })
    const encoded = Schema.encodeSync(KernelProfile.KernelProfile)(leaky)
    expect(encoded.workspace.root).toBe("/workspace?token=sk-live-secret")
    expect(KernelProfile.digest(leaky)).not.toBe(KernelProfile.digest(profile))
  })

  it("derives a stable content-addressed digest", () => {
    const same = KernelProfile.make({
      ...execution,
      runtime,
      bindingsDigest: KernelProfile.bindingsDigest(["workspace", "agents"]),
      workspace,
      limits,
    })
    expect(KernelProfile.digest(same)).toBe(KernelProfile.digest(profile))
  })

  it("changes the digest when the pinned runtime changes", () => {
    const upgraded = KernelProfile.make({
      ...execution,
      runtime: { ...runtime, version: "1.3.15" },
      bindingsDigest: profile.bindingsDigest,
      workspace,
      limits,
    })
    expect(KernelProfile.digest(upgraded)).not.toBe(KernelProfile.digest(profile))
  })

  it("changes the digest when the physical isolation changes", () => {
    const narrowed = KernelProfile.make({
      ...execution,
      runtime,
      bindingsDigest: profile.bindingsDigest,
      workspace,
      limits,
      isolation: "container",
    })
    expect(KernelProfile.digest(narrowed)).not.toBe(KernelProfile.digest(profile))
  })

  it("changes the digest when provider, image, or checkpoint capabilities change", () => {
    const changed = [
      KernelProfile.make({ ...profile, provider: "hosted" }),
      KernelProfile.make({ ...profile, image: { ...profile.image, digest: "other-image" } }),
      KernelProfile.make({ ...profile, checkpoints: { ...profile.checkpoints, liveProcess: true } }),
    ]
    expect(changed.every((candidate) => KernelProfile.digest(candidate) !== KernelProfile.digest(profile))).toBe(true)
  })

  it("states restart-only recovery separately from filesystem, namespace, and live-process recovery", () => {
    expect(KernelProfile.CheckpointKind.literals).toEqual(["live-process", "filesystem", "namespace", "restart-only"])
  })

  it("makes the bindings digest independent of mount order", () => {
    expect(KernelProfile.bindingsDigest(["agents", "workspace"])).toBe(
      KernelProfile.bindingsDigest(["workspace", "agents"]),
    )
  })

  it("changes the bindings digest when a module is added", () => {
    expect(KernelProfile.bindingsDigest(["workspace"])).not.toBe(KernelProfile.bindingsDigest(["workspace", "web"]))
  })
})
