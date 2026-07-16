# Default to infinite continuation

The default turn policy is `TurnPolicy.forever`: Baton imposes no follow-up-turn count, and a turn with no pending tool results still completes the run naturally. A finite cap is an explicit author choice via `TurnPolicy.recurs(n)`; cancellation, budgets, and tool governance remain independent controls.

`forever` is a distinct first-class constructor with its own portable snapshot `{ _tag: "Forever" }`, never `recurs(Infinity)`, an absent snapshot, or a numeric sentinel. JSON cannot preserve `Infinity`, and an absent snapshot already means an opaque custom policy, so durable hosts need a distinct value to tell explicit infinity apart from opaque policies and from legacy records with no policy field, which keep their own interpretation.
