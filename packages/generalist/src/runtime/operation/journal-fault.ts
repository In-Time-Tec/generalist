import { Context, Effect } from "effect"

/** @internal Test-only fault hook after an operation has been durably journaled. */
export class JournalFault extends Context.Service<
  JournalFault,
  { readonly afterJournaledOperation: Effect.Effect<void> }
>()("generalist/runtime/operation/journal-fault/JournalFault") {}
