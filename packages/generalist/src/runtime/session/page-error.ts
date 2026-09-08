import { Schema } from "effect"
import { ActionableTaggedError, errorHint } from "../../core/error-hint.js"

/** A page selector does not name retained evidence in the authorized Session. @experimental */
export class SessionPageInvalid extends ActionableTaggedError<SessionPageInvalid>()(
  "generalist/host/SessionPageInvalid",
  {
    sessionId: Schema.String,
    hint: errorHint("Use the leaf or continuation returned by this Session's snapshot or previous page."),
  },
) {}
