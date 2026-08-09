# Require the kernel profile pin and derive it from the values the pool uses

`KernelProfile` is the content-addressed identity of one kernel epoch: contract version, protocol version, pinned runtime identity and digest, bindings digest, workspace paths, ingestion limits, and trust mode. `KernelProfile.digest` is that identity, and a changed profile requires a new epoch rather than reuse.

The pin is required rather than optional, and it is built from the same values `BunKernelPool.make` is given — the profile it enforces source bounds, channel bounds, and cell deadlines from is the profile it digests. An absent or independently-supplied pin would let a host reconstruct successfully against a profile that never ran, which would make the digest a label rather than an identity.

Two contract properties keep the pin honest, both asserted in `kernel-profile.test.ts`:

- **Unknown keys are dropped from the encoded form and from the digest.** A host cannot widen the profile by attaching extra data to it, and a smuggled field does not change the digest.
- **A foreign protocol version fails to decode.** A host and a kernel must agree exactly.

The profile declares no secret-bearing field: every field is an identifier, a digest, a path, or a bound, and there is no credential, token, header, or environment slot. The content of the free-text identifier and path fields is host-supplied and is not scanned or redacted, so a host that embeds a secret in a path or a runtime name persists and renders it.

`KernelProfile.bindingsDigest(names)` sorts before digesting, so mount order does not change the epoch, while adding or removing a module does.
