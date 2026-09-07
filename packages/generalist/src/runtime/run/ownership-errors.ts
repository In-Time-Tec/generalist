import { Schema } from "effect"
import { ActionableTaggedError, errorHint } from "../../core/error-hint.js"

export class StaleClaim extends ActionableTaggedError<StaleClaim>()("generalist/runtime/StaleClaim", {
  runId: Schema.String,
  workerId: Schema.String,
  attemptFence: Schema.Finite,
  hint: errorHint("Stop mutating with this stale claim and reacquire the Run with a current fence."),
}) {}

/** An exact Runtime Session write binding has been revoked or replaced. */
export class StaleSessionClaim extends ActionableTaggedError<StaleSessionClaim>()(
  "generalist/runtime/StaleSessionClaim",
  {
    sessionId: Schema.String,
    runId: Schema.String,
    ownerId: Schema.String,
    runAttemptFence: Schema.Finite,
    epoch: Schema.String,
    hint: errorHint("Stop Session writes and reacquire the Session writer claim with its current epoch."),
  },
) {}
