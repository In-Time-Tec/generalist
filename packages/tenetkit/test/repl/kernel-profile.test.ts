import { describe, expect, it } from "@effect/vitest"
import { Schema } from "effect"
import { KernelProfile } from "../../src/repl/index"

const runtime: KernelProfile.Runtime = { name: "bun", version: "1.3.14", digest: "runtime-digest" }
const workspace: KernelProfile.Workspace = { root: "/workspace", dataRoot: "/data" }
const limits: KernelProfile.Limits = { sourceBytes: 65_536, cellDeadlineMillis: 120_000 }

const profile = KernelProfile.make({
  runtime,
  bindingsDigest: KernelProfile.bindingsDigest(["workspace", "agents"]),
  workspace,
  limits,
  trustMode: "trusted-local",
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

  it("rejects an unknown trust mode", () => {
    expect(() => Schema.decodeUnknownSync(KernelProfile.TrustMode)("sandboxed")).toThrow()
  })

  it("declares no secret-bearing field: the encoded profile carries only contract fields", () => {
    const encoded = Schema.encodeSync(KernelProfile.KernelProfile)(profile)
    expect(Object.keys(encoded).toSorted()).toEqual([
      "bindingsDigest",
      "contractVersion",
      "limits",
      "protocolVersion",
      "runtime",
      "trustMode",
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
      runtime,
      bindingsDigest: profile.bindingsDigest,
      workspace: { root: "/workspace?token=sk-live-secret", dataRoot: "/data" },
      limits,
      trustMode: "trusted-local",
    })
    const encoded = Schema.encodeSync(KernelProfile.KernelProfile)(leaky)
    expect(encoded.workspace.root).toBe("/workspace?token=sk-live-secret")
    expect(KernelProfile.digest(leaky)).not.toBe(KernelProfile.digest(profile))
  })

  it("derives a stable content-addressed digest", () => {
    const same = KernelProfile.make({
      runtime,
      bindingsDigest: KernelProfile.bindingsDigest(["workspace", "agents"]),
      workspace,
      limits,
      trustMode: "trusted-local",
    })
    expect(KernelProfile.digest(same)).toBe(KernelProfile.digest(profile))
  })

  it("changes the digest when the pinned runtime changes", () => {
    const upgraded = KernelProfile.make({
      runtime: { ...runtime, version: "1.3.15" },
      bindingsDigest: profile.bindingsDigest,
      workspace,
      limits,
      trustMode: "trusted-local",
    })
    expect(KernelProfile.digest(upgraded)).not.toBe(KernelProfile.digest(profile))
  })

  it("changes the digest when the trust mode changes", () => {
    const narrowed = KernelProfile.make({
      runtime,
      bindingsDigest: profile.bindingsDigest,
      workspace,
      limits,
      trustMode: "trusted-workspace",
    })
    expect(KernelProfile.digest(narrowed)).not.toBe(KernelProfile.digest(profile))
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
