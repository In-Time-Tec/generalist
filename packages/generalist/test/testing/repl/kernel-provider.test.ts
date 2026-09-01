/* oxlint-disable effecttsgo/strict-effect-provide -- this test registration is the provider composition root. */
import { KernelProviderConformance } from "generalist/testing"
import { Effect } from "effect"
import { makeHarness, platform } from "../../repl/bun-harness.js"
import { makeRemoteHarness } from "../../repl/remote-provider-fixture.js"

KernelProviderConformance.kernelProviderConformance({
  name: "Bun child process",
  live: true,
  make: makeHarness().pipe(
    Effect.map(({ pool, profile, ownWorkers }) => ({ pool, profile, resourceCount: ownWorkers })),
    Effect.provide(platform),
  ),
})

KernelProviderConformance.kernelProviderConformance({
  name: "deterministic hosted fixture",
  make: makeRemoteHarness,
  remote: makeRemoteHarness,
})
