import { Context } from "effect"

/** Build identity supplied by the hosting application for one executable registry. */
export class AgentBuildRevision extends Context.Service<AgentBuildRevision, string>()(
  "generalist/runtime/executable/AgentBuildRevision",
) {}
