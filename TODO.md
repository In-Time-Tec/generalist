# Baton / Relay north-star execution TODO

## Shipped in previous slices

- [x] Align Baton tools with Effect AI `Tool.make` / `Toolkit` instead of a second tool-definition model.
- [x] Re-export Effect AI primitives from Baton and expose Baton AI surface through Relay.
- [x] Add Baton tool placement routes for local, client, remote, MCP, and sandbox execution.
- [x] Bridge Relay durable tool runtime to Baton / Effect AI toolkits.
- [x] Ship Relay consuming Baton `0.3.1` on `main` and `release`.

## Current slice

- [x] Prove Baton `Session.buildContext` dropped non-message context entries before the Phase 5 context-engineering slice.
- [x] Expand the closed `Session.Entry` union for memory, skills, steering, tool calls, tool results, and handoffs without introducing another prompt format.
- [x] Preserve Effect AI `Prompt` roles/parts for prompt-native entries and render context notes as tagged system messages.
- [x] Run scoped Baton validation for the session context slice.
- [x] Publish Baton patch release and merge/push to `main` and `release`.
- [x] Add Phase 5 memory lifecycle progress with host-requested `Memory.forget` cleanup.
- [x] Refine `Memory.forget` to support exact item ids per the north-star plan.
- [ ] Bump Relay to the new Baton patch, verify, merge/push to `main` and `release`.

## Remaining plan audit

- [~] Re-audit Baton agent runtime against the plan for Effect-native seam shape, avoiding duplicate abstractions over Effect AI.
- [ ] Re-audit Relay durable composition to ensure it builds on Baton surfaces rather than parallel abstractions.
- [ ] Update this TODO after each shipped slice until the plan is complete.
