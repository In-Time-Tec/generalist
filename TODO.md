# Baton / Relay north-star execution TODO

## Shipped in previous slices

- [x] Align Baton tools with Effect AI `Tool.make` / `Toolkit` instead of a second tool-definition model.
- [x] Re-export Effect AI primitives from Baton and expose Baton AI surface through Relay.
- [x] Add Baton tool placement routes for local, client, remote, MCP, and sandbox execution.
- [x] Bridge Relay durable tool runtime to Baton / Effect AI toolkits.
- [x] Ship Relay consuming Baton `0.3.1` on `main` and `release`.

## Current slice

- [x] Refactor Baton steering from ad-hoc queue modes to Effect `Queue` policies with explicit drain modes, bounded capacity, and overflow behavior.
- [x] Emit `SteeringDrained` events when queued steering or follow-up input is consumed into the next prompt.
- [x] Update Baton specs, docs, snippets, transport codecs, FoldKit projection, and tests for queue policies and steering drain events.
- [x] Publish Baton patch release and merge/push to `main` and `release`.
- [x] Bump Relay to the new Baton patch, verify, merge/push to `main` and `release`.

## Remaining plan audit

- [ ] Re-audit Baton agent runtime against the plan for Effect-native seam shape, avoiding duplicate abstractions over Effect AI.
- [ ] Re-audit Relay durable composition to ensure it builds on Baton surfaces rather than parallel abstractions.
- [ ] Update this TODO after each shipped slice until the plan is complete.
