import { Effect } from "effect"
import { defaults } from "../../packages/generalist/src/instructions/skills/index.js"
import type { WorkingRequirement } from "../../packages/generalist/src/memory/index.js"
import type { SummaryRequirement } from "../../packages/generalist/src/memory/working-memory.js"
import type { ConsolidationProposer } from "../../packages/generalist/src/unstable/learning/index.js"

type MissingWorkingRequirement = WorkingRequirement<never>
type MissingSummaryRequirement = SummaryRequirement<never>
const arbitraryProposer: ConsolidationProposer = () => Effect.succeed([])
declare function usePrivateTypes(working: MissingWorkingRequirement, summary: MissingSummaryRequirement): void
void defaults
void arbitraryProposer
void usePrivateTypes
